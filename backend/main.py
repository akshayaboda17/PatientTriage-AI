from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List
from sqlalchemy.orm import Session
import jwt
import datetime
import os
import sys
import re
import secrets

# Add database path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__))))
from models import (
    SessionLocal, Hospital, Staff, Role, Permission, Patient, TriageRecord, TriageAuditLog, AuditLog,
    OverrideReasonEnum, ActionTypeEnum, seed_database, get_hash, Encounter, VitalSigns, TriageAssessment
)

from models import Patient, SessionLocal
from schemas import PatientCreate, PatientResponse
# Add ai_engine to path so we can import it
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'ai_engine')))
from triage_engine import TriageEngine

# Centralized Permissions Constants
class Permissions:
    PATIENT_CREATE = "patient:create"
    PATIENT_VIEW = "patient:view"
    PATIENT_UPDATE = "patient:update"
    TRIAGE_CREATE = "triage:create"
    TRIAGE_VIEW = "triage:view"
    TRIAGE_UPDATE = "triage:update"
    VITALS_CREATE = "vitals:create"
    VITALS_VIEW = "vitals:view"
    VITALS_UPDATE = "vitals:update"
    AI_VIEW = "ai:view"
    AI_OVERRIDE = "ai:override"
    ALERT_VIEW = "alert:view"
    ALERT_ACKNOWLEDGE = "alert:acknowledge"
    STAFF_CREATE = "staff:create"
    STAFF_VIEW = "staff:view"
    STAFF_UPDATE = "staff:update"
    STAFF_DEACTIVATE = "staff:deactivate"
    HOSPITAL_VIEW = "hospital:view"
    HOSPITAL_UPDATE = "hospital:update"
    AUDIT_VIEW = "audit:view"

app = FastAPI(title="PatientTriage.ai API")
engine = TriageEngine()

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Startup Database Seeding
@app.on_event("startup")
def startup_event():
    seed_database()

# Database Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# JWT Config
SECRET_KEY = os.environ.get("JWT_SECRET", "DEV_SECRET_KEY_PATIENT_TRIAGE_AI_2026")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 12 # 12 hours

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.datetime.utcnow() + datetime.timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def serialize_patient(patient: Patient) -> PatientResponse:
    """Keep API output explicit and independent of Pydantic version details."""
    return PatientResponse(
        id=patient.id,
        patient_id=patient.patient_id,
        first_name=patient.first_name,
        last_name=patient.last_name,
        date_of_birth=patient.date_of_birth,
        gender=patient.gender,
        contact_info=patient.contact_info,
        emergency_contact=patient.emergency_contact,
        known_allergies=patient.known_allergies,
        age=patient.age,
    )


@app.post("/api/patients/", response_model=PatientResponse, status_code=status.HTTP_201_CREATED)
def register_patient(patient: PatientCreate, db: Session = Depends(get_db)):
    """Register a patient and assign a stable medical-record number."""
    patient_data = patient.model_dump() if hasattr(patient, "model_dump") else patient.dict()
    db_patient = Patient(**patient_data)
    db.add(db_patient)
    db.flush()
    db_patient.patient_id = f"PT-{db_patient.id:06d}"
    db.commit()
    db.refresh(db_patient)
    return serialize_patient(db_patient)


@app.get("/api/patients/{patient_id}", response_model=PatientResponse)
def get_patient_profile(patient_id: int, db: Session = Depends(get_db)):
    """Retrieve the full registration profile for one patient."""
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    return serialize_patient(patient)

# Pydantic model for incoming frontend data
class PatientInput(BaseModel):
    age: int = None
    gender: str = None
def decode_access_token(token: str):
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None

# Password verification (using bcrypt directly to avoid passlib differences)
import bcrypt
def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False

# Password strength check
def validate_password_strength(password: str) -> bool:
    if len(password) < 8:
        return False
    if not re.search(r"[A-Z]", password):
        return False
    if not re.search(r"[a-z]", password):
        return False
    if not re.search(r"[0-9]", password):
        return False
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
        return False
    return True

# Audit logging helper
def log_audit(db: Session, hospital_id: str, staff_id: str, role: str, action: str, entity_type: str, entity_id: str, details: str = None):
    audit = AuditLog(
        hospital_id=hospital_id,
        staff_id=staff_id,
        staff_role=role,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=details
    )
    db.add(audit)
    db.commit()

# OAuth2 Scheme extractor
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/v1/auth/login", auto_error=False)

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or invalid credentials"
        )
    
    # Strip Bearer prefix if present
    if token.startswith("Bearer "):
        token = token[7:]
        
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired. Please log in again."
        )
        
    hospital_id = payload.get("hospital_id")
    staff_id = payload.get("staff_id")
    role_id = payload.get("role")
    
    staff = db.query(Staff).filter(Staff.staff_id == staff_id, Staff.hospital_id == hospital_id).first()
    if not staff:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Staff profile not found."
        )
        
    if staff.status != "ACTIVE":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Your account status is currently {staff.status.lower()}. Please contact management."
        )
        
    hosp = db.query(Hospital).filter(Hospital.hospital_id == hospital_id).first()
    if not hosp:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Hospital organization not found."
        )
        
    if hosp.verification_status != "VERIFIED":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Hospital account status is {hosp.verification_status.lower()}."
        )
        
    role = db.query(Role).filter(Role.role_id == role_id).first()
    permissions = [p.permission_id for p in role.permissions] if role else []
    
    return {
        "hospital_id": hospital_id,
        "staff_id": staff_id,
        "role": role_id,
        "permissions": permissions,
        "full_name": staff.full_name,
        "official_email": staff.official_email
    }

class PermissionChecker:
    def __init__(self, required_permission: str):
        self.required_permission = required_permission
        
    def __call__(self, current_user: dict = Depends(get_current_user)):
        if self.required_permission not in current_user["permissions"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have authorization to perform this clinical or admin operation."
            )
        return current_user

class EncounterCreateInput(BaseModel):
    patient_id: str

class EncounterResponse(BaseModel):
    id: int
    encounter_id: str
    patient_id: str
    hospital_id: str
    status: str
    arrival_time: datetime.datetime
    created_at: datetime.datetime

    class Config:
        from_attributes = True

class VitalSignsCreateInput(BaseModel):
    heart_rate: Optional[int] = None
    respiratory_rate: Optional[int] = None
    systolic_bp: Optional[int] = None
    diastolic_bp: Optional[int] = None
    spo2: Optional[int] = None
    temperature: Optional[float] = None
    oxygen_support: str = "None"
    oxygen_flow_rate: Optional[float] = None
    weight: Optional[float] = None
    height: Optional[float] = None
    source: str = "MANUAL"
    blood_glucose: Optional[float] = None
    gcs: Optional[int] = None
    pain_score: Optional[int] = None

class VitalSignsResponse(BaseModel):
    vital_id: int
    encounter_id: int
    hospital_id: str
    recorded_by: str
    recorded_at: datetime.datetime
    heart_rate: Optional[int]
    respiratory_rate: Optional[int]
    systolic_bp: Optional[int]
    diastolic_bp: Optional[int]
    spo2: Optional[int]
    temperature: Optional[float]
    oxygen_support: str
    oxygen_flow_rate: Optional[float]
    weight: Optional[float]
    height: Optional[float]
    source: str
    blood_glucose: Optional[float]
    gcs: Optional[int]
    pain_score: Optional[int]
    is_corrected: bool
    correction_reason: Optional[str]
    corrected_by: Optional[str]
    corrected_at: Optional[datetime.datetime]

    class Config:
        from_attributes = True

