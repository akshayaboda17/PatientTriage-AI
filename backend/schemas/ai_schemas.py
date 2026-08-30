from typing import Optional, List
from pydantic import BaseModel, Field
from models import AIRiskCategoryEnum

class AIAssessmentOutputSchema(BaseModel):
    risk_score: float = Field(..., ge=0.0, le=1.0)
    risk_category: AIRiskCategoryEnum
    predicted_level: int = Field(..., ge=1, le=5)
    confidence: Optional[float] = Field(None, ge=0.0, le=1.0)

class LegacyPatientInput(BaseModel):
    age: Optional[int] = None
    gender: Optional[str] = None
    hr: int
    sbp: int
    rr: int
    spo2: int
    gcs: int
    history_available: bool = False

class LegacyOverrideInput(BaseModel):
    patient_id: str
    staff_id: str
    ai_suggested_level: int
    ai_confidence_score: float
    clinician_assigned_level: int
    action_type: str
    override_reason: Optional[str] = None
    top_3_drivers: list
