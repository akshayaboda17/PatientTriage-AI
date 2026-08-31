import datetime
import enum
from typing import Optional, List, Dict, Any
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, Enum, 
    ForeignKey, Text, JSON, Index, create_engine
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship

Base = declarative_base()

# ==========================================
# Enums
# ==========================================

class StaffRoleEnum(str, enum.Enum):
    HOSPITAL_ADMIN = "HOSPITAL_ADMIN"
    EMERGENCY_PHYSICIAN = "EMERGENCY_PHYSICIAN"
    TRIAGE_NURSE = "TRIAGE_NURSE"
    STAFF_NURSE = "STAFF_NURSE"
    EMERGENCY_TECHNICIAN = "EMERGENCY_TECHNICIAN"
    CLINICAL_DIRECTOR = "CLINICAL_DIRECTOR"

class EncounterStatusEnum(str, enum.Enum):
    WAITING = "WAITING"
    IN_TRIAGE = "IN_TRIAGE"
    IN_TREATMENT = "IN_TREATMENT"
    ADMITTED = "ADMITTED"
    DISCHARGED = "DISCHARGED"
    TRANSFERRED = "TRANSFERRED"

class AlertSeverityEnum(str, enum.Enum):
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MODERATE = "MODERATE"
    INFORMATIONAL = "INFORMATIONAL"

class AlertStatusEnum(str, enum.Enum):
    UNACKNOWLEDGED = "UNACKNOWLEDGED"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    RESOLVED = "RESOLVED"
    DISMISSED = "DISMISSED"

class DetectionSourceEnum(str, enum.Enum):
    RULE_BASED = "RULE_BASED"
    ML_BASED = "ML_BASED"
    COMBINED = "COMBINED"

class AIRiskCategoryEnum(str, enum.Enum):
    LOW = "LOW"
    MODERATE = "MODERATE"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"

class ActionTypeEnum(str, enum.Enum):
    ACCEPTED = "ACCEPTED"
    OVERRIDDEN = "OVERRIDDEN"
    AUTO_ESCALATED = "AUTO_ESCALATED"

class OverrideReasonEnum(str, enum.Enum):
    CLINICAL_INTUITION = "Clinical Intuition / Gestalt"
    ACTIVE_HEMORRHAGE = "Uncontrolled / Active Hemorrhage"
    HIGH_RISK_MECHANISM = "High-Risk Mechanism of Injury"
    VISUAL_DISTRESS = "Obvious Acute Visual Distress"
    UNVERIFIED_EHR_CORRECTION = "EHR / History Discrepancy"
    OTHER = "Other (Mandatory Detailed Note)"

class AIAgreementEnum(str, enum.Enum):
    AGREED = "AGREED"
    OVERRIDDEN = "OVERRIDDEN"

class ClinicalDecisionEnum(str, enum.Enum):
    CONTINUE_EVALUATION = "CONTINUE_EVALUATION"
    ESCALATE_CARE = "ESCALATE_CARE"
    ADMIT_INPATIENT = "ADMIT_INPATIENT"
    DISCHARGE_HOME = "DISCHARGE_HOME"
    TRANSFER_FACILITY = "TRANSFER_FACILITY"
    OBSERVATION_UNIT = "OBSERVATION_UNIT"
    OTHER = "OTHER"

class OverrideReasonCategoryEnum(str, enum.Enum):
    CLINICAL_CONTEXT_NOT_IN_MODEL = "Clinical context not represented in model input"
    PHYSICAL_EXAM_FINDINGS = "Physical examination findings"
    RECENT_INTERVENTION = "Recent clinical treatment / intervention response"
    DIAGNOSTIC_RESULTS = "Point-of-care diagnostics / lab discrepancy"
    CLINICAL_INTUITION_GESTALT = "Clinical intuition & Gestalt assessment"
    OTHER = "Other (Mandatory Detailed Clinical Note)"

# ==========================================
# Task 11: Audit Trail Enums
# ==========================================

class ActorTypeEnum(str, enum.Enum):
    HUMAN = "HUMAN"
    SYSTEM = "SYSTEM"
    AI_SYSTEM = "AI_SYSTEM"

class AuditResultEnum(str, enum.Enum):
    SUCCESS = "SUCCESS"
    FAILURE = "FAILURE"
    DENIED = "DENIED"