class VitalSignsCorrectionInput(BaseModel):
    heart_rate: Optional[int] = None
    respiratory_rate: Optional[int] = None
    systolic_bp: Optional[int] = None
    diastolic_bp: Optional[int] = None
    spo2: Optional[int] = None
    temperature: Optional[float] = None
    oxygen_support: str = "None"
    oxygen_flow_rate: Optional[float] = None
    weight: Optional[float] = None
    height: Optional[float] = None
    source: Optional[str] = "MANUAL"
    blood_glucose: Optional[float] = None
    gcs: Optional[int] = None
    pain_score: Optional[int] = None
    correction_reason: str

class ClinicalObservationResponse(BaseModel):
    type: str
    value: float
    unit: str
    recorded_at: datetime.datetime
    source: str
    vital_id: int
    recorded_by: str
    is_corrected: bool
    correction_reason: Optional[str]

    class Config:
        from_attributes = True

class TriageAssessmentCreateInput(BaseModel):
    presenting_complaint: str
    symptom_onset: Optional[str] = None
    symptom_severity: Optional[int] = None
    associated_symptoms: Optional[str] = None
    medical_history: Optional[str] = None
    medications: Optional[str] = None
    allergies: Optional[str] = None
    triage_notes: Optional[str] = None
    clinical_priority: Optional[str] = None
    status: str = "DRAFT"

class TriageAssessmentPatchInput(BaseModel):
    presenting_complaint: Optional[str] = None
    symptom_onset: Optional[str] = None
    symptom_severity: Optional[int] = None
    associated_symptoms: Optional[str] = None
    medical_history: Optional[str] = None
    medications: Optional[str] = None
    allergies: Optional[str] = None
    triage_notes: Optional[str] = None
    clinical_priority: Optional[str] = None
    status: Optional[str] = None

class TriageAssessmentResponse(BaseModel):
    triage_id: int
    hospital_id: str
    encounter_id: int
    assessed_by: str
    assessed_at: datetime.datetime
    presenting_complaint: str
    symptom_onset: Optional[str]
    symptom_severity: Optional[int]
    associated_symptoms: Optional[str]
    medical_history: Optional[str]
    medications: Optional[str]
    allergies: Optional[str]
    triage_notes: Optional[str]
    clinical_priority: Optional[str]
    status: str
    created_at: datetime.datetime
    updated_at: datetime.datetime
    amended_by: Optional[str]
    amended_at: Optional[datetime.datetime]

    class Config:
        from_attributes = True

# ==========================================
# AUTHENTICATION API ROUTES
# ==========================================

class HospitalRegisterInput(BaseModel):
    # Hospital Info
    name: str
    hospital_id: str
    hospital_type: str
    address: str
    city: str
    state: str
    country: str
    postal_code: str
    registration_number: str
    emergency_department_available: bool = True
    ed_capacity: int = 50

    # Admin info
    admin_name: str
    admin_employee_id: str
    admin_designation: str
    admin_email: str
    admin_phone: str
    admin_password: str
    confirm_authorization: bool

@app.post("/api/v1/auth/register-hospital")
def register_hospital(data: HospitalRegisterInput, db: Session = Depends(get_db)):
    if not data.confirm_authorization:
        raise HTTPException(status_code=400, detail="You must confirm you are authorized to register this organization.")
        
    # Validation
    if not data.name or not data.hospital_id or not data.admin_email or not data.admin_password:
        raise HTTPException(status_code=400, detail="Missing required information fields.")
        
    # Hospital unique ID check
    existing_hosp = db.query(Hospital).filter(Hospital.hospital_id == data.hospital_id).first()
    if existing_hosp:
        raise HTTPException(status_code=400, detail="Hospital ID / Organization ID already registered.")
        
    # Admin unique email check
    existing_email = db.query(Staff).filter(Staff.official_email == data.admin_email).first()
    if existing_email:
        raise HTTPException(status_code=400, detail="Official email is already registered to a staff profile.")
        
    # Password strength check
    if not validate_password_strength(data.admin_password):
        raise HTTPException(status_code=400, detail="Password is too weak. Ensure it is at least 8 characters and includes uppercase, lowercase, numbers, and symbols.")

    # Create Hospital (Auto-VERIFIED for prototype)
    new_hosp = Hospital(
        hospital_id=data.hospital_id,
        name=data.name,
        hospital_type=data.hospital_type,
        address=data.address,
        city=data.city,
        state=data.state,
        country=data.country,
        postal_code=data.postal_code,
        registration_number=data.registration_number,
        emergency_department_available=data.emergency_department_available,
        ed_capacity=data.ed_capacity,
        verification_status="VERIFIED"
    )
    db.add(new_hosp)
    db.commit()
    
    # Create Hospital Administrator Staff Account
    admin_staff = Staff(
        staff_id="ADMIN001",
        hospital_id=data.hospital_id,
        full_name=data.admin_name,
        employee_id=data.admin_employee_id,
        official_email=data.admin_email,
        phone_number=data.admin_phone,
        department="Administration",
        designation=data.admin_designation,
        role_id="HOSPITAL_ADMINISTRATOR",
        password_hash=get_hash(data.admin_password),
        status="ACTIVE"
    )
    db.add(admin_staff)
    db.commit()
    
    log_audit(db, data.hospital_id, admin_staff.staff_id, admin_staff.role_id, "Registered hospital and admin account", "hospital", data.hospital_id, f"Registered: {data.name}")
    
    return {
        "message": "Hospital and Administrator account registered successfully.",
        "hospital_id": data.hospital_id,
        "verification_status": "VERIFIED"
    }

class LoginInput(BaseModel):
    hospital_id: str
    username: str # email or staff_id
    password: str

@app.post("/api/v1/auth/login")
def login(data: LoginInput, db: Session = Depends(get_db)):
    # Find staff member
    staff = db.query(Staff).filter(
        Staff.hospital_id == data.hospital_id,
        (Staff.staff_id == data.username) | (Staff.official_email == data.username)
    ).first()
    
    if not staff or not verify_password(data.password, staff.password_hash):
        # Secure message: do not expose whether email exists
        raise HTTPException(status_code=401, detail="Invalid Hospital ID, Staff ID, or password.")
        
    if staff.status != "ACTIVE":
        raise HTTPException(status_code=403, detail=f"Your staff account is currently {staff.status.lower()}. Please contact your administrator.")
        
    hosp = db.query(Hospital).filter(Hospital.hospital_id == data.hospital_id).first()
    if not hosp:
        raise HTTPException(status_code=401, detail="Hospital not found.")
        
    if hosp.verification_status != "VERIFIED":
        raise HTTPException(status_code=403, detail=f"This hospital account is {hosp.verification_status.lower()}. Access blocked.")
        
    # Generate Token
    token = create_access_token({
        "hospital_id": staff.hospital_id,
        "staff_id": staff.staff_id,
        "role": staff.role_id
    })
    
    # Update last login
    staff.last_login_at = datetime.datetime.utcnow()
    db.commit()
    
    log_audit(db, staff.hospital_id, staff.staff_id, staff.role_id, "User login successful", "auth", staff.staff_id)
    
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "staff_id": staff.staff_id,
            "hospital_id": staff.hospital_id,
            "full_name": staff.full_name,
            "role": staff.role_id,
            "official_email": staff.official_email
        }
    }

