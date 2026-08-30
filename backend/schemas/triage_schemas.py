from typing import Optional
from pydantic import BaseModel, Field

class TriageCreateRequest(BaseModel):
    triage_level: int = Field(..., ge=1, le=5)
    acuity_category: str = Field(..., max_length=50)
    chief_complaint: Optional[str] = Field(None, max_length=500)
    pain_score: Optional[int] = Field(0, ge=0, le=10)
    mobility: Optional[str] = Field("Ambulatory", max_length=50)
    notes: Optional[str] = Field(None, max_length=5000)
