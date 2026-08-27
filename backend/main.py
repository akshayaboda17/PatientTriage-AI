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
def triage_patient(patient: PatientInput):
    # 1. Convert Pydantic object to dictionary
    patient_data = patient.dict()
    
    # 2. Run the data through the AI Engine
    triage_result = engine.evaluate_patient(patient_data)
    
    return {"message": "Triage complete", "result": triage_result}