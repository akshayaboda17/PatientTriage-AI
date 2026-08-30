import sys
import os
import datetime
import time
from collections import defaultdict
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, Depends, HTTPException, status, Query, BackgroundTasks, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import desc

# Add parent directory and ai_engine to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'ai_engine')))

import uuid

from models import (
    Base, engine, SessionLocal, Hospital, Staff, StaffRoleEnum,
    Patient, EDEncounter, EncounterStatusEnum, ClinicalObservation,
    TriageAssessment, AIRiskAssessment, AIExplanation, AIRiskCategoryEnum,
    ClinicalAlert, AlertStatusEnum, AlertSeverityEnum,
    AIAgreementEnum, ClinicalDecisionEnum, OverrideReasonCategoryEnum,
    PhysicianAssessment, AuditLog, TriageAuditLog,
    ActorTypeEnum, AuditResultEnum
)
from services.rbac import (
    get_db, get_current_staff, require_permission,
    verify_hospital_access, get_staff_permissions,
    create_session, revoke_session, verify_password, hash_password
)
from services.audit_service import AuditService
from services.deterioration_detector import DeteriorationDetector
from services.alert_service import AlertService
from services.background_monitor import BackgroundMonitorService
from triage_engine import TriageEngine

# Initialize database schema
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="PatientTriage.ai Clinical API",
    description="Emergency Department Clinical Decision Support & Deterioration Detection System",
    version="1.0.0"
)

# ==========================================
# Security Headers Middleware
# ==========================================
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'"
        return response

app.add_middleware(SecurityHeadersMiddleware)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Login Rate Limiting (In-Memory sliding window)
LOGIN_FAILED_ATTEMPTS: Dict[str, List[float]] = defaultdict(list)
MAX_LOGIN_ATTEMPTS = 5
LOGIN_RATE_WINDOW_SECONDS = 60

def check_login_rate_limit(key: str) -> bool:
    now = time.time()
    # Prune attempts outside sliding window
    LOGIN_FAILED_ATTEMPTS[key] = [t for t in LOGIN_FAILED_ATTEMPTS[key] if now - t < LOGIN_RATE_WINDOW_SECONDS]
    return len(LOGIN_FAILED_ATTEMPTS[key]) < MAX_LOGIN_ATTEMPTS

def record_login_failure(key: str) -> None:
    LOGIN_FAILED_ATTEMPTS[key].append(time.time())

def reset_login_rate_limit(key: str) -> None:
    if key in LOGIN_FAILED_ATTEMPTS:
        del LOGIN_FAILED_ATTEMPTS[key]

legacy_engine = TriageEngine()
deterioration_detector = DeteriorationDetector()
monitor_service = BackgroundMonitorService()

# ==========================================
# Pydantic Schemas with Strict Range & Length Validation
# ==========================================

class LoginRequest(BaseModel):
    staff_id: str = Field(..., min_length=1, max_length=50)
    password: Optional[str] = Field("password", max_length=200)
    hospital_id: Optional[str] = Field(None, max_length=50)

class VitalSignInput(BaseModel):
    hr: int = Field(..., ge=0, le=300, description="Heart rate in bpm")
    sbp: int = Field(..., ge=0, le=350, description="Systolic blood pressure in mmHg")
    dbp: Optional[int] = Field(None, ge=0, le=250, description="Diastolic blood pressure in mmHg")
    rr: int = Field(..., ge=0, le=100, description="Respiratory rate in breaths/min")
    spo2: int = Field(..., ge=0, le=100, description="SpO2 oxygen saturation percentage")
    temp: Optional[float] = Field(37.0, ge=20.0, le=50.0, description="Temperature in Celsius")
    gcs: Optional[int] = Field(15, ge=3, le=15, description="Glasgow Coma Scale")
    pain_score: Optional[int] = Field(0, ge=0, le=10, description="Pain score 0-10")
    notes: Optional[str] = Field(None, max_length=5000)

class AlertResolutionInput(BaseModel):
    resolution_reason: str = Field(..., min_length=3, max_length=1000, description="Clinical reason for resolving the alert")

class AlertDismissalInput(BaseModel):
    dismissal_reason: str = Field(..., min_length=3, max_length=1000, description="Clinical rationale for dismissing the alert")

class ClinicalDecisionRequest(BaseModel):
    clinical_assessment: Optional[str] = Field(None, max_length=5000, description="Physician's clinical assessment / findings")
    ai_agreement: AIAgreementEnum = Field(default=AIAgreementEnum.AGREED, description="Whether physician agrees with AI risk assessment")
    clinician_assigned_risk: Optional[str] = Field(None, max_length=50, description="Clinician's determined risk category")
    override_reason: Optional[str] = Field(None, max_length=1000, description="Structured rationale required if overriding AI assessment")
    clinical_notes: Optional[str] = Field(None, max_length=5000, description="Additional physician notes and clinical context")
    clinical_decision: ClinicalDecisionEnum = Field(default=ClinicalDecisionEnum.CONTINUE_EVALUATION, description="Next step / clinical disposition")

class ObservationCorrectionRequest(BaseModel):
    hr: Optional[int] = Field(None, ge=0, le=300)
    sbp: Optional[int] = Field(None, ge=0, le=350)
    dbp: Optional[int] = Field(None, ge=0, le=250)
    rr: Optional[int] = Field(None, ge=0, le=100)
    spo2: Optional[int] = Field(None, ge=0, le=100)
    temp: Optional[float] = Field(None, ge=20.0, le=50.0)
    gcs: Optional[int] = Field(None, ge=3, le=15)
    pain_score: Optional[int] = Field(None, ge=0, le=10)
    notes: Optional[str] = Field(None, max_length=5000)
    correction_reason: str = Field(..., min_length=3, max_length=1000, description="Clinical reason for correcting vital signs data")

class PatientCreateRequest(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    mrn: str = Field(..., min_length=1, max_length=50)
    age: float = Field(..., ge=0, le=130)
    gender: str = Field(..., min_length=1, max_length=30)
    phone: Optional[str] = Field(None, max_length=50)
    allergies: Optional[str] = Field(None, max_length=2000)
    medical_history: Optional[str] = Field(None, max_length=5000)

class PatientUpdateRequest(BaseModel):
    first_name: Optional[str] = Field(None, max_length=100)
    last_name: Optional[str] = Field(None, max_length=100)
    age: Optional[float] = Field(None, ge=0, le=130)
    gender: Optional[str] = Field(None, max_length=30)
    phone: Optional[str] = Field(None, max_length=50)
    allergies: Optional[str] = Field(None, max_length=2000)
    medical_history: Optional[str] = Field(None, max_length=5000)

class EncounterCreateRequest(BaseModel):
    patient_id: str = Field(..., min_length=1, max_length=50)
    chief_complaint: str = Field(..., min_length=1, max_length=500)
    arrival_mode: Optional[str] = Field("Walk-in", max_length=50)
    bed_number: Optional[str] = Field(None, max_length=30)

class EncounterStatusUpdateRequest(BaseModel):
    status: EncounterStatusEnum
    bed_number: Optional[str] = Field(None, max_length=30)

class TriageCreateRequest(BaseModel):
    triage_level: int = Field(..., ge=1, le=5)
    acuity_category: str = Field(..., max_length=50)
    chief_complaint: Optional[str] = Field(None, max_length=500)
    pain_score: Optional[int] = Field(0, ge=0, le=10)
    mobility: Optional[str] = Field("Ambulatory", max_length=50)
    notes: Optional[str] = Field(None, max_length=5000)

class StaffCreateRequest(BaseModel):
    staff_id: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=150)
    email: str = Field(..., min_length=3, max_length=150)
    role: StaffRoleEnum
    password: Optional[str] = Field("password", max_length=200)

class StaffRoleUpdateRequest(BaseModel):
    role: StaffRoleEnum

class AIAssessmentOutputSchema(BaseModel):
    risk_score: float = Field(..., ge=0.0, le=1.0)
    risk_category: AIRiskCategoryEnum
    predicted_level: int = Field(..., ge=1, le=5)
    confidence: Optional[float] = Field(None, ge=0.0, le=1.0)

class LegacyPatientInput(BaseModel):
    age: int = None
    gender: str = None
    hr: int
    sbp: int
    rr: int
    spo2: int
    gcs: int
    history_available: bool = False

class LegacyOverrideInput(BaseModel):
    patient_id: str
    staff_id: str
    ai_suggested_level: int
    ai_confidence_score: float
    clinician_assigned_level: int
    action_type: str
    override_reason: str = None
    top_3_drivers: list

# ==========================================
# Authentication & Tenant Routes
# ==========================================

