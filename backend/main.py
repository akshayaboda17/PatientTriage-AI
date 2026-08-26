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