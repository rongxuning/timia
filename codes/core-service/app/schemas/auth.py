from pydantic import BaseModel, EmailStr


class RegisterRequest(BaseModel):
    email: EmailStr
    display_name: str
    password: str


class MeResponse(BaseModel):
    id: str
    email: EmailStr
    display_name: str
    system_role: str