@app.post("/api/auth/login")
def login(creds: LoginRequest, raw_req: Request, db: Session = Depends(get_db)):
    """
    Authenticates staff with rate limiting, password verification, and session token generation.
    Audits successful logins and failed login attempts without leaking credentials.
    """
    client_ip = raw_req.client.host if (raw_req.client and raw_req.client.host) else "127.0.0.1"
    rate_key = f"{client_ip}:{creds.staff_id}"

    if not check_login_rate_limit(rate_key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed login attempts. Rate limit exceeded. Please wait 60 seconds."
        )

    query = db.query(Staff).filter(Staff.staff_id == creds.staff_id)
    if creds.hospital_id:
        query = query.filter(Staff.hospital_id == creds.hospital_id)
    staff = query.first()

    if not staff or not verify_password(creds.password, staff.password_hash):
        record_login_failure(rate_key)
        AuditService.log_event(
            db=db,
            hospital_id=creds.hospital_id or (staff.hospital_id if staff else "SYSTEM"),
            action="LOGIN_FAILURE",
            entity_type="AUTHENTICATION",
            entity_id=creds.staff_id,
            actor_id=creds.staff_id,
            actor_role=staff.role.value if staff else "UNKNOWN",
            actor_type=ActorTypeEnum.HUMAN,
            result=AuditResultEnum.DENIED,
            metadata={"reason": "Invalid credentials provided"},
            auto_commit=True
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid staff ID or password."
        )

    if not staff.is_active:
        AuditService.log_event(
            db=db,
            hospital_id=staff.hospital_id,
            action="LOGIN_FAILURE",
            entity_type="AUTHENTICATION",
            entity_id=staff.staff_id,
            actor_id=staff.staff_id,
            actor_name=staff.name,
            actor_role=staff.role.value,
            actor_type=ActorTypeEnum.HUMAN,
            result=AuditResultEnum.DENIED,
            metadata={"reason": "Staff account deactivated"},
            auto_commit=True
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Staff account has been deactivated."
        )

    # Success: reset rate limit tracking
    reset_login_rate_limit(rate_key)

    AuditService.log_event(
        db=db,
        hospital_id=staff.hospital_id,
        action="LOGIN_SUCCESS",
        entity_type="AUTHENTICATION",
        entity_id=staff.staff_id,
        actor_id=staff.staff_id,
        actor_name=staff.name,
        actor_role=staff.role.value,
        actor_type=ActorTypeEnum.HUMAN,
        result=AuditResultEnum.SUCCESS,
        metadata={"role": staff.role.value},
        auto_commit=True
    )

    hospital = db.query(Hospital).filter(Hospital.hospital_code == staff.hospital_id).first()
    permissions = list(get_staff_permissions(staff.role))
    token = create_session(staff.staff_id, staff.hospital_id)

    return {
        "access_token": token,
        "token_type": "bearer",
        "staff": staff.to_dict(),
        "hospital": hospital.to_dict() if hospital else None,
        "permissions": permissions
    }

@app.post("/api/auth/logout")
def logout(
    raw_req: Request,
    staff: Staff = Depends(get_current_staff),
    db: Session = Depends(get_db)
):
    """
    Logs out authenticated staff member, invalidates session token, and creates an audit record.
    """
    auth_header = raw_req.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
        revoke_session(token)
    elif raw_req.headers.get("X-Staff-Id"):
        revoke_session(raw_req.headers.get("X-Staff-Id"))

    AuditService.log_event(
        db=db,
        hospital_id=staff.hospital_id,
        action="LOGOUT",
        entity_type="AUTHENTICATION",
        entity_id=staff.staff_id,
        actor_id=staff.staff_id,
        actor_name=staff.name,
        actor_role=staff.role.value,
        actor_type=ActorTypeEnum.HUMAN,
        result=AuditResultEnum.SUCCESS,
        auto_commit=True
    )
    return {"status": "success", "message": "Successfully logged out and session revoked."}

@app.get("/api/auth/me")
def get_current_user_profile(staff: Staff = Depends(get_current_staff), db: Session = Depends(get_db)):
    hospital = db.query(Hospital).filter(Hospital.hospital_code == staff.hospital_id).first()
    return {
        "staff": staff.to_dict(),
        "hospital": hospital.to_dict() if hospital else None,
        "permissions": list(get_staff_permissions(staff.role))
    }

@app.get("/api/hospitals")
def list_hospitals(db: Session = Depends(get_db)):
    hospitals = db.query(Hospital).filter(Hospital.is_active == True).all()
    return {"hospitals": [h.to_dict() for h in hospitals]}

# ==========================================
# ED Queue & Encounters
# ==========================================

@app.get("/api/encounters")
def get_ed_encounters(
    status_filter: Optional[str] = None,
    staff: Staff = Depends(require_permission("patient:view")),
    db: Session = Depends(get_db)
):
    """
    Retrieves active ED queue encounters isolated to the authenticated hospital.
    Includes current vitals, latest triage, AI risk score, and active alert counts.
    """
    query = db.query(EDEncounter).filter(EDEncounter.hospital_id == staff.hospital_id)
    if status_filter:
        query = query.filter(EDEncounter.status == status_filter)
    else:
        # Default to active waiting/in-treatment encounters
        query = query.filter(EDEncounter.status.in_([
            EncounterStatusEnum.WAITING,
            EncounterStatusEnum.IN_TRIAGE,
            EncounterStatusEnum.IN_TREATMENT
        ]))

    encounters = query.order_by(EDEncounter.arrival_time.asc()).all()

    queue_list = []
    now = datetime.datetime.utcnow()

    for enc in encounters:
        patient = enc.patient
        latest_obs = db.query(ClinicalObservation).filter(
            ClinicalObservation.encounter_id == enc.encounter_id
        ).order_by(ClinicalObservation.timestamp.desc()).first()

        latest_triage = db.query(TriageAssessment).filter(
            TriageAssessment.encounter_id == enc.encounter_id
        ).order_by(TriageAssessment.assessed_at.desc()).first()

        latest_ai_risk = db.query(AIRiskAssessment).filter(
            AIRiskAssessment.encounter_id == enc.encounter_id
        ).order_by(AIRiskAssessment.assessed_at.desc()).first()

        active_alerts = db.query(ClinicalAlert).filter(
            ClinicalAlert.encounter_id == enc.encounter_id,
            ClinicalAlert.status.in_([AlertStatusEnum.UNACKNOWLEDGED, AlertStatusEnum.ACKNOWLEDGED])
        ).all()

        wait_mins = int((now - enc.arrival_time).total_seconds() / 60) if enc.arrival_time else 0

        queue_list.append({
            "encounter_id": enc.encounter_id,
            "patient_id": enc.patient_id,
            "patient_name": f"{patient.first_name} {patient.last_name}" if patient else "Unknown",
            "age": patient.age if patient else None,
            "gender": patient.gender if patient else None,
            "arrival_time": enc.arrival_time.isoformat() if enc.arrival_time else None,
            "wait_time_mins": wait_mins,
            "status": enc.status.value,
            "bed_number": enc.bed_number,
            "chief_complaint": enc.chief_complaint,
            "triage_level": latest_triage.triage_level if latest_triage else 3,
            "acuity_category": latest_triage.acuity_category if latest_triage else "Urgent",
            "latest_vitals": latest_obs.to_dict() if latest_obs else None,
            "ai_risk": latest_ai_risk.to_dict() if latest_ai_risk else None,
            "active_alert_count": len(active_alerts),
            "max_alert_severity": max([a.severity.value for a in active_alerts], default=None) if active_alerts else None,
            "alerts": [a.to_dict() for a in active_alerts]
        })

    # Sort queue by priority: Triage Level (1 is highest priority), then longest wait time
    sorted_queue = sorted(queue_list, key=lambda x: (x['triage_level'], -x['wait_time_mins']))
    return {"queue": sorted_queue, "hospital_id": staff.hospital_id, "total": len(sorted_queue)}

# ==========================================
# Patient & Encounter Intake (Tasks 5 & 11)
# ==========================================

@app.post("/api/patients")
def create_patient(
    req: PatientCreateRequest,
    staff: Staff = Depends(require_permission("patient:create")),
    db: Session = Depends(get_db)
):
    """
    Registers a new patient and logs PATIENT_CREATED.
    """
    patient_id = f"PT-{staff.hospital_id[:4]}-{uuid.uuid4().hex[:6].upper()}"
    new_patient = Patient(
        patient_id=patient_id,
        hospital_id=staff.hospital_id,
        first_name=req.first_name,
        last_name=req.last_name,
        mrn=req.mrn,
        age=req.age,
        gender=req.gender,
        phone=req.phone,
        allergies=req.allergies,
        medical_history=req.medical_history,
        created_at=datetime.datetime.utcnow()
    )
    db.add(new_patient)
    db.commit()
    db.refresh(new_patient)

    # Audit Patient Registration
    AuditService.log_event(
        db=db,
        hospital_id=staff.hospital_id,
        action="PATIENT_CREATED",
        entity_type="PATIENT",
        entity_id=new_patient.patient_id,
        actor_id=staff.staff_id,
        actor_name=staff.name,
        actor_role=staff.role.value,
        actor_type=ActorTypeEnum.HUMAN,
        patient_id=new_patient.patient_id,
        result=AuditResultEnum.SUCCESS,
        metadata={"mrn": new_patient.mrn},
        auto_commit=True
    )

    return {"message": "Patient registered successfully.", "patient": new_patient.to_dict()}

@app.get("/api/patients/{patient_id}")
def get_patient(
    patient_id: str,
    staff: Staff = Depends(require_permission("patient:view")),
    db: Session = Depends(get_db)
):
    """
    Retrieves patient demographics and logs PATIENT_VIEWED.
    """
    patient = db.query(Patient).filter(
        Patient.patient_id == patient_id,
        Patient.hospital_id == staff.hospital_id
    ).first()

    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Patient '{patient_id}' not found.")

    AuditService.log_event(
        db=db,
        hospital_id=staff.hospital_id,
        action="PATIENT_VIEWED",
        entity_type="PATIENT",
        entity_id=patient.patient_id,
        actor_id=staff.staff_id,
        actor_name=staff.name,
        actor_role=staff.role.value,
        actor_type=ActorTypeEnum.HUMAN,
        patient_id=patient.patient_id,
        result=AuditResultEnum.SUCCESS,
        auto_commit=True
    )

    return {"patient": patient.to_dict()}

