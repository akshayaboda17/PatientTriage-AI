from typing import List, Optional, Set
from fastapi import HTTPException, Security, Depends, status, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
import json

from models import SessionLocal, Staff, StaffRoleEnum, Hospital

# Role-to-Permissions centralized mapping
ROLE_PERMISSIONS: dict[StaffRoleEnum, Set[str]] = {
    StaffRoleEnum.HOSPITAL_ADMIN: {
        "hospital:view", "hospital:update",
        "staff:view", "staff:create", "staff:update", "staff:deactivate",
        "audit:view", "patient:view", "dashboard:view"
    },
    StaffRoleEnum.CLINICAL_DIRECTOR: {
        "hospital:view", "staff:view", "audit:view",
        "patient:view", "patient:create", "patient:update",
        "triage:view", "triage:create", "triage:update",
        "vitals:view", "vitals:create", "vitals:update",
        "ai:view", "ai:override",
        "alert:view", "alert:acknowledge", "alert:resolve", "alert:dismiss",
        "dashboard:view"
    },
    StaffRoleEnum.EMERGENCY_PHYSICIAN: {
        "patient:view", "patient:create", "patient:update",
        "triage:view", "triage:create", "triage:update",
        "vitals:view", "vitals:create", "vitals:update",
        "ai:view", "ai:override",
        "alert:view", "alert:acknowledge", "alert:resolve", "alert:dismiss",
        "audit:view", "dashboard:view"
    },
    StaffRoleEnum.TRIAGE_NURSE: {
        "patient:view", "patient:create", "patient:update",
        "triage:view", "triage:create", "triage:update",
        "vitals:view", "vitals:create", "vitals:update",
        "ai:view",
        "alert:view", "alert:acknowledge", "alert:resolve",
        "dashboard:view"
    },
    StaffRoleEnum.STAFF_NURSE: {
        "patient:view", "patient:update",
        "triage:view",
        "vitals:view", "vitals:create", "vitals:update",
        "ai:view",
        "alert:view", "alert:acknowledge",
        "dashboard:view"
    },
    StaffRoleEnum.EMERGENCY_TECHNICIAN: {
        "patient:view",
        "vitals:view", "vitals:create",
        "triage:view",
        "alert:view"
    }
}

security = HTTPBearer(auto_error=False)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_current_staff(
    auth: Optional[HTTPAuthorizationCredentials] = Security(security),
    x_staff_id: Optional[str] = Header(None, alias="X-Staff-Id"),
    x_hospital_id: Optional[str] = Header(None, alias="X-Hospital-Id"),
    db: Session = Depends(get_db)
) -> Staff:
    """
    Authenticates staff via Bearer token or header credentials (for flexible demo testing).
    Verifies staff is active and hospital exists and is active.
    """
    staff_id = None
    hospital_id = None

    if auth and auth.credentials:
        # Token format in demo: "TOKEN_{staff_id}_{hospital_id}" or JSON
        token = auth.credentials.strip()
        if token.startswith("TOKEN_"):
            token_body = token.replace("TOKEN_", "", 1)
            parts = token_body.rsplit("_", 1)
            if len(parts) == 2:
                staff_id, hospital_id = parts
        else:
            staff_id = token

    if not staff_id and x_staff_id:
        staff_id = x_staff_id
    if not hospital_id and x_hospital_id:
        hospital_id = x_hospital_id

    if not staff_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please provide a valid staff session."
        )

    # Lookup staff in DB
    query = db.query(Staff).filter(Staff.staff_id == staff_id)
    if hospital_id:
        query = query.filter(Staff.hospital_id == hospital_id)
    
    staff = query.first()
    if not staff:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid staff identity '{staff_id}'. Access denied."
        )

    if not staff.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Staff account is deactivated. Contact hospital administration."
        )

    # Check hospital active status
    hospital = db.query(Hospital).filter(Hospital.hospital_code == staff.hospital_id).first()
    if not hospital or not hospital.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Hospital organization is inactive or not found."
        )

    return staff

def get_staff_permissions(role: StaffRoleEnum) -> Set[str]:
    return ROLE_PERMISSIONS.get(role, set())

def require_permission(permission: str):
    def permission_checker(staff: Staff = Depends(get_current_staff)) -> Staff:
        perms = get_staff_permissions(staff.role)
        if permission not in perms:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Role '{staff.role.value}' does not possess required permission '{permission}'."
            )
        return staff
    return permission_checker

def verify_hospital_access(target_hospital_id: str, staff: Staff) -> bool:
    if staff.hospital_id != target_hospital_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Cross-hospital access prohibited. Staff belongs to '{staff.hospital_id}', not '{target_hospital_id}'."
        )
    return True