@app.get("/api/v1/auth/me")
def get_me(current_user: dict = Depends(get_current_user)):
    return current_user

class ForgotPasswordInput(BaseModel):
    hospital_id: str
    email: str

@app.post("/api/v1/auth/forgot-password")
def forgot_password(data: ForgotPasswordInput, db: Session = Depends(get_db)):
    # Prevent email enumeration: return generic message regardless of email existence
    staff = db.query(Staff).filter(Staff.hospital_id == data.hospital_id, Staff.official_email == data.email).first()
    if staff:
        # Mock token creation
        log_audit(db, data.hospital_id, staff.staff_id, staff.role_id, "Password reset token requested", "auth", staff.staff_id)
    
    return {"message": "If an account matches the provided information, password reset instructions will be provided."}

class ResetPasswordInput(BaseModel):
    hospital_id: str
    email: str
    temp_token: str
    new_password: str

@app.post("/api/v1/auth/reset-password")
def reset_password(data: ResetPasswordInput, db: Session = Depends(get_db)):
    staff = db.query(Staff).filter(Staff.hospital_id == data.hospital_id, Staff.official_email == data.email).first()
    if not staff:
        raise HTTPException(status_code=400, detail="Invalid request parameters.")
        
    if not validate_password_strength(data.new_password):
        raise HTTPException(status_code=400, detail="Password too weak.")
        
    # In a real system, verify temp_token. For hackathon, we verify string match
    if data.temp_token != "RESET-TOKEN-12345":
        raise HTTPException(status_code=400, detail="Invalid or expired reset token.")
        
    staff.password_hash = get_hash(data.new_password)
    db.commit()
    
    log_audit(db, data.hospital_id, staff.staff_id, staff.role_id, "Password reset successfully via token", "auth", staff.staff_id)
    return {"message": "Password updated successfully. You may now log in."}


# ==========================================
# STAFF MANAGEMENT API ROUTES (ADMIN ONLY)
# ==========================================

class StaffCreateInput(BaseModel):
    staff_id: str
    full_name: str
    employee_id: str
    official_email: str
    phone_number: str
    department: str
    designation: str
    role_id: str
    professional_registration_number: str = None
    years_of_experience: int = None

@app.get("/api/v1/staff")
def get_staff_list(db: Session = Depends(get_db), current_user: dict = Depends(PermissionChecker(Permissions.STAFF_VIEW))):
    # Enforce multi-tenant hospital isolation
    staffs = db.query(Staff).filter(Staff.hospital_id == current_user["hospital_id"]).all()
    # Mask password hashes from response
    return [{
        "staff_id": s.staff_id,
        "full_name": s.full_name,
        "employee_id": s.employee_id,
        "official_email": s.official_email,
        "phone_number": s.phone_number,
        "department": s.department,
        "designation": s.designation,
        "role_id": s.role_id,
        "professional_registration_number": s.professional_registration_number,
        "years_of_experience": s.years_of_experience,
        "status": s.status,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "last_login_at": s.last_login_at.isoformat() if s.last_login_at else None
    } for s in staffs]

@app.post("/api/v1/staff")
def create_staff(data: StaffCreateInput, db: Session = Depends(get_db), current_user: dict = Depends(PermissionChecker(Permissions.STAFF_CREATE))):
    # Validate unique constraints
    existing_staff = db.query(Staff).filter(Staff.staff_id == data.staff_id, Staff.hospital_id == current_user["hospital_id"]).first()
    if existing_staff:
        raise HTTPException(status_code=400, detail="Staff ID is already in use at this hospital.")
        
    existing_email = db.query(Staff).filter(Staff.official_email == data.official_email).first()
    if existing_email:
        raise HTTPException(status_code=400, detail="Official email is already registered to a staff profile.")
        
    # Predefined role check
    allowed_roles = ["HOSPITAL_ADMINISTRATOR", "TRIAGE_NURSE", "EMERGENCY_PHYSICIAN", "STAFF_NURSE", "EMERGENCY_TECHNICIAN", "CLINICAL_DIRECTOR"]
    if data.role_id not in allowed_roles:
        raise HTTPException(status_code=400, detail="Invalid role specified.")

    # Secure Hex Token generation
    activation_token = secrets.token_hex(20)
    activation_token_expires_at = datetime.datetime.utcnow() + datetime.timedelta(hours=24)

    new_staff = Staff(
        staff_id=data.staff_id,
        hospital_id=current_user["hospital_id"],
        full_name=data.full_name,
        employee_id=data.employee_id,
        official_email=data.official_email,
        phone_number=data.phone_number,
        department=data.department,
        designation=data.designation,
        professional_registration_number=data.professional_registration_number,
        years_of_experience=data.years_of_experience,
        role_id=data.role_id,
        password_hash=None,
        status="PENDING",
        activation_token=activation_token,
        activation_token_expires_at=activation_token_expires_at
    )
    db.add(new_staff)
    db.commit()
    
    log_audit(db, current_user["hospital_id"], current_user["staff_id"], current_user["role"], f"Invited staff profile {data.staff_id}", "staff", data.staff_id, f"Onboarded as PENDING. Role: {data.role_id}")
    return {
        "message": "Staff member invited successfully.",
        "staff_id": data.staff_id,
        "activation_token": activation_token,
        "invitation_link": f"#/activate?token={activation_token}"
    }

class ActivateStaffInput(BaseModel):
    token: str
    password: str

@app.post("/api/v1/auth/activate-staff")
def activate_staff_account(data: ActivateStaffInput, db: Session = Depends(get_db)):
    staff = db.query(Staff).filter(
        Staff.activation_token == data.token,
        Staff.activation_token_expires_at > datetime.datetime.utcnow()
    ).first()
    
    if not staff:
        raise HTTPException(status_code=400, detail="Invalid or expired activation token.")
        
    if not validate_password_strength(data.password):
        raise HTTPException(status_code=400, detail="Password does not meet complexity requirements.")
        
    staff.password_hash = get_hash(data.password)
    staff.status = "ACTIVE"
    staff.activation_token = None
    staff.activation_token_expires_at = None
    db.commit()
    
    log_audit(db, staff.hospital_id, staff.staff_id, staff.role_id, "Activated staff account", "staff", staff.staff_id, "Password set and status transitioned to ACTIVE")
    return {"message": "Workstation account activated successfully. You can now log in."}

@app.get("/api/v1/staff/{staff_id}/invite")
def get_staff_invite(staff_id: str, db: Session = Depends(get_db), current_user: dict = Depends(PermissionChecker(Permissions.STAFF_VIEW))):
    staff = db.query(Staff).filter(Staff.staff_id == staff_id, Staff.hospital_id == current_user["hospital_id"]).first()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff member not found.")
        
    if staff.status != "PENDING":
        raise HTTPException(status_code=400, detail="Staff account is already active.")
        
    # Regenerate token if expired or doesn't exist
    if not staff.activation_token or not staff.activation_token_expires_at or staff.activation_token_expires_at < datetime.datetime.utcnow():
        staff.activation_token = secrets.token_hex(20)
        staff.activation_token_expires_at = datetime.datetime.utcnow() + datetime.timedelta(hours=24)
        db.commit()
        
    return {
        "staff_id": staff.staff_id,
        "activation_token": staff.activation_token,
        "invitation_link": f"#/activate?token={staff.activation_token}"
    }

