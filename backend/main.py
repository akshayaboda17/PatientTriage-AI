import sys
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Add parent directory and ai_engine to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'ai_engine')))

from models import Base, engine, SessionLocal, Hospital
from middleware.security import SecurityHeadersMiddleware
from services.rbac import get_db
from routers.auth import (
    check_login_rate_limit, record_login_failure,
    reset_login_rate_limit, LOGIN_FAILED_ATTEMPTS
)
from routers import (
    auth_router,
    patients_router,
    encounters_router,
    triage_router,
    vitals_router,
    ai_router,
    alerts_router,
    physician_router,
    audit_router,
    staff_router,
    demo_router
)
from routers.demo import seed_demo_data

# Re-export schemas for test suite compatibility
from schemas import (
    LoginRequest, VitalSignInput, ObservationCorrectionRequest,
    AlertResolutionInput, AlertDismissalInput, ClinicalDecisionRequest,
    PatientCreateRequest, PatientUpdateRequest, EncounterCreateRequest,
    EncounterStatusUpdateRequest, TriageCreateRequest, StaffCreateRequest,
    StaffRoleUpdateRequest, AIAssessmentOutputSchema, LegacyPatientInput,
    LegacyOverrideInput
)

# Initialize database schema
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="PatientTriage.ai Clinical API",
    description="Emergency Department Clinical Decision Support & Deterioration Detection System",
    version="1.0.0"
)

# Security & CORS Middleware
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Register Modular Routers
app.include_router(auth_router)
app.include_router(patients_router)
app.include_router(encounters_router)
app.include_router(triage_router)
app.include_router(vitals_router)
app.include_router(ai_router)
app.include_router(alerts_router)
app.include_router(physician_router)
app.include_router(audit_router)
app.include_router(staff_router)
app.include_router(demo_router)

# Auto-seed demo on startup if table is empty
@app.on_event("startup")
def on_startup():
    db = SessionLocal()
    try:
        if db.query(Hospital).count() == 0:
            seed_demo_data(db)
    finally:
        db.close()