import uuid

import pytest
from fastapi import HTTPException

from app.schemas.project import ProjectUpdate
from app.services.project_api import parse_project_transfer_target


def test_parse_project_transfer_target_absent():
    payload = ProjectUpdate(name="x")
    assert parse_project_transfer_target(set(), payload) is None


def test_parse_project_transfer_target_empty():
    payload = ProjectUpdate(target_workspace_id=None)
    assert parse_project_transfer_target({"target_workspace_id"}, payload) is None


def test_parse_project_transfer_target_valid():
    ws_id = uuid.uuid4()
    payload = ProjectUpdate(target_workspace_id=str(ws_id))
    assert parse_project_transfer_target({"target_workspace_id"}, payload) == ws_id


def test_parse_project_transfer_target_invalid():
    payload = ProjectUpdate(target_workspace_id="not-a-uuid")
    with pytest.raises(HTTPException) as exc:
        parse_project_transfer_target({"target_workspace_id"}, payload)
    assert exc.value.status_code == 400
    assert exc.value.detail == "invalid_transfer_target"