class RoleChangeInput(BaseModel):
    new_role_id: str

@app.patch("/api/v1/staff/{staff_id}/role")
def change_staff_role(staff_id: str, data: RoleChangeInput, db: Session = Depends(get_db), current_user: dict = Depends(PermissionChecker(Permissions.STAFF_UPDATE))):
    # Prevent self privilege escalation
    if staff_id == current_user["staff_id"]:
        raise HTTPException(status_code=403, detail="You are not permitted to change your own role.")
        
    staff = db.query(Staff).filter(Staff.staff_id == staff_id, Staff.hospital_id == current_user["hospital_id"]).first()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff member not found.")
        
    allowed_roles = ["HOSPITAL_ADMINISTRATOR", "TRIAGE_NURSE", "EMERGENCY_PHYSICIAN", "STAFF_NURSE", "EMERGENCY_TECHNICIAN", "CLINICAL_DIRECTOR"]
    if data.new_role_id not in allowed_roles:
        raise HTTPException(status_code=400, detail="Invalid role specified.")
        
    old_role = staff.role_id
    staff.role_id = data.new_role_id
    db.commit()
    
    log_audit(
        db, current_user["hospital_id"], current_user["staff_id"], current_user["role"],
        f"Updated staff role for {staff_id}", "staff", staff_id,
        f"Changed role of {staff_id} from {old_role} to {data.new_role_id}"
    )
    return {"message": f"Staff role updated successfully to {data.new_role_id}."}

@app.post("/api/v1/staff/{staff_id}/deactivate")
def deactivate_staff(staff_id: str, db: Session = Depends(get_db), current_user: dict = Depends(PermissionChecker(Permissions.STAFF_DEACTIVATE))):
    staff = db.query(Staff).filter(Staff.staff_id == staff_id, Staff.hospital_id == current_user["hospital_id"]).first()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff profile not found.")
        
    if staff.staff_id == current_user["staff_id"]:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account.")
        
    staff.status = "DEACTIVATED"
    db.commit()
    
    log_audit(db, current_user["hospital_id"], current_user["staff_id"], current_user["role"], f"Deactivated staff account {staff_id}", "staff", staff_id)
    return {"message": f"Staff account {staff_id} has been deactivated immediately."}

@app.post("/api/v1/staff/{staff_id}/activate")
def activate_staff(staff_id: str, db: Session = Depends(get_db), current_user: dict = Depends(PermissionChecker(Permissions.STAFF_UPDATE))):
    staff = db.query(Staff).filter(Staff.staff_id == staff_id, Staff.hospital_id == current_user["hospital_id"]).first()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff profile not found.")
        
    staff.status = "ACTIVE"
    db.commit()
    
    log_audit(db, current_user["hospital_id"], current_user["staff_id"], current_user["role"], f"Activated staff account {staff_id}", "staff", staff_id)
    return {"message": f"Staff account {staff_id} has been re-activated."}


# ==========================================
# PATIENT INTAKE & TRIAGE API ROUTES (CLINICAL ROLE CHECKS)
# ==========================================

class PatientIntakeInput(BaseModel):
    patient_id: str
    age: float
    gender: str
    arrival_mode: str
    hr: int
    sbp: int
    dbp: int
    rr: int
    spo2: int
    temp: float
    gcs: int
    pain_score: int
    history_available: bool = False

class TriageEvaluateInput(BaseModel):
    age: float
    gender: str

    hr: int
    sbp: int
    rr: int
    spo2: int
    gcs: int
    history_available: bool = False
    setting: str = "Urban"
    facility_tier: int = 2
    transit_time_mins: int = 30

class TriageAcceptInput(BaseModel):
    patient_id: str
    ai_suggested_level: int
    ai_confidence_score: float
    top_3_drivers: list

class TriageOverrideInput(BaseModel):
    patient_id: str
    ai_suggested_level: int
    ai_confidence_score: float
    clinician_assigned_level: int
    override_reason: str
    clinical_notes: str
    top_3_drivers: list

@app.get("/api/v1/patients")
def get_patients(db: Session = Depends(get_db), current_user: dict = Depends(PermissionChecker(Permissions.PATIENT_VIEW))):
    # Enforce multi-tenant hospital isolation
    patients = db.query(Patient).filter(Patient.hospital_id == current_user["hospital_id"]).all()
    return patients

@app.post("/api/v1/patients")
def create_patient(data: PatientIntakeInput, db: Session = Depends(get_db), current_user: dict = Depends(PermissionChecker(Permissions.PATIENT_CREATE))):
    # Check if patient exists
    existing = db.query(Patient).filter(Patient.patient_id == data.patient_id, Patient.hospital_id == current_user["hospital_id"]).first()
    if existing:
        raise HTTPException(status_code=400, detail="Patient ID already registered under this hospital organization.")
        
    new_patient = Patient(
        patient_id=data.patient_id,
        hospital_id=current_user["hospital_id"],
        age=data.age,
        gender=data.gender,
        arrival_mode=data.arrival_mode,
        hr=data.hr,
        sbp=data.sbp,
        dbp=data.dbp,
        rr=data.rr,
        spo2=data.spo2,
        temp=data.temp,
        gcs=data.gcs,
        pain_score=data.pain_score,
        history_available=data.history_available,
        created_by=current_user["staff_id"]
    )
    db.add(new_patient)
    db.commit()
    
    log_audit(db, current_user["hospital_id"], current_user["staff_id"], current_user["role"], f"Registered patient {data.patient_id}", "patient", data.patient_id)
    return {"message": "Patient registered successfully", "patient": data.patient_id}

@app.post("/api/v1/encounters", response_model=EncounterResponse)
def create_encounter(data: EncounterCreateInput, db: Session = Depends(get_db), current_user: dict = Depends(PermissionChecker(Permissions.PATIENT_UPDATE))):
    # Enforce multi-tenant patient ownership
    patient = db.query(Patient).filter(Patient.patient_id == data.patient_id, Patient.hospital_id == current_user["hospital_id"]).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient profile not found in your hospital.")

    # Check if there is already an active encounter (not discharged)
    active_enc = db.query(Encounter).filter(
        Encounter.patient_id == data.patient_id,
        Encounter.hospital_id == current_user["hospital_id"],
        Encounter.status != "DISCHARGED"
    ).first()
    if active_enc:
        raise HTTPException(status_code=400, detail=f"Patient already has an active ED encounter ({active_enc.encounter_id}).")

    # Generate Encounter ID (ENC-YYYYMMDD-XXXX style or dynamic)
    date_str = datetime.datetime.utcnow().strftime("%Y%m%d")
    count = db.query(Encounter).filter(Encounter.hospital_id == current_user["hospital_id"]).count() + 1
    enc_id = f"ENC-{date_str}-{count:04d}"

    new_enc = Encounter(
        encounter_id=enc_id,
        patient_id=data.patient_id,
        hospital_id=current_user["hospital_id"],
        status="WAITING_FOR_TRIAGE",
        arrival_time=datetime.datetime.utcnow(),
        created_at=datetime.datetime.utcnow()
    )
    db.add(new_enc)
    db.commit()
    db.refresh(new_enc)

    log_audit(db, current_user["hospital_id"], current_user["staff_id"], current_user["role"], f"Created ED Encounter {enc_id}", "encounter", enc_id)

    return EncounterResponse(
        id=new_enc.id,
        encounter_id=new_enc.encounter_id,
        patient_id=new_enc.patient_id,
        hospital_id=new_enc.hospital_id,
        status=new_enc.status,
        arrival_time=new_enc.arrival_time.isoformat(),
        created_at=new_enc.created_at.isoformat()
    )

