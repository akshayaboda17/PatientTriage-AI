from typing import Optional
from pydantic import BaseModel, Field

class PatientCreateRequest(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    mrn: Optional[str] = Field(None, max_length=50)
    age: float = Field(..., ge=0, le=130)
    gender: str = Field(..., min_length=1, max_length=30)
    phone: Optional[str] = Field(None, max_length=50)
    allergies: Optional[str] = Field(None, max_length=2000)
    medical_history: Optional[str] = Field(None, max_length=5000)

class PatientUpdateRequest(BaseModel):
    first_name: Optional[str] = Field(None, max_length=100)
    last_name: Optional[str] = Field(None, max_length=100)
    age: Optional[float] = Field(None, ge=0, le=130)
    gender: Optional[str] = Field(None, max_length=30)
    phone: Optional[str] = Field(None, max_length=50)
    allergies: Optional[str] = Field(None, max_length=2000)
    medical_history: Optional[str] = Field(None, max_length=5000)
