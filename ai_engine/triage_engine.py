import os
import joblib
import pandas as pd
import numpy as np

class TriageEngine:
    def __init__(self):
        # 1. Load the ML files you just downloaded
        base_dir = os.path.dirname(__file__)
        try:
            self.model = joblib.load(os.path.join(base_dir, 'triage_model.pkl'))
            self.features = joblib.load(os.path.join(base_dir, 'model_features.pkl'))
            self.model_loaded = True
            print("AI Model loaded successfully!")
        except Exception as e:
            print(f"Warning: Could not load ML files. {e}")
            self.model_loaded = False

    def deterministic_safety_net(self, data):
        # Fail-Safe: No matter what the AI says, if vitals are crashing, it's Level 1
        if data.get('spo2', 100) < 85 or data.get('gcs', 15) <= 8 or data.get('sbp', 120) < 70:
            return 1
        return None

    def evaluate_patient(self, patient_data):
        # Step 1: Run through deterministic safety layer first
        critical = self.deterministic_safety_net(patient_data)
        if critical:
            return {
                "triage_level": 1,
                "confidence_score": 100.0,
                "clinical_drivers": ["Critical Vitals (SpO2/GCS/SBP) triggered deterministic safety net."],
                "auto_escalated": False
            }

        # Step 2: Feed data into the Random Forest AI
        if self.model_loaded:
            # Create a dictionary of 0s that perfectly matches your 10,000 patient dataset columns
            input_dict = {f: 0 for f in self.features}

            # Map the standard incoming data from the React frontend
            input_dict['age'] = patient_data.get('age', 45)
            input_dict['gender'] = 1 if patient_data.get('gender') == 'Male' else 0
            input_dict['hr'] = patient_data.get('hr', 80)
            input_dict['sbp'] = patient_data.get('sbp', 120)
            input_dict['rr'] = patient_data.get('rr', 16)
            input_dict['spo2'] = patient_data.get('spo2', 98)
            input_dict['gcs'] = patient_data.get('gcs', 15)
            
            # Map default values for the advanced Urban/Rural edge cases we created
            input_dict['facility_tier'] = patient_data.get('facility_tier', 2)
            input_dict['transit_time_mins'] = patient_data.get('transit_time_mins', 30)
            input_dict['history_available'] = 1 if patient_data.get('history_available', True) else 0
            
            # Calculate the clinical math derived feature
            input_dict['shock_index'] = round(input_dict['hr'] / max(input_dict['sbp'], 1), 2)

            # Map setting (Urban/Rural) if frontend provides it, otherwise default to Urban
            setting = patient_data.get('setting', 'Urban')
            if f'setting_{setting}' in input_dict:
                input_dict[f'setting_{setting}'] = 1

            # Convert to a DataFrame so the model gets the exact format it expects
            df_input = pd.DataFrame([input_dict], columns=self.features)

            # Generate mathematical prediction and confidence score
            pred_level = int(self.model.predict(df_input)[0])
            probabilities = self.model.predict_proba(df_input)[0]
            confidence = round(float(np.max(probabilities)) * 100, 2)
        else:
            # Fallback if files aren't found
            pred_level = 3
            confidence = 65.0

        # Step 3: Asymmetric Fail-Safe Escalation
        auto_escalated = False
        if confidence < 75.0:  # If AI is uncertain, escalate severity to be safe
            pred_level = max(1, pred_level - 1)
            auto_escalated = True

        # Step 4: Explainable AI drivers
        drivers = []
        if patient_data.get('hr', 80) > 100: drivers.append("Elevated Heart Rate")
        if patient_data.get('spo2', 100) < 95: drivers.append("Borderline Hypoxia")
        if not drivers: drivers.append("Vitals within expected limits")

        return {
            "triage_level": pred_level,
            "confidence_score": confidence,
            "clinical_drivers": drivers,
            "auto_escalated": auto_escalated
        }