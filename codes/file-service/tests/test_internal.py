import uuid

from tests.helpers import jpeg_bytes, make_project, make_user, make_workspace, token_for


def test_internal_requires_token(client, db):
    resp = client.post(
        "/internal/bindings/unbind",
        json={"binding_type": "item", "binding_id": str(uuid.uuid4())},
    )
    assert resp.status_code == 401


def test_unbind_removes_item_files(client, db):
    user = make_user(db)
    ws = make_workspace(db, user)
    project = make_project(db, ws, user)
    item_id = uuid.uuid4()
    token = token_for(user)
    created = client.post(
        "/files",
        headers={"Authorization": f"Bearer {token}"},
        data={
            "kind": "image",
            "workspace_id": str(ws.id),
            "project_id": str(project.id),
            "binding_type": "item",
            "binding_id": str(item_id),
        },
        files={"file": ("a.jpg", jpeg_bytes(), "image/jpeg")},
    )
    file_id = created.json()["id"]
    unbind = client.post(
        "/internal/bindings/unbind",
        headers={"X-Internal-Token": "dev_file_internal_change_me"},
        json={"binding_type": "item", "binding_id": str(item_id)},
    )
    assert unbind.status_code == 200
    assert unbind.json()["updated"] == 1
    missing = client.get(f"/files/{file_id}/content", headers={"Authorization": f"Bearer {token}"})
    assert missing.status_code == 404
