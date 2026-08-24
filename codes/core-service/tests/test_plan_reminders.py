"""DB tests for the hourly plan reminder job."""

from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.deps import get_db
from app.jobs.plan_reminders import run_plan_reminders
from app.main import app
from app.models.item import Item
from app.models.plan import PlanApplyRun, PlanNotification, PlanSubscription
from app.services.plan_time import current_period_start
from test_plan_api import (
    _cleanup_emails,
    _headers,
    _insert_pending_run,
    _register_and_login,
    _subscription_template_with_slot,
    _workspace_and_project,
)

SH = "Asia/Shanghai"


def _subscribe(
    client: TestClient, token: str, template_id: str, workspace_id: str, project_id: str
) -> dict:
    r = client.post(
        f"/plan-templates/{template_id}/subscribe",
        json={
            "workspace_id": workspace_id,
            "project_id": project_id,
            "timezone": SH,
        },
        headers=_headers(token),
    )
    assert r.status_code == 201, r.text
    return r.json()


def _saturday_2000(period_start: date) -> datetime:
    return datetime.combine(period_start + timedelta(days=6), time(20, 0), tzinfo=ZoneInfo(SH))


def _run_job(now: datetime) -> dict:
    db = next(get_db())
    try:
        result = run_plan_reminders(db, now=now)
        db.commit()
        return result
    finally:
        db.close()


def test_saturday_2000_creates_pending_for_next_sunday():
    """now Saturday 20:00 Asia/Shanghai and existing {current Sunday} → pending next Sunday."""
    client = TestClient(app)
    email, token = _register_and_login(client)
    try:
        template_id = _subscription_template_with_slot(client, token)
        workspace_id, project_id = _workspace_and_project(client, token)
        body = _subscribe(client, token, template_id, workspace_id, project_id)
        current_sunday = date.fromisoformat(body["apply_run"]["period_start"])
        now = _saturday_2000(current_sunday)
        assert current_period_start("week", now, SH) == current_sunday
        next_sunday = current_sunday + timedelta(days=7)

        result = _run_job(now)

        assert result == {"pending_created": 1, "expired": 0}
        db = next(get_db())
        try:
            subscription_id = uuid.UUID(body["id"])
            pending = list(
                db.scalars(
                    select(PlanApplyRun).where(
                        PlanApplyRun.subscription_id == subscription_id,
                        PlanApplyRun.status == "pending",
                    )
                ).all()
            )
            assert len(pending) == 1
            run = pending[0]
            assert run.period_start == next_sunday
            assert run.period_kind == "week"
            assert run.source == "subscription_mode"
            assert run.skipped_slots == []
            assert str(run.template_id) == template_id
            assert str(run.workspace_id) == workspace_id
            assert str(run.project_id) == project_id
            notes = list(
                db.scalars(
                    select(PlanNotification).where(
                        PlanNotification.subscription_id == subscription_id,
                        PlanNotification.kind == "upcoming_period",
                    )
                ).all()
            )
            assert len(notes) == 1
            assert notes[0].apply_run_id == run.id
            assert str(notes[0].template_id) == template_id
        finally:
            db.close()
    finally:
        _cleanup_emails([email])


def test_saturday_before_20_does_not_create_pending():
    client = TestClient(app)
    email, token = _register_and_login(client)
    try:
        template_id = _subscription_template_with_slot(client, token)
        workspace_id, project_id = _workspace_and_project(client, token)
        body = _subscribe(client, token, template_id, workspace_id, project_id)
        current_sunday = date.fromisoformat(body["apply_run"]["period_start"])
        now = datetime.combine(
            current_sunday + timedelta(days=6), time(19, 59), tzinfo=ZoneInfo(SH)
        )

        result = _run_job(now)

        assert result == {"pending_created": 0, "expired": 0}
        db = next(get_db())
        try:
            pending = list(
                db.scalars(
                    select(PlanApplyRun).where(
                        PlanApplyRun.subscription_id == uuid.UUID(body["id"]),
                        PlanApplyRun.status == "pending",
                    )
                ).all()
            )
            assert pending == []
        finally:
            db.close()
    finally:
        _cleanup_emails([email])


def test_second_run_in_same_window_does_not_duplicate_pending():
    client = TestClient(app)
    email, token = _register_and_login(client)
    try:
        template_id = _subscription_template_with_slot(client, token)
        workspace_id, project_id = _workspace_and_project(client, token)
        body = _subscribe(client, token, template_id, workspace_id, project_id)
        current_sunday = date.fromisoformat(body["apply_run"]["period_start"])
        now = _saturday_2000(current_sunday)

        first = _run_job(now)
        second = _run_job(now)

        assert first == {"pending_created": 1, "expired": 0}
        assert second == {"pending_created": 0, "expired": 0}
        db = next(get_db())
        try:
            subscription_id = uuid.UUID(body["id"])
            pending = list(
                db.scalars(
                    select(PlanApplyRun).where(
                        PlanApplyRun.subscription_id == subscription_id,
                        PlanApplyRun.status == "pending",
                    )
                ).all()
            )
            assert len(pending) == 1
            notes = list(
                db.scalars(
                    select(PlanNotification).where(
                        PlanNotification.subscription_id == subscription_id,
                        PlanNotification.kind == "upcoming_period",
                    )
                ).all()
            )
            assert len(notes) == 1
        finally:
            db.close()
    finally:
        _cleanup_emails([email])