# ==========================================
# Core Hospital & Staff (Tenant & RBAC)
# ==========================================

class Hospital(Base):
    __tablename__ = 'hospitals'

    id = Column(Integer, primary_key=True, autoincrement=True)
    hospital_code = Column(String(50), unique=True, nullable=False, index=True) # e.g. DEMO001
    name = Column(String(200), nullable=False)
    address = Column(String(300), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    staff_members = relationship("Staff", back_populates="hospital", cascade="all, delete-orphan")
    patients = relationship("Patient", back_populates="hospital", cascade="all, delete-orphan")
    encounters = relationship("EDEncounter", back_populates="hospital", cascade="all, delete-orphan")
    alerts = relationship("ClinicalAlert", back_populates="hospital", cascade="all, delete-orphan")
    physician_assessments = relationship("PhysicianAssessment", back_populates="hospital", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "hospital_code": self.hospital_code,
            "name": self.name,
            "address": self.address,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }

class Staff(Base):
    __tablename__ = 'staff'

    id = Column(Integer, primary_key=True, autoincrement=True)
    hospital_id = Column(String(50), ForeignKey('hospitals.hospital_code'), nullable=False, index=True)
    staff_id = Column(String(50), unique=True, nullable=False, index=True) # e.g. DOC001, NUR001
    name = Column(String(150), nullable=False)
    email = Column(String(150), nullable=False)
    role = Column(Enum(StaffRoleEnum), nullable=False)
    password_hash = Column(String(200), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    hospital = relationship("Hospital", back_populates="staff_members")

    def to_dict(self):
        return {
            "id": self.id,
            "hospital_id": self.hospital_id,
            "staff_id": self.staff_id,
            "name": self.name,
            "email": self.email,
            "role": self.role.value,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }

# ==========================================
# Clinical Entities: Patient & ED Encounter
# ==========================================

class Patient(Base):
    __tablename__ = 'patients'

    id = Column(Integer, primary_key=True, autoincrement=True)
    hospital_id = Column(String(50), ForeignKey('hospitals.hospital_code'), nullable=False, index=True)
    patient_id = Column(String(50), unique=True, nullable=False, index=True) # e.g. PT-DEMO-001
    mrn = Column(String(50), nullable=True)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    age = Column(Float, nullable=False)
    gender = Column(String(20), nullable=False)
    phone = Column(String(50), nullable=True)
    allergies = Column(Text, nullable=True)
    medical_history = Column(Text, nullable=True)
    arrival_mode = Column(String(50), nullable=True) # Walk-in, Ambulance, Helicopter
    created_by = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    # Legacy fields preserved for backward compatibility
    hr = Column(Integer, nullable=True)
    sbp = Column(Integer, nullable=True)
    dbp = Column(Integer, nullable=True)
    rr = Column(Integer, nullable=True)
    spo2 = Column(Integer, nullable=True)
    temp = Column(Float, nullable=True)
    gcs = Column(Integer, nullable=True)
    pain_score = Column(Integer, nullable=True)
    history_available = Column(Boolean, default=False)
    triage_level = Column(Integer, nullable=True)
    override_reason = Column(String, nullable=True)

    hospital = relationship("Hospital", back_populates="patients")
    encounters = relationship("EDEncounter", back_populates="patient", cascade="all, delete-orphan")
    alerts = relationship("ClinicalAlert", back_populates="patient", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "hospital_id": self.hospital_id,
            "patient_id": self.patient_id,
            "mrn": self.mrn,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "full_name": f"{self.first_name} {self.last_name}",
            "age": self.age,
            "gender": self.gender,
            "phone": self.phone,
            "allergies": self.allergies,
            "medical_history": self.medical_history,
            "arrival_mode": self.arrival_mode,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }

class EDEncounter(Base):
    __tablename__ = 'ed_encounters'

    id = Column(Integer, primary_key=True, autoincrement=True)
    hospital_id = Column(String(50), ForeignKey('hospitals.hospital_code'), nullable=False, index=True)
    patient_id = Column(String(50), ForeignKey('patients.patient_id'), nullable=False, index=True)
    encounter_id = Column(String(50), unique=True, nullable=False, index=True) # e.g. ENC-DEMO-001
    
    arrival_time = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    arrival_mode = Column(String(50), default="Walk-in")
    chief_complaint = Column(String(255), nullable=False)
    status = Column(Enum(EncounterStatusEnum), default=EncounterStatusEnum.WAITING, nullable=False, index=True)
    
    assigned_nurse_id = Column(String(50), nullable=True)
    assigned_doctor_id = Column(String(50), nullable=True)
    bed_number = Column(String(30), nullable=True)
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    hospital = relationship("Hospital", back_populates="encounters")
    patient = relationship("Patient", back_populates="encounters")
    observations = relationship("ClinicalObservation", back_populates="encounter", cascade="all, delete-orphan", order_by="ClinicalObservation.timestamp.asc()")
    triage_assessments = relationship("TriageAssessment", back_populates="encounter", cascade="all, delete-orphan")
    ai_risk_assessments = relationship("AIRiskAssessment", back_populates="encounter", cascade="all, delete-orphan")
    alerts = relationship("ClinicalAlert", back_populates="encounter", cascade="all, delete-orphan")
    physician_assessments = relationship("PhysicianAssessment", back_populates="encounter", cascade="all, delete-orphan", order_by="PhysicianAssessment.created_at.desc()")
    ground_truth_outcome = relationship("ClinicalGroundTruthOutcome", back_populates="encounter", uselist=False, cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "hospital_id": self.hospital_id,
            "patient_id": self.patient_id,
            "encounter_id": self.encounter_id,
            "arrival_time": self.arrival_time.isoformat() if self.arrival_time else None,
            "arrival_mode": self.arrival_mode,
            "chief_complaint": self.chief_complaint,
            "status": self.status.value,
            "assigned_nurse_id": self.assigned_nurse_id,
            "assigned_doctor_id": self.assigned_doctor_id,
            "bed_number": self.bed_number,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }

# ==========================================
# Clinical Intake & Longitudinal Observations
# ==========================================

class TriageAssessment(Base):
    __tablename__ = 'triage_assessments'

    id = Column(Integer, primary_key=True, autoincrement=True)
    hospital_id = Column(String(50), nullable=False, index=True)
    patient_id = Column(String(50), nullable=False, index=True)
    encounter_id = Column(String(50), ForeignKey('ed_encounters.encounter_id'), nullable=False, index=True)
    
    triage_level = Column(Integer, nullable=False) # 1 (Resuscitation) to 5 (Non-urgent) ESI
    acuity_category = Column(String(50), nullable=False) # Immediate, Emergent, Urgent, Semi-urgent, Non-urgent
    chief_complaint = Column(String(255), nullable=True)
    pain_score = Column(Integer, nullable=True)
    mobility = Column(String(50), nullable=True) # Ambulatory, Wheelchair, Stretcher
    assessed_by = Column(String(50), nullable=False)
    assessed_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    notes = Column(Text, nullable=True)

    encounter = relationship("EDEncounter", back_populates="triage_assessments")

    def to_dict(self):
        return {
            "id": self.id,
            "hospital_id": self.hospital_id,
            "patient_id": self.patient_id,
            "encounter_id": self.encounter_id,
            "triage_level": self.triage_level,
            "acuity_category": self.acuity_category,
            "chief_complaint": self.chief_complaint,
            "pain_score": self.pain_score,
            "mobility": self.mobility,
            "assessed_by": self.assessed_by,
            "assessed_at": self.assessed_at.isoformat() if self.assessed_at else None,
            "notes": self.notes
        }

class ClinicalObservation(Base):
    __tablename__ = 'clinical_observations'

    id = Column(Integer, primary_key=True, autoincrement=True)
    hospital_id = Column(String(50), nullable=False, index=True)
    patient_id = Column(String(50), nullable=False, index=True)
    encounter_id = Column(String(50), ForeignKey('ed_encounters.encounter_id'), nullable=False, index=True)
    
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, nullable=False, index=True)
    hr = Column(Integer, nullable=False)          # Heart Rate (bpm)
    sbp = Column(Integer, nullable=False)         # Systolic BP (mmHg)
    dbp = Column(Integer, nullable=True)          # Diastolic BP (mmHg)
    rr = Column(Integer, nullable=False)          # Respiratory Rate (breaths/min)
    spo2 = Column(Integer, nullable=False)        # SpO2 Oxygen Saturation (%)
    temp = Column(Float, nullable=True)           # Body Temp (Celsius)
    gcs = Column(Integer, nullable=True) # Glasgow Coma Scale (3-15)
    pain_score = Column(Integer, nullable=True) # Pain (0-10)
    
    recorded_by = Column(String(50), nullable=False) # Staff ID
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    # Observation Correction Traceability (Task 11)
    is_corrected = Column(Boolean, default=False, nullable=False)
    correction_reason = Column(String(255), nullable=True)
    corrected_by = Column(String(50), nullable=True)
    corrected_at = Column(DateTime, nullable=True)
    original_values_json = Column(JSON, nullable=True)

    encounter = relationship("EDEncounter", back_populates="observations")

    # Composite index for fast longitudinal trend queries
    __table_args__ = (
        Index('idx_encounter_timestamp', 'encounter_id', 'timestamp'),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "hospital_id": self.hospital_id,
            "patient_id": self.patient_id,
            "encounter_id": self.encounter_id,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "hr": self.hr,
            "sbp": self.sbp,
            "dbp": self.dbp,
            "rr": self.rr,
            "spo2": self.spo2,
            "temp": self.temp,
            "gcs": self.gcs,
            "pain_score": self.pain_score,
            "recorded_by": self.recorded_by,
            "notes": self.notes,
            "is_corrected": self.is_corrected,
            "correction_reason": self.correction_reason,
            "corrected_by": self.corrected_by,
            "corrected_at": self.corrected_at.isoformat() if self.corrected_at else None,
            "original_values": self.original_values_json
        }

# ==========================================
# Task 7 & 8: AI Risk Assessment & Explainability
# ==========================================

class AIRiskAssessment(Base):
    __tablename__ = 'ai_risk_assessments'

    id = Column(Integer, primary_key=True, autoincrement=True)
    assessment_id = Column(String(100), unique=True, nullable=True, index=True) # e.g. AI-ENC-100-01
    hospital_id = Column(String(50), nullable=False, index=True)
    patient_id = Column(String(50), nullable=False, index=True)
    encounter_id = Column(String(50), ForeignKey('ed_encounters.encounter_id'), nullable=False, index=True)
    observation_id = Column(Integer, ForeignKey('clinical_observations.id'), nullable=True)
    
    risk_score = Column(Float, nullable=False) # 0.0 - 100.0
    risk_probability = Column(Float, nullable=True) # 0.0 - 1.0
    risk_category = Column(Enum(AIRiskCategoryEnum), nullable=False)
    predicted_triage_level = Column(Integer, nullable=False)
    confidence_score = Column(Float, nullable=False)
    shock_index = Column(Float, nullable=True)
    qsofa = Column(Integer, nullable=True)
    mews = Column(Integer, nullable=True)
    model_name = Column(String(100), default="PatientTriage Decompensation Risk Classifier", nullable=True)
    model_version = Column(String(50), default="1.0", nullable=False)
    input_features_json = Column(JSON, nullable=True)
    assessed_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    encounter = relationship("EDEncounter", back_populates="ai_risk_assessments")
    explanation = relationship("AIExplanation", back_populates="risk_assessment", uselist=False, cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "assessment_id": self.assessment_id,
            "hospital_id": self.hospital_id,
            "patient_id": self.patient_id,
            "encounter_id": self.encounter_id,
            "risk_score": self.risk_score,
            "risk_probability": self.risk_probability,
            "risk_category": self.risk_category.value,
            "predicted_triage_level": self.predicted_triage_level,
            "confidence_score": self.confidence_score,
            "shock_index": self.shock_index,
            "qsofa": self.qsofa,
            "mews": self.mews,
            "model_name": self.model_name,
            "model_version": self.model_version,
            "input_features": self.input_features_json,
            "assessed_at": self.assessed_at.isoformat() if self.assessed_at else None
        }

class AIExplanation(Base):
    __tablename__ = 'ai_explanations'

    id = Column(Integer, primary_key=True, autoincrement=True)
    hospital_id = Column(String(50), nullable=False, index=True)
    patient_id = Column(String(50), nullable=False, index=True)
    encounter_id = Column(String(50), nullable=False, index=True)
    risk_assessment_id = Column(Integer, ForeignKey('ai_risk_assessments.id'), nullable=False)
    
    explanation_method = Column(String(50), default="SHAP (TreeExplainer)", nullable=False)
    top_features = Column(JSON, nullable=False) # list of {feature, importance, impact, value}
    summary = Column(Text, nullable=False)
    generated_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    risk_assessment = relationship("AIRiskAssessment", back_populates="explanation")

    def to_dict(self):
        return {
            "id": self.id,
            "risk_assessment_id": self.risk_assessment_id,
            "explanation_method": self.explanation_method,
            "top_features": self.top_features,
            "summary": self.summary,
            "generated_at": self.generated_at.isoformat() if self.generated_at else None
        }

# ==========================================
# Task 9: Clinical Alert & Deterioration Model
# ==========================================

class ClinicalAlert(Base):
    __tablename__ = 'clinical_alerts'

    id = Column(Integer, primary_key=True, autoincrement=True)
    alert_id = Column(String(50), unique=True, nullable=False, index=True) # e.g. ALERT-8921
    hospital_id = Column(String(50), ForeignKey('hospitals.hospital_code'), nullable=False, index=True)
    patient_id = Column(String(50), ForeignKey('patients.patient_id'), nullable=False, index=True)
    encounter_id = Column(String(50), ForeignKey('ed_encounters.encounter_id'), nullable=False, index=True)
    
    alert_type = Column(String(100), default="POTENTIAL_DETERIORATION", nullable=False, index=True)
    severity = Column(Enum(AlertSeverityEnum), nullable=False, index=True)
    status = Column(Enum(AlertStatusEnum), default=AlertStatusEnum.UNACKNOWLEDGED, nullable=False, index=True)
    
    detected_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False, index=True)
    
    # Acknowledgment Tracking
    acknowledged_at = Column(DateTime, nullable=True)
    acknowledged_by_id = Column(String(50), nullable=True)
    acknowledged_by_name = Column(String(150), nullable=True)
    acknowledged_by_role = Column(String(50), nullable=True)
    
    # Resolution Tracking
    resolved_at = Column(DateTime, nullable=True)
    resolved_by_id = Column(String(50), nullable=True)
    resolved_by_name = Column(String(150), nullable=True)
    resolved_by_role = Column(String(50), nullable=True)
    resolution_reason = Column(Text, nullable=True)
    
    # Dismissal Tracking
    dismissed_at = Column(DateTime, nullable=True)
    dismissed_by_id = Column(String(50), nullable=True)
    dismissed_by_name = Column(String(150), nullable=True)
    dismissed_by_role = Column(String(50), nullable=True)
    dismissal_reason = Column(Text, nullable=True)
    
    # Detection Metadata & Evidence
    detection_source = Column(Enum(DetectionSourceEnum), default=DetectionSourceEnum.RULE_BASED, nullable=False)
    detection_rule_id = Column(String(100), nullable=False) # e.g. RULE-DET-COMPOSITE-01
    detection_version = Column(String(50), default="1.0", nullable=False)
    
    summary = Column(Text, nullable=False)
    evidence = Column(JSON, nullable=False) # Structured array of signals: feature, prev, curr, change, rate, unit
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    hospital = relationship("Hospital", back_populates="alerts")
    patient = relationship("Patient", back_populates="alerts")
    encounter = relationship("EDEncounter", back_populates="alerts")

    # Efficient querying indexes
    __table_args__ = (
        Index('idx_alert_hosp_status', 'hospital_id', 'status'),
        Index('idx_alert_enc_status', 'encounter_id', 'status'),
        Index('idx_alert_hosp_severity', 'hospital_id', 'severity'),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "alert_id": self.alert_id,
            "hospital_id": self.hospital_id,
            "patient_id": self.patient_id,
            "encounter_id": self.encounter_id,
            "alert_type": self.alert_type,
            "severity": self.severity.value,
            "status": self.status.value,
            "detected_at": self.detected_at.isoformat() if self.detected_at else None,
            "acknowledged_at": self.acknowledged_at.isoformat() if self.acknowledged_at else None,
            "acknowledged_by_id": self.acknowledged_by_id,
            "acknowledged_by_name": self.acknowledged_by_name,
            "acknowledged_by_role": self.acknowledged_by_role,
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
            "resolved_by_id": self.resolved_by_id,
            "resolved_by_name": self.resolved_by_name,
            "resolved_by_role": self.resolved_by_role,
            "resolution_reason": self.resolution_reason,
            "dismissed_at": self.dismissed_at.isoformat() if self.dismissed_at else None,
            "dismissed_by_id": self.dismissed_by_id,
            "dismissed_by_name": self.dismissed_by_name,
            "dismissed_by_role": self.dismissed_by_role,
            "dismissal_reason": self.dismissal_reason,
            "detection_source": self.detection_source.value,
            "detection_rule_id": self.detection_rule_id,
            "detection_version": self.detection_version,
            "summary": self.summary,
            "evidence": self.evidence,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }

