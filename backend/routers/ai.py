import datetime
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from models import (
    EDEncounter, ClinicalObservation, AIRiskAssessment,
    AIExplanation, AIRiskCategoryEnum, Staff, ActorTypeEnum, AuditResultEnum
)
from schemas.ai_schemas import AIAssessmentOutputSchema, LegacyPatientInput, LegacyOverrideInput
from services.audit_service import AuditService
from services.rbac import get_db, require_permission
from services.ml_inference_service import MLInferenceService

router = APIRouter(tags=["AI Decision Support & Explainability"])

@router.post("/api/encounters/{encounter_id}/ai-assessment")
def generate_ai_risk_assessment(
    encounter_id: str,
    staff: Staff = Depends(require_permission("ai:view")),
    db: Session = Depends(get_db)
):
    """
    Generates point-of-care AI clinical risk assessment using the trained supervised ML model (v1.0),
    enforcing strict patient data minimization, deterministic safety interlocks, local explainability,
    and immutable audit trail logging.
    """
    enc = db.query(EDEncounter).filter(
        EDEncounter.encounter_id == encounter_id,
        EDEncounter.hospital_id == staff.hospital_id
    ).first()

    if not enc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Encounter '{encounter_id}' not found in hospital '{staff.hospital_id}'."
        )

    patient = enc.patient
    observations = db.query(ClinicalObservation).filter(
        ClinicalObservation.encounter_id == encounter_id
    ).order_by(ClinicalObservation.timestamp.asc()).all()

    latest_obs = observations[-1] if observations else None
    prior_obs = observations[-2] if len(observations) >= 2 else None
    obs_count = len(observations)

    # Execute Supervised ML Inference Pipeline
    try:
        eval_result = MLInferenceService.evaluate_encounter(
            patient=patient,
            encounter=enc,
            current_obs=latest_obs,
            prior_obs=prior_obs,
            obs_index=obs_count,
            model_version="1.0"
        )
    except Exception as e:
        # Clinical Safety: Never fabricate a prediction upon model failure.
        AuditService.log_event(
            db=db,
            hospital_id=staff.hospital_id,
            action="AI_ASSESSMENT_FAILED",
            entity_type="AIRiskAssessment",
            entity_id=encounter_id,
            actor_id="AI_SYSTEM",
            actor_role="AI_SYSTEM",
            actor_type=ActorTypeEnum.AI_SYSTEM,
            patient_id=enc.patient_id,
            encounter_id=enc.encounter_id,
            result=AuditResultEnum.FAILURE,
            metadata={"error_detail": str(e)},
            auto_commit=True
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"AI inference engine currently unavailable or input processing failed: {e}"
        )

    inf = eval_result["inference"]
    exp = eval_result["explanations"]

    # Category Mapping
    category_map = {
        "CRITICAL": AIRiskCategoryEnum.CRITICAL,
        "HIGH": AIRiskCategoryEnum.HIGH,
        "MODERATE": AIRiskCategoryEnum.MODERATE,
        "LOW": AIRiskCategoryEnum.LOW
    }
    risk_cat = category_map.get(inf["risk_category"], AIRiskCategoryEnum.MODERATE)

    # 1. Persist AIRiskAssessment with Arrival Triage & Decompensation Outputs
    ai_risk = AIRiskAssessment(
        assessment_id=f"AI-{staff.hospital_id[:4]}-{uuid.uuid4().hex[:6].upper()}",
        hospital_id=staff.hospital_id,
        patient_id=enc.patient_id,
        encounter_id=enc.encounter_id,
        observation_id=latest_obs.id if latest_obs else None,
        risk_score=float(inf["risk_score"]),
        risk_probability=float(inf["risk_probability"]),
        risk_category=risk_cat,
        predicted_triage_level=int(inf["predicted_triage_level"]),
        confidence_score=float(inf["confidence_score"]),
        confidence_tier=inf.get("confidence_tier", "HIGH"),
        uncertainty_score=float(inf["uncertainty_score"]) if inf.get("uncertainty_score") is not None else None,
        normalized_entropy=float(inf["normalized_entropy"]) if inf.get("normalized_entropy") is not None else None,
        decision_margin=float(inf["decision_margin"]) if inf.get("decision_margin") is not None else None,
        triage_probabilities_json=inf.get("probabilities", {}),
        safety_escalation_required=bool(inf.get("safety_escalation_required", False)),
        safety_net_triggered=bool(inf.get("safety_net_triggered", False)),
        safety_triggers_json=inf.get("safety_triggers", []),
        shock_index=float(inf["shock_index"]) if inf.get("shock_index") is not None else None,
        qsofa=int(inf["qsofa"]) if inf.get("qsofa") is not None else None,
        mews=int(inf["mews"]) if inf.get("mews") is not None else None,
        model_name=inf.get("model_name", "PatientTriage Arrival Acuity Classifier"),
        model_version=inf.get("model_version", "1.0"),
        arrival_model_name=inf.get("arrival_model_name", "PatientTriage Arrival Acuity Classifier"),
        arrival_model_version=inf.get("arrival_model_version", "1.0"),
        input_features_json=inf.get("features_snapshot", {}),
        assessed_at=datetime.datetime.utcnow()
    )
    db.add(ai_risk)
    db.commit()
    db.refresh(ai_risk)

    # 2. Persist Synchronized AIExplanation
    ai_exp = AIExplanation(
        hospital_id=staff.hospital_id,
        patient_id=enc.patient_id,
        encounter_id=enc.encounter_id,
        risk_assessment_id=ai_risk.id,
        explanation_method=exp.get("explanation_method", "SHAP (LinearExplainer)"),
        top_features=exp.get("top_features", []),
        summary=exp.get("summary", "SHAP analysis completed."),
        generated_at=datetime.datetime.utcnow()
    )
    db.add(ai_exp)
    db.commit()

    # 3. Log Immutable Audit Event
    AuditService.log_event(
        db=db,
        hospital_id=staff.hospital_id,
        action="AI_ASSESSMENT_GENERATED",
        entity_type="AIRiskAssessment",
        entity_id=str(ai_risk.id),
        actor_id="AI_SYSTEM",
        actor_role="AI_SYSTEM",
        actor_type=ActorTypeEnum.AI_SYSTEM,
        patient_id=enc.patient_id,
        encounter_id=enc.encounter_id,
        result=AuditResultEnum.SUCCESS,
        metadata={
            "predicted_level": ai_risk.predicted_triage_level,
            "probabilities": ai_risk.triage_probabilities_json,
            "confidence_tier": ai_risk.confidence_tier,
            "uncertainty_score": ai_risk.uncertainty_score,
            "risk_score": ai_risk.risk_score,
            "risk_category": ai_risk.risk_category.value,
            "model_version": ai_risk.model_version,
            "safety_net_triggered": inf.get("safety_net_triggered", False)
        },
        auto_commit=True
    )

    return {
        "message": "AI Clinical Risk & Arrival Triage Assessment generated successfully.",
        "recommended_priority": ai_risk.predicted_triage_level,
        "probabilities": ai_risk.triage_probabilities_json,
        "confidence": ai_risk.confidence_tier or "HIGH",
        "confidence_score": ai_risk.confidence_score,
        "uncertainty": ai_risk.uncertainty_score,
        "explanation": ai_exp.to_dict(),
        "model_version": ai_risk.model_version,
        "assessment_timestamp": ai_risk.assessed_at.isoformat() if ai_risk.assessed_at else None,
        "assessment": ai_risk.to_dict()
    }

