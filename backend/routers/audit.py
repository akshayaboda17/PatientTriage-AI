import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from models import EDEncounter, Staff
from services.audit_service import AuditService
from services.rbac import get_db, require_permission

router = APIRouter(tags=["Clinical Audit Trail"])

@router.get("/api/audit-logs")
def get_audit_trail(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    q: Optional[str] = Query(None),
    actor_id: Optional[str] = Query(None),
    actor_role: Optional[str] = Query(None),
    actor_type: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    entity_type: Optional[str] = Query(None),
    encounter_id: Optional[str] = Query(None),
    patient_id: Optional[str] = Query(None),
    result: Optional[str] = Query(None),
    sort_order: str = Query("desc"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    staff: Staff = Depends(require_permission("audit:view")),
    db: Session = Depends(get_db)
):
    """
    Task 11: Retrieves tamper-resistant audit logs for hospital operations.
    Supports server-side multi-parameter filtering, search, pagination, and sorting.
    """
    s_date = None
    e_date = None
    if start_date:
        try:
            s_date = datetime.datetime.fromisoformat(start_date.replace("Z", "+00:00"))
        except Exception:
            pass
    if end_date:
        try:
            e_date = datetime.datetime.fromisoformat(end_date.replace("Z", "+00:00"))
        except Exception:
            pass

    query_res = AuditService.query_logs(
        db=db,
        hospital_id=staff.hospital_id,
        page=page,
        page_size=page_size,
        q=q,
        actor_id=actor_id,
        actor_role=actor_role,
        actor_type=actor_type,
        action=action,
        entity_type=entity_type,
        encounter_id=encounter_id,
        patient_id=patient_id,
        result=result,
        sort_order=sort_order,
        start_date=s_date,
        end_date=e_date
    )

    return {
        "audit_logs": query_res["logs"],
        "logs": query_res["logs"],
        "total": query_res["total"],
        "page": query_res["page"],
        "page_size": query_res["page_size"],
        "total_pages": query_res["total_pages"],
        "hospital_id": staff.hospital_id
    }

@router.get("/api/audit-logs/{event_id}")
def get_audit_event_detail(
    event_id: str,
    staff: Staff = Depends(require_permission("audit:view")),
    db: Session = Depends(get_db)
):
    """
    Retrieves details for a single audit event with hospital tenant isolation.
    """
    event = AuditService.get_event_by_id(db=db, hospital_id=staff.hospital_id, event_id=event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Audit event '{event_id}' not found in hospital '{staff.hospital_id}'."
        )
    return {"audit_event": event.to_dict()}

@router.get("/api/encounters/{encounter_id}/audit-logs")
def get_encounter_audit_trail(
    encounter_id: str,
    staff: Staff = Depends(require_permission("audit:view")),
    db: Session = Depends(get_db)
):
    """
    Retrieves chronological audit events specific to an encounter for accountability timeline reconstruction.
    """
    enc = db.query(EDEncounter).filter(
        EDEncounter.encounter_id == encounter_id,
        EDEncounter.hospital_id == staff.hospital_id
    ).first()

    if not enc:
        raise HTTPException(status_code=404, detail=f"Encounter '{encounter_id}' not found.")

    timeline = AuditService.get_encounter_audit_timeline(
        db=db, hospital_id=staff.hospital_id, encounter_id=encounter_id, patient_id=enc.patient_id
    )
    return {
        "encounter_id": encounter_id,
        "count": len(timeline),
        "audit_timeline": timeline
    }
