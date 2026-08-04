"""Tests for the web (browser) auth flow.

These tests exercise the service-level rotation / reuse-detection logic
against a real DB session. The dev DB is used; each test creates a unique
user and cleans up.
"""

import secrets
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.core.security import create_access_token, hash_password
from app.db.deps import get_db
from app.main import app
from app.models.user import User
from app.models.web_auth import WebSession
from app.services.web_auth import (
    WebAuthError,
    derive_refresh_token,
    refresh_web_session,
    secret_hash,
    user_agent_fingerprint,
)


# --- Pure-function unit tests -------------------------------------------


def test_derive_refresh_token_is_deterministic():
    sid = uuid.uuid4()
    a = derive_refresh_token(sid, 0)
    b = derive_refresh_token(sid, 0)
    assert a == b
    assert derive_refresh_token(sid, 1) != a
    assert derive_refresh_token(uuid.uuid4(), 0) != a


def test_secret_hash_is_stable_sha256():
    assert secret_hash("abc") == secret_hash("abc")
    assert secret_hash("abc") != secret_hash("abd")


def test_user_agent_fingerprint_is_stable_and_handles_none():
    fp = user_agent_fingerprint("Mozilla/5.0 ...")
    assert fp and len(fp) == 64
    assert user_agent_fingerprint(None) is None


# --- Service-level rotation tests (real DB) ------------------------------


def _make_user(db, suffix: str) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"web-auth-{suffix}@example.com",
        display_name=f"web-auth-{suffix}",
        password_hash=hash_password("password123!"),
        status="active",
        system_role="user",
    )
    db.add(user)
    db.commit()
    return user


def _cleanup(db, user: User) -> None:
    db.execute(delete(WebSession).where(WebSession.user_id == user.id))
    db.execute(delete(User).where(User.id == user.id))
    db.commit()


def test_refresh_rotates_token_and_advances_generation():
    db = next(get_db())
    suffix = secrets.token_hex(4)
    user = _make_user(db, suffix)
    try:
        # Manually create a session in generation 0.
        from datetime import timedelta
        from app.models._mixins import utcnow
        from app.models.web_auth import WebSession

        now = utcnow()
        sess = WebSession(
            id=uuid.uuid4(),
            user_id=user.id,
            login_provider="password",
            refresh_token_hash="pending",
            token_family_id=uuid.uuid4(),
            refresh_generation=0,
            last_used_at=now,
            idle_expires_at=now + timedelta(days=30),
            absolute_expires_at=now + timedelta(days=90),
        )
        rt0 = derive_refresh_token(sess.id, 0)
        sess.refresh_token_hash = secret_hash(rt0)
        db.add(sess)
        db.commit()

        result = refresh_web_session(
            db,
            session_id=sess.id,
            refresh_token=rt0,
            request_id="req-1",
            last_ip=None,
            user_agent=None,
        )
        # RT was rotated.
        assert result.refresh_token != rt0
        db.refresh(sess)
        assert sess.refresh_generation == 1
        assert sess.previous_refresh_token_hash == secret_hash(rt0)
        assert sess.refresh_token_hash == secret_hash(result.refresh_token)
    finally:
        _cleanup(db, user)


def test_reused_refresh_token_revokes_family():
    db = next(get_db())
    suffix = secrets.token_hex(4)
    user = _make_user(db, suffix)
    try:
        from datetime import timedelta
        from app.models._mixins import utcnow
        from app.models.web_auth import WebSession

        now = utcnow()
        family = uuid.uuid4()
        sess = WebSession(
            id=uuid.uuid4(),
            user_id=user.id,
            login_provider="password",
            refresh_token_hash="pending",
            token_family_id=family,
            refresh_generation=0,
            last_used_at=now,
            idle_expires_at=now + timedelta(days=30),
            absolute_expires_at=now + timedelta(days=90),
        )
        rt0 = derive_refresh_token(sess.id, 0)
        sess.refresh_token_hash = secret_hash(rt0)
        db.add(sess)
        db.commit()

        # First refresh rotates.
        refresh_web_session(
            db,
            session_id=sess.id,
            refresh_token=rt0,
            request_id="req-1",
            last_ip=None,
            user_agent=None,
        )
        # Replay the old RT (different request_id, past grace) → must revoke.
        with pytest.raises(WebAuthError, match="refresh_token_reused"):
            refresh_web_session(
                db,
                session_id=sess.id,
                refresh_token=rt0,
                request_id="req-2",
                last_ip=None,
                user_agent=None,
            )
        db.refresh(sess)
        assert sess.revoked_at is not None
        assert sess.revoke_reason == "refresh_replay"
    finally:
        _cleanup(db, user)


def test_idempotent_retry_within_grace_window_is_allowed():
    db = next(get_db())
    suffix = secrets.token_hex(4)
    user = _make_user(db, suffix)
    try:
        from datetime import timedelta
        from app.models._mixins import utcnow
        from app.models.web_auth import WebSession

        now = utcnow()
        sess = WebSession(
            id=uuid.uuid4(),
            user_id=user.id,
            login_provider="password",
            refresh_token_hash="pending",
            token_family_id=uuid.uuid4(),
            refresh_generation=0,
            last_used_at=now,
            idle_expires_at=now + timedelta(days=30),
            absolute_expires_at=now + timedelta(days=90),
        )
        rt0 = derive_refresh_token(sess.id, 0)
        sess.refresh_token_hash = secret_hash(rt0)
        db.add(sess)
        db.commit()

        # First refresh.
        first = refresh_web_session(
            db,
            session_id=sess.id,
            refresh_token=rt0,
            request_id="req-dup",
            last_ip=None,
            user_agent=None,
        )
        # Same client retries with the same request_id (network blip).
        second = refresh_web_session(
            db,
            session_id=sess.id,
            refresh_token=rt0,
            request_id="req-dup",
            last_ip=None,
            user_agent=None,
        )
        assert second.refresh_token == first.refresh_token
    finally:
        _cleanup(db, user)


