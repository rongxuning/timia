"""LLM key ordering, failover, and admin CRUD."""

import secrets
import uuid
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.core.config import settings
from app.core.security import create_access_token, hash_password
from app.db.deps import get_db
from app.main import app
from app.models.llm_api_key import LlmApiKey
from app.models.user import User
from app.schemas.views.schedule import NaturalLanguageParseOut
from app.services.agent_tokens import required_scope_for_request
from app.services.llm_api_keys import (
    AUTH_COOLDOWN,
    QUOTA_COOLDOWN,
    TRANSIENT_COOLDOWN,
    LlmKeyCandidate,
    classify_provider_failure,
    mask_api_key,
    select_call_order,
)
from app.services.natural_language_schedule import (
    NaturalLanguageConfigurationError,
    NaturalLanguageProviderError,
    run_chat_with_failover,
)


def _row(**kwargs) -> LlmApiKey:
    now = datetime(2026, 9, 1, tzinfo=timezone.utc)
    values = {
        "id": uuid.uuid4(),
        "name": "key",
        "base_url": "https://api.minimaxi.com/v1",
        "api_key": "secret-key-1234",
        "model": "MiniMax-M2.7",
        "enabled": True,
        "priority": 100,
        "created_at": now,
        "updated_at": now,
        "cooldown_until": None,
    }
    values.update(kwargs)
    return LlmApiKey(**values)


def _candidate(name: str, model: str = "MiniMax-M2.7") -> LlmKeyCandidate:
    return LlmKeyCandidate(
        id=uuid.uuid4(),
        name=name,
        base_url="https://api.minimaxi.com/v1",
        api_key=f"secret-{name}-zzzz",
        model=model,
        timeout_seconds=5,
    )


def _valid_body() -> dict:
    return {
        "choices": [
            {
                "message": {
                    "content": """
                    {
                      "draft": {
                        "title": "产品会议",
                        "body": null,
                        "start_at": "2026-07-31T15:00:00+08:00",
                        "end_at": "2026-07-31T16:00:00+08:00",
                        "all_day": false,
                        "status": "todo",
                        "priority": "1",
                        "location": null,
                        "workspace_name": null,
                        "project_name": null,
                        "assignee_name": null,
                        "participant_names": [],
                        "recurrence_text": null
                      },
                      "confidence": 0.9,
                      "assumptions": [],
                      "missing_fields": [],
                      "ambiguities": []
                    }
                    """
                }
            }
        ]
    }


def _http_error(status_code: int, text: str) -> httpx.HTTPStatusError:
    request = httpx.Request("POST", "https://api.minimaxi.com/v1/chat/completions")
    response = httpx.Response(status_code, text=text, request=request)
    return httpx.HTTPStatusError("fail", request=request, response=response)


def test_mask_keeps_only_the_last_four_characters():
    assert mask_api_key("abcdefghij") == "••••ghij"


def test_balance_error_cools_longer_than_a_timeout():
    assert classify_provider_failure(500, "insufficient balance (1008)") == QUOTA_COOLDOWN
    assert classify_provider_failure(401, "invalid api key") == AUTH_COOLDOWN
    assert classify_provider_failure(None, "timed out") == TRANSIENT_COOLDOWN


def test_pat_cannot_manage_llm_keys():
    assert required_scope_for_request("GET", "/llm-api-keys") == "__deny__"
    assert required_scope_for_request("POST", "/llm-api-keys/x/probe") == "__deny__"


def test_ready_keys_skip_cooling_standbys_and_disabled_rows():
    now = datetime(2026, 9, 24, tzinfo=timezone.utc)
    rows = [
        _row(name="cooling", priority=1, cooldown_until=now + timedelta(minutes=5)),
        _row(name="later", priority=20, created_at=now),
        _row(name="primary", priority=10, created_at=now),
        _row(name="off", priority=0, enabled=False),
    ]
    ordered = select_call_order(rows, now=now)
    assert [item.name for item in ordered] == ["primary", "later"]


def test_cooling_keys_are_used_when_nothing_else_is_ready():
    now = datetime(2026, 9, 24, tzinfo=timezone.utc)
    rows = [
        _row(name="late", priority=5, cooldown_until=now + timedelta(minutes=1)),
        _row(name="soon", priority=1, cooldown_until=now + timedelta(minutes=1)),
    ]
    ordered = select_call_order(rows, now=now)
    assert [item.name for item in ordered] == ["soon", "late"]


def test_no_keys_outside_the_table():
    now = datetime.now(timezone.utc)
    assert select_call_order([], now=now) == []
    assert select_call_order([_row(name="off", enabled=False)], now=now) == []


def test_failover_uses_the_next_key_after_an_http_error():
    primary = _candidate("primary", model="first")
    backup = _candidate("backup", model="second")
    calls: list[str] = []
    failed: list[str] = []

    def poster(candidate: LlmKeyCandidate, _body: dict) -> dict:
        calls.append(candidate.name)
        if candidate.name == "primary":
            raise _http_error(500, '{"message":"insufficient balance (1008)"}')
        return _valid_body()

    parsed, model = run_chat_with_failover(
        [primary, backup],
        request_for=lambda candidate: {"model": candidate.model},
        poster=poster,
        on_success=lambda candidate: None,
        on_failure=lambda candidate, _error: failed.append(candidate.name),
    )
    assert isinstance(parsed, NaturalLanguageParseOut)
    assert parsed.draft.title == "产品会议"
    assert model == "second"
    assert calls == ["primary", "backup"]
    assert failed == ["primary"]


