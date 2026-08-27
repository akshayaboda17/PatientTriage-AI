import numpy as np

class TriageEngine:
    def __init__(self):
        # Placeholder for the Scikit-Learn RandomForest model (.pkl)
        self.model_loaded = True 

    def calculate_derived_vitals(self, patient_data):
        hr = patient_data.get('hr', 80)
        sbp = patient_data.get('sbp', 120)
        rr = patient_data.get('rr', 16)
        gcs = patient_data.get('gcs', 15)

        shock_index = round(hr / sbp, 2) if sbp > 0 else np.nan
        qsofa = sum([rr >= 22, sbp <= 100, gcs < 15])
        return shock_index, qsofa

    def deterministic_safety_net(self, patient_data):
        # Layer 1: Catches immediate life threats before ML processing
        spo2 = patient_data.get('spo2', 100)
        gcs = patient_data.get('gcs', 15)
        sbp = patient_data.get('sbp', 120)

        if spo2 < 85 or gcs <= 8 or sbp < 70:
            return 1 # Level 1: Resuscitation (Red)
        return None

    def evaluate_patient(self, patient_data):
        # 1. Check Deterministic Safety Net
        critical_triage = self.deterministic_safety_net(patient_data)
        if critical_triage:
            return {
                "triage_level": critical_triage,
                "confidence_score": 100.0,
                "clinical_drivers": ["SpO2 < 85% or GCS <= 8", "Deterministic Protocol Activated"],
                "auto_escalated": False
            }

        # 2. ML Model Prediction (Mocked for API integration)
        # In Colab, you will export a .pkl model and replace this block
        ml_suggested_level = 3
        confidence = 65.0 # Simulated model uncertainty
        
        # 3. Layer 3: Asymmetric Fail-Safe Escalation
        auto_escalated = False
        if confidence < 70.0 or patient_data.get('history_available') == False:
            ml_suggested_level -= 1 # Escalate severity
            auto_escalated = True

        # 4. Layer 4: Explainable AI (SHAP output format)
        return {
            "triage_level": max(1, ml_suggested_level),
            "confidence_score": confidence,
            "clinical_drivers": ["Elevated Heart Rate (+30%)", "Age-Stratified Risk (+20%)", "Vague Symptoms (+15%)"],
            "auto_escalated": auto_escalated
        }