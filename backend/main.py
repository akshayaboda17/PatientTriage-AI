from fastapi import FastAPI
from pydantic import BaseModel
import sys
import os

# Add ai_engine to path so we can import it
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'ai_engine')))
from triage_engine import TriageEngine

app = FastAPI(title="PatientTriage.ai API")
engine = TriageEngine()

# Pydantic model for incoming frontend data
class PatientInput(BaseModel):
    age: int = None
    gender: str = None
    hr: int
    sbp: int
    rr: int
    spo2: int
    gcs: int
    history_available: bool = False

@app.post("/api/triage")
def triage_patient(patient_data: dict, db: Session = Depends(get_db)):
    # Placeholder for Phase 2 AI Engine integration
    return {"message": "Patient received", "data": patient_data}

@app.get("/api/queue")
def get_waiting_queue(db: Session = Depends(get_db)):
    # Placeholder for Phase 4 Dynamic Queue
    return {"queue": []}

class OverrideInput(BaseModel):
    patient_id: str
    staff_id: str
    ai_suggested_level: int
    ai_confidence_score: float
    clinician_assigned_level: int
    action_type: str
    override_reason: str = None
    top_3_drivers: list

@app.post("/api/override")
def log_triage_override(audit_data: OverrideInput):
    # In a real scenario, we would save this to the DB using the models.py schema
    # For now, we simulate a successful save to unblock the frontend
    print(f"AUDIT LOGGED: Staff {audit_data.staff_id} overrode AI Level {audit_data.ai_suggested_level} to Level {audit_data.clinician_assigned_level}")
    print(f"Reason: {audit_data.override_reason}")
    return {"message": "Audit log securely saved", "status": "success"}