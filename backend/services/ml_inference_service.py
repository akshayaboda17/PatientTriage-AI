"""
Production-grade Clinical ML Inference & Explainability Integration Service for PatientTriage.ai.
Integrates two specialized ML systems:
1. Arrival Triage ML Model: Evaluates initial presentation (T0) and predicts 5-class ESI distributions,
   recommended priority, uncertainty, and calibrated confidence tiers.
2. 24h Decompensation Risk Model: Evaluates longitudinal clinical trend for critical outcomes.
"""
import os
import sys
import uuid
import datetime
import traceback
import numpy as np
from typing import Dict, Any, List, Optional, Tuple

# Ensure ml_pipeline is on python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

from ml_pipeline.arrival_inference_engine import ArrivalTriageInferenceEngine
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
    calibrated arrival triage predictions and longitudinal decompensation risk estimations.
    """

    _arrival_engine: Optional[ArrivalTriageInferenceEngine] = None
    _decomp_engine: Optional[TriageRiskInferenceEngine] = None
    _shap_engine: Optional[ShapExplainabilityEngine] = None
    _engine_load_error: Optional[str] = None

    @classmethod
    def get_arrival_engine(cls, model_version: str = "1.1") -> ArrivalTriageInferenceEngine:
        """
        Singleton accessor for the dedicated Arrival Triage ML inference engine.
        """
        if cls._arrival_engine is None:
            try:
                cls._arrival_engine = ArrivalTriageInferenceEngine(model_version=model_version)
                cls._engine_load_error = None
            except Exception as e:
                cls._engine_load_error = str(e)
                raise RuntimeError(f"Failed to load Arrival Triage ML model bundle (v{model_version}): {e}")
        return cls._arrival_engine

    @classmethod
    def get_decomp_engine(cls, model_version: str = "1.0") -> TriageRiskInferenceEngine:
        """
        Singleton accessor for the 24-hour longitudinal decompensation risk inference engine.
        """
        if cls._decomp_engine is None:
            try:
                cls._decomp_engine = TriageRiskInferenceEngine(model_version=model_version)
            except Exception as e:
                raise RuntimeError(f"Failed to load Decompensation Risk model bundle (v{model_version}): {e}")
        return cls._decomp_engine

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
    def evaluate_arrival_triage(
        cls,
        patient: Patient,
        encounter: EDEncounter,
        arrival_obs: Optional[ClinicalObservation],
        model_version: str = "1.1"
    ) -> Dict[str, Any]:
        """
        Executes dedicated Arrival Triage ML Model using strictly Point-of-Arrival (T0) features.
        Returns 5-class ESI probabilities, recommended priority, and entropy-based uncertainty.
        """
        engine = cls.get_arrival_engine(model_version=model_version)

        patient_dict = {
            "patient_id": patient.patient_id,
            "age": patient.age,
            "gender": patient.gender,
            "hospital_id": patient.hospital_id,
            "medical_history": getattr(patient, "medical_history", None),
            "allergies": getattr(patient, "allergies", None)
        }

        encounter_dict = {
            "encounter_id": encounter.encounter_id,
            "patient_id": patient.patient_id,
            "hospital_id": encounter.hospital_id,
            "arrival_time": encounter.arrival_time.isoformat() if encounter.arrival_time else datetime.datetime.utcnow().isoformat(),
            "arrival_mode": encounter.arrival_mode,
            "chief_complaint": encounter.chief_complaint
        }

        arrival_obs_dict = {
            "observation_id": arrival_obs.id if arrival_obs else 1,
            "timestamp": arrival_obs.timestamp.isoformat() if arrival_obs and arrival_obs.timestamp else datetime.datetime.utcnow().isoformat(),
            "hr": arrival_obs.hr if arrival_obs else 80,
            "sbp": arrival_obs.sbp if arrival_obs else 120,
            "dbp": arrival_obs.dbp if arrival_obs else None,
            "rr": arrival_obs.rr if arrival_obs else 16,
            "spo2": arrival_obs.spo2 if arrival_obs else 98,
            "temp": arrival_obs.temp if arrival_obs else None,
            "gcs": arrival_obs.gcs if arrival_obs else None,
            "pain_score": arrival_obs.pain_score if arrival_obs else None
        }

        return engine.predict_arrival_triage(
            patient_data=patient_dict,
            encounter_data=encounter_dict,
            arrival_obs=arrival_obs_dict
        )

    @classmethod
    def evaluate_encounter(
        cls,
        patient: Patient,
        encounter: EDEncounter,
        current_obs: Optional[ClinicalObservation],
        prior_obs: Optional[ClinicalObservation] = None,
        obs_index: int = 1,
        model_version: str = "1.1"
    ) -> Dict[str, Any]:
        """
        Executes combined ML clinical evaluation:
        1. Arrival Triage ML Model: Strictly predicts recommended care priority (ESI 1–5),
           5-class probability vector, margin, normalized entropy, and calibrated confidence tier.
        2. 24-Hour Longitudinal Decompensation Model: Predicts 24-hour critical deterioration risk.
        3. Local SHAP Feature Attribution & Physiological Drivers.
        """
        arrival_res = cls.evaluate_arrival_triage(
            patient=patient,
            encounter=encounter,
            arrival_obs=current_obs,
            model_version=model_version
        )

        decomp_engine = cls.get_decomp_engine(model_version=model_version)
        shap_engine = cls.get_shap_engine(model_version=model_version)

        # Minimized inputs for 24h decompensation model
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

        decomp_res = decomp_engine.predict_encounter_risk(
            patient_data=patient_dict,
            encounter_data=encounter_dict,
            current_obs=current_obs_dict,
            prior_obs=prior_obs_dict,
            obs_index=obs_index
        )

        # Generate SHAP Local Explanations
        shap_explanation = shap_engine.explain_prediction(
            features_dict=decomp_res["features_snapshot"],
            risk_probability=decomp_res.get("risk_probability", 0.5),
            safety_net_triggered=arrival_res.get("safety_net_triggered", False),
            safety_triggers=arrival_res.get("safety_triggers")
        )

        # Core Safety Dimensions
        from services.age_service import AgeService, AgeGroupEnum
        from services.uncertainty_service import UncertaintyService
        from services.safety_service import SafetyService

        age_group = AgeService.determine_age_group(patient.age)
        age_disclosure = AgeService.get_ml_applicability_disclosure(age_group)

        history_status = SafetyService.classify_history_status(
            getattr(patient, 'medical_history', None),
            getattr(patient, 'allergies', None)
        )
        is_zero_history = (history_status.value == "ZERO_HISTORY_FIRST_TIME")

        discordance_info = SafetyService.detect_clinical_discordance(
            chief_complaint=encounter.chief_complaint or "",
            vitals=current_obs_dict,
            age_group=age_group
        )

        # Composite Safety Status
        safety_status_info = SafetyService.determine_safety_status(
            ai_risk_category=decomp_res.get("risk_category", "LOW"),
            confidence_level=arrival_res.get("confidence_tier", "HIGH"),
            wait_threshold_exceeded=False,
            has_active_deterioration=arrival_res.get("safety_net_triggered", False),
            has_discordance=discordance_info["is_discordant"],
            age_group=age_group,
            is_zero_history=is_zero_history
        )

        # Assemble Enriched Unified Inference Result
        inference_result = {
            # Arrival Triage ML Outputs (Primary for ESI Acuity)
            "predicted_triage_level": arrival_res["predicted_priority"],
            "recommended_priority": arrival_res["predicted_priority"],
            "predicted_priority_name": arrival_res["predicted_priority_name"],
            "probabilities": arrival_res["class_probabilities"],
            "confidence_score": arrival_res["confidence_score"],
            "confidence_tier": arrival_res["confidence_tier"],
            "confidence": arrival_res["confidence_tier"],
            "uncertainty_score": arrival_res["uncertainty_score"],
            "normalized_entropy": arrival_res["normalized_entropy"],
            "decision_margin": arrival_res["margin"],
            "top_1_probability": arrival_res["top_1_probability"],
            "top_2_probability": arrival_res["top_2_probability"],
            "contributing_factors": arrival_res["contributing_factors"],
            "arrival_model_name": arrival_res["model_name"],
            "arrival_model_version": arrival_res["model_version"],

            # 24h Longitudinal Decompensation Risk Outputs
            "risk_score": decomp_res["risk_score"],
            "risk_probability": decomp_res["risk_probability"],
            "risk_category": decomp_res["risk_category"],
            "shock_index": decomp_res["shock_index"],
            "qsofa": decomp_res["qsofa"],
            "mews": decomp_res["mews"],
            "model_name": arrival_res["model_name"],
            "model_version": model_version,
            "features_snapshot": arrival_res.get("features_snapshot", {}),

            # Safety & Escalation
            "safety_net_triggered": arrival_res.get("safety_net_triggered", False),
            "safety_triggers": arrival_res.get("safety_triggers", []),
            "safety_escalation_required": arrival_res.get("safety_escalation_required", False),
            "age_group": age_group.value,
            "age_disclosure": age_disclosure,
            "history_status": history_status.value,
            "discordance_info": discordance_info,
            "safety_status": safety_status_info["status"],
            "safety_reasons": safety_status_info["reasons"]
        }

        # Enhance explanations with arrival contributing factors
        if "top_features" in shap_explanation:
            shap_explanation["contributing_factors"] = arrival_res["contributing_factors"]

        return {
            "inference": inference_result,
            "explanations": shap_explanation
        }
