"""HTTP tests for plan template write APIs.

Each test registers unique users via /auth/register + /auth/login and cleans
up plan rows and users through get_db(). There is no shared auth fixture.
"""

from __future__ import annotations

import secrets
import uuid
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from app.db.deps import get_db
from app.main import app
from app.models._mixins import utcnow
from app.models.activity import ActivityLog
from app.models.item import Item
from app.models.plan import (
    PlanApplyRun,
    PlanComment,
    PlanNotification,
    PlanSlot,
    PlanSubscription,
    PlanSubscriptionSegment,
    PlanTemplate,
    PlanTemplateTag,
)
from app.models.project import Project, ProjectFavorite, ProjectMember
from app.models.user import User
from app.models.web_auth import WebSession
from app.models.workspace import Workspace, WorkspaceMember

PASSWORD = "password123!"

_TEMPLATE = {
    "title": "晨间",
    "description": "d",
    "creator_intro": "作者介绍",
    "usage_kind": "one_shot",
    "period_kind": "week",
    "visibility": "private",
    "tags": ["专注"],
}


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _register_and_login(client: TestClient) -> tuple[str, str]:
    suffix = secrets.token_hex(8)
    email = f"plan-api-{suffix}@example.com"
    display_name = f"plan-api-{suffix}"
    register = client.post(
        "/auth/register",
        json={"email": email, "password": PASSWORD, "display_name": display_name},
    )
    assert register.status_code == 201, register.text
    login = client.post("/auth/login", json={"email": email, "password": PASSWORD})
    assert login.status_code == 200, login.text
    return email, login.json()["access_token"]


def _cleanup_emails(emails: list[str]) -> None:
    db = next(get_db())
    try:
        users = list(db.scalars(select(User).where(User.email.in_(emails))).all())
        if not users:
            return
        user_ids = [u.id for u in users]
        templates = list(
            db.scalars(select(PlanTemplate).where(PlanTemplate.created_by_user_id.in_(user_ids))).all()
        )
        template_ids = [t.id for t in templates]
        if template_ids:
            db.execute(delete(PlanNotification).where(PlanNotification.template_id.in_(template_ids)))
            db.execute(delete(PlanComment).where(PlanComment.template_id.in_(template_ids)))
            db.execute(delete(PlanApplyRun).where(PlanApplyRun.template_id.in_(template_ids)))
            sub_ids = list(
                db.scalars(
                    select(PlanSubscription.id).where(PlanSubscription.template_id.in_(template_ids))
                ).all()
            )
            if sub_ids:
                db.execute(
                    delete(PlanSubscriptionSegment).where(
                        PlanSubscriptionSegment.subscription_id.in_(sub_ids)
                    )
                )
                db.execute(delete(PlanSubscription).where(PlanSubscription.id.in_(sub_ids)))
            db.execute(delete(PlanTemplateTag).where(PlanTemplateTag.template_id.in_(template_ids)))
            db.execute(delete(PlanSlot).where(PlanSlot.template_id.in_(template_ids)))
            db.execute(delete(PlanTemplate).where(PlanTemplate.id.in_(template_ids)))
        db.execute(delete(PlanNotification).where(PlanNotification.user_id.in_(user_ids)))

        workspaces = list(
            db.scalars(select(Workspace).where(Workspace.created_by_user_id.in_(user_ids))).all()
        )
        ws_ids = [w.id for w in workspaces]
        if ws_ids:
            db.execute(delete(ActivityLog).where(ActivityLog.workspace_id.in_(ws_ids)))
            db.execute(delete(Item).where(Item.workspace_id.in_(ws_ids)))
            db.execute(delete(ProjectFavorite).where(ProjectFavorite.workspace_id.in_(ws_ids)))
            db.execute(delete(ProjectMember).where(ProjectMember.workspace_id.in_(ws_ids)))
            db.execute(delete(Project).where(Project.workspace_id.in_(ws_ids)))
            db.execute(delete(WorkspaceMember).where(WorkspaceMember.workspace_id.in_(ws_ids)))
            db.execute(delete(Workspace).where(Workspace.id.in_(ws_ids)))

        db.execute(delete(WebSession).where(WebSession.user_id.in_(user_ids)))
        db.execute(delete(User).where(User.id.in_(user_ids)))
        db.commit()
    finally:
        db.close()


