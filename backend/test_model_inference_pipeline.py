import unittest
import sys
import os

# Add project root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from ml_pipeline.inference_engine import TriageRiskInferenceEngine

class TestModelInferencePipeline(unittest.TestCase):
    """
    Automated verification of candidate ML model bundle loading,
    inference probability bounding, schema validation, and deterministic safety interlocks.
    """

    @classmethod
    def setUpClass(cls):
        cls.engine = TriageRiskInferenceEngine(model_version="1.0")

    def test_model_artifact_loading(self):
        """Test: Candidate model bundle v1.0 and preprocessor load successfully."""
        self.assertIsNotNone(self.engine.model)
        self.assertIsNotNone(self.engine.preprocessor)
        self.assertEqual(self.engine.model_version, "1.0")

    def test_inference_probability_and_score_bounds(self):
        """Test: Model outputs valid probabilities [0, 1] and risk scores [0, 100]."""
        patient = {"patient_id": "PT-TEST", "age": 55.0, "gender": "Female"}
        encounter = {"encounter_id": "ENC-TEST", "arrival_mode": "Walk-in", "chief_complaint": "Mild headache"}
        obs = {"observation_id": 1, "hr": 76, "sbp": 122, "dbp": 80, "rr": 16, "spo2": 99, "temp": 36.8, "gcs": 15, "pain_score": 3}

        result = self.engine.predict_encounter_risk(
            patient_data=patient,
            encounter_data=encounter,
            current_obs=obs
        )

        self.assertIn("risk_score", result)
        self.assertIn("risk_probability", result)
        self.assertIn("predicted_triage_level", result)
        self.assertIn("risk_category", result)

        self.assertTrue(0.0 <= result["risk_probability"] <= 1.0)
        self.assertTrue(0.0 <= result["risk_score"] <= 100.0)
        self.assertIn(result["predicted_triage_level"], [1, 2, 3, 4, 5])
        self.assertIn(result["risk_category"], ["LOW", "MODERATE", "HIGH", "CRITICAL"])
        self.assertFalse(result["safety_net_triggered"])

    def test_critical_sepsis_scenario_high_risk(self):
        """Test: Severe decompensating sepsis scenario produces HIGH or CRITICAL risk."""
        patient = {"patient_id": "PT-SEPSIS", "age": 72.0, "gender": "Male"}
        encounter = {"encounter_id": "ENC-SEPSIS", "arrival_mode": "Ambulance", "chief_complaint": "High fever, confusion, severe rigors"}
        obs = {"observation_id": 1, "hr": 134, "sbp": 82, "dbp": 46, "rr": 30, "spo2": 91, "temp": 39.4, "gcs": 13, "pain_score": 4}

        result = self.engine.predict_encounter_risk(
            patient_data=patient,
            encounter_data=encounter,
            current_obs=obs
        )

        self.assertGreaterEqual(result["risk_score"], 50.0)
        self.assertIn(result["risk_category"], ["HIGH", "CRITICAL"])
        self.assertIn(result["predicted_triage_level"], [1, 2])

    def test_deterministic_safety_net_interlock(self):
        """Test: Catastrophic hypoxia (SpO2=80%) triggers deterministic safety net immediately."""
        patient = {"patient_id": "PT-HYPOXIA", "age": 60.0, "gender": "Female"}
        encounter = {"encounter_id": "ENC-HYPOXIA", "arrival_mode": "Ambulance", "chief_complaint": "Respiratory distress"}
        crashing_obs = {"observation_id": 1, "hr": 140, "sbp": 110, "dbp": 70, "rr": 36, "spo2": 80, "temp": 37.0, "gcs": 15}

        result = self.engine.predict_encounter_risk(
            patient_data=patient,
            encounter_data=encounter,
            current_obs=crashing_obs
        )

        self.assertTrue(result["safety_net_triggered"])
        self.assertEqual(result["predicted_triage_level"], 1)
        self.assertEqual(result["risk_category"], "CRITICAL")
        self.assertEqual(result["risk_score"], 99.0)

    def test_missing_input_tolerance(self):
        """Test: Sparse inputs with missing DBP, Temp, GCS are handled safely without exceptions."""
        patient = {"patient_id": "PT-SPARSE"}
        encounter = {"encounter_id": "ENC-SPARSE"}
        sparse_obs = {"observation_id": 1, "hr": 82, "sbp": 124, "rr": 16, "spo2": 98}

        result = self.engine.predict_encounter_risk(
            patient_data=patient,
            encounter_data=encounter,
            current_obs=sparse_obs
        )

        self.assertIsNotNone(result)
        self.assertIn("risk_score", result)

if __name__ == "__main__":
    unittest.main()