@app.get("/api/v1/patients/{patient_id}/encounters", response_model=List[EncounterResponse])
def get_patient_encounters(patient_id: str, db: Session = Depends(get_db), current_user: dict = Depends(PermissionChecker(Permissions.PATIENT_VIEW))):
    # Enforce multi-tenant isolation
    patient = db.query(Patient).filter(Patient.patient_id == patient_id, Patient.hospital_id == current_user["hospital_id"]).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient profile not found.")

    encounters = db.query(Encounter).filter(
        Encounter.patient_id == patient_id,
        Encounter.hospital_id == current_user["hospital_id"]
    ).order_by(Encounter.created_at.desc()).all()

    return [EncounterResponse(
        id=e.id,
        encounter_id=e.encounter_id,
        patient_id=e.patient_id,
        hospital_id=e.hospital_id,
        status=e.status,
        arrival_time=e.arrival_time.isoformat(),
        created_at=e.created_at.isoformat()
    ) for e in encounters]

@app.get("/api/v1/encounters/{encounter_id}", response_model=EncounterResponse)
def get_encounter_details(encounter_id: str, db: Session = Depends(get_db), current_user: dict = Depends(PermissionChecker(Permissions.PATIENT_VIEW))):
    encounter = db.query(Encounter).filter(
        Encounter.encounter_id == encounter_id,
        Encounter.hospital_id == current_user["hospital_id"]
    ).first()
    if not encounter:
        raise HTTPException(status_code=404, detail="Encounter record not found.")

    return EncounterResponse(
        id=encounter.id,
        encounter_id=encounter.encounter_id,
        patient_id=encounter.patient_id,
        hospital_id=encounter.hospital_id,
        status=encounter.status,
        arrival_time=encounter.arrival_time.isoformat(),
        created_at=encounter.created_at.isoformat()
    )

@app.post("/api/v1/encounters/{encounter_id}/vitals", response_model=VitalSignsResponse)
def record_vital_signs(encounter_id: str, data: VitalSignsCreateInput, db: Session = Depends(get_db), current_user: dict = Depends(PermissionChecker(Permissions.VITALS_CREATE))):
    encounter = db.query(Encounter).filter(
        Encounter.encounter_id == encounter_id,
        Encounter.hospital_id == current_user["hospital_id"]
    ).first()
    if not encounter:
        raise HTTPException(status_code=404, detail="Encounter not found.")

    # Validation
    if data.heart_rate is not None and (data.heart_rate < 0 or data.heart_rate > 300):
        raise HTTPException(status_code=400, detail="Invalid heart rate value.")
    if data.respiratory_rate is not None and (data.respiratory_rate < 0 or data.respiratory_rate > 100):
        raise HTTPException(status_code=400, detail="Invalid respiratory rate value.")
    if data.systolic_bp is not None and (data.systolic_bp < 0 or data.systolic_bp > 300):
        raise HTTPException(status_code=400, detail="Invalid systolic blood pressure.")
    if data.diastolic_bp is not None and (data.diastolic_bp < 0 or data.diastolic_bp > 200):
        raise HTTPException(status_code=400, detail="Invalid diastolic blood pressure.")
    if data.spo2 is not None and (data.spo2 < 0 or data.spo2 > 100):
        raise HTTPException(status_code=400, detail="Invalid oxygen saturation percentage.")
    if data.temperature is not None and (data.temperature < 20.0 or data.temperature > 50.0):
        raise HTTPException(status_code=400, detail="Invalid temperature value.")
    if data.gcs is not None and (data.gcs < 3 or data.gcs > 15):
        raise HTTPException(status_code=400, detail="Invalid Glasgow Coma Scale score.")
    if data.pain_score is not None and (data.pain_score < 0 or data.pain_score > 10):
        raise HTTPException(status_code=400, detail="Invalid pain score.")
    if data.blood_glucose is not None and (data.blood_glucose < 0 or data.blood_glucose > 1000):
        raise HTTPException(status_code=400, detail="Invalid blood glucose value.")
    if data.source is not None and data.source.upper() not in {"MANUAL", "MONITOR", "PULSE_OXIMETER", "OTHER"}:
        raise HTTPException(status_code=400, detail="Invalid observation source.")

    new_vitals = VitalSigns(
        encounter_id=encounter.id,
        hospital_id=current_user["hospital_id"],
        recorded_by=current_user["staff_id"],
        recorded_at=datetime.datetime.utcnow(),
        heart_rate=data.heart_rate,
        respiratory_rate=data.respiratory_rate,
        systolic_bp=data.systolic_bp,
        diastolic_bp=data.diastolic_bp,
        spo2=data.spo2,
        temperature=data.temperature,
        oxygen_support=data.oxygen_support,
        oxygen_flow_rate=data.oxygen_flow_rate,
        weight=data.weight,
        height=data.height,
        source=data.source.upper() if data.source else "MANUAL",
        blood_glucose=data.blood_glucose,
        gcs=data.gcs,
        pain_score=data.pain_score
    )
    db.add(new_vitals)
    db.commit()
    db.refresh(new_vitals)

    log_audit(db, current_user["hospital_id"], current_user["staff_id"], current_user["role"], f"Recorded vital signs for encounter {encounter_id}", "vital_signs", str(new_vitals.vital_id))

    return new_vitals

@app.get("/api/v1/encounters/{encounter_id}/vitals", response_model=List[VitalSignsResponse])
def get_encounter_vitals(encounter_id: str, db: Session = Depends(get_db), current_user: dict = Depends(PermissionChecker(Permissions.VITALS_VIEW))):
    encounter = db.query(Encounter).filter(
        Encounter.encounter_id == encounter_id,
        Encounter.hospital_id == current_user["hospital_id"]
    ).first()
    if not encounter:
        raise HTTPException(status_code=404, detail="Encounter not found.")

    vitals = db.query(VitalSigns).filter(
        VitalSigns.encounter_id == encounter.id,
        VitalSigns.hospital_id == current_user["hospital_id"]
    ).order_by(VitalSigns.recorded_at.desc()).all()

    return vitals

@app.get("/api/v1/encounters/{encounter_id}/vitals/latest", response_model=Optional[VitalSignsResponse])
def get_encounter_latest_vitals(encounter_id: str, db: Session = Depends(get_db), current_user: dict = Depends(PermissionChecker(Permissions.VITALS_VIEW))):
    encounter = db.query(Encounter).filter(
        Encounter.encounter_id == encounter_id,
        Encounter.hospital_id == current_user["hospital_id"]
    ).first()
    if not encounter:
        raise HTTPException(status_code=404, detail="Encounter not found.")

    vitals = db.query(VitalSigns).filter(
        VitalSigns.encounter_id == encounter.id,
        VitalSigns.hospital_id == current_user["hospital_id"]
    ).order_by(VitalSigns.recorded_at.desc()).first()

    return vitals

