"""
Hospital Scale, Safe Wait Thresholds, and Surge Mode Router for PatientTriage.ai.
Enables configuration-driven scale adaptation (Small, Medium, Large ED),
safe wait-time threshold customization, and 3x ED surge simulation.
"""
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from models import Staff, ActorTypeEnum, AuditResultEnum
from services.audit_service import AuditService
from services.rbac import get_db, require_permission
from services.hospital_config_service import (
    HospitalConfigService, HospitalScaleEnum, SCALE_PROFILES
)

router = APIRouter(prefix="/api/hospital-config", tags=["Hospital Scalability & Surge"])


class HospitalScaleUpdateRequest(BaseModel):
    scale: HospitalScaleEnum


class WaitThresholdsUpdateRequest(BaseModel):
    thresholds: Dict[int, int] # e.g. {1: 0, 2: 15, 3: 45, 4: 90, 5: 120}


class SurgeModeToggleRequest(BaseModel):
    active: bool
    reason: Optional[str] = "Simulated Emergency Department Volume Surge (3x Normal Influx)"


@router.get("")
def get_hospital_configuration(
    staff: Staff = Depends(require_permission("hospital:view")),
    db: Session = Depends(get_db)
):
    """
    Returns active scale profile, safe wait thresholds, and surge state for current hospital.
    """
    config = HospitalConfigService.get_config(staff.hospital_id)
    return {
        "config": config,
        "available_scales": [s.value for s in HospitalScaleEnum],
        "scale_profiles": {k.value: v for k, v in SCALE_PROFILES.items()}
    }


@router.put("/scale")
def update_hospital_scale(
    req: HospitalScaleUpdateRequest,
    staff: Staff = Depends(require_permission("hospital:update")),
    db: Session = Depends(get_db)
):
    """
    Updates hospital operational scale (SMALL_ED, MEDIUM_ED, LARGE_ED).
    """
    updated = HospitalConfigService.set_scale(staff.hospital_id, req.scale)
    
    AuditService.log_event(
        db=db,
        hospital_id=staff.hospital_id,
        action="HOSPITAL_SCALE_UPDATED",
        entity_type="HOSPITAL_CONFIG",
        entity_id=staff.hospital_id,
        actor_id=staff.staff_id,
        actor_name=staff.name,
        actor_role=staff.role.value,
        actor_type=ActorTypeEnum.HUMAN,
        result=AuditResultEnum.SUCCESS,
        metadata={"new_scale": req.scale.value, "scale_name": updated["scale_name"]},
        auto_commit=True
    )

    return {
        "message": f"Hospital scale updated to {updated['scale_name']}.",
        "config": updated
    }


@router.post("/surge-mode")
def toggle_surge_mode(
    req: SurgeModeToggleRequest,
    staff: Staff = Depends(require_permission("hospital:update")),
    db: Session = Depends(get_db)
):
    """
    Activates or deactivates 3x ED Surge Mode for the hospital tenant.
    """
    updated = HospitalConfigService.set_surge_mode(staff.hospital_id, req.active, staff.staff_id)
    
    action = "SURGE_MODE_ACTIVATED" if req.active else "SURGE_MODE_DEACTIVATED"
    AuditService.log_event(
        db=db,
        hospital_id=staff.hospital_id,
        action=action,
        entity_type="HOSPITAL_CONFIG",
        entity_id=staff.hospital_id,
        actor_id=staff.staff_id,
        actor_name=staff.name,
        actor_role=staff.role.value,
        actor_type=ActorTypeEnum.HUMAN,
        result=AuditResultEnum.SUCCESS,
        metadata={
            "surge_active": req.active,
            "surge_multiplier": 3.0,
            "reason": req.reason
        },
        auto_commit=True
    )

    return {
        "message": "3x ED Surge Mode ACTIVATED — queue priority & wait-monitoring enhanced." if req.active else "Surge Mode deactivated. Returned to standard volume.",
        "config": updated
    }
