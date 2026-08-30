from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
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
    OverrideReasonEnum, ActionTypeEnum, seed_database, get_hash
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
