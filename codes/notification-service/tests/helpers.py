import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import create_access_token
from app.db.base import Base
from app.db.deps import get_db
from app.db.session import SessionLocal, engine
from app.main import app
from app.models.identity import Project, ProjectMember, User, Workspace, WorkspaceMember


@pytest.fixture
def db() -> Session:
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
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


def make_user(db: Session, name: str = "alice", *, role: str = "user") -> User:
    user = User(
        email=f"{name}@example.com",
        display_name=name,
        status="active",
        system_role=role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def make_project(db: Session, owner: User, member: User) -> tuple[Workspace, Project]:
    workspace = Workspace(name="空间")
    db.add(workspace)
    db.flush()
    db.add(WorkspaceMember(workspace_id=workspace.id, user_id=owner.id, role="owner", status="active"))
    db.add(WorkspaceMember(workspace_id=workspace.id, user_id=member.id, role="member", status="active"))
    project = Project(workspace_id=workspace.id, name="项目")
    db.add(project)
    db.flush()
    db.add(
        ProjectMember(
            workspace_id=workspace.id,
            project_id=project.id,
            user_id=owner.id,
            role="owner",
            status="active",
        )
    )
    db.add(
        ProjectMember(
            workspace_id=workspace.id,
            project_id=project.id,
            user_id=member.id,
            role="member",
            status="active",
        )
    )
    db.commit()
    db.refresh(workspace)
    db.refresh(project)
    return workspace, project


def token_for(user: User) -> str:
    return create_access_token(str(user.id))
