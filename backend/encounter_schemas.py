from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from models import ArrivalMethod, EncounterDisposition, EncounterPriority, EncounterStatus


class EncounterCreate(BaseModel):
    patient_id: str = Field(..., min_length=1, max_length=50)
    arrival_method: ArrivalMethod
    chief_complaint: str = Field(..., min_length=2, max_length=500)


class EncounterUpdate(BaseModel):
    chief_complaint: Optional[str] = Field(default=None, min_length=2, max_length=500)
    arrival_method: Optional[ArrivalMethod] = None
    expected_version: int = Field(..., ge=1)


class StatusUpdate(BaseModel):
    status: EncounterStatus
    expected_version: int = Field(..., ge=1)


class PriorityUpdate(BaseModel):
    priority: EncounterPriority
    expected_version: int = Field(..., ge=1)


class AssignmentUpdate(BaseModel):
    assigned_nurse_id: Optional[str] = Field(default=None, max_length=50)
    assigned_physician_id: Optional[str] = Field(default=None, max_length=50)
    expected_version: int = Field(..., ge=1)


class DispositionCreate(BaseModel):
    disposition: EncounterDisposition
    expected_version: int = Field(..., ge=1)


class EncounterResponse(BaseModel):
    encounter_id: str
    patient_id: str
    patient_name: str
    patient_age: Optional[float] = None
    arrival_time: datetime
    arrival_method: ArrivalMethod
    chief_complaint: str
    current_status: EncounterStatus
    priority: Optional[EncounterPriority] = None
    assigned_nurse_id: Optional[str] = None
    assigned_nurse_name: Optional[str] = None
    assigned_physician_id: Optional[str] = None
    assigned_physician_name: Optional[str] = None
    triage_status: str
    disposition: Optional[EncounterDisposition] = None
    version: int


class QueueResponse(BaseModel):
    items: list[EncounterResponse]
    counts: dict[str, int]
