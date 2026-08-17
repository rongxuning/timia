"""HTTP tests for plan template write APIs.

Each test registers unique users via /auth/register + /auth/login and cleans
up plan rows and users through get_db(). There is no shared auth fixture.
"""

from __future__ import annotations

import secrets
import uuid
from datetime import date, datetime
from zoneinfo import ZoneInfo

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
from app.services.plan_api import close_template_subscriptions
from app.services.plan_time import current_period_start

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
            db.scalars(
                select(PlanTemplate).where(PlanTemplate.created_by_user_id.in_(user_ids))
            ).all()
        )
        template_ids = [t.id for t in templates]
        if template_ids:
            db.execute(
                delete(PlanNotification).where(PlanNotification.template_id.in_(template_ids))
            )
            db.execute(delete(PlanComment).where(PlanComment.template_id.in_(template_ids)))
            db.execute(delete(PlanApplyRun).where(PlanApplyRun.template_id.in_(template_ids)))
            sub_ids = list(
                db.scalars(
                    select(PlanSubscription.id).where(
                        PlanSubscription.template_id.in_(template_ids)
                    )
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


def _workspace_and_project(client: TestClient, token: str) -> tuple[str, str]:
    ws = client.post(
        "/workspaces",
        json={"name": "plan-apply-ws", "color": "#AABBCC"},
        headers=_headers(token),
    )
    assert ws.status_code == 201, ws.text
    workspace_id = ws.json()["id"]
    pj = client.post(
        f"/workspaces/{workspace_id}/projects",
        json={"name": "plan-apply-pj"},
        headers=_headers(token),
    )
    assert pj.status_code == 201, pj.text
    return workspace_id, pj.json()["id"]


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


def _subscription_template_with_slot(client: TestClient, token: str) -> str:
    created = client.post(
        "/plan-templates",
        json={**_TEMPLATE, "usage_kind": "subscription", "visibility": "public"},
        headers=_headers(token),
    )
    assert created.status_code == 201, created.text
    template_id = created.json()["id"]
    slots = client.put(
        f"/plan-templates/{template_id}/slots",
        json=[_slot(0, rel_day=1, start_minute=9 * 60, end_minute=10 * 60, title="周一晨练")],
        headers=_headers(token),
    )
    assert slots.status_code == 200, slots.text
    return template_id


def _insert_pending_run(
    *,
    email: str,
    template_id: str,
    workspace_id: str,
    project_id: str,
    period_start: date,
    template_version: int | None = None,
) -> tuple[str, str]:
    db = next(get_db())
    try:
        subscriber = db.scalar(select(User).where(User.email == email))
        assert subscriber is not None
        template = db.get(PlanTemplate, uuid.UUID(template_id))
        assert template is not None
        version = template.version if template_version is None else template_version
        subscription = PlanSubscription(
            template_id=uuid.UUID(template_id),
            subscriber_user_id=subscriber.id,
            workspace_id=uuid.UUID(workspace_id),
            project_id=uuid.UUID(project_id),
            timezone="Asia/Shanghai",
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
            template_version=version,
            actor_user_id=subscriber.id,
            workspace_id=uuid.UUID(workspace_id),
            project_id=uuid.UUID(project_id),
            source="subscription",
            subscription_id=subscription.id,
            segment_id=segment.id,
            period_start=period_start,
            period_kind="week",
            status="pending",
        )
        db.add(run)
        db.commit()
        return str(run.id), str(subscription.id)
    finally:
        db.close()


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
            assert db.get(PlanTemplate, uuid.UUID(template_id)) is None
            assert db.get(PlanSubscriptionSegment, segment_id) is None
            assert db.get(PlanApplyRun, run_id) is None
        finally:
            db.close()
    finally:
        _cleanup_emails([owner_email, sub_email])


def test_close_template_subscriptions_ends_segment_and_cancels_pending_run():
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
        template_id = uuid.UUID(created.json()["id"])

        ws = client.post("/workspaces", json={"name": "plan-close-ws"}, headers=_headers(sub_token))
        assert ws.status_code == 201, ws.text
        workspace_id = uuid.UUID(ws.json()["id"])
        pj = client.post(
            f"/workspaces/{workspace_id}/projects",
            json={"name": "plan-close-pj"},
            headers=_headers(sub_token),
        )
        assert pj.status_code == 201, pj.text
        project_id = uuid.UUID(pj.json()["id"])

        db = next(get_db())
        try:
            subscriber = db.scalar(select(User).where(User.email == sub_email))
            assert subscriber is not None
            template = db.get(PlanTemplate, template_id)
            assert template is not None
            subscription = PlanSubscription(
                template_id=template_id,
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
                template_id=template_id,
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
            db.flush()
            segment_id = segment.id
            run_id = run.id

            close_template_subscriptions(db, template)
            db.flush()
            db.expire_all()

            segment = db.get(PlanSubscriptionSegment, segment_id)
            run = db.get(PlanApplyRun, run_id)
            assert segment is not None
            assert segment.ended_at is not None
            assert run is not None
            assert run.status == "canceled"
            assert db.get(PlanTemplate, template_id) is not None
        finally:
            db.close()
    finally:
        _cleanup_emails([owner_email, sub_email])


def test_apply_subscription_template_rejected():
    client = TestClient(app)
    email, token = _register_and_login(client)
    try:
        created = client.post(
            "/plan-templates",
            json={**_TEMPLATE, "usage_kind": "subscription", "visibility": "public"},
            headers=_headers(token),
        )
        assert created.status_code == 201, created.text
        template_id = created.json()["id"]
        workspace_id, project_id = _workspace_and_project(client, token)
        r = client.post(
            f"/plan-templates/{template_id}/apply",
            json={
                "workspace_id": workspace_id,
                "project_id": project_id,
                "period_start": "2026-08-16",
            },
            headers=_headers(token),
        )
        assert r.status_code == 400
        assert r.json()["detail"] == "wrong_usage_kind"
    finally:
        _cleanup_emails([email])


def test_apply_week_creates_items_on_chosen_week():
    client = TestClient(app)
    email, token = _register_and_login(client)
    try:
        created = client.post("/plan-templates", json=_TEMPLATE, headers=_headers(token))
        assert created.status_code == 201, created.text
        template_id = created.json()["id"]
        slots = client.put(
            f"/plan-templates/{template_id}/slots",
            json=[_slot(0, rel_day=1, start_minute=9 * 60, end_minute=10 * 60, title="周一晨练")],
            headers=_headers(token),
        )
        assert slots.status_code == 200, slots.text
        workspace_id, project_id = _workspace_and_project(client, token)

        r = client.post(
            f"/plan-templates/{template_id}/apply",
            json={
                "workspace_id": workspace_id,
                "project_id": project_id,
                "period_start": "2026-08-16",
            },
            headers=_headers(token),
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["status"] == "applied"
        assert body["item_count"] >= 1
        assert body["period_start"] == "2026-08-16"

        db = next(get_db())
        try:
            actor = db.scalar(select(User).where(User.email == email))
            assert actor is not None
            template = db.get(PlanTemplate, uuid.UUID(template_id))
            assert template is not None
            assert template.use_count == 1
            items = list(
                db.scalars(select(Item).where(Item.project_id == uuid.UUID(project_id))).all()
            )
            assert len(items) >= 1
            for item in items:
                assert item.status == "todo"
                assert item.assignee_user_id == actor.id
                assert item.created_by_user_id == actor.id
                assert item.source_plan_template_id == uuid.UUID(template_id)
                assert item.source_plan_slot_id is not None
                assert item.source_plan_apply_run_id == uuid.UUID(body["id"])
                assert not hasattr(item, "repeat")
            logs = list(
                db.scalars(
                    select(ActivityLog).where(
                        ActivityLog.workspace_id == uuid.UUID(workspace_id),
                        ActivityLog.action == "apply_plan",
                    )
                ).all()
            )
            assert len(logs) == 1
            assert logs[0].entity_type == "plan_apply_run"
            assert logs[0].meta["template_id"] == template_id
            assert logs[0].meta["item_count"] >= 1
            assert logs[0].meta["period_start"] == "2026-08-16"
        finally:
            db.close()

        again = client.post(
            f"/plan-templates/{template_id}/apply",
            json={
                "workspace_id": workspace_id,
                "project_id": project_id,
                "period_start": "2026-08-16",
            },
            headers=_headers(token),
        )
        assert again.status_code == 409
        assert again.json()["detail"] == "already_applied"
    finally:
        _cleanup_emails([email])


def test_apply_empty_template_rejected():
    client = TestClient(app)
    email, token = _register_and_login(client)
    try:
        created = client.post("/plan-templates", json=_TEMPLATE, headers=_headers(token))
        assert created.status_code == 201, created.text
        template_id = created.json()["id"]
        workspace_id, project_id = _workspace_and_project(client, token)
        r = client.post(
            f"/plan-templates/{template_id}/apply",
            json={
                "workspace_id": workspace_id,
                "project_id": project_id,
                "period_start": "2026-08-16",
            },
            headers=_headers(token),
        )
        assert r.status_code == 400
        assert r.json()["detail"] == "empty_template"
        db = next(get_db())
        try:
            template = db.get(PlanTemplate, uuid.UUID(template_id))
            assert template is not None
            assert template.use_count == 0
            runs = list(
                db.scalars(
                    select(PlanApplyRun).where(PlanApplyRun.template_id == uuid.UUID(template_id))
                ).all()
            )
            assert runs == []
        finally:
            db.close()
    finally:
        _cleanup_emails([email])


def test_apply_all_invalid_slots_is_empty_template():
    client = TestClient(app)
    email, token = _register_and_login(client)
    try:
        created = client.post(
            "/plan-templates",
            json={**_TEMPLATE, "period_kind": "month"},
            headers=_headers(token),
        )
        assert created.status_code == 201, created.text
        template_id = created.json()["id"]
        slots = client.put(
            f"/plan-templates/{template_id}/slots",
            json=[_slot(rel_day=31, start_minute=0, end_minute=60, title="31号")],
            headers=_headers(token),
        )
        assert slots.status_code == 200, slots.text
        workspace_id, project_id = _workspace_and_project(client, token)
        r = client.post(
            f"/plan-templates/{template_id}/apply",
            json={
                "workspace_id": workspace_id,
                "project_id": project_id,
                "period_start": "2026-02-01",
            },
            headers=_headers(token),
        )
        assert r.status_code == 400
        assert r.json()["detail"] == "empty_template"
        db = next(get_db())
        try:
            runs = list(
                db.scalars(
                    select(PlanApplyRun).where(PlanApplyRun.template_id == uuid.UUID(template_id))
                ).all()
            )
            assert runs == []
            items = list(
                db.scalars(select(Item).where(Item.project_id == uuid.UUID(project_id))).all()
            )
            assert items == []
        finally:
            db.close()
    finally:
        _cleanup_emails([email])


def test_apply_week_coerces_wednesday_to_sunday():
    client = TestClient(app)
    email, token = _register_and_login(client)
    try:
        created = client.post("/plan-templates", json=_TEMPLATE, headers=_headers(token))
        assert created.status_code == 201, created.text
        template_id = created.json()["id"]
        slots = client.put(
            f"/plan-templates/{template_id}/slots",
            json=[_slot(0)],
            headers=_headers(token),
        )
        assert slots.status_code == 200, slots.text
        workspace_id, project_id = _workspace_and_project(client, token)
        r = client.post(
            f"/plan-templates/{template_id}/apply",
            json={
                "workspace_id": workspace_id,
                "project_id": project_id,
                "period_start": "2026-08-19",
            },
            headers=_headers(token),
        )
        assert r.status_code == 201, r.text
        assert r.json()["period_start"] == "2026-08-16"
        again = client.post(
            f"/plan-templates/{template_id}/apply",
            json={
                "workspace_id": workspace_id,
                "project_id": project_id,
                "period_start": "2026-08-16",
            },
            headers=_headers(token),
        )
        assert again.status_code == 409
        assert again.json()["detail"] == "already_applied"
    finally:
        _cleanup_emails([email])


def test_apply_private_template_not_owner_returns_404():
    client = TestClient(app)
    owner_email, owner_token = _register_and_login(client)
    other_email, other_token = _register_and_login(client)
    try:
        created = client.post("/plan-templates", json=_TEMPLATE, headers=_headers(owner_token))
        assert created.status_code == 201, created.text
        template_id = created.json()["id"]
        slots = client.put(
            f"/plan-templates/{template_id}/slots",
            json=[_slot(0)],
            headers=_headers(owner_token),
        )
        assert slots.status_code == 200, slots.text
        workspace_id, project_id = _workspace_and_project(client, other_token)
        r = client.post(
            f"/plan-templates/{template_id}/apply",
            json={
                "workspace_id": workspace_id,
                "project_id": project_id,
                "period_start": "2026-08-16",
            },
            headers=_headers(other_token),
        )
        assert r.status_code == 404
        assert r.json()["detail"] == "not_found"
    finally:
        _cleanup_emails([owner_email, other_email])


def test_apply_requires_auth():
    client = TestClient(app)
    r = client.post(
        f"/plan-templates/{uuid.uuid4()}/apply",
        json={
            "workspace_id": str(uuid.uuid4()),
            "project_id": str(uuid.uuid4()),
            "period_start": "2026-08-16",
        },
    )
    assert r.status_code == 401


def test_subscribe_imports_current_week():
    client = TestClient(app)
    email, token = _register_and_login(client)
    try:
        template_id = _subscription_template_with_slot(client, token)
        workspace_id, project_id = _workspace_and_project(client, token)
        now = datetime.now(ZoneInfo("Asia/Shanghai"))
        expected_start = current_period_start("week", now, "Asia/Shanghai").isoformat()
        r = client.post(
            f"/plan-templates/{template_id}/subscribe",
            json={
                "workspace_id": workspace_id,
                "project_id": project_id,
                "timezone": "Asia/Shanghai",
            },
            headers=_headers(token),
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["imported_current_period"] is True
        assert body["apply_run"]["period_start"] == expected_start
        assert body["apply_run"]["status"] == "applied"
        assert body["apply_run"]["item_count"] >= 1
        db = next(get_db())
        try:
            template = db.get(PlanTemplate, uuid.UUID(template_id))
            assert template is not None
            assert template.use_count == 1
            items = list(
                db.scalars(select(Item).where(Item.project_id == uuid.UUID(project_id))).all()
            )
            assert len(items) >= 1
        finally:
            db.close()
    finally:
        _cleanup_emails([email])


def test_resubscribe_same_week_does_not_duplicate_items():
    client = TestClient(app)
    email, token = _register_and_login(client)
    try:
        template_id = _subscription_template_with_slot(client, token)
        workspace_id, project_id = _workspace_and_project(client, token)
        first = client.post(
            f"/plan-templates/{template_id}/subscribe",
            json={
                "workspace_id": workspace_id,
                "project_id": project_id,
                "timezone": "Asia/Shanghai",
            },
            headers=_headers(token),
        )
        assert first.status_code == 201, first.text
        subscription_id = first.json()["id"]
        db = next(get_db())
        try:
            item_count = len(
                list(db.scalars(select(Item).where(Item.project_id == uuid.UUID(project_id))).all())
            )
        finally:
            db.close()
        canceled = client.post(
            f"/plan-subscriptions/{subscription_id}/cancel",
            headers=_headers(token),
        )
        assert canceled.status_code == 204, canceled.text
        r = client.post(
            f"/plan-templates/{template_id}/subscribe",
            json={
                "workspace_id": workspace_id,
                "project_id": project_id,
                "timezone": "Asia/Shanghai",
            },
            headers=_headers(token),
        )
        assert r.status_code == 201, r.text
        assert r.json()["imported_current_period"] is False
        assert r.json()["id"] == subscription_id
        db = next(get_db())
        try:
            items = list(
                db.scalars(select(Item).where(Item.project_id == uuid.UUID(project_id))).all()
            )
            assert len(items) == item_count
            template = db.get(PlanTemplate, uuid.UUID(template_id))
            assert template is not None
            assert template.use_count == 1
            segments = list(
                db.scalars(
                    select(PlanSubscriptionSegment).where(
                        PlanSubscriptionSegment.subscription_id == uuid.UUID(subscription_id)
                    )
                ).all()
            )
            assert len(segments) == 2
            open_segments = [s for s in segments if s.ended_at is None]
            assert len(open_segments) == 1
        finally:
            db.close()
    finally:
        _cleanup_emails([email])


def test_subscribe_one_shot_template_rejected():
    client = TestClient(app)
    email, token = _register_and_login(client)
    try:
        created = client.post("/plan-templates", json=_TEMPLATE, headers=_headers(token))
        assert created.status_code == 201, created.text
        template_id = created.json()["id"]
        workspace_id, project_id = _workspace_and_project(client, token)
        r = client.post(
            f"/plan-templates/{template_id}/subscribe",
            json={
                "workspace_id": workspace_id,
                "project_id": project_id,
                "timezone": "Asia/Shanghai",
            },
            headers=_headers(token),
        )
        assert r.status_code == 400
        assert r.json()["detail"] == "wrong_usage_kind"
    finally:
        _cleanup_emails([email])


def test_subscribe_already_subscribed():
    client = TestClient(app)
    email, token = _register_and_login(client)
    try:
        template_id = _subscription_template_with_slot(client, token)
        workspace_id, project_id = _workspace_and_project(client, token)
        payload = {
            "workspace_id": workspace_id,
            "project_id": project_id,
            "timezone": "Asia/Shanghai",
        }
        first = client.post(
            f"/plan-templates/{template_id}/subscribe",
            json=payload,
            headers=_headers(token),
        )
        assert first.status_code == 201, first.text
        r = client.post(
            f"/plan-templates/{template_id}/subscribe",
            json=payload,
            headers=_headers(token),
        )
        assert r.status_code == 409
        assert r.json()["detail"] == "already_subscribed"
    finally:
        _cleanup_emails([email])


def test_cancel_cancels_pending_runs():
    client = TestClient(app)
    email, token = _register_and_login(client)
    try:
        template_id = _subscription_template_with_slot(client, token)
        workspace_id, project_id = _workspace_and_project(client, token)
        run_id, subscription_id = _insert_pending_run(
            email=email,
            template_id=template_id,
            workspace_id=workspace_id,
            project_id=project_id,
            period_start=date(2026, 8, 23),
        )
        r = client.post(
            f"/plan-subscriptions/{subscription_id}/cancel",
            headers=_headers(token),
        )
        assert r.status_code == 204, r.text
        db = next(get_db())
        try:
            run = db.get(PlanApplyRun, uuid.UUID(run_id))
            assert run is not None
            assert run.status == "canceled"
            segments = list(
                db.scalars(
                    select(PlanSubscriptionSegment).where(
                        PlanSubscriptionSegment.subscription_id == uuid.UUID(subscription_id)
                    )
                ).all()
            )
            assert segments
            assert all(s.ended_at is not None for s in segments)
        finally:
            db.close()
    finally:
        _cleanup_emails([email])


def test_cancel_not_subscriber_returns_not_found():
    client = TestClient(app)
    owner_email, owner_token = _register_and_login(client)
    other_email, other_token = _register_and_login(client)
    try:
        template_id = _subscription_template_with_slot(client, owner_token)
        workspace_id, project_id = _workspace_and_project(client, owner_token)
        _run_id, subscription_id = _insert_pending_run(
            email=owner_email,
            template_id=template_id,
            workspace_id=workspace_id,
            project_id=project_id,
            period_start=date(2026, 8, 23),
        )
        r = client.post(
            f"/plan-subscriptions/{subscription_id}/cancel",
            headers=_headers(other_token),
        )
        assert r.status_code == 404
        assert r.json()["detail"] == "not_found"
    finally:
        _cleanup_emails([owner_email, other_email])


def test_confirm_pending_creates_items():
    client = TestClient(app)
    email, token = _register_and_login(client)
    try:
        template_id = _subscription_template_with_slot(client, token)
        workspace_id, project_id = _workspace_and_project(client, token)
        run_id, _subscription_id = _insert_pending_run(
            email=email,
            template_id=template_id,
            workspace_id=workspace_id,
            project_id=project_id,
            period_start=date(2026, 8, 23),
        )
        r = client.post(f"/plan-apply-runs/{run_id}/confirm", headers=_headers(token))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "applied"
        assert body["item_count"] >= 1
        assert body["template_updated"] is False
        db = next(get_db())
        try:
            items = list(
                db.scalars(select(Item).where(Item.project_id == uuid.UUID(project_id))).all()
            )
            assert len(items) >= 1
            run = db.get(PlanApplyRun, uuid.UUID(run_id))
            assert run is not None
            assert run.status == "applied"
            template = db.get(PlanTemplate, uuid.UUID(template_id))
            assert template is not None
            assert template.use_count == 1
        finally:
            db.close()
    finally:
        _cleanup_emails([email])


def test_skip_pending_does_not_create_items():
    client = TestClient(app)
    email, token = _register_and_login(client)
    try:
        template_id = _subscription_template_with_slot(client, token)
        workspace_id, project_id = _workspace_and_project(client, token)
        run_id, _subscription_id = _insert_pending_run(
            email=email,
            template_id=template_id,
            workspace_id=workspace_id,
            project_id=project_id,
            period_start=date(2026, 8, 23),
        )
        r = client.post(f"/plan-apply-runs/{run_id}/skip", headers=_headers(token))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "skipped"
        assert body["applied_at"] is None
        db = next(get_db())
        try:
            items = list(
                db.scalars(select(Item).where(Item.project_id == uuid.UUID(project_id))).all()
            )
            assert items == []
            run = db.get(PlanApplyRun, uuid.UUID(run_id))
            assert run is not None
            assert run.status == "skipped"
            assert run.applied_at is None
            template = db.get(PlanTemplate, uuid.UUID(template_id))
            assert template is not None
            assert template.use_count == 0
        finally:
            db.close()
    finally:
        _cleanup_emails([email])


def test_confirm_not_pending_returns_run_not_pending():
    client = TestClient(app)
    email, token = _register_and_login(client)
    try:
        template_id = _subscription_template_with_slot(client, token)
        workspace_id, project_id = _workspace_and_project(client, token)
        run_id, _subscription_id = _insert_pending_run(
            email=email,
            template_id=template_id,
            workspace_id=workspace_id,
            project_id=project_id,
            period_start=date(2026, 8, 23),
        )
        skipped = client.post(f"/plan-apply-runs/{run_id}/skip", headers=_headers(token))
        assert skipped.status_code == 200, skipped.text
        r = client.post(f"/plan-apply-runs/{run_id}/confirm", headers=_headers(token))
        assert r.status_code == 400
        assert r.json()["detail"] == "run_not_pending"
    finally:
        _cleanup_emails([email])


def test_confirm_reports_template_updated():
    client = TestClient(app)
    email, token = _register_and_login(client)
    try:
        template_id = _subscription_template_with_slot(client, token)
        workspace_id, project_id = _workspace_and_project(client, token)
        run_id, _subscription_id = _insert_pending_run(
            email=email,
            template_id=template_id,
            workspace_id=workspace_id,
            project_id=project_id,
            period_start=date(2026, 8, 23),
            template_version=1,
        )
        bumped = client.put(
            f"/plan-templates/{template_id}/slots",
            json=[_slot(0, rel_day=2, start_minute=8 * 60, end_minute=9 * 60, title="新槽")],
            headers=_headers(token),
        )
        assert bumped.status_code == 200, bumped.text
        r = client.post(f"/plan-apply-runs/{run_id}/confirm", headers=_headers(token))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["template_updated"] is True
        assert body["status"] == "applied"
        assert body["item_count"] >= 1
        db = next(get_db())
        try:
            run = db.get(PlanApplyRun, uuid.UUID(run_id))
            template = db.get(PlanTemplate, uuid.UUID(template_id))
            assert run is not None
            assert template is not None
            assert run.template_version == template.version
            items = list(
                db.scalars(select(Item).where(Item.project_id == uuid.UUID(project_id))).all()
            )
            assert any(item.title == "新槽" for item in items)
        finally:
            db.close()
    finally:
        _cleanup_emails([email])


def test_subscribe_requires_auth():
    client = TestClient(app)
    r = client.post(
        f"/plan-templates/{uuid.uuid4()}/subscribe",
        json={
            "workspace_id": str(uuid.uuid4()),
            "project_id": str(uuid.uuid4()),
            "timezone": "Asia/Shanghai",
        },
    )
    assert r.status_code == 401
