from sqlalchemy import Column, Integer, String, Float, Boolean, Date, create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker

Base = declarative_base()

class Patient(Base):
    __tablename__ = 'patients'

    id = Column(Integer, primary_key=True, index=True)
    # A human-readable medical-record number. Existing triage data can continue
    # to use this field while the integer id is used by the patient API.
    patient_id = Column(String, unique=True, index=True, nullable=True) # e.g., PT-000001
    first_name = Column(String(100), nullable=False, default="")
    last_name = Column(String(100), nullable=False, default="")
    date_of_birth = Column(Date, nullable=True)
    gender = Column(String(50), nullable=True)
    contact_info = Column(String(255), nullable=True)
    emergency_contact = Column(String(255), nullable=True)
    known_allergies = Column(String, nullable=True)

    # Fields retained from the initial triage prototype.
    age = Column(Float, nullable=True)
    arrival_mode = Column(String)
    
    # Vitals
    hr = Column(Integer)
    sbp = Column(Integer)
    dbp = Column(Integer)
    rr = Column(Integer)
    spo2 = Column(Integer)
    temp = Column(Float)
    gcs = Column(Integer)
    pain_score = Column(Integer)
    history_available = Column(Boolean, default=False)
    
    # Engine Outputs (To be filled in Phase 2 & 3)
    triage_level = Column(Integer, nullable=True)
    override_reason = Column(String, nullable=True)

# Setup SQLite Database for the prototype
engine = create_engine("sqlite:///./triage_database.db", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
import datetime
import enum
from typing import Optional
from sqlalchemy import String, DateTime, Integer, Enum, Column, Text, JSON
# If Base is defined in models.py, it will use that automatically.

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

class TriageAuditLog(Base):
    __tablename__ = "triage_audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(String(50), nullable=False, index=True)
    staff_id = Column(String(50), nullable=False, index=True)
    timestamp = Column(DateTime(timezone=True), default=datetime.datetime.utcnow, nullable=False)
    
    ai_suggested_level = Column(Integer, nullable=False)
    ai_confidence_score = Column(Float, nullable=False)
    clinician_assigned_level = Column(Integer, nullable=False)
    
    action_type = Column(Enum(ActionTypeEnum), nullable=False)
    override_reason = Column(Enum(OverrideReasonEnum), nullable=True)
    clinical_notes = Column(Text, nullable=True)
    top_3_drivers = Column(JSON, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "patient_id": self.patient_id,
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


# This prototype already has a SQLite database in use.  Add the registration
# columns when opening an older database instead of requiring a destructive reset.
Base.metadata.create_all(bind=engine)
with engine.begin() as connection:
    existing_columns = {
        row[1] for row in connection.execute(text("PRAGMA table_info(patients)"))
    }
    patient_column_migrations = {
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
