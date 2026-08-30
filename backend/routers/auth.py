import time
from collections import defaultdict
from typing import Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from models import Hospital, Staff, StaffRoleEnum, ActorTypeEnum, AuditResultEnum
from schemas.auth_schemas import LoginRequest, RegisterHospitalRequest
from services.audit_service import AuditService
from services.rbac import (
    get_db, get_current_staff,
    get_staff_permissions, create_session, revoke_session,
    verify_password, hash_password
)

router = APIRouter(tags=["Authentication"])

# Login Rate Limiting (In-Memory sliding window)
LOGIN_FAILED_ATTEMPTS: Dict[str, List[float]] = defaultdict(list)
MAX_LOGIN_ATTEMPTS = 5
LOGIN_RATE_WINDOW_SECONDS = 60

def check_login_rate_limit(key: str) -> bool:
    now = time.time()
    LOGIN_FAILED_ATTEMPTS[key] = [t for t in LOGIN_FAILED_ATTEMPTS[key] if now - t < LOGIN_RATE_WINDOW_SECONDS]
    return len(LOGIN_FAILED_ATTEMPTS[key]) < MAX_LOGIN_ATTEMPTS

def record_login_failure(key: str) -> None:
    LOGIN_FAILED_ATTEMPTS[key].append(time.time())

def reset_login_rate_limit(key: str) -> None:
    if key in LOGIN_FAILED_ATTEMPTS:
        del LOGIN_FAILED_ATTEMPTS[key]

@router.post("/api/auth/login")
def login(creds: LoginRequest, raw_req: Request, db: Session = Depends(get_db)):
    """
    Authenticates staff with rate limiting, password verification, and session token generation.
    Audits successful logins and failed login attempts without leaking credentials.
    """
    client_ip = raw_req.client.host if (raw_req.client and raw_req.client.host) else "127.0.0.1"
    rate_key = f"{client_ip}:{creds.staff_id}"

    if not check_login_rate_limit(rate_key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed login attempts. Rate limit exceeded. Please wait 60 seconds."
        )

    query = db.query(Staff).filter(Staff.staff_id == creds.staff_id)
    if creds.hospital_id:
        query = query.filter(Staff.hospital_id == creds.hospital_id)
    staff = query.first()

    if not staff or not verify_password(creds.password, staff.password_hash):
        record_login_failure(rate_key)
        AuditService.log_event(
            db=db,
            hospital_id=creds.hospital_id or (staff.hospital_id if staff else "SYSTEM"),
            action="LOGIN_FAILURE",
            entity_type="AUTHENTICATION",
            entity_id=creds.staff_id,
            actor_id=creds.staff_id,
            actor_role=staff.role.value if staff else "UNKNOWN",
            actor_type=ActorTypeEnum.HUMAN,
            result=AuditResultEnum.DENIED,
            metadata={"reason": "Invalid credentials provided"},
            auto_commit=True
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid staff ID or password."
        )

    if not staff.is_active:
        AuditService.log_event(
            db=db,
            hospital_id=staff.hospital_id,
            action="LOGIN_FAILURE",
            entity_type="AUTHENTICATION",
            entity_id=staff.staff_id,
            actor_id=staff.staff_id,
            actor_name=staff.name,
            actor_role=staff.role.value,
            actor_type=ActorTypeEnum.HUMAN,
            result=AuditResultEnum.DENIED,
            metadata={"reason": "Staff account deactivated"},
            auto_commit=True
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Staff account has been deactivated."
        )

    # Success: reset rate limit tracking
    reset_login_rate_limit(rate_key)

    AuditService.log_event(
        db=db,
        hospital_id=staff.hospital_id,
        action="LOGIN_SUCCESS",
        entity_type="AUTHENTICATION",
        entity_id=staff.staff_id,
        actor_id=staff.staff_id,
        actor_name=staff.name,
        actor_role=staff.role.value,
        actor_type=ActorTypeEnum.HUMAN,
        result=AuditResultEnum.SUCCESS,
        metadata={"role": staff.role.value},
        auto_commit=True
    )

    hospital = db.query(Hospital).filter(Hospital.hospital_code == staff.hospital_id).first()
    permissions = list(get_staff_permissions(staff.role))
    token = create_session(staff.staff_id, staff.hospital_id)

    return {
        "access_token": token,
        "token_type": "bearer",
        "staff": staff.to_dict(),
        "hospital": hospital.to_dict() if hospital else None,
        "permissions": permissions
    }

