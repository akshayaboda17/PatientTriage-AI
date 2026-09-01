"""
Dedicated Arrival Triage Inference Engine for PatientTriage.ai (Task 4 v1.1).
Executes multi-class ESI 1–5 risk predictions on Point-of-Arrival (T0) intake features.
Integrates age-aware intelligence, data quality completeness grading, clinical negation handling,
asymmetric safety-first escalation under uncertainty, and explainable attributions.
"""
import os
import json
import joblib
import numpy as np
import pandas as pd
from typing import Dict, Any, List, Optional

from ml_pipeline.arrival_schema import (
    ARRIVAL_ALL_FEATURE_COLUMNS,
    ARRIVAL_TARGET_CLASSES,
    ARRIVAL_TARGET_CLASS_NAMES
)
from ml_pipeline.arrival_feature_extractor import ArrivalFeatureExtractor
from ml_pipeline.arrival_preprocessor import ArrivalClinicalPreprocessor
from ml_pipeline.age_reference_provider import AgeAwareReferenceProvider
from ml_pipeline.data_quality_engine import DataQualityEngine

class ArrivalTriageInferenceEngine:
    """
    Candidate Inference Engine for Point-of-Arrival Triage (v1.1).
    Loads versioned arrival model bundle and produces calibrated 5-class ESI predictions.
    """

    def __init__(self, model_version: str = "1.1"):
        self.model_version = model_version
        base_dir = os.path.dirname(__file__)
        models_dir = os.path.join(base_dir, "models", "arrival_triage")

        self.model_path = os.path.join(models_dir, f"arrival_triage_model_v{model_version}.joblib")
        self.preprocessor_path = os.path.join(models_dir, f"arrival_preprocessor_v{model_version}.joblib")
        self.metadata_path = os.path.join(models_dir, f"model_metadata_v{model_version}.json")

        if not os.path.exists(self.model_path) or not os.path.exists(self.preprocessor_path):
            # Fallback to v1.0 if v1.1 not yet built
            if model_version != "1.0":
                fallback_path = os.path.join(models_dir, "arrival_triage_model_v1.0.joblib")
                if os.path.exists(fallback_path):
                    self.model_version = "1.0"
                    self.model_path = fallback_path
                    self.preprocessor_path = os.path.join(models_dir, "arrival_preprocessor_v1.0.joblib")
                    self.metadata_path = os.path.join(models_dir, "model_metadata_v1.0.json")

        if not os.path.exists(self.model_path) or not os.path.exists(self.preprocessor_path):
            raise FileNotFoundError(
                f"Arrival Triage model bundle for version '{model_version}' not found in {models_dir}."
            )

        self.model = joblib.load(self.model_path)
        self.preprocessor = ArrivalClinicalPreprocessor.load(self.preprocessor_path)

        with open(self.metadata_path, "r") as f:
            self.metadata = json.load(f)

    def deterministic_safety_net(self, arrival_obs: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Deterministic safety net: Immediately escalates catastrophic vitals to Level 1.
        """
        spo2 = arrival_obs.get("spo2")
        gcs = arrival_obs.get("gcs")
        sbp = arrival_obs.get("sbp")

        triggers = []
        if spo2 is not None and float(spo2) < 85.0:
            triggers.append(f"Critical Hypoxia (SpO2={spo2}%)")
        if gcs is not None and float(gcs) <= 8.0:
            triggers.append(f"Severe Coma / Unresponsive (GCS={gcs})")
        if sbp is not None and float(sbp) < 70.0:
            triggers.append(f"Profound Hypotension / Shock (SBP={sbp}mmHg)")

        if triggers:
            return {
                "predicted_priority": 1,
                "predicted_priority_name": ARRIVAL_TARGET_CLASS_NAMES[1],
                "class_probabilities": {
                    "1": 1.0,
                    "2": 0.0,
                    "3": 0.0,
                    "4": 0.0,
                    "5": 0.0
                },
                "confidence_score": 100.0,
                "confidence_tier": "HIGH",
                "uncertainty_score": 0.0,
                "normalized_entropy": 0.0,
                "safety_net_triggered": True,
                "safety_triggers": triggers,
                "safety_escalation_required": True,
                "safety_escalation_reason": f"Deterministic safety interlock triggered by: {'; '.join(triggers)}",
                "model_name": self.metadata.get("model_name", "Arrival Triage Model"),
                "model_version": self.model_version
            }
        return None

    def predict_arrival_triage(
        self,
        patient_data: Dict[str, Any],
        encounter_data: Dict[str, Any],
        arrival_obs: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Generates calibrated 5-class ESI probability distribution, data quality assessment,
        and asymmetric safety-first decision support.
        """
        # 1. Evaluate Deterministic Safety Net First
        safety_net_res = self.deterministic_safety_net(arrival_obs)
        if safety_net_res:
            features = ArrivalFeatureExtractor.extract_arrival_features(
                patient_data=patient_data,
                encounter_data=encounter_data,
                arrival_obs=arrival_obs
            )
            age = float(patient_data.get("age", 45.0))
            age_group = AgeAwareReferenceProvider.get_age_group(age)
            dq_res = DataQualityEngine.evaluate_data_quality(patient_data, encounter_data, arrival_obs)

            return {
                **safety_net_res,
                "age_group": age_group,
                "data_completeness_score": dq_res["data_completeness_score"],
                "data_quality_tier": dq_res["data_quality_tier"],
                "data_limitations": dq_res["data_limitations"],
                "features_snapshot": features
            }

        # 2. Extract Strict T0 Feature Vector
        features = ArrivalFeatureExtractor.extract_arrival_features(
            patient_data=patient_data,
            encounter_data=encounter_data,
            arrival_obs=arrival_obs
        )

        age = float(patient_data.get("age", 45.0))
        age_group = AgeAwareReferenceProvider.get_age_group(age)
        dq_res = DataQualityEngine.evaluate_data_quality(patient_data, encounter_data, arrival_obs)

        # 3. Preprocess Features
        df_single = pd.DataFrame([features])
        X = self.preprocessor.transform(df_single)

        # 4. Model Prediction & Probabilities
        prob_array = self.model.predict_proba(X)[0]
        pred_class = int(self.model.predict(X)[0])

        # Verify classes mapping
        model_classes = list(self.model.classes_)
        class_probs = {}
        for cls_k in ARRIVAL_TARGET_CLASSES:
            if cls_k in model_classes:
                idx = model_classes.index(cls_k)
                class_probs[str(cls_k)] = round(float(prob_array[idx]), 4)
            else:
                class_probs[str(cls_k)] = 0.0

        # Normalization verification
        prob_sum = sum(class_probs.values())
        if abs(prob_sum - 1.0) > 1e-4 and prob_sum > 0:
            class_probs = {k: round(v / prob_sum, 4) for k, v in class_probs.items()}

        # 5. Uncertainty & Confidence Calculations
        sorted_probs = sorted(class_probs.values(), reverse=True)
        top1_prob = sorted_probs[0]
        top2_prob = sorted_probs[1] if len(sorted_probs) > 1 else 0.0
        margin = round(float(top1_prob - top2_prob), 4)

        # Normalized Entropy: H = - sum(p * log2(p)) / log2(5)
        eps = 1e-12
        entropy = -sum(p * np.log2(p + eps) for p in class_probs.values() if p > 0)
        norm_entropy = round(float(entropy / np.log2(5.0)), 4)

        uncertainty_score = round(float(1.0 - margin), 4)
        confidence_score = round(top1_prob * 100.0, 2)

        # Confidence Tiering
        if margin >= 0.35 and top1_prob >= 0.65:
            confidence_tier = "HIGH"
        elif margin >= 0.15:
            confidence_tier = "MODERATE"
        else:
            confidence_tier = "LOW"

        # 6. Safety-First Asymmetric Escalation Policy
        # Under-triage is more dangerous than over-triage.
        # If model is uncertain near high acuity (ESI 1 or 2) or decision margin is tight:
        # Do NOT silently downgrade. Surface for clinical reassessment.
        safety_escalation = False
        escalation_reason = ""
        recommended_priority = pred_class

        # Check for high uncertainty or decision boundary ambiguity near high acuity
        if confidence_tier == "LOW" or norm_entropy > 0.65:
            safety_escalation = True
            escalation_reason = "Uncertain triage distribution — clinical reassessment required."
            # If ESI 2 has significant probability (e.g. >= 30%) and pred_class is ESI 3, recommend ESI 2 for safety
            if class_probs.get("2", 0.0) >= 0.30 and pred_class >= 3:
                recommended_priority = 2
                escalation_reason = "Uncertain high-acuity assessment (P(ESI 2) >= 30%) — safety policy prioritizes Emergent review."

        elif pred_class <= 2 and margin < 0.20:
            safety_escalation = True
            escalation_reason = "Decision boundary proximity near critical care threshold."

        elif age_group == "PEDIATRIC" and dq_res["vital_missing_count"] > 0:
            safety_escalation = True
            escalation_reason = "Pediatric patient with uncollected bedside vitals — mandatory clinical review."

        # 7. Explanatory Contributing Factors (Top physiological drivers)
        contributing_factors = []
        
        # Age group context
        if age_group == "PEDIATRIC":
            contributing_factors.append("Age group (Pediatric) contributed to the AI assessment.")
        elif age_group == "GERIATRIC":
            contributing_factors.append("Age group (Geriatric) contributed to the AI assessment.")

        # Vitals context
        if features.get("hr", 80) > 110:
            contributing_factors.append(f"Elevated Heart Rate ({features['hr']} bpm)")
        elif features.get("hr", 80) < 50:
            contributing_factors.append(f"Marked Bradycardia ({features['hr']} bpm)")

        if features.get("spo2", 98) < 94:
            contributing_factors.append(f"Borderline/Severe Hypoxia (SpO2 {features['spo2']}%)")

        if features.get("rr", 16) >= 24:
            contributing_factors.append(f"Tachypnea / Elevated Work of Breathing (RR {features['rr']}/min)")

        if features.get("sbp", 120) < 90:
            contributing_factors.append(f"Hypotension / Impaired Perfusion (SBP {features['sbp']} mmHg)")

        if features.get("shock_index", 0.7) >= 0.9:
            contributing_factors.append(f"Elevated Shock Index ({features['shock_index']})")

        if features.get("pain_score", 0) >= 7:
            contributing_factors.append(f"Severe Reported Pain Level ({features['pain_score']}/10)")

        if not contributing_factors:
            contributing_factors.append("Arrival vital signs within expected baseline parameters")

        return {
            "predicted_priority": recommended_priority,
            "predicted_priority_name": ARRIVAL_TARGET_CLASS_NAMES.get(recommended_priority, f"ESI {recommended_priority}"),
            "raw_predicted_class": pred_class,
            "class_probabilities": class_probs,
            "top_1_probability": top1_prob,
            "top_2_probability": top2_prob,
            "margin": margin,
            "confidence_score": confidence_score,
            "confidence_tier": confidence_tier,
            "uncertainty_score": uncertainty_score,
            "normalized_entropy": norm_entropy,
            "safety_net_triggered": False,
            "safety_triggers": [],
            "safety_escalation_required": safety_escalation,
            "safety_escalation_reason": escalation_reason,
            "age_group": age_group,
            "data_completeness_score": dq_res["data_completeness_score"],
            "data_quality_tier": dq_res["data_quality_tier"],
            "data_limitations": dq_res["data_limitations"],
            "contributing_factors": contributing_factors,
            "model_name": self.metadata.get("model_name", "Arrival Triage Model"),
            "model_version": self.model_version,
            "features_snapshot": features
        }