def _slot(i: int = 0, **overrides) -> dict:
    data = {
        "rel_month": None,
        "rel_day": 0,
        "start_minute": i,
        "end_minute": i + 1,
        "all_day": False,
        "title": str(i),
        "body": None,
        "details": None,
        "color": "#FFFFFF",
        "priority": "1",
        "location": None,
        "sort_index": i,
    }
    data.update(overrides)
    return data


def test_create_plan_template_returns_201():
    client = TestClient(app)
    email, token = _register_and_login(client)
    try:
        r = client.post("/plan-templates", json=_TEMPLATE, headers=_headers(token))
        assert r.status_code == 201
        body = r.json()
        assert body["usage_kind"] == "one_shot"
        assert body["creator_intro"] == "作者介绍"
        assert body["tags"] == ["专注"]
    finally:
        _cleanup_emails([email])


def test_put_slots_rejects_over_week_limit():
    client = TestClient(app)
    email, token = _register_and_login(client)
    try:
        created = client.post("/plan-templates", json=_TEMPLATE, headers=_headers(token))
        assert created.status_code == 201, created.text
        template_id = created.json()["id"]
        slots = [_slot(i) for i in range(51)]
        r = client.put(f"/plan-templates/{template_id}/slots", json=slots, headers=_headers(token))
        assert r.status_code == 400
        assert r.json()["detail"] == "too_many_slots"
    finally:
        _cleanup_emails([email])


def test_other_user_cannot_patch_private_template():
    client = TestClient(app)
    owner_email, owner_token = _register_and_login(client)
    other_email, other_token = _register_and_login(client)
    try:
        created = client.post("/plan-templates", json=_TEMPLATE, headers=_headers(owner_token))
        assert created.status_code == 201, created.text
        template_id = created.json()["id"]
        r = client.patch(
            f"/plan-templates/{template_id}",
            json={"title": "hijack"},
            headers=_headers(other_token),
        )
        assert r.status_code == 404
        assert r.json()["detail"] == "not_found"
    finally:
        _cleanup_emails([owner_email, other_email])


def test_create_plan_template_requires_auth():
    client = TestClient(app)
    r = client.post("/plan-templates", json=_TEMPLATE)
    assert r.status_code == 401


def test_create_rejects_invalid_kinds():
    client = TestClient(app)
    email, token = _register_and_login(client)
    try:
        usage = client.post(
            "/plan-templates",
            json={**_TEMPLATE, "usage_kind": "paid"},
            headers=_headers(token),
        )
        assert usage.status_code == 400
        assert usage.json()["detail"] == "invalid_usage_kind"

        period = client.post(
            "/plan-templates",
            json={**_TEMPLATE, "period_kind": "quarter"},
            headers=_headers(token),
        )
        assert period.status_code == 400
        assert period.json()["detail"] == "invalid_period_kind"

        visibility = client.post(
            "/plan-templates",
            json={**_TEMPLATE, "visibility": "paid"},
            headers=_headers(token),
        )
        assert visibility.status_code == 400
        assert visibility.json()["detail"] == "invalid_visibility"
    finally:
        _cleanup_emails([email])


def test_create_rejects_too_many_and_too_long_tags():
    client = TestClient(app)
    email, token = _register_and_login(client)
    try:
        too_many = client.post(
            "/plan-templates",
            json={**_TEMPLATE, "tags": [f"t{i}" for i in range(9)]},
            headers=_headers(token),
        )
        assert too_many.status_code == 400
        assert too_many.json()["detail"] == "too_many_tags"

        too_long = client.post(
            "/plan-templates",
            json={**_TEMPLATE, "tags": ["x" * 21]},
            headers=_headers(token),
        )
        assert too_long.status_code == 400
        assert too_long.json()["detail"] == "tag_too_long"
    finally:
        _cleanup_emails([email])


