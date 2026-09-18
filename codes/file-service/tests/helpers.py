from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy.orm import Session

from app.core.security import create_access_token
from app.db.base import Base
from app.db.deps import get_db
from app.db.session import SessionLocal, engine
from app.main import app
from app.models.identity import Project, ProjectMember, User, Workspace, WorkspaceMember
from app.storage import get_store
from app.storage.memory import MemoryStore


@pytest.fixture
def db() -> Session:
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    store = get_store()
    if isinstance(store, MemoryStore):
        store.clear()
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db: Session) -> TestClient:
    def _override():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = _override
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def make_user(db: Session, name: str = "alice") -> User:
    user = User(email=f"{name}@example.com", display_name=name, status="active")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def make_workspace(db: Session, owner: User, name: str = "ws") -> Workspace:
    ws = Workspace(name=name)
    db.add(ws)
    db.flush()
    db.add(
        WorkspaceMember(
            workspace_id=ws.id,
            user_id=owner.id,
            role="owner",
            status="active",
        )
    )
    db.commit()
    db.refresh(ws)
    return ws


def make_project(db: Session, workspace: Workspace, user: User, name: str = "proj") -> Project:
    project = Project(workspace_id=workspace.id, name=name)
    db.add(project)
    db.flush()
    db.add(
        ProjectMember(
            workspace_id=workspace.id,
            project_id=project.id,
            user_id=user.id,
            role="member",
            status="active",
        )
    )
    db.commit()
    db.refresh(project)
    return project


def token_for(user: User) -> str:
    return create_access_token(str(user.id))


def jpeg_bytes(color: tuple[int, int, int] = (40, 80, 160)) -> bytes:
    image = Image.new("RGB", (32, 24), color)
    buf = BytesIO()
    image.save(buf, format="JPEG")
    return buf.getvalue()
