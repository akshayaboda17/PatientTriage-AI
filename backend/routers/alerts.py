from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from models import (
    EDEncounter, ClinicalObservation, ClinicalAlert,
    AlertStatusEnum, AlertSeverityEnum, Staff
)
from schemas.alert_schemas import AlertResolutionInput, AlertDismissalInput
from services.alert_service import AlertService
from services.deterioration_detector import DeteriorationDetector
from services.background_monitor import BackgroundMonitorService
from services.rbac import get_db, require_permission, verify_hospital_access

router = APIRouter(tags=["Clinical Alerts & Deterioration"])
deterioration_detector = DeteriorationDetector()
monitor_service = BackgroundMonitorService()

@router.post("/api/encounters/{encounter_id}/deterioration/check")
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

@router.get("/api/alerts")
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

@router.get("/api/alerts/{alert_id}")
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

@router.post("/api/alerts/{alert_id}/acknowledge")
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

@router.post("/api/alerts/{alert_id}/resolve")
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

@router.post("/api/alerts/{alert_id}/dismiss")
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

@router.post("/api/monitoring/run")
def run_background_monitoring(
    staff: Staff = Depends(require_permission("alert:view")),
    db: Session = Depends(get_db)
):
    """
    Triggers asynchronous monitoring check across all active ED encounters in the current hospital.
    """
    results = monitor_service.evaluate_active_encounters(db=db, hospital_id=staff.hospital_id)
    return {"status": "success", "monitoring_summary": results}
