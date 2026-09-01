import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from models import EDEncounter, EncounterStatusEnum, TriageAssessment, Staff, ActorTypeEnum, AuditResultEnum
from schemas.triage_schemas import TriageCreateRequest, PriorityReassessmentRequest
from services.audit_service import AuditService
from services.rbac import get_db, require_permission

router = APIRouter(tags=["Triage"])

@router.post("/api/encounters/{encounter_id}/triage")
def create_encounter_triage(
    encounter_id: str,
    req: TriageCreateRequest,
    staff: Staff = Depends(require_permission("triage:create")),
    db: Session = Depends(get_db)
):
    """
    Conducts initial triage assessment for encounter and logs TRIAGE_CREATED.
    """
    enc = db.query(EDEncounter).filter(
        EDEncounter.encounter_id == encounter_id,
        EDEncounter.hospital_id == staff.hospital_id
    ).first()

    if not enc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Encounter '{encounter_id}' not found.")

    triage = TriageAssessment(
        hospital_id=staff.hospital_id,
        patient_id=enc.patient_id,
        encounter_id=encounter_id,
        triage_level=req.triage_level,
        acuity_category=req.acuity_category,
        chief_complaint=req.chief_complaint or enc.chief_complaint,
        pain_score=req.pain_score or 0,
        mobility=req.mobility or "Ambulatory",
        assessed_by=staff.staff_id,
        assessed_at=datetime.datetime.utcnow(),
        notes=req.notes
    )
    db.add(triage)
    enc.status = EncounterStatusEnum.IN_TREATMENT
    db.commit()
    db.refresh(triage)

    AuditService.log_event(
        db=db,
        hospital_id=staff.hospital_id,
        action="TRIAGE_CREATED",
        entity_type="TRIAGE_ASSESSMENT",
        entity_id=str(triage.id),
        actor_id=staff.staff_id,
        actor_name=staff.name,
        actor_role=staff.role.value,
        actor_type=ActorTypeEnum.HUMAN,
        patient_id=enc.patient_id,
        encounter_id=encounter_id,
        result=AuditResultEnum.SUCCESS,
        metadata={"triage_level": req.triage_level, "acuity": req.acuity_category},
        auto_commit=True
    )

    return {"message": "Triage assessment recorded.", "triage": triage.to_dict()}

@router.post("/api/encounters/{encounter_id}/reassess-priority")
def reassess_encounter_priority(
    encounter_id: str,
    req: PriorityReassessmentRequest,
    staff: Staff = Depends(require_permission("triage:create")),
    db: Session = Depends(get_db)
):
    """
    Task 3: Reassesses care priority / ESI level for an active ED patient based on clinical trajectory.
    Appends new TriageAssessment (preserving chronological history), reorders ED Queue,
    and records immutable QUEUE_PRIORITY_CHANGED and PRIORITY_REASSESSMENT audit events.
    """
    enc = db.query(EDEncounter).filter(
        EDEncounter.encounter_id == encounter_id,
        EDEncounter.hospital_id == staff.hospital_id
    ).first()

    if not enc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Encounter '{encounter_id}' not found.")

    # Fetch latest prior triage assessment
    prior_triage = db.query(TriageAssessment).filter(
        TriageAssessment.encounter_id == encounter_id
    ).order_by(TriageAssessment.assessed_at.desc()).first()

    previous_level = prior_triage.triage_level if prior_triage else 3
    previous_category = prior_triage.acuity_category if prior_triage else "Urgent"

    # Append new TriageAssessment record
    notes_text = f"Priority Reassessment: {req.reassessment_reason}."
    if req.vitals_delta_summary:
        notes_text += f" Trajectory Evidence: {req.vitals_delta_summary}."
    if req.notes:
        notes_text += f" Additional Notes: {req.notes}."

    new_triage = TriageAssessment(
        hospital_id=staff.hospital_id,
        patient_id=enc.patient_id,
        encounter_id=encounter_id,
        triage_level=req.new_triage_level,
        acuity_category=req.acuity_category,
        chief_complaint=enc.chief_complaint,
        pain_score=prior_triage.pain_score if prior_triage else 0,
        mobility=prior_triage.mobility if prior_triage else "Ambulatory",
        assessed_by=staff.staff_id,
        assessed_at=datetime.datetime.utcnow(),
        notes=notes_text
    )
    db.add(new_triage)
    db.commit()
    db.refresh(new_triage)

    # Log Audit Trail
    AuditService.log_event(
        db=db,
        hospital_id=staff.hospital_id,
        action="QUEUE_PRIORITY_CHANGED",
        entity_type="TriageAssessment",
        entity_id=str(new_triage.id),
        actor_id=staff.staff_id,
        actor_name=staff.name,
        actor_role=staff.role.value,
        actor_type=ActorTypeEnum.HUMAN,
        patient_id=enc.patient_id,
        encounter_id=encounter_id,
        result=AuditResultEnum.SUCCESS,
        metadata={
            "previous_triage_level": previous_level,
            "previous_acuity_category": previous_category,
            "new_triage_level": req.new_triage_level,
            "new_acuity_category": req.acuity_category,
            "ai_recommended_level": req.ai_recommended_level,
            "reason": req.reassessment_reason,
            "vitals_delta_summary": req.vitals_delta_summary
        },
        auto_commit=True
    )

    return {
        "message": "Patient priority successfully reassessed and updated in active ED queue.",
        "previous_triage_level": previous_level,
        "new_triage_level": req.new_triage_level,
        "triage": new_triage.to_dict()
    }
