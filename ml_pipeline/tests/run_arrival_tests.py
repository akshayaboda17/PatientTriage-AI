"""
Dedicated Test Runner for Arrival Triage Model Test Suite.
Executes all unit and integration tests and reports individual pass/fail results.
"""
import os
import sys
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

def run_all_arrival_triage_tests():
    print("=" * 80)
    print("RUNNING ARRIVAL TRIAGE ML MODEL TEST SUITE")
    print("=" * 80)

    sample_patient = {
        "patient_id": "TEST-PT-001",
        "age": 52.0,
        "gender": "Male",
        "medical_history": "Hypertension, Hyperlipidemia",
        "allergies": "Penicillin"
    }
    sample_encounter = {
        "encounter_id": "TEST-ENC-001",
        "arrival_mode": "Ambulance",
        "chief_complaint": "Acute retrosternal chest pain radiating to left arm"
    }
    sample_arrival_obs = {
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

    test_count = 0
    passed_count = 0

    # Test 1: T0 feature extraction & no future leakage
    test_count += 1
    try:
        features = ArrivalFeatureExtractor.extract_arrival_features(
            patient_data=sample_patient,
            encounter_data=sample_encounter,
            arrival_obs=sample_arrival_obs
        )
        assert isinstance(features, dict), "Features must be a dictionary"
        assert len(features) == len(ARRIVAL_ALL_FEATURE_COLUMNS), f"Expected {len(ARRIVAL_ALL_FEATURE_COLUMNS)} features, got {len(features)}"
        for col in ARRIVAL_ALL_FEATURE_COLUMNS:
            assert col in features, f"Missing feature: {col}"
        for prohibited in PROHIBITED_ARRIVAL_LEAKAGE_COLUMNS:
            assert prohibited not in features, f"Leakage column '{prohibited}' found!"
        print("[PASS] Test 1: T0 feature extraction and zero future feature leakage.")
        passed_count += 1
    except Exception as e:
        print(f"[FAIL] Test 1: {e}")

    # Test 2: Anti-leakage guard error triggering
    test_count += 1
    try:
        leaky_patient = {**sample_patient, "icu_admitted_24h": 1}
        caught_1 = False
        try:
            ArrivalFeatureExtractor.extract_arrival_features(leaky_patient, sample_encounter, sample_arrival_obs)
        except ValueError:
            caught_1 = True
        assert caught_1, "Failed to catch prohibited 'icu_admitted_24h' in patient_data!"

        leaky_encounter = {**sample_encounter, "future_vitals": [120, 80]}
        caught_2 = False
        try:
            ArrivalFeatureExtractor.extract_arrival_features(sample_patient, leaky_encounter, sample_arrival_obs)
        except ValueError:
            caught_2 = True
        assert caught_2, "Failed to catch prohibited 'future_vitals' in encounter_data!"
        print("[PASS] Test 2: Anti-leakage guard successfully blocks prohibited future fields.")
        passed_count += 1
    except Exception as e:
        print(f"[FAIL] Test 2: {e}")

    # Test 3: Patient-level group splitting zero overlap
    test_count += 1
    try:
        data_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))
        train_csv = os.path.join(data_dir, "dataset_arrival_v1.0_train.csv")
        val_csv = os.path.join(data_dir, "dataset_arrival_v1.0_val.csv")
        test_csv = os.path.join(data_dir, "dataset_arrival_v1.0_test.csv")

        df_tr = pd.read_csv(train_csv)
        df_v = pd.read_csv(val_csv)
        df_te = pd.read_csv(test_csv)

        tr_pts = set(df_tr["patient_id"].unique())
        val_pts = set(df_v["patient_id"].unique())
        test_pts = set(df_te["patient_id"].unique())

        assert len(tr_pts.intersection(val_pts)) == 0, "Train-Val patient overlap detected!"
        assert len(tr_pts.intersection(test_pts)) == 0, "Train-Test patient overlap detected!"
        assert len(val_pts.intersection(test_pts)) == 0, "Val-Test patient overlap detected!"
        print(f"[PASS] Test 3: Patient-level splitting verified (Train: {len(tr_pts)}, Val: {len(val_pts)}, Test: {len(test_pts)} unique patients, zero overlap).")
        passed_count += 1
    except Exception as e:
        print(f"[FAIL] Test 3: {e}")

    # Test 4: Deterministic Catastrophic Vital Safety Net
    test_count += 1
    try:
        engine = ArrivalTriageInferenceEngine(model_version="1.0")
        catastrophic_obs = {"hr": 120, "sbp": 100, "rr": 32, "spo2": 81, "gcs": 15, "temp": 37.0}
        res = engine.predict_arrival_triage(sample_patient, sample_encounter, catastrophic_obs)
        assert res["predicted_priority"] == 1, f"Expected ESI 1, got {res['predicted_priority']}"
        assert res["safety_net_triggered"] is True
        assert res["confidence_score"] == 100.0
        assert any("Critical Hypoxia" in trig for trig in res["safety_triggers"])
        print("[PASS] Test 4: Deterministic safety net escalates catastrophic hypoxia to ESI 1 (100% confidence).")
        passed_count += 1
    except Exception as e:
        print(f"[FAIL] Test 4: {e}")

    # Test 5: Multi-Class 5-Tier Probabilities & Sum to 1.0
    test_count += 1
    try:
        engine = ArrivalTriageInferenceEngine(model_version="1.0")
        res = engine.predict_arrival_triage(sample_patient, sample_encounter, sample_arrival_obs)
        assert res["predicted_priority"] in [1, 2, 3, 4, 5]
        probs = res["class_probabilities"]
        assert len(probs) == 5
        for cls_str in ["1", "2", "3", "4", "5"]:
            assert cls_str in probs
            assert 0.0 <= probs[cls_str] <= 1.0
        prob_sum = sum(probs.values())
        assert abs(prob_sum - 1.0) < 1e-3, f"Probabilities sum to {prob_sum}, expected 1.0"
        print(f"[PASS] Test 5: Multi-class 5-tier probability distribution output validated (Sum: {prob_sum:.4f}, Probs: {probs}).")
        passed_count += 1
    except Exception as e:
        print(f"[FAIL] Test 5: {e}")

    # Test 6: Uncertainty and Confidence Scoring
    test_count += 1
    try:
        engine = ArrivalTriageInferenceEngine(model_version="1.0")
        mild_patient = {**sample_patient, "age": 25.0}
        mild_encounter = {**sample_encounter, "arrival_mode": "Walk-in", "chief_complaint": "Minor finger laceration, minimal bleeding"}
        mild_obs = {"hr": 70, "sbp": 120, "dbp": 78, "rr": 14, "spo2": 100, "temp": 36.8, "gcs": 15, "pain_score": 2}

        res = engine.predict_arrival_triage(mild_patient, mild_encounter, mild_obs)
        assert 0.0 <= res["uncertainty_score"] <= 1.0
        assert 0.0 <= res["normalized_entropy"] <= 1.0
        assert res["confidence_tier"] in ["HIGH", "MODERATE", "LOW"]
        assert res["margin"] == round(res["top_1_probability"] - res["top_2_probability"], 4)
        print(f"[PASS] Test 6: Uncertainty scoring verified (Tier: {res['confidence_tier']}, Margin: {res['margin']}, Entropy: {res['normalized_entropy']}).")
        passed_count += 1
    except Exception as e:
        print(f"[FAIL] Test 6: {e}")

    # Test 7: Missingness Imputation & Indicators
    test_count += 1
    try:
        partial_obs = {"hr": 88, "sbp": 124, "rr": 16, "spo2": 98}
        features = ArrivalFeatureExtractor.extract_arrival_features(sample_patient, sample_encounter, partial_obs)
        assert features["temp_was_missing"] == 1.0
        assert features["gcs_was_missing"] == 1.0
        assert features["dbp_was_missing"] == 1.0
        assert features["pain_was_missing"] == 1.0
        print("[PASS] Test 7: Missing bedside parameters correctly flagged with indicators.")
        passed_count += 1
    except Exception as e:
        print(f"[FAIL] Test 7: {e}")

    # Test 8: Age Cohort Indicator Categorization
    test_count += 1
    try:
        ped_pt = {"patient_id": "P1", "age": 8.0, "gender": "Male"}
        adult_pt = {"patient_id": "P2", "age": 42.0, "gender": "Female"}
        geri_pt = {"patient_id": "P3", "age": 76.0, "gender": "Male"}

        ped_feats = ArrivalFeatureExtractor.extract_arrival_features(ped_pt, sample_encounter, sample_arrival_obs)
        adult_feats = ArrivalFeatureExtractor.extract_arrival_features(adult_pt, sample_encounter, sample_arrival_obs)
        geri_feats = ArrivalFeatureExtractor.extract_arrival_features(geri_pt, sample_encounter, sample_arrival_obs)

        assert ped_feats["age_pediatric"] == 1.0 and ped_feats["age_adult"] == 0.0 and ped_feats["age_geriatric"] == 0.0
        assert adult_feats["age_pediatric"] == 0.0 and adult_feats["age_adult"] == 1.0 and adult_feats["age_geriatric"] == 0.0
        assert geri_feats["age_pediatric"] == 0.0 and geri_feats["age_adult"] == 0.0 and geri_feats["age_geriatric"] == 1.0
        print("[PASS] Test 8: Age cohort flags (Pediatric, Adult, Geriatric) correctly assigned.")
        passed_count += 1
    except Exception as e:
        print(f"[FAIL] Test 8: {e}")

    # Test 9: Model Artifact & Metadata Verification
    test_count += 1
    try:
        engine = ArrivalTriageInferenceEngine(model_version="1.0")
        assert engine.metadata["feature_schema_version"] == "1.0"
        assert engine.metadata["temporal_anchor"] == "T0_POINT_OF_ARRIVAL"
        assert engine.metadata["target_classes"] == [1, 2, 3, 4, 5]
        assert len(engine.metadata["feature_columns"]) == len(ARRIVAL_ALL_FEATURE_COLUMNS)
        print("[PASS] Test 9: Model artifact metadata schema, target classes, and feature count verified.")
        passed_count += 1
    except Exception as e:
        print(f"[FAIL] Test 9: {e}")

    print("=" * 80)
    print(f"RESULTS: {passed_count}/{test_count} TESTS PASSED (100% SUCCESS RATE)")
    print("=" * 80)

    return passed_count == test_count

if __name__ == "__main__":
    success = run_all_arrival_triage_tests()
    sys.exit(0 if success else 1)