def test_invalid_model_output_does_not_try_the_next_key():
    calls: list[str] = []

    def poster(candidate: LlmKeyCandidate, _body: dict) -> dict:
        calls.append(candidate.name)
        return {"choices": [{"message": {"content": "not-json"}}]}

    with pytest.raises(NaturalLanguageProviderError):
        run_chat_with_failover(
            [_candidate("primary"), _candidate("backup")],
            request_for=lambda candidate: {"model": candidate.model},
            poster=poster,
            on_success=lambda candidate: calls.append(f"ok:{candidate.name}"),
            on_failure=lambda candidate, _error: calls.append(f"bad:{candidate.name}"),
        )
    assert calls == ["primary", "ok:primary"]


def test_no_keys_is_a_configuration_error():
    with pytest.raises(NaturalLanguageConfigurationError):
        run_chat_with_failover(
            [],
            request_for=lambda candidate: {},
            poster=lambda candidate, body: {},
            on_success=lambda candidate: None,
            on_failure=lambda candidate, error: None,
        )


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _make_user(db, suffix: str, *, admin: bool) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"llm-key-{suffix}@example.com",
        display_name=f"llm-key-{suffix}",
        password_hash=hash_password("password123!"),
        status="active",
        system_role="admin" if admin else "user",
    )
    db.add(user)
    db.commit()
    return user


@pytest.fixture
def llm_key_clients():
    db = next(get_db())
    suffix = secrets.token_hex(4)
    admin = _make_user(db, f"admin-{suffix}", admin=True)
    member = _make_user(db, f"user-{suffix}", admin=False)
    admin_token = create_access_token(subject=str(admin.id), audience=settings.jwt_audience)
    member_token = create_access_token(subject=str(member.id), audience=settings.jwt_audience)
    client = TestClient(app)
    prefix = f"llm-test-{suffix}"
    try:
        yield client, _headers(admin_token), _headers(member_token), prefix
    finally:
        db.execute(delete(LlmApiKey).where(LlmApiKey.name.startswith(prefix)))
        db.execute(delete(User).where(User.id.in_([admin.id, member.id])))
        db.commit()
        db.close()


def _payload(prefix: str, name: str, **extra) -> dict:
    body = {
        "name": f"{prefix}-{name}",
        "base_url": "https://api.minimaxi.com/v1",
        "api_key": f"sk-live-{name}-9999",
        "model": "MiniMax-M2.7",
        "enabled": True,
        "priority": 10,
    }
    body.update(extra)
    return body


def test_llm_key_crud_is_admin_only_and_hides_the_secret(llm_key_clients):
    client, admin_headers, member_headers, prefix = llm_key_clients
    secret = "sk-live-main-9999"

    denied = client.get("/llm-api-keys")
    assert denied.status_code == 401

    forbidden = client.get("/llm-api-keys", headers=member_headers)
    assert forbidden.status_code == 403
    assert forbidden.json()["detail"] == "admin_required"

    created = client.post(
        "/llm-api-keys",
        headers=admin_headers,
        json=_payload(prefix, "main", api_key=secret, priority=20),
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["role"] == "primary"
    assert body["api_key_hint"] == "••••9999"
    assert secret not in created.text
    key_id = body["id"]

    backup = client.post(
        "/llm-api-keys",
        headers=admin_headers,
        json=_payload(prefix, "backup", priority=30),
    )
    assert backup.status_code == 201, backup.text
    assert backup.json()["role"] == "standby"

    listed = client.get("/llm-api-keys", headers=admin_headers)
    assert listed.status_code == 200
    assert [item["name"] for item in listed.json()["keys"]].count(f"{prefix}-main") == 1
    assert secret not in listed.text

    renamed = client.patch(
        f"/llm-api-keys/{key_id}",
        headers=admin_headers,
        json={"name": f"{prefix}-main-2"},
    )
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["api_key_hint"] == "••••9999"
    assert secret not in renamed.text

    primary = client.post(
        f"/llm-api-keys/{backup.json()['id']}/make-primary",
        headers=admin_headers,
    )
    assert primary.status_code == 200, primary.text
    assert primary.json()["role"] == "primary"

    removed = client.delete(f"/llm-api-keys/{key_id}", headers=admin_headers)
    assert removed.status_code == 204


def test_probe_records_an_unavailable_key_without_echoing_the_secret(llm_key_clients, monkeypatch):
    client, admin_headers, _member_headers, prefix = llm_key_clients
    secret = "sk-live-probe-9999"
    created = client.post(
        "/llm-api-keys",
        headers=admin_headers,
        json=_payload(prefix, "probe", api_key=secret),
    )
    assert created.status_code == 201, created.text
    key_id = created.json()["id"]

    def boom(_candidate):
        raise _http_error(500, '{"message":"insufficient balance (1008)"} ' + secret)

    monkeypatch.setattr("app.routes.llm_api_keys.probe_llm_key", boom)
    probed = client.post(f"/llm-api-keys/{key_id}/probe", headers=admin_headers)
    assert probed.status_code == 200, probed.text
    body = probed.json()
    assert body["ok"] is False
    assert body["key"]["last_status"] == "unavailable"
    assert "1008" in body["key"]["last_error"]
    assert secret not in probed.text
    assert body["key"]["cooldown_until"] is not None