@router.post("/api/auth/logout")
def logout(
    raw_req: Request,
    staff: Staff = Depends(get_current_staff),
    db: Session = Depends(get_db)
):
    """
    Logs out authenticated staff member, invalidates session token, and creates an audit record.
    """
    auth_header = raw_req.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
        revoke_session(token)
    elif raw_req.headers.get("X-Staff-Id"):
        revoke_session(raw_req.headers.get("X-Staff-Id"))

    AuditService.log_event(
        db=db,
        hospital_id=staff.hospital_id,
        action="LOGOUT",
        entity_type="AUTHENTICATION",
        entity_id=staff.staff_id,
        actor_id=staff.staff_id,
        actor_name=staff.name,
        actor_role=staff.role.value,
        actor_type=ActorTypeEnum.HUMAN,
        result=AuditResultEnum.SUCCESS,
        auto_commit=True
    )
    return {"status": "success", "message": "Successfully logged out and session revoked."}

@router.get("/api/auth/me")
def get_current_user_profile(staff: Staff = Depends(get_current_staff), db: Session = Depends(get_db)):
    hospital = db.query(Hospital).filter(Hospital.hospital_code == staff.hospital_id).first()
    return {
        "staff": staff.to_dict(),
        "hospital": hospital.to_dict() if hospital else None,
        "permissions": list(get_staff_permissions(staff.role))
    }

@router.get("/api/hospitals")
def list_hospitals(db: Session = Depends(get_db)):
    hospitals = db.query(Hospital).filter(Hospital.is_active == True).all()
    return {"hospitals": [h.to_dict() for h in hospitals]}

@router.post("/api/auth/register-hospital")
def register_new_hospital(req: RegisterHospitalRequest, db: Session = Depends(get_db)):
    """
    Provisions a new hospital facility/tenant and creates the initial administrative/clinical user.
    Enables new users to start with a 100% clean, unpopulated clinical workspace.
    """
    # 1. Check if hospital code already exists
    hosp_code = req.hospital_code.strip().upper()
    existing_hosp = db.query(Hospital).filter(Hospital.hospital_code == hosp_code).first()
    if existing_hosp:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Hospital code '{hosp_code}' already exists. Please choose a unique code."
        )

    # 2. Check if staff ID already exists
    staff_id = req.admin_staff_id.strip()
    existing_staff = db.query(Staff).filter(Staff.staff_id == staff_id).first()
    if existing_staff:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Staff ID '{staff_id}' already exists. Please choose a unique staff ID."
        )

    # 3. Create Hospital
    new_hospital = Hospital(
        hospital_code=hosp_code,
        name=req.hospital_name.strip(),
        address=req.address.strip() if req.address else None,
        is_active=True
    )
    db.add(new_hospital)
    db.commit()
    db.refresh(new_hospital)

    # 4. Resolve initial role
    assigned_role = StaffRoleEnum.CLINICAL_DIRECTOR
    if req.role and req.role.upper() in [r.value for r in StaffRoleEnum]:
        assigned_role = StaffRoleEnum(req.role.upper())

    # 5. Create Staff Account
    from services.rbac import hash_password
    pw_hash = hash_password(req.password)

    new_staff = Staff(
        hospital_id=hosp_code,
        staff_id=staff_id,
        name=req.admin_name.strip(),
        email=req.admin_email.strip(),
        role=assigned_role,
        password_hash=pw_hash,
        is_active=True
    )
    db.add(new_staff)
    db.commit()
    db.refresh(new_staff)

    # 6. Audit Event
    AuditService.log_event(
        db=db,
        hospital_id=hosp_code,
        action="HOSPITAL_ONBOARDED",
        entity_type="HOSPITAL",
        entity_id=hosp_code,
        actor_id=staff_id,
        actor_name=new_staff.name,
        actor_role=assigned_role.value,
        actor_type=ActorTypeEnum.HUMAN,
        result=AuditResultEnum.SUCCESS,
        metadata={"hospital_name": new_hospital.name, "admin_email": new_staff.email},
        auto_commit=True
    )

    # 7. Create Session
    token = create_session(new_staff.staff_id, new_staff.hospital_id)
    permissions = list(get_staff_permissions(new_staff.role))

    return {
        "access_token": token,
        "token_type": "bearer",
        "staff": new_staff.to_dict(),
        "hospital": new_hospital.to_dict(),
        "permissions": permissions,
        "message": f"Hospital '{new_hospital.name}' registered successfully with clean workspace."
    }
