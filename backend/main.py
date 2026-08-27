from fastapi import FastAPI, Depends
from sqlalchemy.orm import Session
import models

app = FastAPI(title="PatientTriage.ai API")

# Dependency to get DB session
def get_db():
    db = models.SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/")
def read_root():
    return {"status": "PatientTriage.ai Backend is running"}

@app.post("/api/triage")
def triage_patient(patient_data: dict, db: Session = Depends(get_db)):
    # Placeholder for Phase 2 AI Engine integration
    return {"message": "Patient received", "data": patient_data}

@app.get("/api/queue")
def get_waiting_queue(db: Session = Depends(get_db)):
    # Placeholder for Phase 4 Dynamic Queue
    return {"queue": []}
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

# Schemas for Phase 3 Audit & Override
class AcceptTriageRequest(BaseModel):
    patient_id: str
    staff_id: str
    ai_suggested_level: int = Field(..., ge=1, le=5)
    ai_confidence_score: float = Field(..., ge=0.0, le=1.0)
    top_3_drivers: List[Dict[str, Any]]

class OverrideTriageRequest(BaseModel):
    patient_id: str
    staff_id: str
    ai_suggested_level: int = Field(..., ge=1, le=5)
    ai_confidence_score: float = Field(..., ge=0.0, le=1.0)
    clinician_assigned_level: int = Field(..., ge=1, le=5)
    override_reason: str
    clinical_notes: Optional[str] = None
    top_3_drivers: List[Dict[str, Any]]

@app.post("/api/v1/triage/accept")
def accept_ai_triage(payload: AcceptTriageRequest, db: Session = Depends(get_db)):
    audit_entry = TriageAuditLog(
        patient_id=payload.patient_id,
        staff_id=payload.staff_id,
        ai_suggested_level=payload.ai_suggested_level,
        ai_confidence_score=payload.ai_confidence_score,
        clinician_assigned_level=payload.ai_suggested_level,
        action_type=ActionTypeEnum.ACCEPTED,
        override_reason=None,
        clinical_notes="Clinician accepted recommendation.",
        top_3_drivers=payload.top_3_drivers
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(audit_entry)
    return {"status": "success", "audit_id": audit_entry.id}

@app.post("/api/v1/triage/override")
def override_ai_triage(payload: OverrideTriageRequest, db: Session = Depends(get_db)):
    audit_entry = TriageAuditLog(
        patient_id=payload.patient_id,
        staff_id=payload.staff_id,
        ai_suggested_level=payload.ai_suggested_level,
        ai_confidence_score=payload.ai_confidence_score,
        clinician_assigned_level=payload.clinician_assigned_level,
        action_type=ActionTypeEnum.OVERRIDDEN,
        override_reason=payload.override_reason,
        clinical_notes=payload.clinical_notes,
        top_3_drivers=payload.top_3_drivers
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(audit_entry)
    return {"status": "success", "audit_id": audit_entry.id}

@app.get("/api/v1/triage/audit-logs")
def get_audit_trail(patient_id: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(TriageAuditLog)
    if patient_id:
        query = query.filter(TriageAuditLog.patient_id == patient_id)
    logs = query.order_by(TriageAuditLog.timestamp.desc()).all()
    return [log.to_dict() for log in logs]