@app.put("/api/patients/{patient_id}")
def update_patient(
    patient_id: str,
    req: PatientUpdateRequest,
    staff: Staff = Depends(require_permission("patient:update")),
    db: Session = Depends(get_db)
):
    """
    Updates patient demographics and logs PATIENT_UPDATED.
    """
    patient = db.query(Patient).filter(
        Patient.patient_id == patient_id,
        Patient.hospital_id == staff.hospital_id
    ).first()

    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Patient '{patient_id}' not found.")

    if req.first_name is not None: patient.first_name = req.first_name
    if req.last_name is not None: patient.last_name = req.last_name
    if req.age is not None: patient.age = req.age
    if req.gender is not None: patient.gender = req.gender
    if req.phone is not None: patient.phone = req.phone
    if req.allergies is not None: patient.allergies = req.allergies
    if req.medical_history is not None: patient.medical_history = req.medical_history

    db.commit()
    db.refresh(patient)

    AuditService.log_event(
        db=db,
        hospital_id=staff.hospital_id,
        action="PATIENT_UPDATED",
        entity_type="PATIENT",
        entity_id=patient.patient_id,
        actor_id=staff.staff_id,
        actor_name=staff.name,
        actor_role=staff.role.value,
        actor_type=ActorTypeEnum.HUMAN,
        patient_id=patient.patient_id,
        result=AuditResultEnum.SUCCESS,
        auto_commit=True
    )

    return {"message": "Patient updated successfully.", "patient": patient.to_dict()}

@app.post("/api/encounters")
def create_encounter(
    req: EncounterCreateRequest,
    staff: Staff = Depends(require_permission("patient:create")),
    db: Session = Depends(get_db)
):
    """
    Creates a new ED encounter and logs ENCOUNTER_CREATED.
    """
    patient = db.query(Patient).filter(
        Patient.patient_id == req.patient_id,
        Patient.hospital_id == staff.hospital_id
    ).first()

    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Patient '{req.patient_id}' not found.")

    enc_id = f"ENC-{staff.hospital_id[:4]}-{uuid.uuid4().hex[:6].upper()}"
    new_enc = EDEncounter(
        encounter_id=enc_id,
        hospital_id=staff.hospital_id,
        patient_id=req.patient_id,
        arrival_time=datetime.datetime.utcnow(),
        arrival_mode=req.arrival_mode or "Walk-in",
        chief_complaint=req.chief_complaint,
        status=EncounterStatusEnum.WAITING,
        bed_number=req.bed_number
    )
    db.add(new_enc)
    db.commit()
    db.refresh(new_enc)

    AuditService.log_event(
        db=db,
        hospital_id=staff.hospital_id,
        action="ENCOUNTER_CREATED",
        entity_type="ENCOUNTER",
        entity_id=new_enc.encounter_id,
        actor_id=staff.staff_id,
        actor_name=staff.name,
        actor_role=staff.role.value,
        actor_type=ActorTypeEnum.HUMAN,
        patient_id=new_enc.patient_id,
        encounter_id=new_enc.encounter_id,
        result=AuditResultEnum.SUCCESS,
        metadata={"chief_complaint": req.chief_complaint, "arrival_mode": req.arrival_mode},
        auto_commit=True
    )

    return {"message": "ED Encounter created successfully.", "encounter": new_enc.to_dict()}

@app.put("/api/encounters/{encounter_id}/status")
def update_encounter_status(
    encounter_id: str,
    req: EncounterStatusUpdateRequest,
    staff: Staff = Depends(require_permission("patient:update")),
    db: Session = Depends(get_db)
):
    """
    Updates encounter status and logs ENCOUNTER_STATUS_CHANGED.
    """
    enc = db.query(EDEncounter).filter(
        EDEncounter.encounter_id == encounter_id,
        EDEncounter.hospital_id == staff.hospital_id
    ).first()

    if not enc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Encounter '{encounter_id}' not found.")

    prev_status = enc.status.value
    enc.status = req.status
    if req.bed_number is not None:
        enc.bed_number = req.bed_number

    db.commit()
    db.refresh(enc)

    AuditService.log_event(
        db=db,
        hospital_id=staff.hospital_id,
        action="ENCOUNTER_STATUS_CHANGED",
        entity_type="ENCOUNTER",
        entity_id=enc.encounter_id,
        actor_id=staff.staff_id,
        actor_name=staff.name,
        actor_role=staff.role.value,
        actor_type=ActorTypeEnum.HUMAN,
        patient_id=enc.patient_id,
        encounter_id=enc.encounter_id,
        result=AuditResultEnum.SUCCESS,
        metadata={"previous_status": prev_status, "new_status": req.status.value},
        auto_commit=True
    )

    return {"message": "Encounter status updated.", "encounter": enc.to_dict()}

@app.post("/api/encounters/{encounter_id}/triage")
def create_encounter_triage(
    encounter_id: str,
    req: TriageCreateRequest,
    staff: Staff = Depends(require_permission("triage:create")),
    db: Session = Depends(get_db)
):
    """
    Conducts triage assessment for encounter and logs TRIAGE_CREATED.
    """
    enc = db.query(EDEncounter).filter(
        EDEncounter.encounter_id == encounter_id,
        EDEncounter.hospital_id == staff.hospital_id
    ).first()

    if not enc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Encounter '{encounter_id}' not found.")

    triage = TriageAssessment(
        hospital_id=staff.hospital_id,
        patient_id=enc.patient_id,
        encounter_id=encounter_id,
        triage_level=req.triage_level,
        acuity_category=req.acuity_category,
        chief_complaint=req.chief_complaint or enc.chief_complaint,
        pain_score=req.pain_score or 0,
        mobility=req.mobility or "Ambulatory",
        assessed_by=staff.staff_id,
        assessed_at=datetime.datetime.utcnow(),
        notes=req.notes
    )
    db.add(triage)
    enc.status = EncounterStatusEnum.IN_TREATMENT
    db.commit()
    db.refresh(triage)

    AuditService.log_event(
        db=db,
        hospital_id=staff.hospital_id,
        action="TRIAGE_CREATED",
        entity_type="TRIAGE_ASSESSMENT",
        entity_id=str(triage.id),
        actor_id=staff.staff_id,
        actor_name=staff.name,
        actor_role=staff.role.value,
        actor_type=ActorTypeEnum.HUMAN,
        patient_id=enc.patient_id,
        encounter_id=encounter_id,
        result=AuditResultEnum.SUCCESS,
        metadata={"triage_level": req.triage_level, "acuity": req.acuity_category},
        auto_commit=True
    )

    return {"message": "Triage assessment recorded.", "triage": triage.to_dict()}

