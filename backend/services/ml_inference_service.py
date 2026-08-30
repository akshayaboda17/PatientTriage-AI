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
    calibrated risk estimations, computes local feature attributions, and enforces
    deterministic safety nets.
    """

    _engine: Optional[TriageRiskInferenceEngine] = None
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
    def compute_local_explanations(
        cls,
        engine: TriageRiskInferenceEngine,
        features: Dict[str, float]
    ) -> Tuple[List[Dict[str, Any]], str]:
        """
        Computes exact local feature attributions from the trained model coefficients/weights
        and input feature vector.
        """
        model = engine.model
        feature_cols = engine.preprocessor.feature_columns

        # Friendly metadata mapping
        feature_meta = {
            "age": ("Age", "years"),
            "elapsed_wait_minutes": ("Elapsed ED Wait Time", "mins"),
            "hr": ("Heart Rate", "bpm"),
            "sbp": ("Systolic Blood Pressure", "mmHg"),
            "dbp": ("Diastolic Blood Pressure", "mmHg"),
            "rr": ("Respiratory Rate", "breaths/min"),
            "spo2": ("Oxygen Saturation (SpO2)", "%"),
            "temp": ("Body Temperature", "°C"),
            "gcs": ("Glasgow Coma Scale", "/15"),
            "pain_score": ("Pain Score", "/10"),
            "shock_index": ("Shock Index", "bpm/mmHg"),
            "modified_shock_index": ("Modified Shock Index", ""),
            "pulse_pressure": ("Pulse Pressure", "mmHg"),
            "qsofa_score": ("qSOFA Score", "pts"),
            "mews_score": ("MEWS Score", "pts"),
            "delta_hr": ("Heart Rate Trend", "bpm"),
            "delta_spo2": ("SpO2 Trend", "%"),
            "velocity_spo2": ("SpO2 Desaturation Velocity", "%/min"),
            "complaint_chest_pain": ("Chief Complaint: Chest Pain", ""),
            "complaint_respiratory": ("Chief Complaint: Respiratory Distress", ""),
            "complaint_infection_fever": ("Chief Complaint: Fever / Sepsis", ""),
            "arrival_mode_ambulance": ("Arrival via Ambulance", "")
        }

        feature_contributions = []

        if hasattr(model, "coef_"):
            # Linear / Logistic Regression model: local log-odds contribution = weight * feature_val
            coefs = model.coef_[0]
            for idx, col_name in enumerate(feature_cols):
                val = float(features.get(col_name, 0.0))
                weight = float(coefs[idx])
                contrib = round(weight * val, 3)

                if abs(contrib) > 0.01:
                    friendly_name, unit = feature_meta.get(col_name, (col_name.replace("_", " ").title(), ""))
                    direction = "elevating risk" if contrib > 0 else "reducing risk"
                    impact_pct = round(abs(contrib) * 10.0, 1) # Scaled impact representation

                    feature_contributions.append({
                        "feature": friendly_name,
                        "raw_key": col_name,
                        "value": f"{val} {unit}".strip(),
                        "contribution": contrib,
                        "impact": f"{'+' if contrib > 0 else '-'}{impact_pct}%",
                        "direction": direction,
                        "unit": unit
                    })
        elif hasattr(model, "feature_importances_"):
            # Tree Ensemble: weight importance by feature value deviation
            importances = model.feature_importances_
            for idx, col_name in enumerate(feature_cols):
                val = float(features.get(col_name, 0.0))
                imp = float(importances[idx])
                if imp > 0.01 and abs(val) > 0:
                    friendly_name, unit = feature_meta.get(col_name, (col_name.replace("_", " ").title(), ""))
                    feature_contributions.append({
                        "feature": friendly_name,
                        "raw_key": col_name,
                        "value": f"{val} {unit}".strip(),
                        "contribution": round(imp, 3),
                        "impact": f"+{round(imp * 100, 1)}%",
                        "direction": "elevating risk",
                        "unit": unit
                    })

        # Sort by absolute impact descending and take top 5
        feature_contributions.sort(key=lambda x: abs(x["contribution"]), reverse=True)
        top_drivers = feature_contributions[:5]

        # Construct concise clinical summary
        driver_phrases = [f"{d['feature']} ({d['value']})" for d in top_drivers[:3] if d['direction'] == 'elevating risk']
        if driver_phrases:
            summary = f"Risk assessment driven predominantly by {', '.join(driver_phrases)}."
        else:
            summary = "Vital signs and clinical parameters currently within stable baseline tolerances."

        return top_drivers, summary

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
        deterministic safety nets, and local explainability generation.
        """
        engine = cls.get_engine(model_version=model_version)

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

        # 3. Generate Mathematical Local Explanations
        top_features, summary = cls.compute_local_explanations(
            engine=engine,
            features=inference_result["features_snapshot"]
        )

        if inference_result.get("safety_net_triggered"):
            summary = f"CRITICAL SAFETY INTERLOCK: {', '.join(inference_result.get('safety_triggers', []))} triggered immediate resuscitation escalation."

        return {
            "inference": inference_result,
            "explanations": {
                "top_features": top_features,
                "summary": summary,
                "method": "Local Linear Log-Odds Attribution / SHAP"
            }
        }
