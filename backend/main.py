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