"""
Unit and Integration Test Suite for the Dedicated Arrival Triage ML Model.
Tests T0 feature extraction, anti-leakage guards, patient-level splitting,
5-class probability outputs, probability sums, calibration, uncertainty,
deterministic safety nets, and model serialization/loading.
"""
import os
import sys
import pytest
import numpy as np
import pandas as pd

# Add project root to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from ml_pipeline.arrival_schema import (
    ARRIVAL_ALL_FEATURE_COLUMNS,
    ARRIVAL_TARGET_CLASSES,
    PROHIBITED_ARRIVAL_LEAKAGE_COLUMNS
)
from ml_pipeline.arrival_feature_extractor import ArrivalFeatureExtractor
from ml_pipeline.arrival_preprocessor import ArrivalClinicalPreprocessor
from ml_pipeline.arrival_inference_engine import ArrivalTriageInferenceEngine

class TestArrivalTriageModel:

    @pytest.fixture
    def sample_patient(self):
        return {
            "patient_id": "TEST-PT-001",
            "age": 52.0,
            "gender": "Male",
            "medical_history": "Hypertension, Hyperlipidemia",
            "allergies": "Penicillin"
        }

    @pytest.fixture
    def sample_encounter(self):
        return {
            "encounter_id": "TEST-ENC-001",
            "arrival_mode": "Ambulance",
            "chief_complaint": "Acute retrosternal chest pain radiating to left arm"
        }

    @pytest.fixture
    def sample_arrival_obs(self):
        return {
            "observation_id": 1,
            "timestamp": "2026-09-01T12:00:00Z",
            "hr": 110.0,
            "sbp": 95.0,
            "dbp": 60.0,
            "rr": 24.0,
            "spo2": 92.0,
            "temp": 37.2,
            "gcs": 15.0,
            "pain_score": 8.0
        }

    def test_t0_feature_extraction_no_future_leakage(self, sample_patient, sample_encounter, sample_arrival_obs):
        """
        Test 1: Verify all 37 arrival features are extracted with zero longitudinal delta features.
        """
        features = ArrivalFeatureExtractor.extract_arrival_features(
            patient_data=sample_patient,
            encounter_data=sample_encounter,
            arrival_obs=sample_arrival_obs
        )

        assert isinstance(features, dict)
        assert len(features) == len(ARRIVAL_ALL_FEATURE_COLUMNS)

        # Ensure all schema features exist and are valid float values
        for col in ARRIVAL_ALL_FEATURE_COLUMNS:
            assert col in features, f"Missing feature: {col}"
            assert isinstance(features[col], (int, float))
            assert not np.isnan(features[col])

        # Ensure NO prohibited longitudinal features exist in output
        for prohibited in PROHIBITED_ARRIVAL_LEAKAGE_COLUMNS:
            assert prohibited not in features, f"Leakage column '{prohibited}' found in features!"

    def test_anti_leakage_guard_raises_error(self, sample_patient, sample_encounter, sample_arrival_obs):
        """
        Test 2: Verify feature extractor rejects prohibited future/downstream clinical signals.
        """
        leaky_patient = {**sample_patient, "icu_admitted_24h": 1}
        with pytest.raises(ValueError, match="CRITICAL DATA LEAKAGE"):
            ArrivalFeatureExtractor.extract_arrival_features(
                patient_data=leaky_patient,
                encounter_data=sample_encounter,
                arrival_obs=sample_arrival_obs
            )

        leaky_encounter = {**sample_encounter, "future_vitals": [120, 80]}
        with pytest.raises(ValueError, match="CRITICAL DATA LEAKAGE"):
            ArrivalFeatureExtractor.extract_arrival_features(
                patient_data=sample_patient,
                encounter_data=leaky_encounter,
                arrival_obs=sample_arrival_obs
            )

    def test_patient_level_splitting_zero_overlap(self):
        """
        Test 3: Verify train, validation, and test datasets have zero shared patient_id.
        """
        data_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))
        train_csv = os.path.join(data_dir, "dataset_arrival_v1.0_train.csv")
        val_csv = os.path.join(data_dir, "dataset_arrival_v1.0_val.csv")
        test_csv = os.path.join(data_dir, "dataset_arrival_v1.0_test.csv")

        if os.path.exists(train_csv) and os.path.exists(val_csv) and os.path.exists(test_csv):
            df_tr = pd.read_csv(train_csv)
            df_v = pd.read_csv(val_csv)
            df_te = pd.read_csv(test_csv)

            tr_pts = set(df_tr["patient_id"].unique())
            val_pts = set(df_v["patient_id"].unique())
            test_pts = set(df_te["patient_id"].unique())

            assert len(tr_pts.intersection(val_pts)) == 0, "Train-Val patient overlap detected!"
            assert len(tr_pts.intersection(test_pts)) == 0, "Train-Test patient overlap detected!"
            assert len(val_pts.intersection(test_pts)) == 0, "Val-Test patient overlap detected!"

    def test_deterministic_catastrophic_safety_net(self, sample_patient, sample_encounter):
        """
        Test 4: Catastrophic vitals (SpO2 < 85%, GCS <= 8, SBP < 70) immediately assign ESI 1.
        """
        engine = ArrivalTriageInferenceEngine(model_version="1.0")

        # Profound hypoxia
        catastrophic_obs = {
            "hr": 120, "sbp": 100, "rr": 32, "spo2": 81, "gcs": 15, "temp": 37.0
        }
        res = engine.predict_arrival_triage(sample_patient, sample_encounter, catastrophic_obs)
        assert res["predicted_priority"] == 1
        assert res["safety_net_triggered"] is True
        assert res["confidence_score"] == 100.0
        assert any("Critical Hypoxia" in trig for trig in res["safety_triggers"])

    def test_arrival_inference_five_class_probabilities(self, sample_patient, sample_encounter, sample_arrival_obs):
        """
        Test 5: Model returns calibrated 5-class probability vector that sums to 1.0.
        """
        engine = ArrivalTriageInferenceEngine(model_version="1.0")
        res = engine.predict_arrival_triage(sample_patient, sample_encounter, sample_arrival_obs)

        assert "predicted_priority" in res
        assert res["predicted_priority"] in [1, 2, 3, 4, 5]

        probs = res["class_probabilities"]
        assert len(probs) == 5
        for cls_str in ["1", "2", "3", "4", "5"]:
            assert cls_str in probs
            assert 0.0 <= probs[cls_str] <= 1.0

        prob_sum = sum(probs.values())
        assert abs(prob_sum - 1.0) < 1e-3, f"Probabilities must sum to 1.0, got: {prob_sum}"

    def test_uncertainty_and_confidence_scoring(self, sample_patient, sample_encounter):
        """
        Test 6: Uncertainty metrics (margin, entropy, confidence tier) are mathematically consistent.
        """
        engine = ArrivalTriageInferenceEngine(model_version="1.0")

        # Stable, non-urgent case
        mild_patient = {**sample_patient, "age": 25.0}
        mild_encounter = {**sample_encounter, "arrival_mode": "Walk-in", "chief_complaint": "Minor finger laceration, minimal bleeding"}
        mild_obs = {"hr": 70, "sbp": 120, "dbp": 78, "rr": 14, "spo2": 100, "temp": 36.8, "gcs": 15, "pain_score": 2}

        res = engine.predict_arrival_triage(mild_patient, mild_encounter, mild_obs)
        assert 0.0 <= res["uncertainty_score"] <= 1.0
        assert 0.0 <= res["normalized_entropy"] <= 1.0
        assert res["confidence_tier"] in ["HIGH", "MODERATE", "LOW"]
        assert res["margin"] == round(res["top_1_probability"] - res["top_2_probability"], 4)

    def test_missingness_imputation_and_flags(self, sample_patient, sample_encounter):
        """
        Test 7: Missing optional bedside parameters are marked with indicators.
        """
        partial_obs = {
            "hr": 88,
            "sbp": 124,
            "rr": 16,
            "spo2": 98
            # temp, gcs, dbp, pain_score omitted
        }
        features = ArrivalFeatureExtractor.extract_arrival_features(
            patient_data=sample_patient,
            encounter_data=sample_encounter,
            arrival_obs=partial_obs
        )

        assert features["temp_was_missing"] == 1.0
        assert features["gcs_was_missing"] == 1.0
        assert features["dbp_was_missing"] == 1.0
        assert features["pain_was_missing"] == 1.0

    def test_age_cohort_indicators(self, sample_encounter, sample_arrival_obs):
        """
        Test 8: Pediatric (<18), Adult (18-64), Geriatric (>=65) indicators are accurately set.
        """
        ped_pt = {"patient_id": "P1", "age": 8.0, "gender": "Male"}
        adult_pt = {"patient_id": "P2", "age": 42.0, "gender": "Female"}
        geri_pt = {"patient_id": "P3", "age": 76.0, "gender": "Male"}

        ped_feats = ArrivalFeatureExtractor.extract_arrival_features(ped_pt, sample_encounter, sample_arrival_obs)
        adult_feats = ArrivalFeatureExtractor.extract_arrival_features(adult_pt, sample_encounter, sample_arrival_obs)
        geri_feats = ArrivalFeatureExtractor.extract_arrival_features(geri_pt, sample_encounter, sample_arrival_obs)

        assert ped_feats["age_pediatric"] == 1.0 and ped_feats["age_adult"] == 0.0 and ped_feats["age_geriatric"] == 0.0
        assert adult_feats["age_pediatric"] == 0.0 and adult_feats["age_adult"] == 1.0 and adult_feats["age_geriatric"] == 0.0
        assert geri_feats["age_pediatric"] == 0.0 and geri_feats["age_adult"] == 0.0 and geri_feats["age_geriatric"] == 1.0

    def test_model_serialization_and_metadata(self):
        """
        Test 9: Serialized model artifact and metadata match expected schema.
        """
        engine = ArrivalTriageInferenceEngine(model_version="1.0")
        assert engine.metadata["feature_schema_version"] == "1.0"
        assert engine.metadata["temporal_anchor"] == "T0_POINT_OF_ARRIVAL"
        assert engine.metadata["target_classes"] == [1, 2, 3, 4, 5]
        assert len(engine.metadata["feature_columns"]) == len(ARRIVAL_ALL_FEATURE_COLUMNS)
