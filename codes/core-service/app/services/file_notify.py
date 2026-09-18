from __future__ import annotations

import logging
import uuid

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


def _post(path: str, payload: dict) -> None:
    base = (settings.file_service_base or "").rstrip("/")
    token = settings.file_internal_token
    if not base or not token:
        return
    try:
        with httpx.Client(timeout=5.0) as client:
            resp = client.post(
                f"{base}{path}",
                json=payload,
                headers={"X-Internal-Token": token},
            )
            if resp.status_code >= 400:
                logger.warning("file-service %s -> %s %s", path, resp.status_code, resp.text[:200])
    except httpx.HTTPError as exc:
        logger.warning("file-service %s failed: %s", path, exc)


def notify_item_unbound(item_id: uuid.UUID) -> None:
    _post("/internal/bindings/unbind", {"binding_type": "item", "binding_id": str(item_id)})


def notify_item_rehomed(
    item_id: uuid.UUID, workspace_id: uuid.UUID, project_id: uuid.UUID
) -> None:
    _post(
        "/internal/bindings/rehome",
        {
            "binding_type": "item",
            "binding_id": str(item_id),
            "workspace_id": str(workspace_id),
            "project_id": str(project_id),
        },
    )


def notify_project_rehomed(project_id: uuid.UUID, workspace_id: uuid.UUID) -> None:
    _post(
        "/internal/bindings/rehome-project",
        {"project_id": str(project_id), "workspace_id": str(workspace_id)},
    )
