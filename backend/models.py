from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Date, ForeignKey, Text, JSON, Table, create_engine, Enum, UniqueConstraint, Index, text
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
import datetime
import enum
import bcrypt

Base = declarative_base()

class OverrideReasonEnum(str, enum.Enum):
    CLINICAL_INTUITION = "Clinical Intuition / Gestalt"
    ACTIVE_HEMORRHAGE = "Uncontrolled / Active Hemorrhage"
    HIGH_RISK_MECHANISM = "High-Risk Mechanism of Injury"
    VISUAL_DISTRESS = "Obvious Acute Visual Distress"
    UNVERIFIED_EHR_CORRECTION = "EHR / History Discrepancy"
    OTHER = "Other (Mandatory Detailed Note)"

class ActionTypeEnum(str, enum.Enum):
    ACCEPTED = "ACCEPTED"
    OVERRIDDEN = "OVERRIDDEN"
    AUTO_ESCALATED = "AUTO_ESCALATED"

class AIRiskCategory(str, enum.Enum):
    LOW = "LOW"
    MODERATE = "MODERATE"
    HIGH = "HIGH"

class AIRiskStatus(str, enum.Enum):
    PENDING_CLINICIAN_REVIEW = "PENDING_CLINICIAN_REVIEW"
    UNAVAILABLE = "UNAVAILABLE"
    FAILED = "FAILED"

# Association table for Role-Permission mapping
role_permissions = Table(
    'role_permissions',
    Base.metadata,
    Column('role_id', String(50), ForeignKey('roles.role_id'), primary_key=True),
    Column('permission_id', String(50), ForeignKey('permissions.permission_id'), primary_key=True)
)

class Hospital(Base):
    __tablename__ = 'hospitals'

    id = Column(Integer, primary_key=True, autoincrement=True)
    hospital_id = Column(String(50), unique=True, index=True, nullable=False) # e.g. DEMO001, HOSP_A
    name = Column(String(200), nullable=False)
    hospital_type = Column(String(100), nullable=False)
    address = Column(String(200), nullable=False)
    city = Column(String(100), nullable=False)
    state = Column(String(100), nullable=False)
    country = Column(String(100), nullable=False)
    postal_code = Column(String(20), nullable=False)
    registration_number = Column(String(100), nullable=False)
    emergency_department_available = Column(Boolean, default=True)
    ed_capacity = Column(Integer, default=50)
    verification_status = Column(String(50), default="VERIFIED") # PENDING, VERIFIED, REJECTED, SUSPENDED
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class Permission(Base):
    __tablename__ = 'permissions'

    permission_id = Column(String(50), primary_key=True) # e.g., patient:create
    description = Column(String(200), nullable=True)

class Role(Base):
    __tablename__ = 'roles'

    role_id = Column(String(50), primary_key=True) # e.g. EMERGENCY_PHYSICIAN
    name = Column(String(100), nullable=False)
    description = Column(String(200), nullable=True)

    permissions = relationship("Permission", secondary=role_permissions, backref="roles")

