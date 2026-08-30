import datetime
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from models import (
    Staff, StaffRoleEnum, MLModelRegistry, MLDatasetRegistry,
    ClinicalGroundTruthOutcome, MLModelStatusEnum, ActorTypeEnum, AuditResultEnum
)
from services.rbac import get_db, require_permission
from services.audit_service import AuditService
from ml_pipeline.mlops_service import MLOpsService

router = APIRouter(prefix="/api/mlops", tags=["MLOps & Clinical Model Governance"])

# Pydantic Input Schemas
class OutcomeInputSchema(BaseModel):
    patient_id: str
    encounter_id: str
    icu_admitted_24h: bool = False
    intubated_24h: bool = False
    vasopressor_24h: bool = False
    mortality_24h: bool = False
    outcome_timestamp: Optional[datetime.datetime] = None

class BuildDatasetSchema(BaseModel):
    dataset_version: str = Field(..., example="v1.1")

class TrainCandidateSchema(BaseModel):
    dataset_version: str = Field(..., example="v1.1")
    candidate_version: str = Field(..., example="1.1")

class RollbackSchema(BaseModel):
    target_version: str = Field(..., example="1.0")

@router.get("/models")
def list_registered_models(
    staff: Staff = Depends(require_permission("ai:view")),
    db: Session = Depends(get_db)
):
    """Lists all candidate, approved, production, and retired models in the registry."""
    models = db.query(MLModelRegistry).order_by(MLModelRegistry.trained_at.desc()).all()
    return {"models": [m.to_dict() for m in models]}

@router.get("/production-model")
def get_current_production_model(
    staff: Staff = Depends(require_permission("ai:view")),
    db: Session = Depends(get_db)
):
    """Retrieves the active production model metadata."""
    prod = db.query(MLModelRegistry).filter(
        MLModelRegistry.status == MLModelStatusEnum.PRODUCTION
    ).first()
    
    if not prod:
        return {
            "model_name": "PatientTriage Decompensation Risk Classifier",
            "model_version": "1.0",
            "status": "PRODUCTION",
            "deployed_at": datetime.datetime.utcnow().isoformat(),
            "notes": "Default candidate model active."
        }
    return prod.to_dict()

@router.post("/outcomes")
def record_clinical_outcome(
    data: OutcomeInputSchema,
    staff: Staff = Depends(require_permission("clinical_review:review")),
    db: Session = Depends(get_db)
):
    """Ingests objective ground-truth clinical outcome and performs automated training eligibility assessment."""
    outcome = MLOpsService.record_ground_truth_outcome(
        db=db,
        hospital_id=staff.hospital_id,
        patient_id=data.patient_id,
        encounter_id=data.encounter_id,
        icu_admitted=data.icu_admitted_24h,
        intubated=data.intubated_24h,
        vasopressor=data.vasopressor_24h,
        mortality=data.mortality_24h,
        outcome_time=data.outcome_timestamp,
        staff_id=staff.staff_id
    )
    return {
        "message": "Ground-truth outcome recorded successfully.",
        "outcome": outcome.to_dict()
    }

@router.post("/datasets/build")
def build_dataset_from_outcomes(
    data: BuildDatasetSchema,
    staff: Staff = Depends(require_permission("system:admin")),
    db: Session = Depends(get_db)
):
    """Builds and validates a versioned training dataset from eligible clinical outcomes with zero temporal leakage."""
    dataset = MLOpsService.build_versioned_dataset(
        db=db,
        dataset_version=data.dataset_version,
        actor_id=staff.staff_id
    )
    return {
        "message": f"Versioned dataset '{data.dataset_version}' built successfully.",
        "dataset": dataset.to_dict()
    }

@router.get("/datasets")
def list_datasets(
    staff: Staff = Depends(require_permission("ai:view")),
    db: Session = Depends(get_db)
):
    """Lists all versioned training datasets in the registry."""
    datasets = db.query(MLDatasetRegistry).order_by(MLDatasetRegistry.created_at.desc()).all()
    return {"datasets": [d.to_dict() for d in datasets]}

@router.post("/models/train-candidate")
def train_candidate_model(
    data: TrainCandidateSchema,
    staff: Staff = Depends(require_permission("system:admin")),
    db: Session = Depends(get_db)
):
    """Trains a new candidate ML model without modifying production."""
    candidate = MLOpsService.train_candidate_model(
        db=db,
        dataset_version=data.dataset_version,
        candidate_version=data.candidate_version,
        actor_id=staff.staff_id
    )
    return {
        "message": f"Candidate model 'v{data.candidate_version}' trained successfully.",
        "model": candidate.to_dict()
    }

@router.post("/models/{version}/validate")
def validate_candidate_model(
    version: str,
    staff: Staff = Depends(require_permission("clinical_review:review")),
    db: Session = Depends(get_db)
):
    """Evaluates a candidate model against predefined acceptance criteria."""
    try:
        passed, res = MLOpsService.validate_and_compare_candidate(
            db=db,
            candidate_version=version,
            actor_id=staff.staff_id
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return {
        "message": f"Validation completed. Status: {res['status']}",
        "result": res
    }

@router.post("/models/{version}/deploy")
def deploy_model_to_production(
    version: str,
    staff: Staff = Depends(require_permission("system:admin")),
    db: Session = Depends(get_db)
):
    """Deploys an approved candidate model to production with human governance sign-off."""
    try:
        deployed = MLOpsService.deploy_to_production(
            db=db,
            target_version=version,
            staff_id=staff.staff_id,
            staff_role=staff.role.value
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "message": f"Model 'v{version}' promoted to PRODUCTION successfully.",
        "model": deployed.to_dict()
    }

@router.post("/models/rollback")
def rollback_production_model(
    data: RollbackSchema,
    staff: Staff = Depends(require_permission("system:admin")),
    db: Session = Depends(get_db)
):
    """Rolls back the production model to a previously approved version."""
    try:
        rolled_back = MLOpsService.rollback_production_model(
            db=db,
            rollback_to_version=data.target_version,
            staff_id=staff.staff_id,
            staff_role=staff.role.value
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "message": f"Production model rolled back to 'v{data.target_version}'.",
        "model": rolled_back.to_dict()
    }

@router.get("/monitoring")
def get_ml_monitoring(
    staff: Staff = Depends(require_permission("ai:view")),
    db: Session = Depends(get_db)
):
    """Retrieves real-time MLOps monitoring metrics, drift alerts, and override rates."""
    metrics = MLOpsService.compute_monitoring_metrics(
        db=db,
        hospital_id=staff.hospital_id
    )
    return {"monitoring": metrics}