# ==========================================
# Task 10: Physician Review & Clinical Decision (Human-in-the-Loop)
# ==========================================

class PhysicianAssessment(Base):
    __tablename__ = 'physician_assessments'

    id = Column(Integer, primary_key=True, autoincrement=True)
    assessment_id = Column(String(100), unique=True, nullable=False, index=True) # e.g. PA-ENC-DEMO-001-xxxx
    hospital_id = Column(String(50), ForeignKey('hospitals.hospital_code'), nullable=False, index=True)
    encounter_id = Column(String(50), ForeignKey('ed_encounters.encounter_id'), nullable=False, index=True)
    patient_id = Column(String(50), ForeignKey('patients.patient_id'), nullable=False, index=True)
    
    physician_id = Column(String(50), ForeignKey('staff.staff_id'), nullable=False, index=True)
    physician_name = Column(String(150), nullable=False)
    physician_role = Column(String(50), nullable=False)
    
    # Reference to original AI assessment at time of review (preserved immutably)
    ai_assessment_id = Column(String(100), nullable=True)
    ai_risk_category_at_review = Column(String(50), nullable=True)
    ai_risk_score_at_review = Column(Float, nullable=True)
    
    # Physician evaluation
    clinical_assessment = Column(Text, nullable=True) # Clinician interpretation
    ai_agreement = Column(Enum(AIAgreementEnum), default=AIAgreementEnum.AGREED, nullable=False)
    clinician_assigned_risk = Column(String(50), nullable=True) # e.g. LOW, MODERATE, HIGH, CRITICAL
    override_reason = Column(String(255), nullable=True) # Mandatory when OVERRIDDEN
    clinical_notes = Column(Text, nullable=True)
    
    # Structured clinical decision (what happens next)
    clinical_decision = Column(Enum(ClinicalDecisionEnum), default=ClinicalDecisionEnum.CONTINUE_EVALUATION, nullable=False)
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False, index=True)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    __table_args__ = (
        Index('idx_phys_assess_hosp_enc', 'hospital_id', 'encounter_id'),
        Index('idx_phys_assess_enc_time', 'encounter_id', 'created_at'),
    )

    hospital = relationship("Hospital", back_populates="physician_assessments")
    encounter = relationship("EDEncounter", back_populates="physician_assessments")

    def to_dict(self):
        return {
            "id": self.id,
            "assessment_id": self.assessment_id,
            "hospital_id": self.hospital_id,
            "encounter_id": self.encounter_id,
            "patient_id": self.patient_id,
            "physician_id": self.physician_id,
            "physician_name": self.physician_name,
            "physician_role": self.physician_role,
            "ai_assessment_id": self.ai_assessment_id,
            "ai_risk_category_at_review": self.ai_risk_category_at_review,
            "ai_risk_score_at_review": self.ai_risk_score_at_review,
            "clinical_assessment": self.clinical_assessment,
            "ai_agreement": self.ai_agreement.value if hasattr(self.ai_agreement, 'value') else self.ai_agreement,
            "clinician_assigned_risk": self.clinician_assigned_risk,
            "override_reason": self.override_reason,
            "clinical_notes": self.clinical_notes,
            "clinical_decision": self.clinical_decision.value if hasattr(self.clinical_decision, 'value') else self.clinical_decision,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }

