"""Best-effort POST to notification-service. Failures are logged only."""

from __future__ import annotations

import logging
import threading

import httpx

from app.core.config import settings
from app.services.notification_audience import NotificationIntent

logger = logging.getLogger(__name__)


def _send_all(intents: list[NotificationIntent]) -> None:
    base = (settings.notification_service_base or "").rstrip("/")
    token = settings.notification_internal_token
    if not base or not token:
        return
    try:
        with httpx.Client(timeout=3.0) as client:
            for intent in intents:
                if not intent.user_ids:
                    continue
                payload = {
                    "scenario_key": intent.scenario_key,
                    "sender_user_id": str(intent.sender_user_id),
                    "link": intent.link,
                    "audience": {
                        "type": "user_ids",
                        "user_ids": [str(uid) for uid in intent.user_ids],
                    },
                    "variables": intent.variables,
                    "timing": "immediate",
                }
                try:
                    resp = client.post(
                        f"{base}/v1/notifications",
                        json=payload,
                        headers={"X-Internal-Token": token},
                    )
                    if resp.status_code >= 400:
                        logger.warning(
                            "notification-service %s -> %s %s",
                            intent.scenario_key,
                            resp.status_code,
                            resp.text[:200],
                        )
                except httpx.HTTPError as exc:
                    logger.warning("notification-service %s failed: %s", intent.scenario_key, exc)
    except httpx.HTTPError as exc:
        logger.warning("notification-service client failed: %s", exc)


def dispatch_notifications(intents: list[NotificationIntent], *, background: bool = True) -> None:
    pending = [intent for intent in intents if intent.user_ids]
    if not pending:
        return
    if not settings.notification_service_base or not settings.notification_internal_token:
        return
    try:
        if background:
            threading.Thread(target=_send_all, args=(pending,), daemon=True).start()
        else:
            _send_all(pending)
    except Exception:
        logger.exception("notification dispatch failed to start")