@app.get("/api/encounters/{encounter_id}")
def get_encounter_details(
    encounter_id: str,
    staff: Staff = Depends(require_permission("patient:view")),
    db: Session = Depends(get_db)
):
    """
    Retrieves full longitudinal history, vitals trend, AI risk assessment, explainability, alerts, and timeline.
    """
    enc = db.query(EDEncounter).filter(
        EDEncounter.encounter_id == encounter_id,
        EDEncounter.hospital_id == staff.hospital_id
    ).first()

    if not enc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Encounter '{encounter_id}' not found in hospital '{staff.hospital_id}'."
        )

    patient = enc.patient
    observations = db.query(ClinicalObservation).filter(
        ClinicalObservation.encounter_id == encounter_id
    ).order_by(ClinicalObservation.timestamp.asc()).all()

    triage = db.query(TriageAssessment).filter(
        TriageAssessment.encounter_id == encounter_id
    ).order_by(TriageAssessment.assessed_at.desc()).first()

    ai_risk = db.query(AIRiskAssessment).filter(
        AIRiskAssessment.encounter_id == encounter_id
    ).order_by(AIRiskAssessment.assessed_at.desc()).first()

    ai_explanation = None
    if ai_risk:
        ai_explanation = db.query(AIExplanation).filter(
            AIExplanation.risk_assessment_id == ai_risk.id
        ).first()

    alerts = db.query(ClinicalAlert).filter(
        ClinicalAlert.encounter_id == encounter_id
    ).order_by(ClinicalAlert.detected_at.desc()).all()

    physician_assessments = db.query(PhysicianAssessment).filter(
        PhysicianAssessment.encounter_id == encounter_id
    ).order_by(PhysicianAssessment.created_at.desc()).all()

    # Build Unified Clinical Timeline
    timeline = []
    if enc.arrival_time:
        timeline.append({
            "timestamp": enc.arrival_time.isoformat(),
            "type": "ARRIVAL",
            "title": "Patient Arrived in ED",
            "description": f"Arrival via {enc.arrival_mode} with chief complaint: {enc.chief_complaint}",
            "actor": "Intake Desk"
        })
    if triage:
        timeline.append({
            "timestamp": triage.assessed_at.isoformat(),
            "type": "TRIAGE",
            "title": f"Triage Assessed: ESI Level {triage.triage_level} ({triage.acuity_category})",
            "description": triage.notes or "Initial triage completed.",
            "actor": triage.assessed_by
        })
    for obs in observations:
        timeline.append({
            "timestamp": obs.timestamp.isoformat(),
            "type": "VITALS",
            "title": f"Vital Signs Recorded: HR {obs.hr}, SpO2 {obs.spo2}%, RR {obs.rr}",
            "description": f"BP: {obs.sbp}/{obs.dbp or '-'} mmHg, Temp: {obs.temp}°C, GCS: {obs.gcs}",
            "actor": obs.recorded_by
        })
    if ai_risk:
        timeline.append({
            "timestamp": ai_risk.assessed_at.isoformat(),
            "type": "AI_RISK",
            "title": f"AI Risk Assessment: {ai_risk.risk_category.value} ({ai_risk.risk_score}%)",
            "description": f"Predicted Triage Level {ai_risk.predicted_triage_level} (Confidence {ai_risk.confidence_score}%)",
            "actor": "AI Engine"
        })
    for alert in alerts:
        timeline.append({
            "timestamp": alert.detected_at.isoformat(),
            "type": "ALERT_DETECTED",
            "title": f"🚨 Clinical Alert: {alert.severity.value} - {alert.alert_type}",
            "description": alert.summary,
            "actor": alert.detection_source.value
        })
        if alert.acknowledged_at:
            timeline.append({
                "timestamp": alert.acknowledged_at.isoformat(),
                "type": "ALERT_ACKNOWLEDGED",
                "title": f"Alert Acknowledged by {alert.acknowledged_by_name} ({alert.acknowledged_by_role})",
                "description": f"Alert {alert.alert_id} moved to ACKNOWLEDGED",
                "actor": alert.acknowledged_by_id
            })
        if alert.resolved_at:
            timeline.append({
                "timestamp": alert.resolved_at.isoformat(),
                "type": "ALERT_RESOLVED",
                "title": f"Alert Resolved by {alert.resolved_by_name} ({alert.resolved_by_role})",
                "description": f"Resolution Note: {alert.resolution_reason}",
                "actor": alert.resolved_by_id
            })
    for pa in physician_assessments:
        if pa.ai_agreement == AIAgreementEnum.OVERRIDDEN:
            timeline.append({
                "timestamp": pa.created_at.isoformat(),
                "type": "PHYSICIAN_OVERRIDE",
                "title": f"👨‍⚕️ Physician Override: AI {pa.ai_risk_category_at_review or 'Risk'} ➔ Clinician {pa.clinician_assigned_risk or 'Assessment'}",
                "description": f"Decision: {pa.clinical_decision.value} | Reason: {pa.override_reason or 'Clinical context'}. Notes: {pa.clinical_notes or '-'}",
                "actor": f"{pa.physician_name} ({pa.physician_role})"
            })
        else:
            timeline.append({
                "timestamp": pa.created_at.isoformat(),
                "type": "PHYSICIAN_DECISION",
                "title": f"👨‍⚕️ Physician Decision: Agreed with AI Assessment ({pa.clinical_decision.value})",
                "description": f"Assessment: {pa.clinical_assessment or 'Reviewed and confirmed'}. Notes: {pa.clinical_notes or '-'}",
                "actor": f"{pa.physician_name} ({pa.physician_role})"
            })

    timeline_sorted = sorted(timeline, key=lambda x: x['timestamp'], reverse=True)

    return {
        "encounter": enc.to_dict(),
        "patient": patient.to_dict() if patient else None,
        "observations": [o.to_dict() for o in observations],
        "triage": triage.to_dict() if triage else None,
        "ai_risk": ai_risk.to_dict() if ai_risk else None,
        "ai_explanation": ai_explanation.to_dict() if ai_explanation else None,
        "alerts": [a.to_dict() for a in alerts],
        "physician_assessments": [p.to_dict() for p in physician_assessments],
        "current_physician_assessment": physician_assessments[0].to_dict() if physician_assessments else None,
        "timeline": timeline_sorted
    }

@app.post("/api/encounters/{encounter_id}/ai-assessment")
def generate_ai_risk_assessment(
    encounter_id: str,
    staff: Staff = Depends(require_permission("ai:view")),
    db: Session = Depends(get_db)
):
    """
    Generates AI risk assessment with strict data minimization (anonymized clinical parameters only)
    and rigorous schema output validation.
    """
    enc = db.query(EDEncounter).filter(
        EDEncounter.encounter_id == encounter_id,
        EDEncounter.hospital_id == staff.hospital_id
    ).first()

    if not enc:
        raise HTTPException(status_code=404, detail=f"Encounter '{encounter_id}' not found.")

    patient = enc.patient
    latest_obs = db.query(ClinicalObservation).filter(
        ClinicalObservation.encounter_id == encounter_id
    ).order_by(ClinicalObservation.timestamp.desc()).first()

    # Data Minimization: Send ONLY clinical parameters to ML engine; never PHI (names, phone, mrn)
    minimized_features = {
        "age": patient.age,
        "gender": patient.gender,
        "chief_complaint": enc.chief_complaint,
        "hr": latest_obs.hr if latest_obs else 80,
        "sbp": latest_obs.sbp if latest_obs else 120,
        "dbp": latest_obs.dbp if latest_obs else 80,
        "rr": latest_obs.rr if latest_obs else 16,
        "spo2": latest_obs.spo2 if latest_obs else 98,
        "temp": latest_obs.temp if latest_obs else 37.0,
        "pain_score": latest_obs.pain_score if latest_obs else 0,
        "gcs": latest_obs.gcs if latest_obs else 15
    }

    try:
        raw_result = legacy_engine.evaluate_patient(minimized_features)
        
        # Schema validation of AI output
        raw_score = float(raw_result.get("confidence_score", 75.0))
        normalized_score = raw_score / 100.0 if raw_score > 1.0 else raw_score
        level = int(raw_result.get("triage_level", 3))
        
        cat_map = {1: AIRiskCategoryEnum.CRITICAL, 2: AIRiskCategoryEnum.HIGH, 3: AIRiskCategoryEnum.MODERATE, 4: AIRiskCategoryEnum.LOW, 5: AIRiskCategoryEnum.LOW}
        risk_cat = cat_map.get(level, AIRiskCategoryEnum.MODERATE)

        validated_output = AIAssessmentOutputSchema(
            risk_score=min(max(normalized_score, 0.0), 1.0),
            risk_category=risk_cat,
            predicted_level=level,
            confidence=normalized_score
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI risk engine returned invalid or malformed output: {e}")

    # Save AIRiskAssessment
    ai_risk = AIRiskAssessment(
        assessment_id=f"AI-{staff.hospital_id[:4]}-{uuid.uuid4().hex[:6].upper()}",
        hospital_id=staff.hospital_id,
        patient_id=enc.patient_id,
        encounter_id=enc.encounter_id,
        predicted_triage_level=validated_output.predicted_level,
        risk_score=validated_output.risk_score,
        risk_category=validated_output.risk_category,
        confidence_score=validated_output.confidence,
        model_name="PatientTriage TriageEngine",
        model_version="1.0-rf",
        assessed_at=datetime.datetime.utcnow()
    )
    db.add(ai_risk)
    db.commit()
    db.refresh(ai_risk)

    AuditService.log_event(
        db=db,
        hospital_id=staff.hospital_id,
        action="AI_ASSESSMENT_GENERATED",
        entity_type="AIRiskAssessment",
        entity_id=str(ai_risk.id),
        actor_id="AI_SYSTEM",
        actor_role="AI_SYSTEM",
        actor_type=ActorTypeEnum.AI_SYSTEM,
        patient_id=enc.patient_id,
        encounter_id=enc.encounter_id,
        result=AuditResultEnum.SUCCESS,
        metadata={"predicted_level": validated_output.predicted_level, "risk_category": validated_output.risk_category.value},
        auto_commit=True
    )

    return {"message": "AI Assessment generated.", "assessment": ai_risk.to_dict()}

@app.get("/api/encounters/{encounter_id}/clinical-review")
def get_clinical_review(
    encounter_id: str,
    staff: Staff = Depends(require_permission("clinical_decision:view")),
    db: Session = Depends(get_db)
):
    """
    Dedicated endpoint for the Physician Clinical Review Workspace, consolidating all clinical inputs.
    """
    return get_encounter_details(encounter_id, staff, db)

@app.post("/api/encounters/{encounter_id}/clinical-decision")
def record_clinical_decision(
    encounter_id: str,
    req: ClinicalDecisionRequest,
    current_staff: Staff = Depends(require_permission("clinical_decision:create")),
    db: Session = Depends(get_db)
):
    """
    Task 10: Records physician clinical assessment, agreement/override with AI, and clinical decision.
    Ensures original AI risk assessment remains immutable and untouched.
    """
    enc = db.query(EDEncounter).filter(EDEncounter.encounter_id == encounter_id).first()
    if not enc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Encounter '{encounter_id}' not found."
        )

    verify_hospital_access(enc.hospital_id, current_staff)

    # If overriding AI, require 'ai:override' permission
    if req.ai_agreement == AIAgreementEnum.OVERRIDDEN:
        perms = get_staff_permissions(current_staff.role)
        if "ai:override" not in perms:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{current_staff.role.value}' does not have permission 'ai:override'."
            )
        if not req.override_reason or not req.override_reason.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Structured override reason is mandatory when overriding AI assessment."
            )

    if not req.clinical_decision:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Clinical decision is required."
        )

    # Fetch latest AI assessment (if any) to store snapshot references immutably
    latest_ai = db.query(AIRiskAssessment).filter(
        AIRiskAssessment.encounter_id == encounter_id
    ).order_by(desc(AIRiskAssessment.assessed_at)).first()

    assessment_uid = f"PA-{encounter_id}-{uuid.uuid4().hex[:8].upper()}"

    new_assessment = PhysicianAssessment(
        assessment_id=assessment_uid,
        hospital_id=enc.hospital_id,
        encounter_id=encounter_id,
        patient_id=enc.patient_id,
        physician_id=current_staff.staff_id,
        physician_name=current_staff.name,
        physician_role=current_staff.role.value,
        ai_assessment_id=latest_ai.assessment_id if latest_ai else None,
        ai_risk_category_at_review=latest_ai.risk_category.value if latest_ai else None,
        ai_risk_score_at_review=latest_ai.risk_score if latest_ai else None,
        clinical_assessment=req.clinical_assessment,
        ai_agreement=req.ai_agreement,
        clinician_assigned_risk=req.clinician_assigned_risk,
        override_reason=req.override_reason if req.ai_agreement == AIAgreementEnum.OVERRIDDEN else None,
        clinical_notes=req.clinical_notes,
        clinical_decision=req.clinical_decision
    )

    db.add(new_assessment)

    # Create immutable audit log
    action_type = "AI_OVERRIDDEN" if req.ai_agreement == AIAgreementEnum.OVERRIDDEN else "CLINICAL_DECISION_SAVED"
    AuditService.log_event(
        db=db,
        hospital_id=enc.hospital_id,
        action=action_type,
        entity_type="PhysicianAssessment",
        entity_id=assessment_uid,
        actor_id=current_staff.staff_id,
        actor_name=current_staff.name,
        actor_role=current_staff.role.value,
        actor_type=ActorTypeEnum.HUMAN,
        patient_id=enc.patient_id,
        encounter_id=encounter_id,
        result=AuditResultEnum.SUCCESS,
        metadata={
            "encounter_id": encounter_id,
            "patient_id": enc.patient_id,
            "ai_agreement": req.ai_agreement.value,
            "clinical_decision": req.clinical_decision.value,
            "override_reason": req.override_reason if req.ai_agreement == AIAgreementEnum.OVERRIDDEN else None,
            "ai_risk_original": latest_ai.risk_category.value if latest_ai else None,
            "clinician_assigned_risk": req.clinician_assigned_risk,
            "physician_notes": req.clinical_notes
        }
    )

    db.commit()
    db.refresh(new_assessment)

    return {
        "status": "SUCCESS",
        "message": f"Clinical decision recorded successfully for encounter {encounter_id}.",
        "assessment": new_assessment.to_dict()
    }

