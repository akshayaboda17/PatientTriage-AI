from typing import Optional
from pydantic import BaseModel, Field

class LoginRequest(BaseModel):
    staff_id: str = Field(..., min_length=1, max_length=50)
    password: Optional[str] = Field("password", max_length=200)
    hospital_id: Optional[str] = Field(None, max_length=50)
