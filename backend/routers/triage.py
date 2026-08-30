import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from models import EDEncounter, EncounterStatusEnum, TriageAssessment, Staff, ActorTypeEnum, AuditResultEnum
from schemas.triage_schemas import TriageCreateRequest
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
    Conducts triage assessment for encounter and logs TRIAGE_CREATED.
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