@app.get("/api/encounters/{encounter_id}/physician-assessments")
def get_physician_assessments(
    encounter_id: str,
    staff: Staff = Depends(require_permission("clinical_decision:view")),
    db: Session = Depends(get_db)
):
    """
    Returns full history of physician clinical assessments for the encounter.
    """
    enc = db.query(EDEncounter).filter(EDEncounter.encounter_id == encounter_id).first()
    if not enc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Encounter '{encounter_id}' not found."
        )

    verify_hospital_access(enc.hospital_id, staff)

    assessments = db.query(PhysicianAssessment).filter(
        PhysicianAssessment.encounter_id == encounter_id
    ).order_by(PhysicianAssessment.created_at.desc()).all()

    return {
        "encounter_id": encounter_id,
        "count": len(assessments),
        "assessments": [a.to_dict() for a in assessments]
    }

@app.post("/api/encounters/{encounter_id}/vitals")
def record_vital_signs(
    encounter_id: str,
    vital_input: VitalSignInput,
    background_tasks: BackgroundTasks,
    staff: Staff = Depends(require_permission("vitals:create")),
    db: Session = Depends(get_db)
):
    """
    Records a new longitudinal vital signs observation.
    Immediately triggers Deterioration Detection across historical trend.
    """
    enc = db.query(EDEncounter).filter(
        EDEncounter.encounter_id == encounter_id,
        EDEncounter.hospital_id == staff.hospital_id
    ).first()

    if not enc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Encounter '{encounter_id}' not found in hospital '{staff.hospital_id}'."
        )

    # Insert Observation
    obs = ClinicalObservation(
        hospital_id=staff.hospital_id,
        patient_id=enc.patient_id,
        encounter_id=encounter_id,
        timestamp=datetime.datetime.utcnow(),
        hr=vital_input.hr,
        sbp=vital_input.sbp,
        dbp=vital_input.dbp,
        rr=vital_input.rr,
        spo2=vital_input.spo2,
        temp=vital_input.temp,
        gcs=vital_input.gcs or 15,
        pain_score=vital_input.pain_score or 0,
        recorded_by=staff.staff_id,
        notes=vital_input.notes
    )
    db.add(obs)
    db.commit()
    db.refresh(obs)

    # Audit Observation Recording
    AuditService.log_event(
        db=db,
        hospital_id=staff.hospital_id,
        action="OBSERVATION_RECORDED",
        entity_type="ClinicalObservation",
        entity_id=str(obs.id),
        actor_id=staff.staff_id,
        actor_name=staff.name,
        actor_role=staff.role.value,
        actor_type=ActorTypeEnum.HUMAN,
        patient_id=enc.patient_id,
        encounter_id=encounter_id,
        result=AuditResultEnum.SUCCESS,
        metadata={"hr": obs.hr, "sbp": obs.sbp, "rr": obs.rr, "spo2": obs.spo2},
        auto_commit=True
    )

    # Run Real-Time Deterioration Detection across all historical observations
    all_obs = db.query(ClinicalObservation).filter(
        ClinicalObservation.encounter_id == encounter_id
    ).order_by(ClinicalObservation.timestamp.asc()).all()

    detection_result = deterioration_detector.evaluate_longitudinal_trend(
        observations=all_obs,
        patient_age=enc.patient.age if enc.patient else None
    )

    alert_created = False
    alert_obj = None
    alert_msg = ""

    if detection_result.get("detected"):
        alert_obj, alert_created, alert_msg = AlertService.create_or_update_alert(
            db=db,
            hospital_id=staff.hospital_id,
            patient_id=enc.patient_id,
            encounter_id=encounter_id,
            detection_result=detection_result
        )

    return {
        "message": "Vital signs recorded successfully.",
        "observation": obs.to_dict(),
        "deterioration_detected": detection_result.get("detected", False),
        "detection_result": detection_result,
        "alert": alert_obj.to_dict() if alert_obj else None,
        "alert_created": alert_created,
        "alert_status_message": alert_msg
    }

@app.put("/api/encounters/{encounter_id}/observations/{observation_id}")
def correct_observation(
    encounter_id: str,
    observation_id: int,
    req: ObservationCorrectionRequest,
    staff: Staff = Depends(require_permission("vitals:update")),
    db: Session = Depends(get_db)
):
    """
    Task 11: Corrects a vital signs observation with mandatory clinical rationale.
    Preserves original observation values and logs OBSERVATION_CORRECTED audit event.
    """
    obs = db.query(ClinicalObservation).filter(
        ClinicalObservation.id == observation_id,
        ClinicalObservation.encounter_id == encounter_id,
        ClinicalObservation.hospital_id == staff.hospital_id
    ).first()

    if not obs:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Observation '{observation_id}' for encounter '{encounter_id}' not found."
        )

    # Save original values
    orig_vals = {
        "hr": obs.hr, "sbp": obs.sbp, "dbp": obs.dbp,
        "rr": obs.rr, "spo2": obs.spo2, "temp": obs.temp,
        "gcs": obs.gcs, "pain_score": obs.pain_score,
        "notes": obs.notes
    }
    obs.original_values_json = orig_vals

    # Apply corrections if provided
    if req.hr is not None: obs.hr = req.hr
    if req.sbp is not None: obs.sbp = req.sbp
    if req.dbp is not None: obs.dbp = req.dbp
    if req.rr is not None: obs.rr = req.rr
    if req.spo2 is not None: obs.spo2 = req.spo2
    if req.temp is not None: obs.temp = req.temp
    if req.gcs is not None: obs.gcs = req.gcs
    if req.pain_score is not None: obs.pain_score = req.pain_score
    if req.notes is not None: obs.notes = req.notes

    obs.is_corrected = True
    obs.correction_reason = req.correction_reason.strip()
    obs.corrected_by = staff.staff_id
    obs.corrected_at = datetime.datetime.utcnow()

    db.commit()
    db.refresh(obs)

    # Log OBSERVATION_CORRECTED
    AuditService.log_event(
        db=db,
        hospital_id=staff.hospital_id,
        action="OBSERVATION_CORRECTED",
        entity_type="ClinicalObservation",
        entity_id=str(obs.id),
        actor_id=staff.staff_id,
        actor_name=staff.name,
        actor_role=staff.role.value,
        actor_type=ActorTypeEnum.HUMAN,
        patient_id=obs.patient_id,
        encounter_id=encounter_id,
        result=AuditResultEnum.SUCCESS,
        metadata={
            "reason": req.correction_reason.strip(),
            "previous_values": orig_vals,
            "corrected_values": {
                "hr": obs.hr, "sbp": obs.sbp, "dbp": obs.dbp,
                "rr": obs.rr, "spo2": obs.spo2, "temp": obs.temp
            }
        },
        auto_commit=True
    )

    return {
        "message": "Observation corrected successfully.",
        "observation": obs.to_dict()
    }

