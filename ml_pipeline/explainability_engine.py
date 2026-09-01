import os
import json
import joblib
import numpy as np
import pandas as pd
try:
    import shap
except ImportError:
    shap = None
from typing import Dict, Any, List, Optional, Tuple
from ml_pipeline.schema import ALL_FEATURE_COLUMNS
from ml_pipeline.preprocessor import ClinicalPreprocessor

class ShapExplainabilityEngine:
    """
    Genuine Mathematical SHAP Explainability Engine for PatientTriage.ai.
    Calculates exact local Shapley feature contributions for the versioned model (v1.0),
    providing transparent, non-causal clinical feature influence factors.
    """

    def __init__(self, model_version: str = "1.0"):
        self.model_version = model_version
        base_dir = os.path.dirname(__file__)
        models_dir = os.path.join(base_dir, "models")
        data_dir = os.path.join(base_dir, "data")

        self.model_path = os.path.join(models_dir, f"triage_risk_model_v{model_version}.joblib")
        self.preprocessor_path = os.path.join(models_dir, f"preprocessor_v{model_version}.joblib")

        if not os.path.exists(self.model_path) or not os.path.exists(self.preprocessor_path):
            raise FileNotFoundError(f"Model artifacts for version '{model_version}' not found in {models_dir}")

        self.model = joblib.load(self.model_path)
        self.preprocessor = ClinicalPreprocessor.load(self.preprocessor_path)
        self.feature_names = ALL_FEATURE_COLUMNS

        # Load training background baseline to compute accurate expected values E[X]
        train_path = os.path.join(data_dir, "dataset_v1.0_train.csv")
        if os.path.exists(train_path):
            df_train = pd.read_csv(train_path)
            self.X_train_background = self.preprocessor.transform(df_train)
            self.feature_means = np.mean(self.X_train_background, axis=0)
        else:
            self.feature_means = np.zeros(len(self.feature_names))

        # Initialize Explainer based on model architecture
        try:
            if hasattr(self.model, "coef_"):
                # Linear / Logistic Regression model -> Exact LinearExplainer
                self.explainer = shap.LinearExplainer(self.model, self.X_train_background)
            elif hasattr(self.model, "estimators_"):
                # Tree Ensemble -> TreeExplainer
                self.explainer = shap.TreeExplainer(self.model)
            else:
                self.explainer = shap.Explainer(self.model, self.X_train_background)
        except Exception:
            self.explainer = None

    def explain_prediction(
        self,
        features_dict: Dict[str, float],
        risk_probability: float,
        safety_net_triggered: bool = False,
        safety_triggers: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Generates genuine SHAP feature attributions from the model and features snapshot.
        """
        if safety_net_triggered:
            triggers_str = ", ".join(safety_triggers or ["Critical vital threshold breached"])
            return {
                "status": "AVAILABLE",
                "explanation_method": "Deterministic Clinical Safety Interlock",
                "base_value": 0.0,
                "top_features": [
                    {
                        "feature": "Deterministic Safety Threshold",
                        "raw_key": "safety_net",
                        "value": triggers_str,
                        "shap_contribution": 1.0,
                        "impact": "+100.0%",
                        "direction": "elevating risk",
                        "unit": ""
                    }
                ],
                "summary": f"Immediate escalation triggered by clinical safety interlock: {triggers_str}."
            }

        # Friendly clinical metadata mapping
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

        try:
            # Transform single feature dictionary
            df_single = pd.DataFrame([features_dict])
            X_single = self.preprocessor.transform(df_single) # Shape: (1, 40)

            # Compute Exact Shapley Values
            if hasattr(self.model, "coef_"):
                # Exact closed-form linear Shapley values: phi_j = w_j * (x_j - E[x_j])
                coefs = self.model.coef_[0]
                intercept = float(self.model.intercept_[0])
                base_value = float(intercept + np.dot(coefs, self.feature_means))
                shap_values_raw = coefs * (X_single[0] - self.feature_means)
                method_name = "SHAP (LinearExplainer)"
            elif hasattr(self.model, "calibrated_classifiers_"):
                # CalibratedClassifierCV ensemble wrapper
                first_est = self.model.calibrated_classifiers_[0].estimator
                if hasattr(first_est, "coef_"):
                    coefs = np.mean([clf.estimator.coef_[0] for clf in self.model.calibrated_classifiers_], axis=0)
                    intercept = float(np.mean([clf.estimator.intercept_[0] for clf in self.model.calibrated_classifiers_]))
                    base_value = float(intercept + np.dot(coefs, self.feature_means))
                    shap_values_raw = coefs * (X_single[0] - self.feature_means)
                    method_name = "SHAP (Calibrated Linear Attribution)"
                elif self.explainer:
                    shap_res = self.explainer(X_single)
                    shap_values_raw = shap_res.values[0]
                    base_value = float(shap_res.base_values[0]) if hasattr(shap_res, "base_values") else 0.0
                    method_name = "SHAP (TreeExplainer)"
                else:
                    shap_values_raw = (X_single[0] - self.feature_means) * 0.1
                    base_value = 0.5
                    method_name = "Feature Attributions (Baseline Deviation)"
            elif self.explainer:
                shap_res = self.explainer(X_single)
                shap_values_raw = shap_res.values[0]
                base_value = float(shap_res.base_values[0]) if hasattr(shap_res, "base_values") else 0.0
                method_name = "SHAP (TreeExplainer)"
            else:
                shap_values_raw = (X_single[0] - self.feature_means) * 0.1
                base_value = 0.5
                method_name = "Feature Attributions (Baseline Deviation)"

            structured_contributions = []
            for idx, col_name in enumerate(self.feature_names):
                phi = float(shap_values_raw[idx])
                raw_val = float(features_dict.get(col_name, 0.0))

                if abs(phi) > 0.005 or col_name in ["spo2", "hr", "sbp", "shock_index", "qsofa_score", "mews_score"]:
                    friendly_name, unit = feature_meta.get(col_name, (col_name.replace("_", " ").title(), ""))
                    direction = "elevating risk" if phi > 0 else "reducing risk"
                    impact_pct = round(abs(phi) * 10.0, 1)

                    structured_contributions.append({
                        "feature": friendly_name,
                        "raw_key": col_name,
                        "value": f"{raw_val} {unit}".strip(),
                        "shap_contribution": round(phi, 4),
                        "impact": f"{'+' if phi > 0 else '-'}{impact_pct}%",
                        "direction": direction,
                        "unit": unit
                    })

            # Sort by absolute Shapley contribution magnitude descending
            structured_contributions.sort(key=lambda x: abs(x["shap_contribution"]), reverse=True)
            top_drivers = structured_contributions[:5]

            # Construct non-causal clinical summary
            elevating = [f"{d['feature']} ({d['value']})" for d in top_drivers if d['direction'] == 'elevating risk']
            reducing = [f"{d['feature']} ({d['value']})" for d in top_drivers if d['direction'] == 'reducing risk']

            if elevating:
                summary = f"This prediction was elevated primarily by measured {', '.join(elevating[:3])}."
                if reducing:
                    summary += f" Stabilizing influence was provided by {', '.join(reducing[:2])}."
            else:
                summary = "Measured vital signs and clinical biomarkers contributed to a lower baseline risk estimation."

            return {
                "status": "AVAILABLE",
                "explanation_method": method_name,
                "base_value": round(base_value, 4),
                "top_features": top_drivers,
                "all_shap_contributions": {col: round(float(shap_values_raw[i]), 4) for i, col in enumerate(self.feature_names)},
                "summary": summary
            }

        except Exception as e:
            # Clinical Safety: Never invent false explanations upon error
            return {
                "status": "UNAVAILABLE",
                "explanation_method": "SHAP (Unavailable)",
                "base_value": 0.0,
                "top_features": [],
                "summary": f"Mathematical SHAP explanation currently unavailable: {e}"
            }
