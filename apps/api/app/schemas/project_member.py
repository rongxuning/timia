from typing import Literal

from pydantic import BaseModel


class ProjectMemberAdd(BaseModel):
    user_id: str
    role: Literal["owner", "member"] = "member"


class ProjectMemberRoleUpdate(BaseModel):
    role: Literal["owner", "member"]


class ProjectMemberOut(BaseModel):
    id: str
    user_id: str
    email: str
    display_name: str
    role: str
    status: str
    is_creator: bool = False