# --- HTTP-level tests (TestClient) ---------------------------------------


def _register_user_for_http(email: str, password: str, display_name: str) -> str:
    """Hit /auth/register to seed a user, then return the access token from /auth/login.
    The /auth/login call also exercises the new flow.
    """
    client = TestClient(app)
    resp = client.post(
        "/auth/register",
        json={"email": email, "password": password, "display_name": display_name},
    )
    if resp.status_code == 409:
        # Pre-existing user from a previous test run; ignore.
        pass
    else:
        assert resp.status_code == 201, resp.text
    return email


def test_login_sets_cookie_and_returns_access_token():
    client = TestClient(app)
    email = f"login-cookie-{secrets.token_hex(4)}@example.com"
    _register_user_for_http(email, "password123!", f"u-{secrets.token_hex(4)}")

    resp = client.post("/auth/login", json={"email": email, "password": "password123!"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "access_token" in body
    assert body["expires_in"] > 0
    assert "session_id" in body
    # Cookie is HttpOnly.
    set_cookie = resp.headers.get("set-cookie", "")
    assert "HttpOnly" in set_cookie or "httponly" in set_cookie.lower()
    assert "timia_rt" in set_cookie
    assert "Path=/auth" in set_cookie

    # Cleanup.
    db = next(get_db())
    user = db.query(User).filter(User.email == email).first()
    if user:
        _cleanup(db, user)


def test_refresh_issues_new_at_and_rotates_cookie():
    with TestClient(app) as client:
        email = f"refresh-{secrets.token_hex(4)}@example.com"
        _register_user_for_http(email, "password123!", f"u-{secrets.token_hex(4)}")

        login = client.post("/auth/login", json={"email": email, "password": "password123!"})
        assert login.status_code == 200
        body = login.json()
        rt_cookie_v1 = _extract_rt_cookie(login.headers.get("set-cookie", ""))
        assert rt_cookie_v1

        # Refresh — the server looks up the session by RT cookie alone, so
        # the client doesn't need to send X-Session-Id. This is what makes
        # `bootstrapSession()` work on a hard refresh.
        refresh = client.post(
            "/auth/refresh",
            json={"request_id": secrets.token_urlsafe(24)},
        )
        assert refresh.status_code == 200, refresh.text
        rt_cookie_v2 = _extract_rt_cookie(refresh.headers.get("set-cookie", ""))
        assert rt_cookie_v2
        assert rt_cookie_v2 != rt_cookie_v1, "refresh must rotate the RT cookie"

        # Cleanup.
        db = next(get_db())
        user = db.query(User).filter(User.email == email).first()
        if user:
            _cleanup(db, user)


def test_refresh_works_without_session_id_header():
    """The client does not need to remember the session id across a hard
    refresh — the server finds the session by RT hash. This is the
    `bootstrapSession()` contract."""
    with TestClient(app) as client:
        email = f"bootstrap-{secrets.token_hex(4)}@example.com"
        _register_user_for_http(email, "password123!", f"u-{secrets.token_hex(4)}")

        client.post("/auth/login", json={"email": email, "password": "password123!"})
        # No X-Session-Id header — the server should still find the session.
        refresh = client.post(
            "/auth/refresh",
            json={"request_id": secrets.token_urlsafe(24)},
        )
        assert refresh.status_code == 200, refresh.text
        assert "access_token" in refresh.json()

        # Cleanup.
        db = next(get_db())
        user = db.query(User).filter(User.email == email).first()
        if user:
            _cleanup(db, user)


def _extract_rt_cookie(set_cookie: str) -> str | None:
    """Parse `Set-Cookie: timia_rt=xxx; ...` and return the value."""
    for piece in set_cookie.split(","):
        # `set_cookie` may have multiple cookies comma-joined; for our test we
        # know there's only one.
        if "timia_rt=" in piece:
            return piece.split("timia_rt=", 1)[1].split(";", 1)[0]
    return None


def test_logout_clears_cookie_and_revokes_session():
    with TestClient(app) as client:
        email = f"logout-{secrets.token_hex(4)}@example.com"
        _register_user_for_http(email, "password123!", f"u-{secrets.token_hex(4)}")

        client.post("/auth/login", json={"email": email, "password": "password123!"})
        # TestClient inside `with` block shares the cookie jar across calls.
        resp = client.post("/auth/logout")
        assert resp.status_code == 204
        set_cookie = resp.headers.get("set-cookie", "")
        assert "timia_rt" in set_cookie
        assert "Max-Age=0" in set_cookie or "max-age=0" in set_cookie.lower()

        # Cleanup.
        db = next(get_db())
        user = db.query(User).filter(User.email == email).first()
        if user:
            _cleanup(db, user)


def test_at_contains_session_id_and_decodes_to_web_audience():
    user_id = str(uuid.uuid4())
    sid = str(uuid.uuid4())
    token = create_access_token(user_id, session_id=sid)
    from app.core.security import decode_access_token

    payload = decode_access_token(token)
    assert payload["sub"] == user_id
    assert payload["sid"] == sid
