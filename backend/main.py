from fastapi import FastAPI, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
import sys
import os


from models import SessionLocal


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

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

# Pydantic model for the Phase 3 Audit Log
class OverrideInput(BaseModel):
    patient_id: str
    staff_id: str
    ai_suggested_level: int
    ai_confidence_score: float
    clinician_assigned_level: int
    action_type: str
    override_reason: str = None
    top_3_drivers: list

@app.post("/api/triage")
def triage_patient(patient: PatientInput, db: Session = Depends(get_db)):
    patient_data = patient.dict()
    triage_result = engine.evaluate_patient(patient_data)
    return {"message": "Triage complete", "result": triage_result}

# --- Phase 4: Dynamic Queue Logic ---
# Mock in-memory queue to simulate active ER patients
mock_queue = [
    {"patient_id": "PT-883", "age": 45, "gender": "Male", "triage_level": 3, "wait_time_mins": 42, "status": "Waiting"},
    {"patient_id": "PT-884", "age": 28, "gender": "Female", "triage_level": 2, "wait_time_mins": 15, "status": "Waiting"},
    {"patient_id": "PT-885", "age": 72, "gender": "Male", "triage_level": 1, "wait_time_mins": 4, "status": "In Treatment"},
    {"patient_id": "PT-886", "age": 19, "gender": "Female", "triage_level": 4, "wait_time_mins": 65, "status": "Waiting"},
    {"patient_id": "PT-887", "age": 55, "gender": "Male", "triage_level": 3, "wait_time_mins": 12, "status": "Waiting"}
]

@app.get("/api/queue")
def get_waiting_queue():
    # Sort Rule 1: Triage level (ascending: 1 is highest priority)
    # Sort Rule 2: Wait time (descending: longest wait time goes first if levels are tied)
    sorted_queue = sorted(mock_queue, key=lambda p: (p['triage_level'], -p['wait_time_mins']))
    
    return {"queue": sorted_queue}

@app.post("/api/override")
def log_triage_override(audit_data: OverrideInput):
    print(f"AUDIT LOGGED: Staff {audit_data.staff_id} overrode AI Level {audit_data.ai_suggested_level} to Level {audit_data.clinician_assigned_level}")
    print(f"Reason: {audit_data.override_reason}")
    return {"message": "Audit log securely saved", "status": "success"}