import uuid
from sqlalchemy.orm import Session
from sqlalchemy import desc
from fastapi import APIRouter, Depends, HTTPException, status

from models import (
    EDEncounter, AIRiskAssessment, PhysicianAssessment,
    AIAgreementEnum, Staff, ActorTypeEnum, AuditResultEnum
)
from schemas.physician_schemas import ClinicalDecisionRequest
from services.audit_service import AuditService
from services.rbac import (
    get_db, require_permission,
    verify_hospital_access, get_staff_permissions
)

router = APIRouter(tags=["Physician Review & Clinical Decisions"])

@router.post("/api/encounters/{encounter_id}/clinical-decision")
@router.post("/api/encounters/{encounter_id}/physician-review")
def record_clinical_decision(
    encounter_id: str,
    req: ClinicalDecisionRequest,
    current_staff: Staff = Depends(require_permission("clinical_decision:create")),
    db: Session = Depends(get_db)
):
    """
    Task 10: Records physician clinical assessment, agreement/override with AI, and clinical decision.
    Ensures original AI risk assessment remains immutable and untouched.
    """
    enc = db.query(EDEncounter).filter(EDEncounter.encounter_id == encounter_id).first()
    if not enc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Encounter '{encounter_id}' not found."
        )

    verify_hospital_access(enc.hospital_id, current_staff)

    # If overriding AI, require 'ai:override' permission
    if req.ai_agreement == AIAgreementEnum.OVERRIDDEN:
        perms = get_staff_permissions(current_staff.role)
        if "ai:override" not in perms:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{current_staff.role.value}' does not have permission 'ai:override'."
            )
        if not req.override_reason or not req.override_reason.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Structured override reason is mandatory when overriding AI assessment."
            )

    if not req.clinical_decision:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Clinical decision is required."
        )

    # Fetch latest AI assessment (if any) to store snapshot references immutably
    latest_ai = db.query(AIRiskAssessment).filter(
        AIRiskAssessment.encounter_id == encounter_id
    ).order_by(desc(AIRiskAssessment.assessed_at)).first()

    assessment_uid = f"PA-{encounter_id}-{uuid.uuid4().hex[:8].upper()}"

    new_assessment = PhysicianAssessment(
        assessment_id=assessment_uid,
        hospital_id=enc.hospital_id,
        encounter_id=encounter_id,
        patient_id=enc.patient_id,
        physician_id=current_staff.staff_id,
        physician_name=current_staff.name,
        physician_role=current_staff.role.value,
        ai_assessment_id=latest_ai.assessment_id if latest_ai else None,
        ai_risk_category_at_review=latest_ai.risk_category.value if latest_ai else None,
        ai_risk_score_at_review=latest_ai.risk_score if latest_ai else None,
        clinical_assessment=req.clinical_assessment,
        ai_agreement=req.ai_agreement,
        clinician_assigned_risk=req.clinician_assigned_risk,
        override_reason=req.override_reason if req.ai_agreement == AIAgreementEnum.OVERRIDDEN else None,
        clinical_notes=req.clinical_notes,
        clinical_decision=req.clinical_decision
    )

    db.add(new_assessment)

    # Create immutable audit log
    action_type = "AI_OVERRIDDEN" if req.ai_agreement == AIAgreementEnum.OVERRIDDEN else "CLINICAL_DECISION_SAVED"
    AuditService.log_event(
        db=db,
        hospital_id=enc.hospital_id,
        action=action_type,
        entity_type="PhysicianAssessment",
        entity_id=assessment_uid,
        actor_id=current_staff.staff_id,
        actor_name=current_staff.name,
        actor_role=current_staff.role.value,
        actor_type=ActorTypeEnum.HUMAN,
        patient_id=enc.patient_id,
        encounter_id=encounter_id,
        result=AuditResultEnum.SUCCESS,
        metadata={
            "encounter_id": encounter_id,
            "patient_id": enc.patient_id,
            "ai_agreement": req.ai_agreement.value,
            "clinical_decision": req.clinical_decision.value,
            "override_reason": req.override_reason if req.ai_agreement == AIAgreementEnum.OVERRIDDEN else None,
            "ai_risk_original": latest_ai.risk_category.value if latest_ai else None,
            "clinician_assigned_risk": req.clinician_assigned_risk,
            "physician_notes": req.clinical_notes
        }
    )

    db.commit()
    db.refresh(new_assessment)

    return {
        "status": "SUCCESS",
        "message": f"Clinical decision recorded successfully for encounter {encounter_id}.",
        "assessment": new_assessment.to_dict()
    }

@router.get("/api/encounters/{encounter_id}/physician-assessments")
def get_physician_assessments(
    encounter_id: str,
    staff: Staff = Depends(require_permission("clinical_decision:view")),
    db: Session = Depends(get_db)
):
    """
    Returns full history of physician clinical assessments for the encounter.
    """
    enc = db.query(EDEncounter).filter(EDEncounter.encounter_id == encounter_id).first()
    if not enc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Encounter '{encounter_id}' not found."
        )

    verify_hospital_access(enc.hospital_id, staff)

    assessments = db.query(PhysicianAssessment).filter(
        PhysicianAssessment.encounter_id == encounter_id
    ).order_by(PhysicianAssessment.created_at.desc()).all()

    return {
        "encounter_id": encounter_id,
        "count": len(assessments),
        "assessments": [a.to_dict() for a in assessments]
    }
