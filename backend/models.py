from sqlalchemy import Column, Integer, String, Float, Boolean, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

Base = declarative_base()

class Patient(Base):
    __tablename__ = 'patients'

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(String, unique=True, index=True) # e.g., TEMP-4587
    age = Column(Float, nullable=True)
    gender = Column(String, nullable=True)
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
Base.metadata.create_all(bind=engine)
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