# ==========================================
# Audit Trail (Tamper-Resistant Log)
# ==========================================

class AuditLog(Base):
    __tablename__ = 'audit_logs'

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_id = Column(String(100), unique=True, nullable=False, index=True) # e.g. AUD-2026-000001
    hospital_id = Column(String(50), nullable=False, index=True)
    
    # Actor details
    staff_id = Column(String(50), nullable=False, index=True) # actor_id
    staff_name = Column(String(150), nullable=True)           # actor_name
    role = Column(String(50), nullable=False, index=True)      # actor_role
    actor_type = Column(Enum(ActorTypeEnum), default=ActorTypeEnum.HUMAN, nullable=False, index=True)

    # Action & Target Entity
    action = Column(String(100), nullable=False, index=True) # e.g. PATIENT_CREATED, AI_OVERRIDE_RECORDED
    entity_type = Column(String(50), nullable=False, index=True) # e.g. PATIENT, ENCOUNTER, AI_ASSESSMENT
    entity_id = Column(String(100), nullable=False, index=True)
    
    # Clinical Context References
    patient_id = Column(String(50), nullable=True, index=True)
    encounter_id = Column(String(50), nullable=True, index=True)

    # Event Result & Timestamp
    result = Column(Enum(AuditResultEnum), default=AuditResultEnum.SUCCESS, nullable=False, index=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, nullable=False, index=True)
    
    # Safe structured metadata (no raw PHI, no passwords, no tokens)
    metadata_json = Column(JSON, nullable=True)

    __table_args__ = (
        Index('idx_audit_hosp_time', 'hospital_id', 'timestamp'),
        Index('idx_audit_hosp_action', 'hospital_id', 'action'),
        Index('idx_audit_hosp_enc', 'hospital_id', 'encounter_id'),
        Index('idx_audit_hosp_actor', 'hospital_id', 'staff_id'),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "event_id": self.event_id,
            "hospital_id": self.hospital_id,
            "actor_id": self.staff_id,
            "actor_name": self.staff_name or self.staff_id,
            "actor_role": self.role,
            "actor_type": self.actor_type.value if hasattr(self.actor_type, 'value') else self.actor_type,
            "action": self.action,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "patient_id": self.patient_id,
            "encounter_id": self.encounter_id,
            "result": self.result.value if hasattr(self.result, 'value') else self.result,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "metadata": self.metadata_json,
            # Backward compatibility aliases
            "staff_id": self.staff_id,
            "staff_name": self.staff_name,
            "role": self.role
        }

