from typing import Optional
from pydantic import BaseModel, Field

class VitalSignInput(BaseModel):
    hr: int = Field(..., ge=0, le=300, description="Heart rate in bpm")
    sbp: int = Field(..., ge=0, le=350, description="Systolic blood pressure in mmHg")
    dbp: Optional[int] = Field(None, ge=0, le=250, description="Diastolic blood pressure in mmHg")
    rr: int = Field(..., ge=0, le=100, description="Respiratory rate in breaths/min")
    spo2: int = Field(..., ge=0, le=100, description="SpO2 oxygen saturation percentage")
    temp: Optional[float] = Field(37.0, ge=20.0, le=50.0, description="Temperature in Celsius")
    gcs: Optional[int] = Field(15, ge=3, le=15, description="Glasgow Coma Scale")
    pain_score: Optional[int] = Field(0, ge=0, le=10, description="Pain score 0-10")
    notes: Optional[str] = Field(None, max_length=5000)

class ObservationCorrectionRequest(BaseModel):
    hr: Optional[int] = Field(None, ge=0, le=300)
    sbp: Optional[int] = Field(None, ge=0, le=350)
    dbp: Optional[int] = Field(None, ge=0, le=250)
    rr: Optional[int] = Field(None, ge=0, le=100)
    spo2: Optional[int] = Field(None, ge=0, le=100)
    temp: Optional[float] = Field(None, ge=20.0, le=50.0)
    gcs: Optional[int] = Field(None, ge=3, le=15)
    pain_score: Optional[int] = Field(None, ge=0, le=10)
    notes: Optional[str] = Field(None, max_length=5000)
    correction_reason: str = Field(..., min_length=3, max_length=1000, description="Clinical reason for correcting vital signs data")