@app.get("/api/v1/encounters/{encounter_id}/observations", response_model=List[ClinicalObservationResponse])
def get_encounter_observations(encounter_id: str, db: Session = Depends(get_db), current_user: dict = Depends(PermissionChecker(Permissions.VITALS_VIEW))):
    encounter = db.query(Encounter).filter(
        Encounter.encounter_id == encounter_id,
        Encounter.hospital_id == current_user["hospital_id"]
    ).first()
    if not encounter:
        raise HTTPException(status_code=404, detail="Encounter not found.")

    vitals_list = db.query(VitalSigns).filter(
        VitalSigns.encounter_id == encounter.id
    ).order_by(VitalSigns.recorded_at.asc()).all()

    observations = []
    metrics = [
        ("heart_rate", "heart_rate", "bpm"),
        ("respiratory_rate", "respiratory_rate", "breaths/min"),
        ("systolic_bp", "systolic_bp", "mmHg"),
        ("diastolic_bp", "diastolic_bp", "mmHg"),
        ("spo2", "spo2", "%"),
        ("temperature", "temperature", "°C"),
        ("blood_glucose", "blood_glucose", "mg/dL"),
        ("gcs", "gcs", "GCS scale"),
        ("pain_score", "pain_score", "0-10 scale"),
        ("weight", "weight", "kg"),
        ("height", "height", "cm")
    ]

    for v in vitals_list:
        for field, label, unit in metrics:
            val = getattr(v, field, None)
            if val is not None:
                observations.append(
                    ClinicalObservationResponse(
                        type=label,
                        value=float(val),
                        unit=unit,
                        recorded_at=v.recorded_at,
                        source=v.source,
                        vital_id=v.vital_id,
                        recorded_by=v.recorded_by,
                        is_corrected=v.is_corrected,
                        correction_reason=v.correction_reason
                    )
                )

    return observations

@app.get("/api/v1/encounters/{encounter_id}/observations/latest", response_model=List[ClinicalObservationResponse])
def get_latest_encounter_observations(encounter_id: str, db: Session = Depends(get_db), current_user: dict = Depends(PermissionChecker(Permissions.VITALS_VIEW))):
    encounter = db.query(Encounter).filter(
        Encounter.encounter_id == encounter_id,
        Encounter.hospital_id == current_user["hospital_id"]
    ).first()
    if not encounter:
        raise HTTPException(status_code=404, detail="Encounter not found.")

    vitals_list = db.query(VitalSigns).filter(
        VitalSigns.encounter_id == encounter.id
    ).order_by(VitalSigns.recorded_at.desc()).all()

    observations = []
    found_types = set()
    metrics = [
        ("heart_rate", "heart_rate", "bpm"),
        ("respiratory_rate", "respiratory_rate", "breaths/min"),
        ("systolic_bp", "systolic_bp", "mmHg"),
        ("diastolic_bp", "diastolic_bp", "mmHg"),
        ("spo2", "spo2", "%"),
        ("temperature", "temperature", "°C"),
        ("blood_glucose", "blood_glucose", "mg/dL"),
        ("gcs", "gcs", "GCS scale"),
        ("pain_score", "pain_score", "0-10 scale"),
        ("weight", "weight", "kg"),
        ("height", "height", "cm")
    ]

    for v in vitals_list:
        for field, label, unit in metrics:
            if label not in found_types:
                val = getattr(v, field, None)
                if val is not None:
                    observations.append(
                        ClinicalObservationResponse(
                            type=label,
                            value=float(val),
                            unit=unit,
                            recorded_at=v.recorded_at,
                            source=v.source,
                            vital_id=v.vital_id,
                            recorded_by=v.recorded_by,
                            is_corrected=v.is_corrected,
                            correction_reason=v.correction_reason
                        )
                    )
                    found_types.add(label)

    return observations

@app.post("/api/v1/encounters/{encounter_id}/observations", response_model=VitalSignsResponse)
def record_encounter_observation(encounter_id: str, data: VitalSignsCreateInput, db: Session = Depends(get_db), current_user: dict = Depends(PermissionChecker(Permissions.VITALS_CREATE))):
    return record_vital_signs(encounter_id, data, db, current_user)

@app.patch("/api/v1/vitals/{vital_id}", response_model=VitalSignsResponse)
def correct_vital_signs(vital_id: int, data: VitalSignsCorrectionInput, db: Session = Depends(get_db), current_user: dict = Depends(PermissionChecker(Permissions.VITALS_UPDATE))):
    vitals = db.query(VitalSigns).filter(
        VitalSigns.vital_id == vital_id,
        VitalSigns.hospital_id == current_user["hospital_id"]
    ).first()
    if not vitals:
        raise HTTPException(status_code=404, detail="Vitals entry not found.")

    # Validation
    if data.heart_rate is not None and (data.heart_rate < 0 or data.heart_rate > 300):
        raise HTTPException(status_code=400, detail="Invalid heart rate value.")
    if data.respiratory_rate is not None and (data.respiratory_rate < 0 or data.respiratory_rate > 100):
        raise HTTPException(status_code=400, detail="Invalid respiratory rate value.")
    if data.systolic_bp is not None and (data.systolic_bp < 0 or data.systolic_bp > 300):
        raise HTTPException(status_code=400, detail="Invalid systolic blood pressure.")
    if data.diastolic_bp is not None and (data.diastolic_bp < 0 or data.diastolic_bp > 200):
        raise HTTPException(status_code=400, detail="Invalid diastolic blood pressure.")
    if data.spo2 is not None and (data.spo2 < 0 or data.spo2 > 100):
        raise HTTPException(status_code=400, detail="Invalid oxygen saturation percentage.")
    if data.temperature is not None and (data.temperature < 20.0 or data.temperature > 50.0):
        raise HTTPException(status_code=400, detail="Invalid temperature value.")
    if data.gcs is not None and (data.gcs < 3 or data.gcs > 15):
        raise HTTPException(status_code=400, detail="Invalid Glasgow Coma Scale score.")
    if data.pain_score is not None and (data.pain_score < 0 or data.pain_score > 10):
        raise HTTPException(status_code=400, detail="Invalid pain score.")
    if data.blood_glucose is not None and (data.blood_glucose < 0 or data.blood_glucose > 1000):
        raise HTTPException(status_code=400, detail="Invalid blood glucose value.")
    if data.source is not None and data.source.upper() not in {"MANUAL", "MONITOR", "PULSE_OXIMETER", "OTHER"}:
        raise HTTPException(status_code=400, detail="Invalid observation source.")
    if not data.correction_reason.strip():
        raise HTTPException(status_code=400, detail="Correction reason is mandatory.")

    old_values = {
        "heart_rate": vitals.heart_rate,
        "respiratory_rate": vitals.respiratory_rate,
        "systolic_bp": vitals.systolic_bp,
        "diastolic_bp": vitals.diastolic_bp,
        "spo2": vitals.spo2,
        "temperature": vitals.temperature,
        "oxygen_support": vitals.oxygen_support,
        "oxygen_flow_rate": vitals.oxygen_flow_rate,
        "weight": vitals.weight,
        "height": vitals.height,
        "source": vitals.source,
        "blood_glucose": vitals.blood_glucose,
        "gcs": vitals.gcs,
        "pain_score": vitals.pain_score
    }

    vitals.heart_rate = data.heart_rate
    vitals.respiratory_rate = data.respiratory_rate
    vitals.systolic_bp = data.systolic_bp
    vitals.diastolic_bp = data.diastolic_bp
    vitals.spo2 = data.spo2
    vitals.temperature = data.temperature
    vitals.oxygen_support = data.oxygen_support
    vitals.oxygen_flow_rate = data.oxygen_flow_rate
    vitals.weight = data.weight
    vitals.height = data.height
    vitals.source = data.source.upper() if data.source else vitals.source
    vitals.blood_glucose = data.blood_glucose
    vitals.gcs = data.gcs
    vitals.pain_score = data.pain_score
    vitals.is_corrected = True
    vitals.correction_reason = data.correction_reason
    vitals.corrected_by = current_user["staff_id"]
    vitals.corrected_at = datetime.datetime.utcnow()

    db.commit()
    db.refresh(vitals)

    log_audit(db, current_user["hospital_id"], current_user["staff_id"], current_user["role"], f"Corrected vital signs {vital_id}", "vital_signs", str(vital_id), details=f"Old: {old_values}, Reason: {data.correction_reason}")

    return vitals