# Legacy TriageAuditLog model preserved for backward compatibility
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
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "ai_suggested_level": self.ai_suggested_level,
            "ai_confidence_score": self.ai_confidence_score,
            "clinician_assigned_level": self.clinician_assigned_level,
            "action_type": self.action_type.value if hasattr(self.action_type, 'value') else self.action_type,
            "override_reason": self.override_reason.value if self.override_reason and hasattr(self.override_reason, 'value') else self.override_reason,
            "clinical_notes": self.clinical_notes,
            "top_3_drivers": self.top_3_drivers
        }

# ==========================================
# MLOps, Model Registry & Continuous Learning
# ==========================================

class MLModelStatusEnum(enum.Enum):
    CANDIDATE = "CANDIDATE"
    VALIDATING = "VALIDATING"
    APPROVED = "APPROVED"
    PRODUCTION = "PRODUCTION"
    REJECTED = "REJECTED"
    RETIRED = "RETIRED"

class MLModelRegistry(Base):
    __tablename__ = "ml_model_registry"

    id = Column(Integer, primary_key=True, autoincrement=True)
    model_name = Column(String(100), nullable=False)
    model_version = Column(String(50), unique=True, nullable=False, index=True)
    model_type = Column(String(100), nullable=False)
    feature_schema_version = Column(String(50), default="1.0", nullable=False)
    dataset_version = Column(String(50), nullable=False)
    status = Column(Enum(MLModelStatusEnum), default=MLModelStatusEnum.CANDIDATE, nullable=False, index=True)
    
    validation_metrics_json = Column(JSON, nullable=False)
    test_metrics_json = Column(JSON, nullable=True)
    hyperparameters_json = Column(JSON, nullable=True)
    artifact_path = Column(String(255), nullable=True)
    
    trained_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    approved_by = Column(String(50), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    deployed_at = Column(DateTime, nullable=True)
    retired_at = Column(DateTime, nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "model_name": self.model_name,
            "model_version": self.model_version,
            "model_type": self.model_type,
            "feature_schema_version": self.feature_schema_version,
            "dataset_version": self.dataset_version,
            "status": self.status.value,
            "validation_metrics": self.validation_metrics_json,
            "test_metrics": self.test_metrics_json,
            "hyperparameters": self.hyperparameters_json,
            "artifact_path": self.artifact_path,
            "trained_at": self.trained_at.isoformat() if self.trained_at else None,
            "approved_by": self.approved_by,
            "approved_at": self.approved_at.isoformat() if self.approved_at else None,
            "deployed_at": self.deployed_at.isoformat() if self.deployed_at else None,
            "retired_at": self.retired_at.isoformat() if self.retired_at else None
        }

class MLDatasetRegistry(Base):
    __tablename__ = "ml_dataset_registry"

    id = Column(Integer, primary_key=True, autoincrement=True)
    dataset_version = Column(String(50), unique=True, nullable=False, index=True)
    feature_schema_version = Column(String(50), default="1.0", nullable=False)
    source_data_range = Column(String(100), nullable=False)
    
    total_encounters = Column(Integer, nullable=False)
    eligible_count = Column(Integer, nullable=False)
    excluded_count = Column(Integer, default=0, nullable=False)
    positive_count = Column(Integer, nullable=False)
    negative_count = Column(Integer, nullable=False)
    
    exclusion_reasons_json = Column(JSON, nullable=True)
    manifest_json = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "dataset_version": self.dataset_version,
            "feature_schema_version": self.feature_schema_version,
            "source_data_range": self.source_data_range,
            "total_encounters": self.total_encounters,
            "eligible_count": self.eligible_count,
            "excluded_count": self.excluded_count,
            "positive_count": self.positive_count,
            "negative_count": self.negative_count,
            "exclusion_reasons": self.exclusion_reasons_json,
            "manifest": self.manifest_json,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }

