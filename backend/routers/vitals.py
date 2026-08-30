import datetime
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from sqlalchemy.orm import Session

from models import (
    EDEncounter, ClinicalObservation, Staff,
    ActorTypeEnum, AuditResultEnum
)
from schemas.vital_schemas import VitalSignInput, ObservationCorrectionRequest
from services.audit_service import AuditService
from services.deterioration_detector import DeteriorationDetector
from services.alert_service import AlertService
from services.rbac import get_db, require_permission

router = APIRouter(tags=["Vital Signs & Observations"])
deterioration_detector = DeteriorationDetector()

@router.post("/api/encounters/{encounter_id}/vitals")
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

@router.put("/api/encounters/{encounter_id}/observations/{observation_id}")
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

    return {"message": "Observation corrected.", "observation": obs.to_dict()}