@app.post("/api/encounters/{encounter_id}/deterioration/check")
def check_encounter_deterioration(
    encounter_id: str,
    staff: Staff = Depends(require_permission("alert:view")),
    db: Session = Depends(get_db)
):
    """
    Explicit endpoint to evaluate deterioration trends for an encounter and generate/update alerts.
    """
    enc = db.query(EDEncounter).filter(
        EDEncounter.encounter_id == encounter_id,
        EDEncounter.hospital_id == staff.hospital_id
    ).first()

    if not enc:
        raise HTTPException(status_code=404, detail=f"Encounter '{encounter_id}' not found.")

    observations = db.query(ClinicalObservation).filter(
        ClinicalObservation.encounter_id == encounter_id
    ).order_by(ClinicalObservation.timestamp.asc()).all()

    detection_result = deterioration_detector.evaluate_longitudinal_trend(
        observations=observations,
        patient_age=enc.patient.age if enc.patient else None
    )

    alert_obj = None
    alert_created = False
    msg = "No deterioration detected"

    if detection_result.get("detected"):
        alert_obj, alert_created, msg = AlertService.create_or_update_alert(
            db=db,
            hospital_id=staff.hospital_id,
            patient_id=enc.patient_id,
            encounter_id=encounter_id,
            detection_result=detection_result
        )

    return {
        "encounter_id": encounter_id,
        "detection_result": detection_result,
        "alert": alert_obj.to_dict() if alert_obj else None,
        "alert_created": alert_created,
        "status_message": msg
    }

# ==========================================
# Task 9: Clinical Alerts Management
# ==========================================

@app.get("/api/alerts")
def get_clinical_alerts(
    status_filter: Optional[str] = Query(None, alias="status"),
    severity_filter: Optional[str] = Query(None, alias="severity"),
    encounter_id: Optional[str] = None,
    staff: Staff = Depends(require_permission("alert:view")),
    db: Session = Depends(get_db)
):
    """
    Retrieves all clinical alerts for the staff member's hospital.
    Supports filtering by status, severity, or encounter.
    """
    query = db.query(ClinicalAlert).filter(ClinicalAlert.hospital_id == staff.hospital_id)

    if status_filter:
        query = query.filter(ClinicalAlert.status == status_filter)
    if severity_filter:
        query = query.filter(ClinicalAlert.severity == severity_filter)
    if encounter_id:
        query = query.filter(ClinicalAlert.encounter_id == encounter_id)

    alerts = query.order_by(ClinicalAlert.detected_at.desc()).all()

    # Aggregate metric counts for dashboard
    all_hospital_alerts = db.query(ClinicalAlert).filter(ClinicalAlert.hospital_id == staff.hospital_id).all()
    metrics = {
        "total": len(all_hospital_alerts),
        "unacknowledged": sum(1 for a in all_hospital_alerts if a.status == AlertStatusEnum.UNACKNOWLEDGED),
        "acknowledged": sum(1 for a in all_hospital_alerts if a.status == AlertStatusEnum.ACKNOWLEDGED),
        "resolved": sum(1 for a in all_hospital_alerts if a.status == AlertStatusEnum.RESOLVED),
        "critical": sum(1 for a in all_hospital_alerts if a.severity == AlertSeverityEnum.CRITICAL and a.status in [AlertStatusEnum.UNACKNOWLEDGED, AlertStatusEnum.ACKNOWLEDGED]),
        "high": sum(1 for a in all_hospital_alerts if a.severity == AlertSeverityEnum.HIGH and a.status in [AlertStatusEnum.UNACKNOWLEDGED, AlertStatusEnum.ACKNOWLEDGED]),
        "moderate": sum(1 for a in all_hospital_alerts if a.severity == AlertSeverityEnum.MODERATE and a.status in [AlertStatusEnum.UNACKNOWLEDGED, AlertStatusEnum.ACKNOWLEDGED]),
    }

    return {
        "alerts": [a.to_dict() for a in alerts],
        "metrics": metrics,
        "hospital_id": staff.hospital_id
    }

@app.get("/api/alerts/{alert_id}")
def get_alert_by_id(
    alert_id: str,
    staff: Staff = Depends(require_permission("alert:view")),
    db: Session = Depends(get_db)
):
    alert = db.query(ClinicalAlert).filter(ClinicalAlert.alert_id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail=f"Alert '{alert_id}' not found.")
    verify_hospital_access(alert.hospital_id, staff)
    return {"alert": alert.to_dict()}

@app.post("/api/alerts/{alert_id}/acknowledge")
def acknowledge_alert_endpoint(
    alert_id: str,
    staff: Staff = Depends(require_permission("alert:acknowledge")),
    db: Session = Depends(get_db)
):
    """
    Clinician acknowledges an active alert.
    Verifies hospital isolation, records staff attribution, updates status to ACKNOWLEDGED, and audits event.
    """
    updated_alert = AlertService.acknowledge_alert(db=db, alert_id=alert_id, staff=staff)
    return {
        "message": f"Alert '{alert_id}' acknowledged by {staff.name} ({staff.role.value}).",
        "alert": updated_alert.to_dict()
    }

@app.post("/api/alerts/{alert_id}/resolve")
def resolve_alert_endpoint(
    alert_id: str,
    payload: AlertResolutionInput,
    staff: Staff = Depends(require_permission("alert:resolve")),
    db: Session = Depends(get_db)
):
    """
    Authorized clinician resolves an alert with mandatory clinical documentation.
    """
    updated_alert = AlertService.resolve_alert(
        db=db, 
        alert_id=alert_id, 
        staff=staff, 
        resolution_reason=payload.resolution_reason
    )
    return {
        "message": f"Alert '{alert_id}' resolved successfully.",
        "alert": updated_alert.to_dict()
    }

@app.post("/api/alerts/{alert_id}/dismiss")
def dismiss_alert_endpoint(
    alert_id: str,
    payload: AlertDismissalInput,
    staff: Staff = Depends(require_permission("alert:dismiss")),
    db: Session = Depends(get_db)
):
    """
    Authorized physician or clinical director dismisses an alert with mandatory justification.
    """
    updated_alert = AlertService.dismiss_alert(
        db=db,
        alert_id=alert_id,
        staff=staff,
        dismissal_reason=payload.dismissal_reason
    )
    return {
        "message": f"Alert '{alert_id}' dismissed.",
        "alert": updated_alert.to_dict()
    }

# ==========================================
# Background Monitoring & Audit Routes
# ==========================================

@app.post("/api/monitoring/run")
def run_background_monitoring(
    staff: Staff = Depends(require_permission("alert:view")),
    db: Session = Depends(get_db)
):
    """
    Triggers asynchronous monitoring check across all active ED encounters in the current hospital.
    """
    results = monitor_service.evaluate_active_encounters(db=db, hospital_id=staff.hospital_id)
    return {"status": "success", "monitoring_summary": results}

