"""
Production-Grade Longitudinal Patient Deterioration Inference Engine for PatientTriage.ai (Task 3).
Evaluates patient trajectory [T0 -> T1 -> ... -> Tn], enforces deterministic safety interlocks,
predicts calibrated deterioration probabilities, recommends clinically governed priority escalation,
and generates human-interpretable physiological explanations.
"""
import os
import json
import datetime
import joblib
import numpy as np
import pandas as pd
from typing import Dict, Any, List, Optional, Union, Tuple

from ml_pipeline.longitudinal_schema import LONGITUDINAL_FEATURE_COLUMNS
from ml_pipeline.longitudinal_feature_extractor import LongitudinalFeatureExtractor
from ml_pipeline.longitudinal_preprocessor import LongitudinalPreprocessor

class DeteriorationInferenceEngine:
    """
    Longitudinal Deterioration Inference Engine.
    Combines deterministic clinical safety nets with a calibrated ML trajectory model.
    """

    def __init__(self, model_version: str = "1.0"):
        self.model_version = model_version
        base_dir = os.path.dirname(__file__)
        models_dir = os.path.join(base_dir, "models", "deterioration")

        self.model_path = os.path.join(models_dir, f"deterioration_model_v{model_version}.joblib")
        self.preprocessor_path = os.path.join(models_dir, f"deterioration_preprocessor_v{model_version}.joblib")
        self.metadata_path = os.path.join(models_dir, f"deterioration_metadata_v{model_version}.json")

        if not os.path.exists(self.model_path) or not os.path.exists(self.preprocessor_path):
            raise FileNotFoundError(f"Deterioration model artifacts (v{model_version}) not found in {models_dir}")

        self.model = joblib.load(self.model_path)
        self.preprocessor = LongitudinalPreprocessor.load(self.preprocessor_path)

        with open(self.metadata_path, "r") as f:
            self.metadata = json.load(f)

    def deterministic_safety_net(self, observations: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """
        Deterministic safety interlock: Immediately triggers critical escalation
        if catastrophic vital signs or collapse are observed.
        """
        if not observations:
            return None

        curr_obs = observations[-1]
        hr = curr_obs.get("hr")
        sbp = curr_obs.get("sbp")
        spo2 = curr_obs.get("spo2")
        rr = curr_obs.get("rr")
        gcs = curr_obs.get("gcs")

        si = (hr / sbp) if (hr and sbp and sbp > 0) else None

        triggers = []
        if spo2 is not None and spo2 < 85:
            triggers.append(f"Catastrophic Hypoxia (SpO2={spo2}%)")
        if gcs is not None and gcs <= 8:
            triggers.append(f"Severe Coma / Loss of Consciousness (GCS={gcs})")
        if sbp is not None and sbp < 70:
            triggers.append(f"Profound Hypotension / Circulatory Collapse (SBP={sbp}mmHg)")
        if si is not None and si >= 1.3:
            triggers.append(f"Severe Shock Index ({si:.2f} >= 1.3)")
        if rr is not None and (rr >= 38 or rr <= 6):
            triggers.append(f"Extreme Respiratory Distress / Apnea (RR={rr}/min)")

        if triggers:
            return {
                "risk_score": 99.0,
                "risk_probability": 0.99,
                "deterioration_probability": 0.99,
                "risk_category": "CRITICAL",
                "confidence_score": 100.0,
                "confidence_tier": "HIGH",
                "uncertainty_score": 0.0,
                "safety_net_triggered": True,
                "safety_triggers": triggers,
                "escalation_recommended": True,
                "recommended_priority": 1,
                "recommended_priority_name": "Resuscitation (ESI 1)",
                "summary": f"CRITICAL SAFETY INTERLOCK TRIGGERED: {'; '.join(triggers)}. Immediate physician bedside evaluation required."
            }
        return None

    def evaluate_priority_escalation(
        self,
        current_triage_level: int,
        risk_score: float,
        features: Dict[str, float],
        safety_net_triggered: bool
    ) -> Tuple[bool, int, str, str]:
        """
        Protocolized Clinical Urgency Reassessment Policy.
        Determines if patient urgency has outgrown current ESI placement based on trajectory evidence.
        """
        if safety_net_triggered:
            return True, 1, "Immediate Resuscitation (ESI 1)", "Deterministic safety net triggered by critical vital sign breach."

        current_level = int(current_triage_level) if current_triage_level else 3

        spo2 = features.get("spo2", 98.0)
        rr = features.get("rr", 16.0)
        hr = features.get("hr", 80.0)
        si = features.get("shock_index", 0.7)
        mews = features.get("mews_score", 0.0)
        qsofa = features.get("qsofa_score", 0.0)
        v_spo2 = features.get("velocity_spo2", 0.0)

        # Severe Decompensation Criteria
        if risk_score >= 80.0 or mews >= 6.0 or (spo2 < 90.0 and rr >= 28.0) or (si >= 1.1):
            if current_level > 1:
                rec_level = 1 if (spo2 < 88.0 or si >= 1.2 or mews >= 7.0) else 2
                rec_name = "Resuscitation (ESI 1)" if rec_level == 1 else "Emergent (ESI 2)"
                return True, rec_level, rec_name, "Patient trajectory indicates rapid acute physiological decompensation."

        # High Acuity Trajectory Criteria
        if risk_score >= 50.0 or mews >= 4.0 or qsofa >= 2.0 or (v_spo2 <= -0.25 and spo2 <= 93.0):
            if current_level > 2:
                return True, 2, "Emergent (ESI 2)", "Increasing physiological instability and high deterioration risk while waiting."

        # Moderate Acuity Trajectory Criteria
        if risk_score >= 25.0 or mews >= 3.0:
            if current_level > 3:
                return True, 3, "Urgent (ESI 3)", "Worsening vital sign trajectory requires closer surveillance."

        return False, current_level, f"Level {current_level}", "Current priority remains appropriate for stable trajectory."

    def build_explainable_comparison(
        self,
        observations: List[Dict[str, Any]],
        initial_priority: int,
        recommended_priority: int,
        risk_score: float,
        features: Dict[str, float]
    ) -> Dict[str, Any]:
        """
        Constructs transparent, non-causal explanation of trajectory changes.
        """
        if not observations:
            return {"changes": [], "summary": "No observations available."}

        t0 = observations[0]
        tn = observations[-1]

        vitals_comparison = [
            {
                "vital": "Oxygen Saturation (SpO2)",
                "baseline_t0": f"{t0.get('spo2', '—')}%",
                "current_tn": f"{tn.get('spo2', '—')}%",
                "delta": f"{features.get('baseline_spo2_delta', 0.0):+.1f}%",
                "rate": f"{features.get('velocity_spo2', 0.0):+.2f}%/min"
            },
            {
                "vital": "Respiratory Rate (RR)",
                "baseline_t0": f"{t0.get('rr', '—')}/min",
                "current_tn": f"{tn.get('rr', '—')}/min",
                "delta": f"{features.get('baseline_rr_delta', 0.0):+.1f}/min",
                "rate": f"{features.get('velocity_rr', 0.0):+.2f}/min^2"
            },
            {
                "vital": "Heart Rate (HR)",
                "baseline_t0": f"{t0.get('hr', '—')} bpm",
                "current_tn": f"{tn.get('hr', '—')} bpm",
                "delta": f"{features.get('baseline_hr_delta', 0.0):+.1f} bpm",
                "rate": f"{features.get('velocity_hr', 0.0):+.2f} bpm/min"
            },
            {
                "vital": "Systolic Blood Pressure (SBP)",
                "baseline_t0": f"{t0.get('sbp', '—')} mmHg",
                "current_tn": f"{tn.get('sbp', '—')} mmHg",
                "delta": f"{features.get('baseline_sbp_delta', 0.0):+.1f} mmHg",
                "rate": f"{features.get('velocity_sbp', 0.0):+.2f} mmHg/min"
            },
            {
                "vital": "Shock Index (HR / SBP)",
                "baseline_t0": f"{float(t0.get('hr', 80))/max(float(t0.get('sbp', 120)), 1):.2f}",
                "current_tn": f"{features.get('shock_index', 0.7):.2f}",
                "delta": f"{features.get('delta_shock_index', 0.0):+.2f}",
                "rate": f"{features.get('velocity_shock_index', 0.0):+.3f}/min"
            }
        ]

        factor_groups = {
            "Oxygenation": [
                f"SpO2: {tn.get('spo2')}% (change of {features.get('baseline_spo2_delta'):+.1f}%)",
                f"Desaturation velocity: {features.get('velocity_spo2'):+.2f}%/min"
            ],
            "Hemodynamics": [
                f"SBP: {tn.get('sbp')} mmHg ({features.get('baseline_sbp_delta'):+.1f} mmHg delta)",
                f"Shock Index: {features.get('shock_index'):.2f} (norm < 0.9)"
            ],
            "Respiration": [
                f"Respiratory Rate: {tn.get('rr')}/min ({features.get('baseline_rr_delta'):+.1f}/min delta)",
                f"qSOFA sepsis score: {int(features.get('qsofa_score', 0))}/3"
            ],
            "Trajectory": [
                f"Total observations: {int(features.get('observation_count', 1))}",
                f"Elapsed ED wait: {features.get('time_since_arrival_mins', 0):.0f} mins",
                f"MEWS early warning: {int(features.get('mews_score', 0))}/14"
            ]
        }

        return {
            "vitals_comparison": vitals_comparison,
            "factor_groups": factor_groups,
            "summary": f"Deterioration risk evaluated at {risk_score:.1f}% across {len(observations)} timepoint observations."
        }

    def predict_deterioration_trajectory(
        self,
        patient_data: Dict[str, Any],
        encounter_data: Dict[str, Any],
        observations: List[Dict[str, Any]],
        prediction_timestamp: Optional[Union[str, datetime.datetime]] = None
    ) -> Dict[str, Any]:
        """
        Executes hybrid trajectory deterioration evaluation over observations [T0 -> Tn].
        """
        if not observations:
            raise ValueError("Observations sequence cannot be empty.")

        # 1. Deterministic Safety Net First
        safety_net_res = self.deterministic_safety_net(observations)
        if safety_net_res:
            features = LongitudinalFeatureExtractor.extract_trajectory_features(
                patient_data=patient_data,
                encounter_data=encounter_data,
                observations=observations,
                prediction_timestamp=prediction_timestamp
            )
            initial_triage = int(encounter_data.get("initial_triage_level") or encounter_data.get("triage_level") or 3)
            expl = self.build_explainable_comparison(
                observations=observations,
                initial_priority=initial_triage,
                recommended_priority=1,
                risk_score=99.0,
                features=features
            )
            return {
                **safety_net_res,
                "initial_priority": initial_triage,
                "features_snapshot": features,
                "explanation": expl,
                "model_name": self.metadata.get("model_name"),
                "model_version": self.model_version
            }

        # 2. Extract 48 Trajectory Features (No Future Leakage)
        features = LongitudinalFeatureExtractor.extract_trajectory_features(
            patient_data=patient_data,
            encounter_data=encounter_data,
            observations=observations,
            prediction_timestamp=prediction_timestamp
        )

        # 3. Preprocess & Scale
        df_single = pd.DataFrame([features])
        X = self.preprocessor.transform(df_single)

        # 4. Predict Calibrated Deterioration Probability
        prob_deterioration = float(self.model.predict_proba(X)[0, 1])
        risk_score = round(prob_deterioration * 100.0, 2)

        # 5. Risk Category Assignment
        if risk_score >= 80.0:
            risk_category = "CRITICAL"
        elif risk_score >= 50.0:
            risk_category = "HIGH"
        elif risk_score >= 20.0:
            risk_category = "MODERATE"
        else:
            risk_category = "LOW"

        # 6. Confidence & Uncertainty
        margin_from_50 = abs(prob_deterioration - 0.50) * 2.0
        uncertainty = round(1.0 - margin_from_50, 4)
        confidence_score = round(max(prob_deterioration, 1.0 - prob_deterioration) * 100.0, 2)
        
        if margin_from_50 >= 0.50:
            confidence_tier = "HIGH"
        elif margin_from_50 >= 0.25:
            confidence_tier = "MODERATE"
        else:
            confidence_tier = "LOW"

        # 7. Priority Escalation Protocol
        initial_triage = int(encounter_data.get("initial_triage_level") or encounter_data.get("triage_level") or 3)
        escalation_req, rec_priority, rec_name, reason = self.evaluate_priority_escalation(
            current_triage_level=initial_triage,
            risk_score=risk_score,
            features=features,
            safety_net_triggered=False
        )

        # 8. Build Explainable Factor Attributions
        expl = self.build_explainable_comparison(
            observations=observations,
            initial_priority=initial_triage,
            recommended_priority=rec_priority,
            risk_score=risk_score,
            features=features
        )

        return {
            "deterioration_probability": prob_deterioration,
            "risk_score": risk_score,
            "risk_category": risk_category,
            "confidence_score": confidence_score,
            "confidence_tier": confidence_tier,
            "uncertainty_score": uncertainty,
            "initial_priority": initial_triage,
            "escalation_recommended": escalation_req,
            "recommended_priority": rec_priority,
            "recommended_priority_name": rec_name,
            "escalation_reason": reason,
            "safety_net_triggered": False,
            "safety_triggers": [],
            "features_snapshot": features,
            "explanation": expl,
            "model_name": self.metadata.get("model_name"),
            "model_version": self.model_version
        }