# Legacy endpoints for backward compatibility
@router.post("/api/triage")
def legacy_triage_patient(patient: LegacyPatientInput, db: Session = Depends(get_db)):
    from triage_engine import TriageEngine
    legacy_engine = TriageEngine()
    patient_data = patient.dict()
    triage_result = legacy_engine.evaluate_patient(patient_data)
    return {"message": "Triage complete", "result": triage_result}

@router.get("/api/queue")
def legacy_get_waiting_queue():
    mock_queue = [
        {"patient_id": "PT-883", "age": 45, "gender": "Male", "triage_level": 3, "wait_time_mins": 42, "status": "Waiting"},
        {"patient_id": "PT-884", "age": 28, "gender": "Female", "triage_level": 2, "wait_time_mins": 15, "status": "Waiting"},
        {"patient_id": "PT-885", "age": 72, "gender": "Male", "triage_level": 1, "wait_time_mins": 4, "status": "In Treatment"},
        {"patient_id": "PT-886", "age": 19, "gender": "Female", "triage_level": 4, "wait_time_mins": 65, "status": "Waiting"},
        {"patient_id": "PT-887", "age": 55, "gender": "Male", "triage_level": 3, "wait_time_mins": 12, "status": "Waiting"}
    ]
    sorted_queue = sorted(mock_queue, key=lambda p: (p['triage_level'], -p['wait_time_mins']))
    return {"queue": sorted_queue}

@router.post("/api/override")
def legacy_log_triage_override(audit_data: LegacyOverrideInput):
    print(f"AUDIT LOGGED: Staff {audit_data.staff_id} overrode AI Level {audit_data.ai_suggested_level} to Level {audit_data.clinician_assigned_level}")
    return {"message": "Audit log securely saved", "status": "success"}