def test_pending_expires_after_period_without_materializing_items():
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
            period_start=date(2026, 8, 16),
        )
        now = datetime(2026, 8, 23, 0, 1, tzinfo=ZoneInfo(SH))

        result = _run_job(now)

        assert result["expired"] == 1
        db = next(get_db())
        try:
            run = db.get(PlanApplyRun, uuid.UUID(run_id))
            assert run is not None
            assert run.status == "expired"
            items = list(
                db.scalars(select(Item).where(Item.project_id == uuid.UUID(project_id))).all()
            )
            assert items == []
        finally:
            db.close()
    finally:
        _cleanup_emails([email])


def test_closed_segment_is_not_scanned():
    client = TestClient(app)
    email, token = _register_and_login(client)
    try:
        template_id = _subscription_template_with_slot(client, token)
        workspace_id, project_id = _workspace_and_project(client, token)
        body = _subscribe(client, token, template_id, workspace_id, project_id)
        canceled = client.post(
            f"/plan-subscriptions/{body['id']}/cancel",
            headers=_headers(token),
        )
        assert canceled.status_code == 204, canceled.text
        current_sunday = date.fromisoformat(body["apply_run"]["period_start"])
        now = _saturday_2000(current_sunday)

        result = _run_job(now)

        assert result == {"pending_created": 0, "expired": 0}
        db = next(get_db())
        try:
            pending = list(
                db.scalars(
                    select(PlanApplyRun).where(
                        PlanApplyRun.subscription_id == uuid.UUID(body["id"]),
                        PlanApplyRun.status == "pending",
                    )
                ).all()
            )
            assert pending == []
        finally:
            db.close()
    finally:
        _cleanup_emails([email])


def test_resubscribe_after_canceled_pending_schedules_next_period():
    """Cancel then resubscribe the same week: canceled must not occupy next Sunday."""
    client = TestClient(app)
    email, token = _register_and_login(client)
    try:
        template_id = _subscription_template_with_slot(client, token)
        workspace_id, project_id = _workspace_and_project(client, token)
        body = _subscribe(client, token, template_id, workspace_id, project_id)
        subscription_id = body["id"]
        current_sunday = date.fromisoformat(body["apply_run"]["period_start"])
        now = _saturday_2000(current_sunday)
        next_sunday = current_sunday + timedelta(days=7)

        first = _run_job(now)
        assert first == {"pending_created": 1, "expired": 0}

        canceled = client.post(
            f"/plan-subscriptions/{subscription_id}/cancel",
            headers=_headers(token),
        )
        assert canceled.status_code == 204, canceled.text

        again = _subscribe(client, token, template_id, workspace_id, project_id)
        assert again["id"] == subscription_id
        assert again["imported_current_period"] is False

        second = _run_job(now)
        assert second == {"pending_created": 1, "expired": 0}

        db = next(get_db())
        try:
            sid = uuid.UUID(subscription_id)
            pending = list(
                db.scalars(
                    select(PlanApplyRun).where(
                        PlanApplyRun.subscription_id == sid,
                        PlanApplyRun.status == "pending",
                    )
                ).all()
            )
            assert len(pending) == 1
            assert pending[0].period_start == next_sunday
            canceled_runs = list(
                db.scalars(
                    select(PlanApplyRun).where(
                        PlanApplyRun.subscription_id == sid,
                        PlanApplyRun.status == "canceled",
                        PlanApplyRun.period_start == next_sunday,
                    )
                ).all()
            )
            assert len(canceled_runs) == 1
        finally:
            db.close()
    finally:
        _cleanup_emails([email])


def test_invalid_timezone_on_one_subscription_does_not_abort_batch():
    client = TestClient(app)
    email, token = _register_and_login(client)
    try:
        good_template = _subscription_template_with_slot(client, token)
        bad_template = _subscription_template_with_slot(client, token)
        workspace_id, project_id = _workspace_and_project(client, token)
        good = _subscribe(client, token, good_template, workspace_id, project_id)
        bad = _subscribe(client, token, bad_template, workspace_id, project_id)
        current_sunday = date.fromisoformat(good["apply_run"]["period_start"])
        now = _saturday_2000(current_sunday)
        next_sunday = current_sunday + timedelta(days=7)

        db = next(get_db())
        try:
            sub = db.get(PlanSubscription, uuid.UUID(bad["id"]))
            assert sub is not None
            sub.timezone = "Not/AZone"
            db.commit()
        finally:
            db.close()

        result = _run_job(now)

        assert result["pending_created"] == 1
        assert result["expired"] == 0
        db = next(get_db())
        try:
            good_pending = list(
                db.scalars(
                    select(PlanApplyRun).where(
                        PlanApplyRun.subscription_id == uuid.UUID(good["id"]),
                        PlanApplyRun.status == "pending",
                    )
                ).all()
            )
            assert len(good_pending) == 1
            assert good_pending[0].period_start == next_sunday
            bad_pending = list(
                db.scalars(
                    select(PlanApplyRun).where(
                        PlanApplyRun.subscription_id == uuid.UUID(bad["id"]),
                        PlanApplyRun.status == "pending",
                    )
                ).all()
            )
            assert bad_pending == []
        finally:
            db.close()
    finally:
        _cleanup_emails([email])