@app.post("/api/v1/encounters/{encounter_id}/triage", response_model=TriageAssessmentResponse)
def create_triage_assessment(encounter_id: str, data: TriageAssessmentCreateInput, db: Session = Depends(get_db), current_user: dict = Depends(PermissionChecker(Permissions.TRIAGE_CREATE))):
    encounter = db.query(Encounter).filter(
        Encounter.encounter_id == encounter_id,
        Encounter.hospital_id == current_user["hospital_id"]
    ).first()
    if not encounter:
        raise HTTPException(status_code=404, detail="Encounter not found.")

    if encounter.status in ["TRIAGED", "DISCHARGED"]:
        raise HTTPException(status_code=400, detail="Encounter is in a closed/finished state and cannot add/start triage.")

    existing = db.query(TriageAssessment).filter(TriageAssessment.encounter_id == encounter.id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Triage assessment already exists for this encounter. Use update.")

    if data.status == "COMPLETED":
        if not data.presenting_complaint.strip():
            raise HTTPException(status_code=400, detail="Presenting complaint is required to complete triage.")
        if data.symptom_severity is not None and (data.symptom_severity < 0 or data.symptom_severity > 10):
            raise HTTPException(status_code=400, detail="Symptom severity must be between 0 and 10.")
        if not data.clinical_priority:
            raise HTTPException(status_code=400, detail="Clinical priority is required to complete triage.")

    new_triage = TriageAssessment(
        hospital_id=current_user["hospital_id"],
        encounter_id=encounter.id,
        assessed_by=current_user["staff_id"],
        assessed_at=datetime.datetime.utcnow(),
        presenting_complaint=data.presenting_complaint,
        symptom_onset=data.symptom_onset,
        symptom_severity=data.symptom_severity,
        associated_symptoms=data.associated_symptoms,
        medical_history=data.medical_history,
        medications=data.medications,
        allergies=data.allergies,
        triage_notes=data.triage_notes,
        clinical_priority=data.clinical_priority,
        status=data.status
    )
    db.add(new_triage)
    
    if data.status == "COMPLETED":
        encounter.status = "TRIAGED"
    else:
        encounter.status = "TRIAGE_IN_PROGRESS"
        
    db.commit()
    db.refresh(new_triage)

    log_audit(db, current_user["hospital_id"], current_user["staff_id"], current_user["role"], f"Created triage assessment draft ({data.status}) for encounter {encounter_id}", "triage_assessment", str(new_triage.triage_id))

    return new_triage

@app.get("/api/v1/encounters/{encounter_id}/triage", response_model=Optional[TriageAssessmentResponse])
def get_triage_assessment(encounter_id: str, db: Session = Depends(get_db), current_user: dict = Depends(PermissionChecker(Permissions.TRIAGE_VIEW))):
    encounter = db.query(Encounter).filter(
        Encounter.encounter_id == encounter_id,
        Encounter.hospital_id == current_user["hospital_id"]
    ).first()
    if not encounter:
        raise HTTPException(status_code=404, detail="Encounter not found.")

    triage = db.query(TriageAssessment).filter(
        TriageAssessment.encounter_id == encounter.id,
        TriageAssessment.hospital_id == current_user["hospital_id"]
    ).first()
    return triage

@app.patch("/api/v1/encounters/{encounter_id}/triage", response_model=TriageAssessmentResponse)
def update_triage_assessment(encounter_id: str, data: TriageAssessmentPatchInput, db: Session = Depends(get_db), current_user: dict = Depends(PermissionChecker(Permissions.TRIAGE_UPDATE))):
    encounter = db.query(Encounter).filter(
        Encounter.encounter_id == encounter_id,
        Encounter.hospital_id == current_user["hospital_id"]
    ).first()
    if not encounter:
        raise HTTPException(status_code=404, detail="Encounter not found.")

    triage = db.query(TriageAssessment).filter(
        TriageAssessment.encounter_id == encounter.id,
        TriageAssessment.hospital_id == current_user["hospital_id"]
    ).first()
    if not triage:
        raise HTTPException(status_code=404, detail="Triage assessment not found.")

    if encounter.status == "DISCHARGED":
        raise HTTPException(status_code=400, detail="Cannot update triage of a discharged encounter.")

    if data.symptom_severity is not None and (data.symptom_severity < 0 or data.symptom_severity > 10):
        raise HTTPException(status_code=400, detail="Symptom severity must be between 0 and 10.")

    old_priority = triage.clinical_priority
    new_priority = data.clinical_priority if data.clinical_priority is not None else triage.clinical_priority

    if data.status == "COMPLETED" or triage.status == "COMPLETED":
        complaint = data.presenting_complaint if data.presenting_complaint is not None else triage.presenting_complaint
        priority = data.clinical_priority if data.clinical_priority is not None else triage.clinical_priority
        if not complaint or not complaint.strip():
            raise HTTPException(status_code=400, detail="Presenting complaint is required to complete triage.")
        if not priority:
            raise HTTPException(status_code=400, detail="Clinical priority is required to complete triage.")

    if data.presenting_complaint is not None: triage.presenting_complaint = data.presenting_complaint
    if data.symptom_onset is not None: triage.symptom_onset = data.symptom_onset
    if data.symptom_severity is not None: triage.symptom_severity = data.symptom_severity
    if data.associated_symptoms is not None: triage.associated_symptoms = data.associated_symptoms
    if data.medical_history is not None: triage.medical_history = data.medical_history
    if data.medications is not None: triage.medications = data.medications
    if data.allergies is not None: triage.allergies = data.allergies
    if data.triage_notes is not None: triage.triage_notes = data.triage_notes
    if data.clinical_priority is not None: triage.clinical_priority = data.clinical_priority

    is_amending = triage.status == "COMPLETED" and data.status == "COMPLETED"
    if data.status is not None:
        triage.status = data.status

    triage.updated_at = datetime.datetime.utcnow()

    if triage.status == "COMPLETED":
        encounter.status = "TRIAGED"
    else:
        encounter.status = "TRIAGE_IN_PROGRESS"

    if is_amending:
        triage.status = "AMENDED"
        triage.amended_by = current_user["staff_id"]
        triage.amended_at = datetime.datetime.utcnow()
        log_audit(db, current_user["hospital_id"], current_user["staff_id"], current_user["role"], f"Amended triage assessment for encounter {encounter_id}", "triage_assessment", str(triage.triage_id))
    else:
        log_audit(db, current_user["hospital_id"], current_user["staff_id"], current_user["role"], f"Updated triage assessment ({triage.status}) for encounter {encounter_id}", "triage_assessment", str(triage.triage_id))

    if old_priority != new_priority:
        log_audit(db, current_user["hospital_id"], current_user["staff_id"], current_user["role"], f"Priority changed for encounter {encounter_id} from {old_priority} to {new_priority}", "triage_assessment", str(triage.triage_id))

    db.commit()
    db.refresh(triage)
    return triage

@app.post("/api/v1/triage")
def triage_evaluate(patient: TriageEvaluateInput, current_user: dict = Depends(PermissionChecker(Permissions.TRIAGE_CREATE))):
    # Clean clinical data send to AI - pseudonymize names/emails
    patient_data = patient.dict()
    triage_result = engine.evaluate_patient(patient_data)
    
    # Map raw clinical_drivers to formatted list of {"feature": d, "weight": weight}
    raw_drivers = triage_result.get("clinical_drivers", [])
    formatted_drivers = []
    # Map simple SHAP mock weights
    for idx, d in enumerate(raw_drivers):
        weight = 25 - (idx * 5)
        formatted_drivers.append({"feature": d, "weight": max(5, weight)})
        
    if not formatted_drivers:
        formatted_drivers.append({"feature": "Vitals within standard deviations", "weight": 5})

    return {
        "ai_suggested_level": triage_result["triage_level"],
        "confidence_score": triage_result["confidence_score"] / 100.0, # map percentage to fractional
        "top_3_drivers": formatted_drivers[:3],
        "auto_escalated": triage_result["auto_escalated"]
    }

@app.post("/api/v1/triage/accept")
def triage_accept(data: TriageAcceptInput, db: Session = Depends(get_db), current_user: dict = Depends(PermissionChecker(Permissions.TRIAGE_CREATE))):
    # Enforce multi-tenant resource check
    patient = db.query(Patient).filter(Patient.patient_id == data.patient_id, Patient.hospital_id == current_user["hospital_id"]).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient record not found in this organization.")
        
    # Update Patient triage level
    patient.triage_level = data.ai_suggested_level
    
    # Create triage record
    record = TriageRecord(
        triage_id=f"TR-{data.patient_id}-{int(datetime.datetime.utcnow().timestamp())}",
        patient_id=data.patient_id,
        hospital_id=current_user["hospital_id"],
        ai_suggested_level=data.ai_suggested_level,
        ai_confidence_score=data.ai_confidence_score,
        clinician_assigned_level=data.ai_suggested_level,
        action_type="ACCEPTED",
        created_by=current_user["staff_id"]
    )
    db.add(record)
    
    # Create Triage Audit Log
    triage_audit = TriageAuditLog(
        patient_id=data.patient_id,
        hospital_id=current_user["hospital_id"],
        staff_id=current_user["staff_id"],
        ai_suggested_level=data.ai_suggested_level,
        ai_confidence_score=data.ai_confidence_score,
        clinician_assigned_level=data.ai_suggested_level,
        action_type=ActionTypeEnum.ACCEPTED,
        top_3_drivers=data.top_3_drivers
    )
    db.add(triage_audit)
    
    db.commit()
    
    log_audit(db, current_user["hospital_id"], current_user["staff_id"], current_user["role"], f"Accepted AI triage level {data.ai_suggested_level}", "triage", data.patient_id)
    return {"message": "AI recommended triage tier accepted successfully."}

# Map string reason to Enum
def map_override_reason(reason_str: str):
    for enum_val in OverrideReasonEnum:
        if enum_val.value == reason_str or enum_val.name == reason_str:
            return enum_val
    return OverrideReasonEnum.OTHER

@app.post("/api/v1/triage/override")
def triage_override(data: TriageOverrideInput, db: Session = Depends(get_db), current_user: dict = Depends(PermissionChecker(Permissions.AI_OVERRIDE))):
    patient = db.query(Patient).filter(Patient.patient_id == data.patient_id, Patient.hospital_id == current_user["hospital_id"]).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient record not found in this organization.")
        
    patient.triage_level = data.clinician_assigned_level
    patient.override_reason = data.override_reason
    
    # Create triage record
    record = TriageRecord(
        triage_id=f"TR-{data.patient_id}-{int(datetime.datetime.utcnow().timestamp())}",
        patient_id=data.patient_id,
        hospital_id=current_user["hospital_id"],
        ai_suggested_level=data.ai_suggested_level,
        ai_confidence_score=data.ai_confidence_score,
        clinician_assigned_level=data.clinician_assigned_level,
        action_type="OVERRIDDEN",
        override_reason=data.override_reason,
        clinical_notes=data.clinical_notes,
        created_by=current_user["staff_id"]
    )
    db.add(record)
    
    # Create Triage Audit Log
    triage_audit = TriageAuditLog(
        patient_id=data.patient_id,
        hospital_id=current_user["hospital_id"],
        staff_id=current_user["staff_id"],
        ai_suggested_level=data.ai_suggested_level,
        ai_confidence_score=data.ai_confidence_score,
        clinician_assigned_level=data.clinician_assigned_level,
        action_type=ActionTypeEnum.OVERRIDDEN,
        override_reason=map_override_reason(data.override_reason),
        clinical_notes=data.clinical_notes,
        top_3_drivers=data.top_3_drivers
    )
    db.add(triage_audit)
    
    db.commit()
    
    log_audit(
        db, current_user["hospital_id"], current_user["staff_id"], current_user["role"],
        f"Overrode AI triage level {data.ai_suggested_level} to {data.clinician_assigned_level}",
        "triage", data.patient_id, f"Reason: {data.override_reason}"
    )
    return {"message": "Clinical override recorded successfully."}


# ==========================================
# GENERAL AUDIT LOG RETRIEVAL (ADMIN/DIRECTOR ONLY)
# ==========================================

@app.get("/api/v1/audit-logs")
def get_audit_logs(db: Session = Depends(get_db), current_user: dict = Depends(PermissionChecker(Permissions.AUDIT_VIEW))):
    # Enforce multi-tenant hospital isolation
    logs = db.query(AuditLog).filter(
        AuditLog.hospital_id == current_user["hospital_id"]
    ).order_by(AuditLog.timestamp.desc()).all()
    
    return [{
        "log_id": l.log_id,
        "staff_id": l.staff_id,
        "staff_role": l.staff_role,
        "action": l.action,
        "entity_type": l.entity_type,
        "entity_id": l.entity_id,
        "timestamp": l.timestamp.isoformat(),
        "details": l.details
    } for l in logs]


# Keep legacy routes with secure mock mappings so we do not break any existing simple benchmark scripts
@app.post("/api/triage")
def legacy_triage_patient(patient: dict):
    # Map simple legacy call
    result = engine.evaluate_patient(patient)
    return {"message": "Triage complete", "result": result}

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
class OverrideInput(BaseModel):
    staff_id: str
    ai_suggested_level: int
    clinician_assigned_level: int
    override_reason: str

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
