import datetime
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from models import (
    EDEncounter, EncounterStatusEnum, Patient, ClinicalObservation,
    TriageAssessment, AIRiskAssessment, AIExplanation, ClinicalAlert,
    AlertStatusEnum, PhysicianAssessment, AIAgreementEnum, Staff,
    ActorTypeEnum, AuditResultEnum
)
from schemas.encounter_schemas import EncounterCreateRequest, EncounterStatusUpdateRequest
from services.audit_service import AuditService
from services.rbac import get_db, require_permission

router = APIRouter(prefix="/api/encounters", tags=["Encounters & Queue"])

@router.get("")
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

@router.post("")
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

@router.get("/{encounter_id}")
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

@router.put("/{encounter_id}/status")
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

@router.get("/{encounter_id}/clinical-review")
def get_clinical_review(
    encounter_id: str,
    staff: Staff = Depends(require_permission("clinical_decision:view")),
    db: Session = Depends(get_db)
):
    """
    Dedicated endpoint for the Physician Clinical Review Workspace, consolidating all clinical inputs.
    """
    return get_encounter_details(encounter_id, staff, db)