def test_put_slots_rejects_invalid_slot():
    client = TestClient(app)
    email, token = _register_and_login(client)
    try:
        created = client.post("/plan-templates", json=_TEMPLATE, headers=_headers(token))
        assert created.status_code == 201, created.text
        template_id = created.json()["id"]
        r = client.put(
            f"/plan-templates/{template_id}/slots",
            json=[_slot(rel_day=7, start_minute=0, end_minute=60)],
            headers=_headers(token),
        )
        assert r.status_code == 400
        assert r.json()["detail"] == "invalid_slot"

        cross_day = client.put(
            f"/plan-templates/{template_id}/slots",
            json=[_slot(start_minute=1400, end_minute=1500)],
            headers=_headers(token),
        )
        assert cross_day.status_code == 400
        assert cross_day.json()["detail"] == "invalid_slot"
    finally:
        _cleanup_emails([email])


def test_put_slots_replaces_all_and_bumps_version():
    client = TestClient(app)
    email, token = _register_and_login(client)
    try:
        created = client.post("/plan-templates", json=_TEMPLATE, headers=_headers(token))
        assert created.status_code == 201, created.text
        template_id = created.json()["id"]
        first = client.put(
            f"/plan-templates/{template_id}/slots",
            json=[_slot(0), _slot(1)],
            headers=_headers(token),
        )
        assert first.status_code == 200, first.text
        second = client.put(
            f"/plan-templates/{template_id}/slots",
            json=[_slot(3, title="only")],
            headers=_headers(token),
        )
        assert second.status_code == 200, second.text

        db = next(get_db())
        try:
            template = db.get(PlanTemplate, uuid.UUID(template_id))
            assert template is not None
            assert template.version == 3
            slots = list(
                db.scalars(select(PlanSlot).where(PlanSlot.template_id == template.id)).all()
            )
            assert len(slots) == 1
            assert slots[0].title == "only"
        finally:
            db.close()
    finally:
        _cleanup_emails([email])