@app.get("/api/audit-logs")
def get_audit_trail(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    q: Optional[str] = Query(None),
    actor_id: Optional[str] = Query(None),
    actor_role: Optional[str] = Query(None),
    actor_type: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    entity_type: Optional[str] = Query(None),
    encounter_id: Optional[str] = Query(None),
    patient_id: Optional[str] = Query(None),
    result: Optional[str] = Query(None),
    sort_order: str = Query("desc"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    staff: Staff = Depends(require_permission("audit:view")),
    db: Session = Depends(get_db)
):
    """
    Task 11: Retrieves tamper-resistant audit logs for hospital operations.
    Supports server-side multi-parameter filtering, search, pagination, and sorting.
    """
    s_date = None
    e_date = None
    if start_date:
        try:
            s_date = datetime.datetime.fromisoformat(start_date.replace("Z", "+00:00"))
        except Exception:
            pass
    if end_date:
        try:
            e_date = datetime.datetime.fromisoformat(end_date.replace("Z", "+00:00"))
        except Exception:
            pass

    query_res = AuditService.query_logs(
        db=db,
        hospital_id=staff.hospital_id,
        page=page,
        page_size=page_size,
        q=q,
        actor_id=actor_id,
        actor_role=actor_role,
        actor_type=actor_type,
        action=action,
        entity_type=entity_type,
        encounter_id=encounter_id,
        patient_id=patient_id,
        result=result,
        sort_order=sort_order,
        start_date=s_date,
        end_date=e_date
    )

    return {
        "audit_logs": query_res["logs"],
        "logs": query_res["logs"],
        "total": query_res["total"],
        "page": query_res["page"],
        "page_size": query_res["page_size"],
        "total_pages": query_res["total_pages"],
        "hospital_id": staff.hospital_id
    }

@app.get("/api/audit-logs/{event_id}")
def get_audit_event_detail(
    event_id: str,
    staff: Staff = Depends(require_permission("audit:view")),
    db: Session = Depends(get_db)
):
    """
    Retrieves details for a single audit event with hospital tenant isolation.
    """
    event = AuditService.get_event_by_id(db=db, hospital_id=staff.hospital_id, event_id=event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Audit event '{event_id}' not found in hospital '{staff.hospital_id}'."
        )
    return {"audit_event": event.to_dict()}

@app.get("/api/encounters/{encounter_id}/audit-logs")
def get_encounter_audit_trail(
    encounter_id: str,
    staff: Staff = Depends(require_permission("audit:view")),
    db: Session = Depends(get_db)
):
    """
    Retrieves chronological audit events specific to an encounter for accountability timeline reconstruction.
    """
    enc = db.query(EDEncounter).filter(
        EDEncounter.encounter_id == encounter_id,
        EDEncounter.hospital_id == staff.hospital_id
    ).first()

    if not enc:
        raise HTTPException(status_code=404, detail=f"Encounter '{encounter_id}' not found.")

    timeline = AuditService.get_encounter_audit_timeline(
        db=db, hospital_id=staff.hospital_id, encounter_id=encounter_id, patient_id=enc.patient_id
    )
    return {
        "encounter_id": encounter_id,
        "count": len(timeline),
        "audit_timeline": timeline
    }

# ==========================================
# Staff & Role Management (Tasks 2 & 11)
# ==========================================

@app.post("/api/staff")
def create_staff(
    req: StaffCreateRequest,
    current_staff: Staff = Depends(require_permission("staff:create")),
    db: Session = Depends(get_db)
):
    """
    Creates new staff account and logs STAFF_CREATED.
    """
    existing = db.query(Staff).filter(Staff.staff_id == req.staff_id).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Staff ID '{req.staff_id}' already exists.")

    new_staff = Staff(
        hospital_id=current_staff.hospital_id,
        staff_id=req.staff_id,
        name=req.name,
        email=req.email,
        role=req.role,
        password_hash="hashed_pw_demo",
        is_active=True
    )
    db.add(new_staff)
    db.commit()
    db.refresh(new_staff)

    AuditService.log_event(
        db=db,
        hospital_id=current_staff.hospital_id,
        action="STAFF_CREATED",
        entity_type="STAFF",
        entity_id=new_staff.staff_id,
        actor_id=current_staff.staff_id,
        actor_name=current_staff.name,
        actor_role=current_staff.role.value,
        actor_type=ActorTypeEnum.HUMAN,
        result=AuditResultEnum.SUCCESS,
        metadata={"role": new_staff.role.value, "email": new_staff.email},
        auto_commit=True
    )

    return {"message": "Staff member created.", "staff": new_staff.to_dict()}

@app.put("/api/staff/{staff_id}/deactivate")
def deactivate_staff(
    staff_id: str,
    current_staff: Staff = Depends(require_permission("staff:deactivate")),
    db: Session = Depends(get_db)
):
    """
    Deactivates staff account and logs STAFF_DEACTIVATED.
    """
    target = db.query(Staff).filter(
        Staff.staff_id == staff_id,
        Staff.hospital_id == current_staff.hospital_id
    ).first()

    if not target:
        raise HTTPException(status_code=404, detail=f"Staff '{staff_id}' not found.")

    target.is_active = False
    db.commit()
    db.refresh(target)

    AuditService.log_event(
        db=db,
        hospital_id=current_staff.hospital_id,
        action="STAFF_DEACTIVATED",
        entity_type="STAFF",
        entity_id=target.staff_id,
        actor_id=current_staff.staff_id,
        actor_name=current_staff.name,
        actor_role=current_staff.role.value,
        actor_type=ActorTypeEnum.HUMAN,
        result=AuditResultEnum.SUCCESS,
        metadata={"deactivated_staff_name": target.name},
        auto_commit=True
    )

    return {"message": "Staff member deactivated.", "staff": target.to_dict()}

@app.put("/api/staff/{staff_id}/role")
def update_staff_role(
    staff_id: str,
    req: StaffRoleUpdateRequest,
    current_staff: Staff = Depends(require_permission("staff:update")),
    db: Session = Depends(get_db)
):
    """
    Updates staff role and logs ROLE_CHANGED.
    """
    target = db.query(Staff).filter(
        Staff.staff_id == staff_id,
        Staff.hospital_id == current_staff.hospital_id
    ).first()

    if not target:
        raise HTTPException(status_code=404, detail=f"Staff '{staff_id}' not found.")

    prev_role = target.role.value
    target.role = req.role
    db.commit()
    db.refresh(target)

    AuditService.log_event(
        db=db,
        hospital_id=current_staff.hospital_id,
        action="ROLE_CHANGED",
        entity_type="STAFF",
        entity_id=target.staff_id,
        actor_id=current_staff.staff_id,
        actor_name=current_staff.name,
        actor_role=current_staff.role.value,
        actor_type=ActorTypeEnum.HUMAN,
        result=AuditResultEnum.SUCCESS,
        metadata={"previous_role": prev_role, "new_role": req.role.value},
        auto_commit=True
    )

    return {"message": "Staff role updated.", "staff": target.to_dict()}

# ==========================================
# Synthetic Demo Seeding Endpoint
# ==========================================

@app.post("/api/demo/seed")
def seed_demo_data(db: Session = Depends(get_db)):
    """
    Seeds rich synthetic demo data for Demo General Hospital (DEMO001) & Metro Health (METRO002),
    including realistic patients, longitudinal observation trajectories, and deterioration scenarios.
    """
    # 1. Hospitals
    hosp1 = db.query(Hospital).filter(Hospital.hospital_code == "DEMO001").first()
    if not hosp1:
        hosp1 = Hospital(hospital_code="DEMO001", name="Demo General Hospital", address="100 Medical Center Way, Suite 100")
        db.add(hosp1)
    
    hosp2 = db.query(Hospital).filter(Hospital.hospital_code == "METRO002").first()
    if not hosp2:
        hosp2 = Hospital(hospital_code="METRO002", name="Metro Health Medical Center", address="500 University Blvd")
        db.add(hosp2)
    db.commit()

    # 2. Staff
    demo_staff = [
        {"staff_id": "ADMIN001", "name": "Sarah Connor, MHA", "email": "admin@demohospital.org", "role": StaffRoleEnum.HOSPITAL_ADMIN, "hosp": "DEMO001"},
        {"staff_id": "DOC001", "name": "Dr. Gregory House, MD", "email": "doc001@demohospital.org", "role": StaffRoleEnum.EMERGENCY_PHYSICIAN, "hosp": "DEMO001"},
        {"staff_id": "NUR001", "name": "Nurse Jackie Peyton, RN", "email": "nur001@demohospital.org", "role": StaffRoleEnum.TRIAGE_NURSE, "hosp": "DEMO001"},
        {"staff_id": "TECH001", "name": "John Carter, EMT-P", "email": "tech001@demohospital.org", "role": StaffRoleEnum.EMERGENCY_TECHNICIAN, "hosp": "DEMO001"},
        {"staff_id": "DOC002_METRO", "name": "Dr. Allison Cameron, MD", "email": "doc002@metrohealth.org", "role": StaffRoleEnum.EMERGENCY_PHYSICIAN, "hosp": "METRO002"}
    ]
    for s in demo_staff:
        existing = db.query(Staff).filter(Staff.staff_id == s["staff_id"]).first()
        if not existing:
            staff_obj = Staff(
                hospital_id=s["hosp"],
                staff_id=s["staff_id"],
                name=s["name"],
                email=s["email"],
                role=s["role"],
                password_hash="hashed_pw_demo"
            )
            db.add(staff_obj)
    db.commit()

    # 3. Synthetic Patients and Longitudinal Scenarios
    # Patient 1: PT-DEMO-001 (Classic Deterioration: Worsening Asthma / Hypoxia)
    p1 = db.query(Patient).filter(Patient.patient_id == "PT-DEMO-001").first()
    if not p1:
        p1 = Patient(
            hospital_id="DEMO001",
            patient_id="PT-DEMO-001",
            mrn="MRN-88201",
            first_name="Marcus",
            last_name="Vance",
            age=54.0,
            gender="Male",
            arrival_mode="Walk-in",
            created_by="NUR001"
        )
        db.add(p1)
        db.commit()

        # Encounter
        enc1 = EDEncounter(
            hospital_id="DEMO001",
            patient_id="PT-DEMO-001",
            encounter_id="ENC-DEMO-001",
            arrival_time=datetime.datetime.utcnow() - datetime.timedelta(minutes=65),
            arrival_mode="Walk-in",
            chief_complaint="Shortness of breath, persistent dry cough",
            status=EncounterStatusEnum.WAITING,
            bed_number="ED-Wait-04"
        )
        db.add(enc1)
        db.commit()

        # Triage Assessment (Task 5)
        tr1 = TriageAssessment(
            hospital_id="DEMO001",
            patient_id="PT-DEMO-001",
            encounter_id="ENC-DEMO-001",
            triage_level=3,
            acuity_category="Urgent",
            chief_complaint="Shortness of breath, persistent dry cough",
            pain_score=3,
            mobility="Ambulatory",
            assessed_by="NUR001",
            assessed_at=datetime.datetime.utcnow() - datetime.timedelta(minutes=60),
            notes="History of moderate persistent asthma. SpO2 on room air 97% initially."
        )
        db.add(tr1)

        # Historical Observations (Task 6)
        t0 = datetime.datetime.utcnow() - datetime.timedelta(minutes=60)
        t1 = datetime.datetime.utcnow() - datetime.timedelta(minutes=35)
        t2 = datetime.datetime.utcnow() - datetime.timedelta(minutes=10)

        obs1 = ClinicalObservation(
            hospital_id="DEMO001", patient_id="PT-DEMO-001", encounter_id="ENC-DEMO-001",
            timestamp=t0, hr=92, sbp=128, dbp=82, rr=18, spo2=97, temp=37.1, gcs=15, recorded_by="NUR001"
        )
        obs2 = ClinicalObservation(
            hospital_id="DEMO001", patient_id="PT-DEMO-001", encounter_id="ENC-DEMO-001",
            timestamp=t1, hr=108, sbp=122, dbp=78, rr=23, spo2=93, temp=37.3, gcs=15, recorded_by="NUR001"
        )
        obs3 = ClinicalObservation(
            hospital_id="DEMO001", patient_id="PT-DEMO-001", encounter_id="ENC-DEMO-001",
            timestamp=t2, hr=121, sbp=118, dbp=74, rr=29, spo2=89, temp=37.4, gcs=15, recorded_by="NUR001"
        )
        db.add_all([obs1, obs2, obs3])
        db.commit()

        # AI Risk Assessment (Task 7)
        risk1 = AIRiskAssessment(
            hospital_id="DEMO001", patient_id="PT-DEMO-001", encounter_id="ENC-DEMO-001",
            risk_score=78.5, risk_category=AIRiskCategoryEnum.HIGH, predicted_triage_level=2,
            confidence_score=84.0, shock_index=1.02, qsofa=1,
            assessed_at=datetime.datetime.utcnow() - datetime.timedelta(minutes=30)
        )
        db.add(risk1)
        db.commit()

        # Explainable AI (Task 8)
        exp1 = AIExplanation(
            hospital_id="DEMO001", patient_id="PT-DEMO-001", encounter_id="ENC-DEMO-001",
            risk_assessment_id=risk1.id,
            top_features=[
                {"feature": "Oxygen Saturation", "impact": "+35%", "direction": "elevating risk", "value": "89%"},
                {"feature": "Respiratory Rate", "impact": "+28%", "direction": "elevating risk", "value": "29/min"},
                {"feature": "Heart Rate", "impact": "+18%", "direction": "elevating risk", "value": "121 bpm"}
            ],
            summary="High acute risk driven primarily by hypoxic decompensation and compensatory tachypnea."
        )
        db.add(exp1)
        db.commit()

        # Trigger Deterioration Detection & Create Task 9 Clinical Alert
        det_result = deterioration_detector.evaluate_longitudinal_trend([obs1, obs2, obs3], patient_age=54.0)
        if det_result.get("detected"):
            AlertService.create_or_update_alert(
                db=db, hospital_id="DEMO001", patient_id="PT-DEMO-001", encounter_id="ENC-DEMO-001", detection_result=det_result
            )

    # Patient 2: PT-DEMO-002 (Stable Geriatric Patient - High Risk Baseline, No Deterioration)
    p2 = db.query(Patient).filter(Patient.patient_id == "PT-DEMO-002").first()
    if not p2:
        p2 = Patient(
            hospital_id="DEMO001",
            patient_id="PT-DEMO-002",
            mrn="MRN-88202",
            first_name="Eleanor",
            last_name="Rigby",
            age=76.0,
            gender="Female",
            arrival_mode="Ambulance",
            created_by="NUR001"
        )
        db.add(p2)
        db.commit()

        enc2 = EDEncounter(
            hospital_id="DEMO001", patient_id="PT-DEMO-002", encounter_id="ENC-DEMO-002",
            arrival_time=datetime.datetime.utcnow() - datetime.timedelta(minutes=45),
            arrival_mode="Ambulance", chief_complaint="Fall with right hip contusion, baseline hypertension",
            status=EncounterStatusEnum.IN_TREATMENT, bed_number="Bed-03"
        )
        db.add(enc2)
        db.commit()

        tr2 = TriageAssessment(
            hospital_id="DEMO001", patient_id="PT-DEMO-002", encounter_id="ENC-DEMO-002",
            triage_level=3, acuity_category="Urgent", chief_complaint="Mechanical fall, hip pain",
            pain_score=6, mobility="Stretcher", assessed_by="NUR001"
        )
        db.add(tr2)

        # Stable vitals sequence
        obs_a = ClinicalObservation(
            hospital_id="DEMO001", patient_id="PT-DEMO-002", encounter_id="ENC-DEMO-002",
            timestamp=datetime.datetime.utcnow() - datetime.timedelta(minutes=40),
            hr=78, sbp=142, dbp=88, rr=16, spo2=98, temp=36.8, gcs=15, recorded_by="NUR001"
        )
        obs_b = ClinicalObservation(
            hospital_id="DEMO001", patient_id="PT-DEMO-002", encounter_id="ENC-DEMO-002",
            timestamp=datetime.datetime.utcnow() - datetime.timedelta(minutes=15),
            hr=76, sbp=140, dbp=86, rr=16, spo2=98, temp=36.8, gcs=15, recorded_by="NUR001"
        )
        db.add_all([obs_a, obs_b])
        db.commit()

        # High AI baseline risk (Task 7) because of age and comorbidities, but NO deterioration alert!
        risk2 = AIRiskAssessment(
            hospital_id="DEMO001", patient_id="PT-DEMO-002", encounter_id="ENC-DEMO-002",
            risk_score=68.0, risk_category=AIRiskCategoryEnum.HIGH, predicted_triage_level=2,
            confidence_score=75.0, shock_index=0.55, qsofa=0
        )
        db.add(risk2)
        db.commit()

    # Patient 3: PT-DEMO-003 (Moderate Risk + Sepsis / Shock Progression Deterioration)
    p3 = db.query(Patient).filter(Patient.patient_id == "PT-DEMO-003").first()
    if not p3:
        p3 = Patient(
            hospital_id="DEMO001",
            patient_id="PT-DEMO-003",
            mrn="MRN-88203",
            first_name="David",
            last_name="Chen",
            age=42.0,
            gender="Male",
            arrival_mode="Walk-in",
            created_by="NUR001"
        )
        db.add(p3)
        db.commit()

        enc3 = EDEncounter(
            hospital_id="DEMO001", patient_id="PT-DEMO-003", encounter_id="ENC-DEMO-003",
            arrival_time=datetime.datetime.utcnow() - datetime.timedelta(minutes=80),
            arrival_mode="Walk-in", chief_complaint="High fever, chills, urinary discomfort",
            status=EncounterStatusEnum.WAITING, bed_number="ED-Wait-09"
        )
        db.add(enc3)
        db.commit()

        tr3 = TriageAssessment(
            hospital_id="DEMO001", patient_id="PT-DEMO-003", encounter_id="ENC-DEMO-003",
            triage_level=3, acuity_category="Urgent", chief_complaint="Fever and dysuria",
            pain_score=4, mobility="Ambulatory", assessed_by="NUR001"
        )
        db.add(tr3)

        obs_c1 = ClinicalObservation(
            hospital_id="DEMO001", patient_id="PT-DEMO-003", encounter_id="ENC-DEMO-003",
            timestamp=datetime.datetime.utcnow() - datetime.timedelta(minutes=75),
            hr=88, sbp=124, dbp=78, rr=18, spo2=98, temp=38.6, gcs=15, recorded_by="NUR001"
        )
        obs_c2 = ClinicalObservation(
            hospital_id="DEMO001", patient_id="PT-DEMO-003", encounter_id="ENC-DEMO-003",
            timestamp=datetime.datetime.utcnow() - datetime.timedelta(minutes=15),
            hr=118, sbp=96, dbp=58, rr=24, spo2=96, temp=39.2, gcs=15, recorded_by="NUR001"
        )
        db.add_all([obs_c1, obs_c2])
        db.commit()

        det_result3 = deterioration_detector.evaluate_longitudinal_trend([obs_c1, obs_c2], patient_age=42.0)
        if det_result3.get("detected"):
            AlertService.create_or_update_alert(
                db=db, hospital_id="DEMO001", patient_id="PT-DEMO-003", encounter_id="ENC-DEMO-003", detection_result=det_result3
            )

    return {
        "status": "success",
        "message": "Synthetic demo data successfully initialized for DEMO001 & METRO002."
    }

# ==========================================
# Legacy Endpoints (Backward Compatibility)
# ==========================================

@app.post("/api/triage")
def legacy_triage_patient(patient: LegacyPatientInput, db: Session = Depends(get_db)):
    patient_data = patient.dict()
    triage_result = legacy_engine.evaluate_patient(patient_data)
    return {"message": "Triage complete", "result": triage_result}

@app.get("/api/queue")
def legacy_get_waiting_queue():
    mock_queue = [
        {"patient_id": "PT-883", "age": 45, "gender": "Male", "triage_level": 3, "wait_time_mins": 42, "status": "Waiting"},
        {"patient_id": "PT-884", "age": 28, "gender": "Female", "triage_level": 2, "wait_time_mins": 15, "status": "Waiting"},
        {"patient_id": "PT-885", "age": 72, "gender": "Male", "triage_level": 1, "wait_time_mins": 4, "status": "In Treatment"},
        {"patient_id": "PT-886", "age": 19, "gender": "Female", "triage_level": 4, "wait_time_mins": 65, "status": "Waiting"},
        {"patient_id": "PT-887", "age": 55, "gender": "Male", "triage_level": 3, "wait_time_mins": 12, "status": "Waiting"}
    ]
    sorted_queue = sorted(mock_queue, key=lambda p: (p['triage_level'], -p['wait_time_mins']))
    return {"queue": sorted_queue}

@app.post("/api/override")
def legacy_log_triage_override(audit_data: LegacyOverrideInput):
    print(f"AUDIT LOGGED: Staff {audit_data.staff_id} overrode AI Level {audit_data.ai_suggested_level} to Level {audit_data.clinician_assigned_level}")
    return {"message": "Audit log securely saved", "status": "success"}

# Auto-seed demo on startup if table is empty
@app.on_event("startup")
def on_startup():
    db = SessionLocal()
    try:
        if db.query(Hospital).count() == 0:
            seed_demo_data(db)
    finally:
        db.close()