from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from models import Staff, ActorTypeEnum, AuditResultEnum
from schemas.staff_schemas import StaffCreateRequest, StaffRoleUpdateRequest
from services.audit_service import AuditService
from services.rbac import get_db, require_permission

router = APIRouter(prefix="/api/staff", tags=["Staff Management & RBAC"])

@router.get("")
def list_staff(
    current_staff: Staff = Depends(require_permission("staff:view")),
    db: Session = Depends(get_db)
):
    """
    Lists all staff members in the current hospital tenant.
    """
    staff_list = db.query(Staff).filter(
        Staff.hospital_id == current_staff.hospital_id
    ).order_by(Staff.created_at.desc()).all()
    return {"staff": [s.to_dict() for s in staff_list]}

@router.post("")
def create_staff(
    req: StaffCreateRequest,
    current_staff: Staff = Depends(require_permission("staff:create")),
    db: Session = Depends(get_db)
):
    """
    Creates new staff account and logs STAFF_CREATED.
    """
    existing = db.query(Staff).filter(Staff.staff_id == req.staff_id).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Staff ID '{req.staff_id}' already exists.")

    new_staff = Staff(
        hospital_id=current_staff.hospital_id,
        staff_id=req.staff_id,
        name=req.name,
        email=req.email,
        role=req.role,
        password_hash="hashed_pw_demo",
        is_active=True
    )
    db.add(new_staff)
    db.commit()
    db.refresh(new_staff)

    AuditService.log_event(
        db=db,
        hospital_id=current_staff.hospital_id,
        action="STAFF_CREATED",
        entity_type="STAFF",
        entity_id=new_staff.staff_id,
        actor_id=current_staff.staff_id,
        actor_name=current_staff.name,
        actor_role=current_staff.role.value,
        actor_type=ActorTypeEnum.HUMAN,
        result=AuditResultEnum.SUCCESS,
        metadata={"role": new_staff.role.value, "email": new_staff.email},
        auto_commit=True
    )

    return {"message": "Staff member created.", "staff": new_staff.to_dict()}

@router.put("/{staff_id}/deactivate")
def deactivate_staff(
    staff_id: str,
    current_staff: Staff = Depends(require_permission("staff:deactivate")),
    db: Session = Depends(get_db)
):
    """
    Deactivates staff account and logs STAFF_DEACTIVATED.
    """
    target = db.query(Staff).filter(
        Staff.staff_id == staff_id,
        Staff.hospital_id == current_staff.hospital_id
    ).first()

    if not target:
        raise HTTPException(status_code=404, detail=f"Staff '{staff_id}' not found.")

    target.is_active = False
    db.commit()
    db.refresh(target)

    AuditService.log_event(
        db=db,
        hospital_id=current_staff.hospital_id,
        action="STAFF_DEACTIVATED",
        entity_type="STAFF",
        entity_id=target.staff_id,
        actor_id=current_staff.staff_id,
        actor_name=current_staff.name,
        actor_role=current_staff.role.value,
        actor_type=ActorTypeEnum.HUMAN,
        result=AuditResultEnum.SUCCESS,
        metadata={"deactivated_staff_name": target.name},
        auto_commit=True
    )

    return {"message": "Staff member deactivated.", "staff": target.to_dict()}

@router.put("/{staff_id}/role")
def update_staff_role(
    staff_id: str,
    req: StaffRoleUpdateRequest,
    current_staff: Staff = Depends(require_permission("staff:update")),
    db: Session = Depends(get_db)
):
    """
    Updates staff role and logs ROLE_CHANGED.
    """
    target = db.query(Staff).filter(
        Staff.staff_id == staff_id,
        Staff.hospital_id == current_staff.hospital_id
    ).first()

    if not target:
        raise HTTPException(status_code=404, detail=f"Staff '{staff_id}' not found.")

    prev_role = target.role.value
    target.role = req.role
    db.commit()
    db.refresh(target)

    AuditService.log_event(
        db=db,
        hospital_id=current_staff.hospital_id,
        action="ROLE_CHANGED",
        entity_type="STAFF",
        entity_id=target.staff_id,
        actor_id=current_staff.staff_id,
        actor_name=current_staff.name,
        actor_role=current_staff.role.value,
        actor_type=ActorTypeEnum.HUMAN,
        result=AuditResultEnum.SUCCESS,
        metadata={"previous_role": prev_role, "new_role": req.role.value},
        auto_commit=True
    )

    return {"message": "Staff role updated.", "staff": target.to_dict()}
