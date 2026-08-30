from datetime import date
from typing import Optional

from pydantic import BaseModel, Field


class PatientCreate(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    date_of_birth: Optional[date] = None
    age: Optional[float] = Field(default=None, ge=0, le=130)
    gender: Optional[str] = Field(default=None, max_length=50)
    contact_info: Optional[str] = Field(default=None, max_length=255)
    emergency_contact: Optional[str] = Field(default=None, max_length=255)
    known_allergies: Optional[str] = None


class PatientResponse(PatientCreate):
    id: int
    patient_id: str

    class Config:
        from_attributes = True
