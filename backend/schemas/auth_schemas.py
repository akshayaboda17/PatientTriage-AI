from typing import Optional
from pydantic import BaseModel, Field

class LoginRequest(BaseModel):
    staff_id: str = Field(..., min_length=1, max_length=50)
    password: Optional[str] = Field("password", max_length=200)
    hospital_id: Optional[str] = Field(None, max_length=50)

class RegisterHospitalRequest(BaseModel):
    hospital_name: str = Field(..., min_length=2, max_length=200, example="City General Hospital")
    hospital_code: str = Field(..., min_length=2, max_length=50, example="CITYGEN")
    address: Optional[str] = Field(None, max_length=300, example="123 Medical Center Blvd")
    admin_name: str = Field(..., min_length=2, max_length=150, example="Dr. Akshay Aboda, MD")
    admin_staff_id: str = Field(..., min_length=2, max_length=50, example="DIR_ADMIN")
    admin_email: str = Field(..., min_length=5, max_length=150, example="director@citygen.org")
    password: str = Field(..., min_length=4, max_length=100, example="Password123")
    role: Optional[str] = Field("CLINICAL_DIRECTOR", max_length=50)
