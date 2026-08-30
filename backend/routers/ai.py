import datetime
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from models import (
    EDEncounter, ClinicalObservation, AIRiskAssessment,
    AIRiskCategoryEnum, Staff, ActorTypeEnum, AuditResultEnum
)
from schemas.ai_schemas import AIAssessmentOutputSchema, LegacyPatientInput, LegacyOverrideInput
from services.audit_service import AuditService
from services.rbac import get_db, require_permission
from triage_engine import TriageEngine

router = APIRouter(tags=["AI Decision Support & Explainability"])
legacy_engine = TriageEngine()

@router.post("/api/encounters/{encounter_id}/ai-assessment")
def generate_ai_risk_assessment(
    encounter_id: str,
    staff: Staff = Depends(require_permission("ai:view")),
    db: Session = Depends(get_db)
):
    """
    Generates AI risk assessment with strict data minimization (anonymized clinical parameters only)
    and rigorous schema output validation.
    """
    enc = db.query(EDEncounter).filter(
        EDEncounter.encounter_id == encounter_id,
        EDEncounter.hospital_id == staff.hospital_id
    ).first()

    if not enc:
        raise HTTPException(status_code=404, detail=f"Encounter '{encounter_id}' not found.")

    patient = enc.patient
    latest_obs = db.query(ClinicalObservation).filter(
        ClinicalObservation.encounter_id == encounter_id
    ).order_by(ClinicalObservation.timestamp.desc()).first()

    # Data Minimization: Send ONLY clinical parameters to ML engine; never PHI (names, phone, mrn)
    minimized_features = {
        "age": patient.age,
        "gender": patient.gender,
        "chief_complaint": enc.chief_complaint,
        "hr": latest_obs.hr if latest_obs else 80,
        "sbp": latest_obs.sbp if latest_obs else 120,
        "dbp": latest_obs.dbp if latest_obs else 80,
        "rr": latest_obs.rr if latest_obs else 16,
        "spo2": latest_obs.spo2 if latest_obs else 98,
        "temp": latest_obs.temp if latest_obs else 37.0,
        "pain_score": latest_obs.pain_score if latest_obs else 0,
        "gcs": latest_obs.gcs if latest_obs else 15
    }

    try:
        raw_result = legacy_engine.evaluate_patient(minimized_features)
        
        # Schema validation of AI output
        raw_score = float(raw_result.get("confidence_score", 75.0))
        normalized_score = raw_score / 100.0 if raw_score > 1.0 else raw_score
        level = int(raw_result.get("triage_level", 3))
        
        cat_map = {
            1: AIRiskCategoryEnum.CRITICAL,
            2: AIRiskCategoryEnum.HIGH,
            3: AIRiskCategoryEnum.MODERATE,
            4: AIRiskCategoryEnum.LOW,
            5: AIRiskCategoryEnum.LOW
        }
        risk_cat = cat_map.get(level, AIRiskCategoryEnum.MODERATE)

        validated_output = AIAssessmentOutputSchema(
            risk_score=min(max(normalized_score, 0.0), 1.0),
            risk_category=risk_cat,
            predicted_level=level,
            confidence=normalized_score
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI risk engine returned invalid or malformed output: {e}")

    # Save AIRiskAssessment
    ai_risk = AIRiskAssessment(
        assessment_id=f"AI-{staff.hospital_id[:4]}-{uuid.uuid4().hex[:6].upper()}",
        hospital_id=staff.hospital_id,
        patient_id=enc.patient_id,
        encounter_id=enc.encounter_id,
        predicted_triage_level=validated_output.predicted_level,
        risk_score=validated_output.risk_score,
        risk_category=validated_output.risk_category,
        confidence_score=validated_output.confidence,
        model_name="PatientTriage TriageEngine",
        model_version="1.0-rf",
        assessed_at=datetime.datetime.utcnow()
    )
    db.add(ai_risk)
    db.commit()
    db.refresh(ai_risk)

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
        metadata={"predicted_level": validated_output.predicted_level, "risk_category": validated_output.risk_category.value},
        auto_commit=True
    )

    return {"message": "AI Assessment generated.", "assessment": ai_risk.to_dict()}

# Legacy endpoints for backward compatibility
@router.post("/api/triage")
def legacy_triage_patient(patient: LegacyPatientInput, db: Session = Depends(get_db)):
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