def test_patch_does_not_change_usage_or_period_and_bumps_version():
    client = TestClient(app)
    email, token = _register_and_login(client)
    try:
        created = client.post("/plan-templates", json=_TEMPLATE, headers=_headers(token))
        assert created.status_code == 201, created.text
        template_id = created.json()["id"]
        assert created.json()["version"] == 1
        r = client.patch(
            f"/plan-templates/{template_id}",
            json={
                "title": "新标题",
                "usage_kind": "subscription",
                "period_kind": "day",
            },
            headers=_headers(token),
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["title"] == "新标题"
        assert body["usage_kind"] == "one_shot"
        assert body["period_kind"] == "week"
        assert body["version"] == 2
    finally:
        _cleanup_emails([email])


def test_delete_template_is_creator_only():
    client = TestClient(app)
    owner_email, owner_token = _register_and_login(client)
    other_email, other_token = _register_and_login(client)
    try:
        created = client.post("/plan-templates", json=_TEMPLATE, headers=_headers(owner_token))
        assert created.status_code == 201, created.text
        template_id = created.json()["id"]
        denied = client.delete(f"/plan-templates/{template_id}", headers=_headers(other_token))
        assert denied.status_code == 404
        assert denied.json()["detail"] == "not_found"
        ok = client.delete(f"/plan-templates/{template_id}", headers=_headers(owner_token))
        assert ok.status_code == 204
        db = next(get_db())
        try:
            assert db.get(PlanTemplate, uuid.UUID(template_id)) is None
        finally:
            db.close()
    finally:
        _cleanup_emails([owner_email, other_email])


def test_put_slots_notifies_active_subscribers():
    client = TestClient(app)
    owner_email, owner_token = _register_and_login(client)
    sub_email, sub_token = _register_and_login(client)
    try:
        created = client.post(
            "/plan-templates",
            json={**_TEMPLATE, "usage_kind": "subscription", "visibility": "public"},
            headers=_headers(owner_token),
        )
        assert created.status_code == 201, created.text
        template_id = created.json()["id"]

        ws = client.post("/workspaces", json={"name": "plan-ws"}, headers=_headers(sub_token))
        assert ws.status_code == 201, ws.text
        workspace_id = uuid.UUID(ws.json()["id"])
        pj = client.post(
            f"/workspaces/{workspace_id}/projects",
            json={"name": "plan-pj"},
            headers=_headers(sub_token),
        )
        assert pj.status_code == 201, pj.text
        project_id = uuid.UUID(pj.json()["id"])

        db = next(get_db())
        try:
            subscriber = db.scalar(select(User).where(User.email == sub_email))
            assert subscriber is not None
            subscription = PlanSubscription(
                template_id=uuid.UUID(template_id),
                subscriber_user_id=subscriber.id,
                workspace_id=workspace_id,
                project_id=project_id,
            )
            db.add(subscription)
            db.flush()
            db.add(
                PlanSubscriptionSegment(
                    subscription_id=subscription.id,
                    started_at=utcnow(),
                    ended_at=None,
                )
            )
            db.commit()
            subscriber_id = subscriber.id
        finally:
            db.close()

        r = client.put(
            f"/plan-templates/{template_id}/slots",
            json=[_slot(0)],
            headers=_headers(owner_token),
        )
        assert r.status_code == 200, r.text

        db = next(get_db())
        try:
            notes = list(
                db.scalars(
                    select(PlanNotification).where(PlanNotification.user_id == subscriber_id)
                ).all()
            )
            assert len(notes) == 1
            assert notes[0].kind == "template_updated"
            assert notes[0].template_id == uuid.UUID(template_id)
        finally:
            db.close()
    finally:
        _cleanup_emails([owner_email, sub_email])


def test_delete_ends_open_segments_and_cancels_pending_runs():
    client = TestClient(app)
    owner_email, owner_token = _register_and_login(client)
    sub_email, sub_token = _register_and_login(client)
    try:
        created = client.post(
            "/plan-templates",
            json={**_TEMPLATE, "usage_kind": "subscription", "visibility": "public"},
            headers=_headers(owner_token),
        )
        assert created.status_code == 201, created.text
        template_id = created.json()["id"]

        ws = client.post("/workspaces", json={"name": "plan-del-ws"}, headers=_headers(sub_token))
        assert ws.status_code == 201, ws.text
        workspace_id = uuid.UUID(ws.json()["id"])
        pj = client.post(
            f"/workspaces/{workspace_id}/projects",
            json={"name": "plan-del-pj"},
            headers=_headers(sub_token),
        )
        assert pj.status_code == 201, pj.text
        project_id = uuid.UUID(pj.json()["id"])

        db = next(get_db())
        try:
            subscriber = db.scalar(select(User).where(User.email == sub_email))
            assert subscriber is not None
            subscription = PlanSubscription(
                template_id=uuid.UUID(template_id),
                subscriber_user_id=subscriber.id,
                workspace_id=workspace_id,
                project_id=project_id,
            )
            db.add(subscription)
            db.flush()
            segment = PlanSubscriptionSegment(
                subscription_id=subscription.id,
                started_at=utcnow(),
                ended_at=None,
            )
            db.add(segment)
            db.flush()
            run = PlanApplyRun(
                template_id=uuid.UUID(template_id),
                template_version=1,
                actor_user_id=subscriber.id,
                workspace_id=workspace_id,
                project_id=project_id,
                source="subscription",
                subscription_id=subscription.id,
                segment_id=segment.id,
                period_start=date(2026, 8, 16),
                period_kind="week",
                status="pending",
            )
            db.add(run)
            db.commit()
            run_id = run.id
            segment_id = segment.id
        finally:
            db.close()

        r = client.delete(f"/plan-templates/{template_id}", headers=_headers(owner_token))
        assert r.status_code == 204

        db = next(get_db())
        try:
            # Template delete cascades subscriptions/runs; the write path must still
            # have ended the segment and canceled the pending run before delete.
            assert db.get(PlanTemplate, uuid.UUID(template_id)) is None
            assert db.get(PlanSubscriptionSegment, segment_id) is None
            assert db.get(PlanApplyRun, run_id) is None
        finally:
            db.close()
    finally:
        _cleanup_emails([owner_email, sub_email])
