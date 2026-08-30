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
