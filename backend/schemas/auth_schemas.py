from typing import Optional
from pydantic import BaseModel, Field

class LoginRequest(BaseModel):
    staff_id: str = Field(..., min_length=1, max_length=50)
    password: Optional[str] = Field("password", max_length=200)
    hospital_id: Optional[str] = Field(None, max_length=50)

class VerifyHospitalRequest(BaseModel):
    hospital_code: str = Field(..., min_length=1, max_length=50, example="CITY001")
    password: Optional[str] = Field(None, max_length=200, example="hospital123")

class RegisterHospitalOnlyRequest(BaseModel):
    hospital_name: str = Field(..., min_length=2, max_length=200, example="CityCare Emergency & Trauma Center")
    hospital_code: str = Field(..., min_length=2, max_length=50, example="CITY001")
    password: Optional[str] = Field(None, min_length=1, max_length=200, example="hospital123")
    address: Optional[str] = Field(None, max_length=300, example="124 Healthcare Boulevard")
    bed_capacity: Optional[int] = Field(25, ge=1, le=500)

class RegisterHospitalRequest(BaseModel):
    hospital_name: str = Field(..., min_length=2, max_length=200, example="City General Hospital")
    hospital_code: str = Field(..., min_length=2, max_length=50, example="CITYGEN")
    address: Optional[str] = Field(None, max_length=300, example="123 Medical Center Blvd")
    admin_name: str = Field(..., min_length=2, max_length=150, example="Dr. Akshay Aboda, MD")
    admin_staff_id: str = Field(..., min_length=2, max_length=50, example="DIR_ADMIN")
    admin_email: str = Field(..., min_length=5, max_length=150, example="director@citygen.org")
    password: str = Field(..., min_length=4, max_length=100, example="Password123")
    role: Optional[str] = Field("CLINICAL_DIRECTOR", max_length=50)

class RegisterStaffRequest(BaseModel):
    hospital_id: str = Field(..., min_length=1, max_length=50, example="CITY001")
    name: str = Field(..., min_length=2, max_length=150, example="Dr. Robert Chase, MD")
    staff_id: str = Field(..., min_length=2, max_length=50, example="DOC002")
    email: str = Field(..., min_length=4, max_length=150, example="chase@citycare.org")
    role: Optional[str] = Field("EMERGENCY_PHYSICIAN", max_length=50)
    specialization: Optional[str] = Field(None, max_length=200, example="Emergency Medicine & Cardiology")
    password: str = Field(..., min_length=4, max_length=200, example="Password123")
