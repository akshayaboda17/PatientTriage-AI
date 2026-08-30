import sys
import os
import datetime
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, Depends, HTTPException, status, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import desc

# Add parent directory and ai_engine to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'ai_engine')))

from models import (
    Base, engine, SessionLocal, Hospital, Staff, StaffRoleEnum,
    Patient, EDEncounter, EncounterStatusEnum, ClinicalObservation,
    TriageAssessment, AIRiskAssessment, AIExplanation, AIRiskCategoryEnum,
    ClinicalAlert, AlertStatusEnum, AlertSeverityEnum,
    AuditLog, TriageAuditLog
)
from services.rbac import (
    get_db, get_current_staff, require_permission,
    verify_hospital_access, get_staff_permissions
)
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

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

legacy_engine = TriageEngine()
deterioration_detector = DeteriorationDetector()
monitor_service = BackgroundMonitorService()

# ==========================================
# Pydantic Schemas
# ==========================================

class LoginRequest(BaseModel):
    staff_id: str
    password: Optional[str] = "password"
    hospital_id: Optional[str] = None

class VitalSignInput(BaseModel):
    hr: int = Field(..., ge=20, le=260, description="Heart rate in bpm")
    sbp: int = Field(..., ge=30, le=300, description="Systolic blood pressure in mmHg")
    dbp: Optional[int] = Field(None, ge=20, le=200, description="Diastolic blood pressure in mmHg")
    rr: int = Field(..., ge=4, le=70, description="Respiratory rate in breaths/min")
    spo2: int = Field(..., ge=40, le=100, description="SpO2 oxygen saturation percentage")
    temp: Optional[float] = Field(37.0, ge=30.0, le=45.0, description="Temperature in Celsius")
    gcs: Optional[int] = Field(15, ge=3, le=15, description="Glasgow Coma Scale")
    pain_score: Optional[int] = Field(0, ge=0, le=10, description="Pain score 0-10")
    notes: Optional[str] = None

class AlertResolutionInput(BaseModel):
    resolution_reason: str = Field(..., min_length=3, description="Clinical reason for resolving the alert")

class AlertDismissalInput(BaseModel):
    dismissal_reason: str = Field(..., min_length=3, description="Clinical rationale for dismissing the alert")

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
def login(creds: LoginRequest, db: Session = Depends(get_db)):
    """
    Authenticates staff and returns session info with RBAC permissions and hospital affiliation.
    """
    query = db.query(Staff).filter(Staff.staff_id == creds.staff_id)
    if creds.hospital_id:
        query = query.filter(Staff.hospital_id == creds.hospital_id)
    staff = query.first()

    if not staff:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Staff identity '{creds.staff_id}' not found."
        )

    if not staff.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Staff account has been deactivated."
        )

    hospital = db.query(Hospital).filter(Hospital.hospital_code == staff.hospital_id).first()
    permissions = list(get_staff_permissions(staff.role))
    token = f"TOKEN_{staff.staff_id}_{staff.hospital_id}"

    return {
        "access_token": token,
        "token_type": "bearer",
        "staff": staff.to_dict(),
        "hospital": hospital.to_dict() if hospital else None,
        "permissions": permissions
    }

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

    timeline_sorted = sorted(timeline, key=lambda x: x['timestamp'], reverse=True)

    return {
        "encounter": enc.to_dict(),
        "patient": patient.to_dict() if patient else None,
        "observations": [o.to_dict() for o in observations],
        "triage": triage.to_dict() if triage else None,
        "ai_risk": ai_risk.to_dict() if ai_risk else None,
        "ai_explanation": ai_explanation.to_dict() if ai_explanation else None,
        "alerts": [a.to_dict() for a in alerts],
        "timeline": timeline_sorted
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
    staff: Staff = Depends(require_permission("audit:view")),
    db: Session = Depends(get_db)
):
    """
    Retrieves tamper-resistant audit logs for hospital operations.
    """
    logs = db.query(AuditLog).filter(
        AuditLog.hospital_id == staff.hospital_id
    ).order_by(AuditLog.timestamp.desc()).limit(100).all()
    return {"audit_logs": [l.to_dict() for l in logs]}

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