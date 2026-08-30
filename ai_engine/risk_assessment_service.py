"""Encounter-scoped development risk adapter. Not clinically validated."""
from dataclasses import dataclass
import os
import joblib
import pandas as pd

INPUT_SCHEMA_VERSION = "1.0"
PREDICTION_TARGET = "Probability the configured triage classifier assigns ESI 1 or 2 at the current assessment"
PREDICTION_HORIZON = "Current ED presentation (no future deterioration horizon)"
class MissingClinicalData(Exception):
    def __init__(self, fields): self.fields = fields
class ModelUnavailable(Exception): pass
class InvalidModelOutput(Exception): pass
@dataclass
class RiskResult:
    score: float; category: str; model_name: str; model_version: str
class ExistingTriageClassifierRiskAdapter:
    name = os.getenv("AI_RISK_MODEL_NAME", "Existing Triage Classifier Development Adapter")
    version = os.getenv("AI_RISK_MODEL_VERSION", "1.0.0-dev")
    def __init__(self):
        base = os.path.dirname(__file__)
        try:
            self.model = joblib.load(os.getenv("AI_RISK_MODEL_PATH", os.path.join(base, "triage_model.pkl")))
            self.features = joblib.load(os.path.join(base, "model_features.pkl"))
        except Exception as exc: raise ModelUnavailable("MODEL_UNAVAILABLE") from exc
    def predict(self, clinical_input):
        required = [key for key in ("age", "heart_rate", "systolic_bp", "respiratory_rate", "spo2", "gcs") if clinical_input.get(key) is None]
        if required: raise MissingClinicalData(required)
        values = {feature: 0 for feature in self.features}
        values.update({"age": clinical_input["age"], "gender": 1 if clinical_input.get("gender") == "Male" else 0, "hr": clinical_input["heart_rate"], "sbp": clinical_input["systolic_bp"], "rr": clinical_input["respiratory_rate"], "spo2": clinical_input["spo2"], "gcs": clinical_input["gcs"], "history_available": 1 if clinical_input.get("history_available") else 0, "facility_tier": 2, "transit_time_mins": 30, "shock_index": round(clinical_input["heart_rate"] / max(clinical_input["systolic_bp"], 1), 2)})
        probabilities = self.model.predict_proba(pd.DataFrame([values], columns=self.features))[0]
        score = sum(float(probability) for label, probability in zip(self.model.classes_, probabilities) if int(label) in (1, 2))
        if not 0 <= score <= 1: raise InvalidModelOutput("INVALID_MODEL_OUTPUT")
        return RiskResult(score, "HIGH" if score >= .70 else "MODERATE" if score >= .30 else "LOW", self.name, self.version)
