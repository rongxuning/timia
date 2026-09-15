from tests.helpers import jpeg_bytes, make_project, make_user, make_workspace, token_for


def test_file_browser_view(client, db):
    user = make_user(db)
    ws = make_workspace(db, user, "Alpha")
    project = make_project(db, ws, user, "P1")
    token = token_for(user)
    client.post(
        "/files",
        headers={"Authorization": f"Bearer {token}"},
        data={"kind": "image", "workspace_id": str(ws.id), "project_id": str(project.id)},
        files={"file": ("card.jpg", jpeg_bytes(), "image/jpeg")},
    )
    resp = client.get(
        "/views/file-browser",
        headers={"Authorization": f"Bearer {token}"},
        params={"workspace_id": str(ws.id)},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["workspace_name"] == "Alpha"
    assert body["folders"] == []
    assert body["totals"]["file_count"] == 1
    assert body["files"][0]["size_label"]
    assert "object_key" not in body["files"][0]
