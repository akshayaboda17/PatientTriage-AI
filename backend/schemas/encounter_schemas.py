from typing import Optional
from pydantic import BaseModel, Field
from models import EncounterStatusEnum

class EncounterCreateRequest(BaseModel):
    patient_id: str = Field(..., min_length=1, max_length=50)
    chief_complaint: str = Field(..., min_length=1, max_length=500)
    arrival_mode: Optional[str] = Field("Walk-in", max_length=50)
    bed_number: Optional[str] = Field(None, max_length=30)

class EncounterStatusUpdateRequest(BaseModel):
    status: EncounterStatusEnum
    bed_number: Optional[str] = Field(None, max_length=30)

class DischargeRequest(BaseModel):
    disposition_notes: Optional[str] = Field(None, max_length=1000)
    destination: Optional[str] = Field("Home", max_length=100) # Home, Nursing Facility, Outpatient Followup, etc.

class PriorityOverrideRequest(BaseModel):
    new_priority: int = Field(..., ge=1, le=5)
    override_reason: str = Field(..., min_length=3, max_length=500)
    clinical_notes: Optional[str] = Field(None, max_length=1000)
