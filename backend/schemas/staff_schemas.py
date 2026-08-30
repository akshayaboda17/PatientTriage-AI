from typing import Optional
from pydantic import BaseModel, Field
from models import StaffRoleEnum

class StaffCreateRequest(BaseModel):
    staff_id: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=150)
    email: str = Field(..., min_length=3, max_length=150)
    role: StaffRoleEnum
    password: Optional[str] = Field("password", max_length=200)

class StaffRoleUpdateRequest(BaseModel):
    role: StaffRoleEnum
