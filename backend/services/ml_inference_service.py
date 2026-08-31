import os
import sys
import uuid
import datetime
import traceback
import numpy as np
from typing import Dict, Any, List, Optional, Tuple

# Ensure ml_pipeline is on python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

from ml_pipeline.inference_engine import TriageRiskInferenceEngine
from ml_pipeline.explainability_engine import ShapExplainabilityEngine
from ml_pipeline.schema import (
    ALL_FEATURE_COLUMNS,
    NUMERICAL_FEATURE_COLUMNS,
    CATEGORICAL_BINARY_FEATURE_COLUMNS,
    PROHIBITED_LEAKAGE_COLUMNS
)
from models import (
    Patient, EDEncounter, ClinicalObservation,
    AIRiskAssessment, AIExplanation, AIRiskCategoryEnum
)

class MLInferenceService:
    """
    Production-grade Clinical ML Inference & Explainability Integration Service.
    Loads candidate model artifacts, executes strict schema validation, generates
    calibrated risk estimations, computes local SHAP feature attributions, and enforces
    deterministic safety nets.
    """

    _engine: Optional[TriageRiskInferenceEngine] = None
    _shap_engine: Optional[ShapExplainabilityEngine] = None
    _engine_load_error: Optional[str] = None

    @classmethod
    def get_engine(cls, model_version: str = "1.0") -> TriageRiskInferenceEngine:
        """
        Singleton accessor for the candidate inference engine.
        """
        if cls._engine is None:
            try:
                cls._engine = TriageRiskInferenceEngine(model_version=model_version)
                cls._engine_load_error = None
            except Exception as e:
                cls._engine_load_error = str(e)
                raise RuntimeError(f"Failed to load ML candidate model bundle (v{model_version}): {e}")
        return cls._engine

    @classmethod
    def get_shap_engine(cls, model_version: str = "1.0") -> ShapExplainabilityEngine:
        """
        Singleton accessor for the SHAP explainability engine.
        """
        if cls._shap_engine is None:
            try:
                cls._shap_engine = ShapExplainabilityEngine(model_version=model_version)
            except Exception as e:
                raise RuntimeError(f"Failed to load SHAP explainability engine (v{model_version}): {e}")
        return cls._shap_engine

    @classmethod
    def evaluate_encounter(
        cls,
        patient: Patient,
        encounter: EDEncounter,
        current_obs: Optional[ClinicalObservation],
        prior_obs: Optional[ClinicalObservation] = None,
        obs_index: int = 1,
        model_version: str = "1.0"
    ) -> Dict[str, Any]:
        """
        Executes ML inference on an encounter with strict data minimization,
        deterministic safety nets, and genuine mathematical SHAP explainability.
        """
        engine = cls.get_engine(model_version=model_version)
        shap_engine = cls.get_shap_engine(model_version=model_version)

        # 1. Anonymized / Minimized Input Dictionaries
        patient_dict = {
            "patient_id": patient.patient_id,
            "age": patient.age,
            "gender": patient.gender,
            "hospital_id": patient.hospital_id
        }

        encounter_dict = {
            "encounter_id": encounter.encounter_id,
            "patient_id": patient.patient_id,
            "hospital_id": encounter.hospital_id,
            "arrival_time": encounter.arrival_time.isoformat() if encounter.arrival_time else datetime.datetime.utcnow().isoformat(),
            "arrival_mode": encounter.arrival_mode,
            "chief_complaint": encounter.chief_complaint
        }

        current_obs_dict = {
            "observation_id": current_obs.id if current_obs else 1,
            "timestamp": current_obs.timestamp.isoformat() if current_obs and current_obs.timestamp else datetime.datetime.utcnow().isoformat(),
            "hr": current_obs.hr if current_obs else 80,
            "sbp": current_obs.sbp if current_obs else 120,
            "dbp": current_obs.dbp if current_obs else None,
            "rr": current_obs.rr if current_obs else 16,
            "spo2": current_obs.spo2 if current_obs else 98,
            "temp": current_obs.temp if current_obs else None,
            "gcs": current_obs.gcs if current_obs else None,
            "pain_score": current_obs.pain_score if current_obs else None
        }

        prior_obs_dict = None
        if prior_obs:
            prior_obs_dict = {
                "observation_id": prior_obs.id,
                "timestamp": prior_obs.timestamp.isoformat() if prior_obs.timestamp else None,
                "hr": prior_obs.hr,
                "sbp": prior_obs.sbp,
                "dbp": prior_obs.dbp,
                "rr": prior_obs.rr,
                "spo2": prior_obs.spo2,
                "temp": prior_obs.temp,
                "gcs": prior_obs.gcs,
                "pain_score": prior_obs.pain_score
            }

        # 2. Execute Inference Engine
        inference_result = engine.predict_encounter_risk(
            patient_data=patient_dict,
            encounter_data=encounter_dict,
            current_obs=current_obs_dict,
            prior_obs=prior_obs_dict,
            obs_index=obs_index
        )

        # 3. Generate Genuine SHAP Local Explanations
        shap_explanation = shap_engine.explain_prediction(
            features_dict=inference_result["features_snapshot"],
            risk_probability=inference_result.get("risk_probability", 0.5),
            safety_net_triggered=inference_result.get("safety_net_triggered", False),
            safety_triggers=inference_result.get("safety_triggers")
        )

        # 4. Round 2 Core Dimensions: Age Group, Uncertainty, Discordance & Safety Status
        from services.age_service import AgeService, AgeGroupEnum
        from services.uncertainty_service import UncertaintyService
        from services.safety_service import SafetyService

        age_group = AgeService.determine_age_group(patient.age)
        age_disclosure = AgeService.get_ml_applicability_disclosure(age_group)

        # Count imputed/missing features in snapshot
        features_snapshot = inference_result.get("features_snapshot", {})
        imputed_count = sum(1 for v in features_snapshot.values() if v is None or (isinstance(v, float) and np.isnan(v)))

        # History status
        history_status = SafetyService.classify_history_status(
            getattr(patient, 'medical_history', None),
            getattr(patient, 'allergies', None)
        )
        is_zero_history = (history_status.value == "ZERO_HISTORY_FIRST_TIME")

        # Discordance detection
        discordance_info = SafetyService.detect_clinical_discordance(
            chief_complaint=encounter.chief_complaint or "",
            vitals=current_obs_dict,
            age_group=age_group
        )

        # Composite Uncertainty & Confidence estimation
        prob = float(inference_result.get("risk_probability", 0.5))
        uncertainty_info = UncertaintyService.calculate_uncertainty(
            probability=prob,
            imputed_feature_count=imputed_count,
            total_feature_count=len(features_snapshot) if features_snapshot else 40,
            age_group=age_group,
            has_discordant_signals=discordance_info["is_discordant"],
            is_zero_history=is_zero_history
        )

        # Workflow Safety Status
        safety_status_info = SafetyService.determine_safety_status(
            ai_risk_category=inference_result.get("risk_category", "LOW"),
            confidence_level=uncertainty_info["confidence"],
            wait_threshold_exceeded=False,
            has_active_deterioration=inference_result.get("safety_net_triggered", False),
            has_discordance=discordance_info["is_discordant"],
            age_group=age_group,
            is_zero_history=is_zero_history
        )

        # Attach Round 2 dimensions to inference result
        inference_result["age_group"] = age_group.value
        inference_result["age_disclosure"] = age_disclosure
        inference_result["confidence"] = uncertainty_info["confidence"]
        inference_result["uncertainty_score"] = uncertainty_info["uncertainty_score"]
        inference_result["uncertainty_info"] = uncertainty_info
        inference_result["history_status"] = history_status.value
        inference_result["discordance_info"] = discordance_info
        inference_result["safety_status"] = safety_status_info["status"]
        inference_result["safety_reasons"] = safety_status_info["reasons"]

        return {
            "inference": inference_result,
            "explanations": shap_explanation
        }
