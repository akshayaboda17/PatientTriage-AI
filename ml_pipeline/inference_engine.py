import os
import json
import joblib
import numpy as np
import pandas as pd
from typing import Dict, Any, List, Optional
from ml_pipeline.schema import ALL_FEATURE_COLUMNS
from ml_pipeline.feature_extractor import ClinicalFeatureExtractor
from ml_pipeline.preprocessor import ClinicalPreprocessor

class TriageRiskInferenceEngine:
    """
    Production Candidate Inference Engine for PatientTriage.ai.
    Loads versioned model artifacts and executes reproducible probability estimation,
    acuity level mapping, and safety net verification.
    """

    def __init__(self, model_version: str = "1.0"):
        self.model_version = model_version
        base_dir = os.path.dirname(__file__)
        models_dir = os.path.join(base_dir, "models")
        
        self.model_path = os.path.join(models_dir, f"triage_risk_model_v{model_version}.joblib")
        self.preprocessor_path = os.path.join(models_dir, f"preprocessor_v{model_version}.joblib")
        self.metadata_path = os.path.join(models_dir, f"model_metadata_v{model_version}.json")

        if not os.path.exists(self.model_path) or not os.path.exists(self.preprocessor_path):
            raise FileNotFoundError(f"Model artifacts for version '{model_version}' not found in {models_dir}")

        self.model = joblib.load(self.model_path)
        self.preprocessor = ClinicalPreprocessor.load(self.preprocessor_path)
        
        with open(self.metadata_path, "r") as f:
            self.metadata = json.load(f) if hasattr(json, "load") else {}

    def deterministic_safety_net(self, current_obs: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Deterministic safety net: Immediately escalates catastrophic vitals to Level 1.
        """
        spo2 = current_obs.get("spo2", 98)
        gcs = current_obs.get("gcs", 15)
        sbp = current_obs.get("sbp", 120)

        triggers = []
        if spo2 is not None and spo2 < 85:
            triggers.append(f"Critical Hypoxia (SpO2={spo2}%)")
        if gcs is not None and gcs <= 8:
            triggers.append(f"Severe Coma/Unresponsive (GCS={gcs})")
        if sbp is not None and sbp < 70:
            triggers.append(f"Profound Hypotension/Shock (SBP={sbp}mmHg)")

        if triggers:
            return {
                "triage_level": 1,
                "predicted_triage_level": 1,
                "risk_score": 99.0,
                "risk_category": "CRITICAL",
                "confidence_score": 100.0,
                "safety_net_triggered": True,
                "safety_triggers": triggers
            }
        return None

    def predict_encounter_risk(
        self,
        patient_data: Dict[str, Any],
        encounter_data: Dict[str, Any],
        current_obs: Dict[str, Any],
        prior_obs: Optional[Dict[str, Any]] = None,
        obs_index: int = 1
    ) -> Dict[str, Any]:
        """
        Generates risk prediction, probability distribution, and acuity level.
        """
        # 1. Evaluate Deterministic Safety Net First
        safety_result = self.deterministic_safety_net(current_obs)
        if safety_result:
            return {
                **safety_result,
                "model_version": self.model_version,
                "model_name": self.metadata.get("model_name", "PatientTriage Model"),
                "features_snapshot": ClinicalFeatureExtractor.extract_point_in_time_features(
                    patient_data=patient_data,
                    encounter_data=encounter_data,
                    current_obs=current_obs,
                    prior_obs=prior_obs,
                    obs_index=obs_index
                )
            }

        # 2. Extract Exact 40-Dimensional Feature Vector
        features = ClinicalFeatureExtractor.extract_point_in_time_features(
            patient_data=patient_data,
            encounter_data=encounter_data,
            current_obs=current_obs,
            prior_obs=prior_obs,
            obs_index=obs_index
        )

        # 3. Preprocess Features
        df_single = pd.DataFrame([features])
        X = self.preprocessor.transform(df_single)

        # 4. Model Prediction
        prob_positive = float(self.model.predict_proba(X)[0, 1])
        risk_score = round(prob_positive * 100.0, 2)

        # 5. Acuity & Category Mapping
        spo2_val = current_obs.get("spo2") if current_obs.get("spo2") is not None else 98
        gcs_val = current_obs.get("gcs") if current_obs.get("gcs") is not None else 15
        pain_val = current_obs.get("pain_score") if current_obs.get("pain_score") is not None else 0

        if risk_score >= 80.0:
            risk_category = "CRITICAL"
            predicted_esi = 1 if spo2_val < 90 or gcs_val < 13 else 2
        elif risk_score >= 50.0:
            risk_category = "HIGH"
            predicted_esi = 2
        elif risk_score >= 20.0:
            risk_category = "MODERATE"
            predicted_esi = 3
        else:
            risk_category = "LOW"
            predicted_esi = 4 if pain_val > 4 else 5

        # Confidence: distance from decision threshold 0.50
        confidence = round(max(prob_positive, 1.0 - prob_positive) * 100.0, 2)

        return {
            "risk_score": risk_score,
            "risk_probability": prob_positive,
            "risk_category": risk_category,
            "predicted_triage_level": predicted_esi,
            "confidence_score": confidence,
            "shock_index": features["shock_index"],
            "qsofa": int(features["qsofa_score"]),
            "mews": int(features["mews_score"]),
            "safety_net_triggered": False,
            "model_name": self.metadata.get("model_name", "PatientTriage Model"),
            "model_version": self.model_version,
            "features_snapshot": features
        }