class ClinicalGroundTruthOutcome(Base):
    __tablename__ = "clinical_ground_truth_outcomes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    hospital_id = Column(String(50), nullable=False, index=True)
    patient_id = Column(String(50), nullable=False, index=True)
    encounter_id = Column(String(50), ForeignKey('ed_encounters.encounter_id'), unique=True, nullable=False, index=True)
    
    icu_admitted_24h = Column(Boolean, default=False, nullable=False)
    intubated_24h = Column(Boolean, default=False, nullable=False)
    vasopressor_24h = Column(Boolean, default=False, nullable=False)
    mortality_24h = Column(Boolean, default=False, nullable=False)
    composite_critical_outcome_24h = Column(Integer, default=0, nullable=False) # 1 or 0
    
    outcome_timestamp = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    outcome_recorded_by = Column(String(50), nullable=False)
    eligibility_status = Column(String(50), default="ELIGIBLE", nullable=False) # ELIGIBLE, EXCLUDED_MISSING_PREDICTION, etc.
    eligibility_notes = Column(Text, nullable=True)

    encounter = relationship("EDEncounter", back_populates="ground_truth_outcome")

    def to_dict(self):
        return {
            "id": self.id,
            "hospital_id": self.hospital_id,
            "patient_id": self.patient_id,
            "encounter_id": self.encounter_id,
            "icu_admitted_24h": self.icu_admitted_24h,
            "intubated_24h": self.intubated_24h,
            "vasopressor_24h": self.vasopressor_24h,
            "mortality_24h": self.mortality_24h,
            "composite_critical_outcome_24h": self.composite_critical_outcome_24h,
            "outcome_timestamp": self.outcome_timestamp.isoformat() if self.outcome_timestamp else None,
            "outcome_recorded_by": self.outcome_recorded_by,
            "eligibility_status": self.eligibility_status,
            "eligibility_notes": self.eligibility_notes
        }

class MLMonitoringLog(Base):
    __tablename__ = "ml_monitoring_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    hospital_id = Column(String(50), nullable=False, index=True)
    model_version = Column(String(50), nullable=False, index=True)
    metric_type = Column(String(50), nullable=False) # DRIFT, PERFORMANCE, LATENCY, OVERRIDE_RATE
    metric_name = Column(String(100), nullable=False)
    metric_value = Column(Float, nullable=False)
    threshold = Column(Float, nullable=True)
    status = Column(String(20), default="NORMAL", nullable=False) # NORMAL, WARNING, ALERT
    details_json = Column(JSON, nullable=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "hospital_id": self.hospital_id,
            "model_version": self.model_version,
            "metric_type": self.metric_type,
            "metric_name": self.metric_name,
            "metric_value": self.metric_value,
            "threshold": self.threshold,
            "status": self.status,
            "details": self.details_json,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None
        }

# ==========================================
# Database Connection Setup
# ==========================================

import os
db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "triage_database.db"))
engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
Base.metadata.create_all(bind=engine)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)