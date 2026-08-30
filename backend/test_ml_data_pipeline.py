import unittest
import sys
import os
import numpy as np
import pandas as pd

# Add parent directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from ml_pipeline.schema import (
    ALL_FEATURE_COLUMNS,
    NUMERICAL_FEATURE_COLUMNS,
    CATEGORICAL_BINARY_FEATURE_COLUMNS,
    TARGET_COLUMNS,
    PROHIBITED_LEAKAGE_COLUMNS
)
from ml_pipeline.feature_extractor import ClinicalFeatureExtractor, calculate_mews
from ml_pipeline.preprocessor import ClinicalPreprocessor
from ml_pipeline.synthetic_cohort_generator import PhysiologicallyGroundedCohortGenerator
from ml_pipeline.dataset_builder import DatasetBuilder
from ml_pipeline.dataset_validator import DatasetValidator

class TestMLDataPipeline(unittest.TestCase):
    """
    Automated validation suite testing the ML data preparation, feature extraction,
    missingness handling, anti-leakage guards, and grouped splitting mechanics.
    """

    def setUp(self):
        self.patient = {
            "patient_id": "TEST-PT-001",
            "age": 62.0,
            "gender": "Male"
        }
        self.encounter = {
            "encounter_id": "TEST-ENC-001",
            "arrival_time": "2026-01-01T10:00:00",
            "arrival_mode": "Ambulance",
            "chief_complaint": "Acute shortness of breath, wheezing and persistent cough"
        }
        self.obs1 = {
            "observation_id": 1,
            "timestamp": "2026-01-01T10:15:00",
            "hr": 118,
            "sbp": 96,
            "dbp": 58,
            "rr": 26,
            "spo2": 91,
            "temp": 38.6,
            "gcs": 14,
            "pain_score": 5
        }
        self.obs2 = {
            "observation_id": 2,
            "timestamp": "2026-01-01T10:45:00",
            "hr": 130,
            "sbp": 88,
            "dbp": 50,
            "rr": 30,
            "spo2": 87,
            "temp": 38.9,
            "gcs": 13,
            "pain_score": 6
        }

    def test_feature_extraction_schema_conformity(self):
        """Test: Extracted point-in-time features strictly conform to the 40-feature schema."""
        features = ClinicalFeatureExtractor.extract_point_in_time_features(
            patient_data=self.patient,
            encounter_data=self.encounter,
            current_obs=self.obs1
        )
        self.assertEqual(len(features), len(ALL_FEATURE_COLUMNS))
        for col in ALL_FEATURE_COLUMNS:
            self.assertIn(col, features)
            self.assertIsInstance(features[col], (int, float))

    def test_anti_leakage_prohibited_fields_rejection(self):
        """Test: Passing prohibited post-triage fields immediately raises ValueError."""
        leaky_patient = {**self.patient, "clinical_decision": "ADMIT_INPATIENT"}
        with self.assertRaises(ValueError):
            ClinicalFeatureExtractor.extract_point_in_time_features(
                patient_data=leaky_patient,
                encounter_data=self.encounter,
                current_obs=self.obs1
            )

        leaky_encounter = {**self.encounter, "override_reason": "Gestalt"}
        with self.assertRaises(ValueError):
            ClinicalFeatureExtractor.extract_point_in_time_features(
                patient_data=self.patient,
                encounter_data=leaky_encounter,
                current_obs=self.obs1
            )

    def test_biomarker_math_correctness(self):
        """Test: Derived biomarkers (Shock Index, MSI, qSOFA, MEWS) match exact clinical formulas."""
        features = ClinicalFeatureExtractor.extract_point_in_time_features(
            patient_data=self.patient,
            encounter_data=self.encounter,
            current_obs=self.obs1
        )
        # Expected Shock Index = 118 / 96 = 1.229
        self.assertAlmostEqual(features["shock_index"], 118 / 96, places=2)
        
        # Expected Pulse Pressure = 96 - 58 = 38
        self.assertEqual(features["pulse_pressure"], 38.0)

        # Expected qSOFA = RR>=22 (1) + GCS<15 (1) + SBP<=100 (1) = 3
        self.assertEqual(features["qsofa_score"], 3.0)

        # Chief complaint should be mapped to respiratory
        self.assertEqual(features["complaint_respiratory"], 1.0)
        self.assertEqual(features["arrival_mode_ambulance"], 1.0)

    def test_missingness_imputation_and_indicator_flags(self):
        """Test: Missing DBP, Temp, and GCS are imputed safely and flagged with indicator columns."""
        sparse_obs = {
            "observation_id": 1,
            "timestamp": "2026-01-01T10:15:00",
            "hr": 80,
            "sbp": 120,
            "dbp": None,
            "rr": 16,
            "spo2": 98,
            "temp": None,
            "gcs": None,
            "pain_score": None
        }
        features = ClinicalFeatureExtractor.extract_point_in_time_features(
            patient_data=self.patient,
            encounter_data=self.encounter,
            current_obs=sparse_obs
        )
        # Verify default imputations
        self.assertEqual(features["dbp"], 120 * 0.65) # 78.0
        self.assertEqual(features["temp"], 37.0)
        self.assertEqual(features["gcs"], 15.0)
        self.assertEqual(features["pain_score"], 0.0)

        # Verify missingness flags
        self.assertEqual(features["dbp_was_missing"], 1.0)
        self.assertEqual(features["temp_was_missing"], 1.0)
        self.assertEqual(features["gcs_was_missing"], 1.0)
        self.assertEqual(features["pain_was_missing"], 1.0)

    def test_longitudinal_deltas_and_velocity(self):
        """Test: Multi-timepoint longitudinal deltas and velocities are calculated accurately."""
        feat2 = ClinicalFeatureExtractor.extract_point_in_time_features(
            patient_data=self.patient,
            encounter_data=self.encounter,
            current_obs=self.obs2,
            prior_obs=self.obs1,
            obs_index=2
        )
        # obs2 (130) - obs1 (118) = +12 bpm
        self.assertEqual(feat2["delta_hr"], 12.0)
        # obs2 (87) - obs1 (91) = -4 %
        self.assertEqual(feat2["delta_spo2"], -4.0)
        # delta_t = 30 minutes -> velocity_spo2 = -4 / 30 = -0.133 %/min
        self.assertAlmostEqual(feat2["velocity_spo2"], -4.0 / 30.0, places=2)
        self.assertEqual(feat2["is_initial_observation"], 0.0)

    def test_grouped_split_zero_patient_leakage(self):
        """Test: Grouped splitting ensures 0% patient ID overlap across train, val, and test partitions."""
        generator = PhysiologicallyGroundedCohortGenerator(seed=101)
        df_sample = generator.generate_cohort_dataset(n_patients=100)

        df_train, df_val, df_test = DatasetBuilder.split_grouped_dataset(
            df=df_sample,
            train_ratio=0.70,
            val_ratio=0.15,
            test_ratio=0.15,
            seed=42
        )

        train_pts = set(df_train["patient_id"].unique())
        val_pts = set(df_val["patient_id"].unique())
        test_pts = set(df_test["patient_id"].unique())

        self.assertEqual(len(train_pts.intersection(val_pts)), 0)
        self.assertEqual(len(train_pts.intersection(test_pts)), 0)
        self.assertEqual(len(val_pts.intersection(test_pts)), 0)
        self.assertEqual(len(train_pts) + len(val_pts) + len(test_pts), 100)

    def test_preprocessor_fit_transform_consistency(self):
        """Test: ClinicalPreprocessor transforms DataFrames to formatted float32 matrices."""
        generator = PhysiologicallyGroundedCohortGenerator(seed=102)
        df_sample = generator.generate_cohort_dataset(n_patients=50)

        preprocessor = ClinicalPreprocessor(scale_numerical=False)
        X_mat = preprocessor.fit_transform(df_sample)

        self.assertIsInstance(X_mat, np.ndarray)
        self.assertEqual(X_mat.shape, (len(df_sample), len(ALL_FEATURE_COLUMNS)))
        self.assertEqual(X_mat.dtype, np.float32)

if __name__ == "__main__":
    unittest.main()
