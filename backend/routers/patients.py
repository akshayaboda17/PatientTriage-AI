import datetime
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from models import Patient, Staff, ActorTypeEnum, AuditResultEnum
from schemas.patient_schemas import PatientCreateRequest, PatientUpdateRequest
from services.audit_service import AuditService
from services.rbac import get_db, require_permission

router = APIRouter(prefix="/api/patients", tags=["Patients"])

@router.post("")
def create_patient(
    req: PatientCreateRequest,
    staff: Staff = Depends(require_permission("patient:create")),
    db: Session = Depends(get_db)
):
    """
    Registers a new patient and logs PATIENT_CREATED.
    """
    patient_id = f"PT-{staff.hospital_id[:4]}-{uuid.uuid4().hex[:6].upper()}"
    new_patient = Patient(
        patient_id=patient_id,
        hospital_id=staff.hospital_id,
        first_name=req.first_name,
        last_name=req.last_name,
        mrn=req.mrn,
        age=req.age,
        gender=req.gender,
        phone=req.phone,
        allergies=req.allergies,
        medical_history=req.medical_history,
        created_at=datetime.datetime.utcnow()
    )
    db.add(new_patient)
    db.commit()
    db.refresh(new_patient)

    # Audit Patient Registration
    AuditService.log_event(
        db=db,
        hospital_id=staff.hospital_id,
        action="PATIENT_CREATED",
        entity_type="PATIENT",
        entity_id=new_patient.patient_id,
        actor_id=staff.staff_id,
        actor_name=staff.name,
        actor_role=staff.role.value,
        actor_type=ActorTypeEnum.HUMAN,
        patient_id=new_patient.patient_id,
        result=AuditResultEnum.SUCCESS,
        metadata={"mrn": new_patient.mrn},
        auto_commit=True
    )

    return {"message": "Patient registered successfully.", "patient": new_patient.to_dict()}

@router.get("/{patient_id}")
def get_patient(
    patient_id: str,
    staff: Staff = Depends(require_permission("patient:view")),
    db: Session = Depends(get_db)
):
    """
    Retrieves patient demographics and logs PATIENT_VIEWED.
    """
    patient = db.query(Patient).filter(
        Patient.patient_id == patient_id,
        Patient.hospital_id == staff.hospital_id
    ).first()

    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Patient '{patient_id}' not found.")

    AuditService.log_event(
        db=db,
        hospital_id=staff.hospital_id,
        action="PATIENT_VIEWED",
        entity_type="PATIENT",
        entity_id=patient.patient_id,
        actor_id=staff.staff_id,
        actor_name=staff.name,
        actor_role=staff.role.value,
        actor_type=ActorTypeEnum.HUMAN,
        patient_id=patient.patient_id,
        result=AuditResultEnum.SUCCESS,
        auto_commit=True
    )

    return {"patient": patient.to_dict()}

@router.put("/{patient_id}")
def update_patient(
    patient_id: str,
    req: PatientUpdateRequest,
    staff: Staff = Depends(require_permission("patient:update")),
    db: Session = Depends(get_db)
):
    """
    Updates patient demographics and logs PATIENT_UPDATED.
    """
    patient = db.query(Patient).filter(
        Patient.patient_id == patient_id,
        Patient.hospital_id == staff.hospital_id
    ).first()

    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Patient '{patient_id}' not found.")

    if req.first_name is not None: patient.first_name = req.first_name
    if req.last_name is not None: patient.last_name = req.last_name
    if req.age is not None: patient.age = req.age
    if req.gender is not None: patient.gender = req.gender
    if req.phone is not None: patient.phone = req.phone
    if req.allergies is not None: patient.allergies = req.allergies
    if req.medical_history is not None: patient.medical_history = req.medical_history

    db.commit()
    db.refresh(patient)

    AuditService.log_event(
        db=db,
        hospital_id=staff.hospital_id,
        action="PATIENT_UPDATED",
        entity_type="PATIENT",
        entity_id=patient.patient_id,
        actor_id=staff.staff_id,
        actor_name=staff.name,
        actor_role=staff.role.value,
        actor_type=ActorTypeEnum.HUMAN,
        patient_id=patient.patient_id,
        result=AuditResultEnum.SUCCESS,
        auto_commit=True
    )

    return {"message": "Patient updated successfully.", "patient": patient.to_dict()}