class Staff(Base):
    __tablename__ = 'staffs'
    __table_args__ = (
        UniqueConstraint('hospital_id', 'staff_id', name='_hospital_staff_uc'),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    staff_id = Column(String(50), index=True, nullable=False) # e.g. DOC001
    hospital_id = Column(String(50), ForeignKey('hospitals.hospital_id'), nullable=False)
    full_name = Column(String(100), nullable=False)
    employee_id = Column(String(50), nullable=False)
    official_email = Column(String(100), unique=True, index=True, nullable=False)
    phone_number = Column(String(50), nullable=False)
    department = Column(String(100), nullable=False)
    designation = Column(String(100), nullable=False)
    professional_registration_number = Column(String(100), nullable=True)
    years_of_experience = Column(Integer, nullable=True)
    role_id = Column(String(50), ForeignKey('roles.role_id'), nullable=False)
    password_hash = Column(String(200), nullable=True)
    status = Column(String(50), default="PENDING") # ACTIVE, PENDING, SUSPENDED, DEACTIVATED
    activation_token = Column(String(100), unique=True, nullable=True, index=True)
    activation_token_expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    last_login_at = Column(DateTime, nullable=True)

class Patient(Base):
    __tablename__ = 'patients'

    id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(String(50), unique=True, index=True, nullable=False) # e.g. PT-A100
    hospital_id = Column(String(50), ForeignKey('hospitals.hospital_id'), nullable=False)
    first_name = Column(String(100), nullable=False, default="")
    last_name = Column(String(100), nullable=False, default="")
    date_of_birth = Column(Date, nullable=True)
    gender = Column(String(50), nullable=True)
    contact_info = Column(String(255), nullable=True)
    emergency_contact = Column(String(255), nullable=True)
    known_allergies = Column(String, nullable=True)

    # Fields retained from the initial triage prototype
    age = Column(Float, nullable=True)
    arrival_mode = Column(String(100), nullable=True)
    
    # Vitals
    hr = Column(Integer, nullable=True)
    sbp = Column(Integer, nullable=True)
    dbp = Column(Integer, nullable=True)
    rr = Column(Integer, nullable=True)
    spo2 = Column(Integer, nullable=True)
    temp = Column(Float, nullable=True)
    gcs = Column(Integer, nullable=True)
    pain_score = Column(Integer, nullable=True)
    history_available = Column(Boolean, default=False)
    
    # Decision outputs
    triage_level = Column(Integer, nullable=True)
    override_reason = Column(String(100), nullable=True)
    created_by = Column(String(50), ForeignKey('staffs.staff_id'), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class TriageRecord(Base):
    __tablename__ = 'triage_records'

    triage_id = Column(String(100), primary_key=True) # e.g. TR-PT-A100-timestamp
    patient_id = Column(String(50), ForeignKey('patients.patient_id'), nullable=False)
    hospital_id = Column(String(50), ForeignKey('hospitals.hospital_id'), nullable=False)
    ai_suggested_level = Column(Integer, nullable=False)
    ai_confidence_score = Column(Float, nullable=False)
    clinician_assigned_level = Column(Integer, nullable=True) # None if accepted without override
    action_type = Column(String(50), nullable=False) # ACCEPTED, OVERRIDDEN, AUTO_ESCALATED
    override_reason = Column(String(200), nullable=True)
    clinical_notes = Column(Text, nullable=True)
    created_by = Column(String(50), ForeignKey('staffs.staff_id'), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class TriageAuditLog(Base):
    __tablename__ = 'triage_audit_logs'

    id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(String(50), ForeignKey('patients.patient_id'), nullable=False)
    hospital_id = Column(String(50), ForeignKey('hospitals.hospital_id'), nullable=False)
    staff_id = Column(String(50), ForeignKey('staffs.staff_id'), nullable=False)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    ai_suggested_level = Column(Integer, nullable=False)
    ai_confidence_score = Column(Float, nullable=False)
    clinician_assigned_level = Column(Integer, nullable=False)
    action_type = Column(Enum(ActionTypeEnum), nullable=False)
    override_reason = Column(Enum(OverrideReasonEnum), nullable=True)
    clinical_notes = Column(Text, nullable=True)
    top_3_drivers = Column(JSON, nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "patient_id": self.patient_id,
            "hospital_id": self.hospital_id,
            "staff_id": self.staff_id,
            "timestamp": self.timestamp.isoformat(),
            "ai_suggested_level": self.ai_suggested_level,
            "ai_confidence_score": self.ai_confidence_score,
            "clinician_assigned_level": self.clinician_assigned_level,
            "action_type": self.action_type.value,
            "override_reason": self.override_reason.value if self.override_reason else None,
            "clinical_notes": self.clinical_notes,
            "top_3_drivers": self.top_3_drivers
        }

class AuditLog(Base):
    __tablename__ = 'audit_logs'

    log_id = Column(Integer, primary_key=True, autoincrement=True)
    hospital_id = Column(String(50), ForeignKey('hospitals.hospital_id'), nullable=False)
    staff_id = Column(String(50), ForeignKey('staffs.staff_id'), nullable=False)
    staff_role = Column(String(50), nullable=False)
    action = Column(String(100), nullable=False) # e.g. Login, Patient view
    entity_type = Column(String(50), nullable=False) # patient, triage, staff, auth
    entity_id = Column(String(50), nullable=False)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    details = Column(Text, nullable=True)

class Encounter(Base):
    __tablename__ = 'encounters'

    id = Column(Integer, primary_key=True, autoincrement=True)
    encounter_id = Column(String(50), unique=True, index=True, nullable=False) # e.g. ENC-2026-000001
    patient_id = Column(String(50), ForeignKey('patients.patient_id'), nullable=False)
    hospital_id = Column(String(50), ForeignKey('hospitals.hospital_id'), nullable=False)
    status = Column(String(50), default="WAITING_FOR_TRIAGE", nullable=False) # WAITING_FOR_TRIAGE, TRIAGE_IN_PROGRESS, TRIAGED, WAITING_FOR_DOCTOR, DISCHARGED
    arrival_time = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

class VitalSigns(Base):
    __tablename__ = 'vital_signs'

    vital_id = Column(Integer, primary_key=True, autoincrement=True)
    encounter_id = Column(Integer, ForeignKey('encounters.id'), nullable=False)
    hospital_id = Column(String(50), ForeignKey('hospitals.hospital_id'), nullable=False)
    recorded_by = Column(String(50), ForeignKey('staffs.staff_id'), nullable=False)
    recorded_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    heart_rate = Column(Integer, nullable=True)
    respiratory_rate = Column(Integer, nullable=True)
    systolic_bp = Column(Integer, nullable=True)
    diastolic_bp = Column(Integer, nullable=True)
    spo2 = Column(Integer, nullable=True)
    temperature = Column(Float, nullable=True)
    oxygen_support = Column(String(50), default="None", nullable=False) # None, Nasal Cannula, Face Mask, Other
    oxygen_flow_rate = Column(Float, nullable=True)
    weight = Column(Float, nullable=True)
    height = Column(Float, nullable=True)
    source = Column(String(50), default="MANUAL", nullable=False) # MANUAL, MONITOR, PULSE_OXIMETER, OTHER
    blood_glucose = Column(Float, nullable=True)
    gcs = Column(Integer, nullable=True)
    pain_score = Column(Integer, nullable=True)
    is_corrected = Column(Boolean, default=False, nullable=False)
    correction_reason = Column(Text, nullable=True)
    corrected_by = Column(String(50), ForeignKey('staffs.staff_id'), nullable=True)
    corrected_at = Column(DateTime, nullable=True)

class TriageAssessment(Base):
    __tablename__ = 'triage_assessments'

    triage_id = Column(Integer, primary_key=True, autoincrement=True)
    hospital_id = Column(String(50), ForeignKey('hospitals.hospital_id'), nullable=False)
    encounter_id = Column(Integer, ForeignKey('encounters.id'), nullable=False)
    assessed_by = Column(String(50), ForeignKey('staffs.staff_id'), nullable=False)
    assessed_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    presenting_complaint = Column(String(200), nullable=False)
    symptom_onset = Column(String(100), nullable=True)
    symptom_severity = Column(Integer, nullable=True) # 0-10
    associated_symptoms = Column(Text, nullable=True)
    medical_history = Column(Text, nullable=True)
    medications = Column(Text, nullable=True)
    allergies = Column(Text, nullable=True) # Explicit "No known allergies" vs empty
    triage_notes = Column(Text, nullable=True)
    clinical_priority = Column(String(50), nullable=True) # HIGH, MEDIUM, LOW
    status = Column(String(50), default="DRAFT", nullable=False) # DRAFT, COMPLETED, AMENDED
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    amended_by = Column(String(50), ForeignKey('staffs.staff_id'), nullable=True)
    amended_at = Column(DateTime, nullable=True)

class AIRiskAssessment(Base):
    __tablename__ = 'ai_risk_assessments'
    __table_args__ = (Index('ix_ai_risk_history', 'hospital_id', 'encounter_id', 'generated_at'), Index('ix_ai_risk_model', 'model_name', 'model_version'))
    id = Column(Integer, primary_key=True, autoincrement=True)
    assessment_id = Column(String(60), unique=True, nullable=False, index=True)
    hospital_id = Column(String(50), ForeignKey('hospitals.hospital_id'), nullable=False, index=True)
    encounter_id = Column(Integer, ForeignKey('encounters.id'), nullable=False, index=True)
    model_name = Column(String(150), nullable=False)
    model_version = Column(String(50), nullable=False)
    input_schema_version = Column(String(50), nullable=False)
    prediction_target = Column(String(250), nullable=False)
    prediction_horizon = Column(String(100), nullable=False)
    risk_score = Column(Float, nullable=True)
    risk_category = Column(Enum(AIRiskCategory), nullable=True)
    status = Column(Enum(AIRiskStatus), nullable=False, index=True)
    input_snapshot = Column(JSON, nullable=True)
    vital_sign_ids = Column(JSON, nullable=True)
    triage_id = Column(Integer, nullable=True)
    failure_code = Column(String(100), nullable=True)
    generated_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False, index=True)
    created_by = Column(String(50), ForeignKey('staffs.staff_id'), nullable=False)

# Setup SQLite Database for the prototype
engine = create_engine("sqlite:///./triage_database.db", connect_args={"check_same_thread": False})
Base.metadata.create_all(bind=engine)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Additive migration for legacy single-tenant prototype databases. Existing
# records are retained and associated to the seeded demo hospital.
with engine.begin() as connection:
    existing_columns = {
        row[1] for row in connection.execute(text("PRAGMA table_info(patients)"))
    }
    patient_column_migrations = {
        "hospital_id": "VARCHAR(50)",
        "first_name": "VARCHAR(100)",
        "last_name": "VARCHAR(100)",
        "date_of_birth": "DATE",
        "contact_info": "VARCHAR(255)",
        "emergency_contact": "VARCHAR(255)",
        "known_allergies": "VARCHAR",
    }
    for column_name, column_type in patient_column_migrations.items():
        if column_name not in existing_columns:
            connection.execute(text(f"ALTER TABLE patients ADD COLUMN {column_name} {column_type}"))
    connection.execute(text("UPDATE patients SET hospital_id = 'DEMO001' WHERE hospital_id IS NULL OR hospital_id = ''"))

def get_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

# Database Seeding helper
def seed_database():
    db = SessionLocal()
    try:
        # 1. Seed Permissions
        permissions_data = [
            ("patient:create", "Create patient record"),
            ("patient:view", "View patient details"),
            ("patient:update", "Update patient record"),
            ("triage:create", "Evaluate patient triage"),
            ("triage:view", "View triage records"),
            ("triage:update", "Modify triage records"),
            ("vitals:create", "Record vital signs"),
            ("vitals:view", "View vital signs"),
            ("vitals:update", "Modify vital signs"),
            ("ai:view", "View AI clinical insights"),
            ("ai:override", "Override AI recommendations"),
            ("alert:view", "View clinical alerts"),
            ("alert:acknowledge", "Acknowledge clinical alerts"),
            ("staff:create", "Create new staff accounts"),
            ("staff:view", "View staff records"),
            ("staff:update", "Modify staff profiles"),
            ("staff:deactivate", "Deactivate staff accounts"),
            ("hospital:view", "View hospital information"),
            ("hospital:update", "Update hospital settings"),
            ("audit:view", "View audit trails")
        ]
        
        existing_perms = {p.permission_id for p in db.query(Permission).all()}
        for pid, desc in permissions_data:
            if pid not in existing_perms:
                db.add(Permission(permission_id=pid, description=desc))
        db.commit()

        # 2. Seed Roles
        roles_data = [
            ("HOSPITAL_ADMINISTRATOR", "Hospital Administrator", "Administrative management only"),
            ("TRIAGE_NURSE", "Triage Nurse", "Intake and early vital assessments"),
            ("EMERGENCY_PHYSICIAN", "Emergency Physician", "Emergency physician diagnosis and treatment"),
            ("STAFF_NURSE", "Staff Nurse", "General clinical ward treatment"),
            ("EMERGENCY_TECHNICIAN", "Emergency Technician", "Technical vitals recording and assistant"),
            ("CLINICAL_DIRECTOR", "Clinical Director", "Operational overview and auditing")
        ]
        
        existing_roles = {r.role_id for r in db.query(Role).all()}
        for rid, name, desc in roles_data:
            if rid not in existing_roles:
                db.add(Role(role_id=rid, name=name, description=desc))
        db.commit()

        # 3. Seed Role-Permissions
        role_permissions_map = {
            "HOSPITAL_ADMINISTRATOR": [
                "staff:create", "staff:view", "staff:update", "staff:deactivate",
                "hospital:view", "hospital:update", "audit:view"
            ],
            "TRIAGE_NURSE": [
                "patient:create", "patient:view", "triage:create", "triage:view",
                "triage:update", "vitals:create", "vitals:view", "vitals:update", "ai:view", "alert:view"
            ],
            "EMERGENCY_PHYSICIAN": [
                "patient:view", "patient:update", "triage:view", "vitals:view",
                "ai:view", "ai:override", "alert:view", "alert:acknowledge"
            ],
            "STAFF_NURSE": [
                "patient:view", "vitals:create", "vitals:view", "triage:view",
                "ai:view", "alert:view"
            ],
            "EMERGENCY_TECHNICIAN": [
                "patient:view", "vitals:create", "vitals:view"
            ],
            "CLINICAL_DIRECTOR": [
                "patient:view", "triage:view", "vitals:view", "ai:view",
                "alert:view", "alert:acknowledge", "audit:view"
            ]
        }

        role_objs = {r.role_id: r for r in db.query(Role).all()}
        perm_objs = {p.permission_id: p for p in db.query(Permission).all()}

        for rid, perm_ids in role_permissions_map.items():
            role_obj = role_objs.get(rid)
            if role_obj:
                current_mapped = {p.permission_id for p in role_obj.permissions}
                for pid in perm_ids:
                    if pid not in current_mapped and pid in perm_objs:
                        role_obj.permissions.append(perm_objs[pid])
        db.commit()

        # 4. Seed Demo Hospital
        demo_hosp = db.query(Hospital).filter_by(hospital_id="DEMO001").first()
        if not demo_hosp:
            demo_hosp = Hospital(
                hospital_id="DEMO001",
                name="Demo General Hospital",
                hospital_type="Teaching Hospital",
                address="100 Medical Plaza Dr",
                city="Metropolis",
                state="NY",
                country="USA",
                postal_code="10001",
                registration_number="REG-778899",
                emergency_department_available=True,
                ed_capacity=75,
                verification_status="VERIFIED"
            )
            db.add(demo_hosp)
            db.commit()

        # 5. Seed Demo Staff
        staff_data = [
            ("ADMIN001", "DEMO001", "Admin User", "EMP-001", "admin@demohospital.com", "555-0100", "Administration", "Hospital Admin", "HOSPITAL_ADMINISTRATOR", "DemoAdmin123!"),
            ("DOC001", "DEMO001", "Dr. Sarah Jenkins", "EMP-002", "doctor@demohospital.com", "555-0101", "Emergency Medicine", "Attending Physician", "EMERGENCY_PHYSICIAN", "DemoDoctor123!"),
            ("NUR001", "DEMO001", "Nurse Kelly Adams", "EMP-003", "nurse@demohospital.com", "555-0102", "Emergency Medicine", "Triage Nurse", "TRIAGE_NURSE", "DemoNurse123!"),
            ("TECH001", "DEMO001", "Tech Bob Miller", "EMP-004", "tech@demohospital.com", "555-0103", "Emergency Medicine", "ED Technician", "EMERGENCY_TECHNICIAN", "DemoTech123!"),
            ("DIR001", "DEMO001", "Dr. Marcus Vance", "EMP-005", "director@demohospital.com", "555-0104", "Emergency Medicine", "Clinical Director", "CLINICAL_DIRECTOR", "DemoDirector123!")
        ]

        for sid, hid, name, empid, email, phone, dept, desig, role_id, pwd in staff_data:
            existing_staff = db.query(Staff).filter_by(staff_id=sid, hospital_id=hid).first()
            if not existing_staff:
                new_staff = Staff(
                    staff_id=sid,
                    hospital_id=hid,
                    full_name=name,
                    employee_id=empid,
                    official_email=email,
                    phone_number=phone,
                    department=dept,
                    designation=desig,
                    professional_registration_number="LIC-12345" if role_id != "HOSPITAL_ADMINISTRATOR" else None,
                    years_of_experience=10 if role_id != "HOSPITAL_ADMINISTRATOR" else None,
                    role_id=role_id,
                    password_hash=get_hash(pwd),
                    status="ACTIVE"
                )
                db.add(new_staff)
        db.commit()

        # 6. Seed Demo Patient
        demo_patient = db.query(Patient).filter_by(patient_id="PT-DEMO-001").first()
        if not demo_patient:
            demo_patient = Patient(
                patient_id="PT-DEMO-001",
                hospital_id="DEMO001",
                first_name="John",
                last_name="Doe",
                date_of_birth=datetime.date(1980, 1, 1),
                gender="Male",
                age=46.0,
                known_allergies="Penicillin"
            )
            db.add(demo_patient)
            db.commit()

        # 7. Seed Demo Encounter
        demo_encounter = db.query(Encounter).filter_by(encounter_id="ENC-DEMO-001").first()
        if not demo_encounter:
            demo_encounter = Encounter(
                encounter_id="ENC-DEMO-001",
                patient_id="PT-DEMO-001",
                hospital_id="DEMO001",
                status="WAITING_FOR_TRIAGE"
            )
            db.add(demo_encounter)
            db.commit()

        # Seed longitudinal observations for ENC-DEMO-001
        db_enc = db.query(Encounter).filter_by(encounter_id="ENC-DEMO-001").first()
        if db_enc:
            existing_vitals = db.query(VitalSigns).filter_by(encounter_id=db_enc.id).first()
            if not existing_vitals:
                now = datetime.datetime.utcnow()
                t1 = datetime.datetime(now.year, now.month, now.day, 10, 40)
                t2 = datetime.datetime(now.year, now.month, now.day, 10, 55)
                t3 = datetime.datetime(now.year, now.month, now.day, 11, 10)
                
                v1 = VitalSigns(
                    encounter_id=db_enc.id,
                    hospital_id="DEMO001",
                    recorded_by="NUR001",
                    recorded_at=t1,
                    heart_rate=98,
                    spo2=96,
                    respiratory_rate=18,
                    temperature=37.1,
                    systolic_bp=130,
                    diastolic_bp=85,
                    oxygen_support="None",
                    source="MONITOR",
                    blood_glucose=110.0,
                    gcs=15,
                    pain_score=4
                )
                v2 = VitalSigns(
                    encounter_id=db_enc.id,
                    hospital_id="DEMO001",
                    recorded_by="NUR001",
                    recorded_at=t2,
                    heart_rate=108,
                    spo2=93,
                    respiratory_rate=22,
                    temperature=37.5,
                    systolic_bp=138,
                    diastolic_bp=88,
                    oxygen_support="None",
                    source="MONITOR",
                    blood_glucose=115.0,
                    gcs=15,
                    pain_score=5
                )
                v3 = VitalSigns(
                    encounter_id=db_enc.id,
                    hospital_id="DEMO001",
                    recorded_by="NUR001",
                    recorded_at=t3,
                    heart_rate=121,
                    spo2=89,
                    respiratory_rate=28,
                    temperature=38.2,
                    systolic_bp=145,
                    diastolic_bp=92,
                    oxygen_support="Nasal Cannula",
                    oxygen_flow_rate=2.0,
                    source="MONITOR",
                    blood_glucose=120.0,
                    gcs=14,
                    pain_score=6
                )
                db.add(v1)
                db.add(v2)
                db.add(v3)
                db.commit()

    finally:
        db.close()
