import uuid

from tests.helpers import jpeg_bytes, make_project, make_user, make_workspace, token_for


def test_upload_list_content_and_redaction(client, db):
    user = make_user(db)
    ws = make_workspace(db, user)
    project = make_project(db, ws, user)
    item_id = uuid.uuid4()
    token = token_for(user)

    resp = client.post(
        "/files",
        headers={"Authorization": f"Bearer {token}"},
        data={
            "kind": "image",
            "workspace_id": str(ws.id),
            "project_id": str(project.id),
            "binding_type": "item",
            "binding_id": str(item_id),
        },
        files={"file": ("shot.png", jpeg_bytes(), "image/jpeg")},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert "object_key" not in body
    assert "storage_backend" not in body
    assert "minio" not in str(body).lower()
    assert "X-Amz" not in str(body)
    assert body["kind"] == "image"
    assert body["content_path"].startswith("/files/")
    assert body["thumb_path"]
    file_id = body["id"]

    listed = client.get(
        "/files",
        headers={"Authorization": f"Bearer {token}"},
        params={
            "workspace_id": str(ws.id),
            "binding_type": "item",
            "binding_id": str(item_id),
        },
    )
    assert listed.status_code == 200
    assert len(listed.json()["items"]) == 1

    content = client.get(
        f"/files/{file_id}/content",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert content.status_code == 200
    assert content.headers["cache-control"] == "private, no-store"
    assert content.content[:3] == b"\xff\xd8\xff"

    ranged = client.get(
        f"/files/{file_id}/content",
        headers={"Authorization": f"Bearer {token}", "Range": "bytes=0-10"},
    )
    assert ranged.status_code == 206
    assert ranged.content == content.content[:11]


def test_non_member_cannot_read(client, db):
    owner = make_user(db, "owner")
    outsider = make_user(db, "outsider")
    ws = make_workspace(db, owner)
    project = make_project(db, ws, owner)
    token = token_for(owner)
    other = token_for(outsider)
    created = client.post(
        "/files",
        headers={"Authorization": f"Bearer {token}"},
        data={
            "kind": "image",
            "workspace_id": str(ws.id),
            "project_id": str(project.id),
        },
        files={"file": ("a.jpg", jpeg_bytes(), "image/jpeg")},
    )
    assert created.status_code == 201
    file_id = created.json()["id"]
    denied = client.get(
        f"/files/{file_id}/content",
        headers={"Authorization": f"Bearer {other}"},
    )
    assert denied.status_code == 403


def test_delete_then_content_404(client, db):
    user = make_user(db)
    ws = make_workspace(db, user)
    project = make_project(db, ws, user)
    token = token_for(user)
    created = client.post(
        "/files",
        headers={"Authorization": f"Bearer {token}"},
        data={"kind": "image", "workspace_id": str(ws.id), "project_id": str(project.id)},
        files={"file": ("a.jpg", jpeg_bytes(), "image/jpeg")},
    )
    file_id = created.json()["id"]
    deleted = client.delete(f"/files/{file_id}", headers={"Authorization": f"Bearer {token}"})
    assert deleted.status_code == 204
    missing = client.get(f"/files/{file_id}/content", headers={"Authorization": f"Bearer {token}"})
    assert missing.status_code == 404


def test_query_by_name(client, db):
    user = make_user(db)
    ws = make_workspace(db, user)
    project = make_project(db, ws, user)
    token = token_for(user)
    client.post(
        "/files",
        headers={"Authorization": f"Bearer {token}"},
        data={"kind": "image", "workspace_id": str(ws.id), "project_id": str(project.id)},
        files={"file": ("alpha.jpg", jpeg_bytes(), "image/jpeg")},
    )
    client.post(
        "/files",
        headers={"Authorization": f"Bearer {token}"},
        data={"kind": "image", "workspace_id": str(ws.id), "project_id": str(project.id)},
        files={"file": ("beta.jpg", jpeg_bytes((10, 10, 10)), "image/jpeg")},
    )
    found = client.get(
        "/files",
        headers={"Authorization": f"Bearer {token}"},
        params={"workspace_id": str(ws.id), "q": "alpha"},
    )
    assert found.status_code == 200
    names = [item["original_filename"] for item in found.json()["items"]]
    assert names == ["alpha.jpg"]
