"""
Unit Test Suite for Longitudinal Patient Deterioration Monitoring (Task 3).
Tests trajectory feature extraction, temporal anti-leakage guards, deterministic safety interlocks,
calibrated probability estimation, and explainability generation.
"""
import os
import sys
import datetime
import numpy as np

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

from ml_pipeline.longitudinal_schema import (
    LONGITUDINAL_FEATURE_COLUMNS,
    PROHIBITED_LONGITUDINAL_LEAKAGE_COLUMNS
)
from ml_pipeline.longitudinal_feature_extractor import LongitudinalFeatureExtractor
from ml_pipeline.deterioration_inference_engine import DeteriorationInferenceEngine

def test_1_multiple_observation_preservation():
    """
    Test 1: Multiple observations are preserved chronologically.
    """
    obs_t0 = {"observation_id": 1, "timestamp": "2026-03-01T10:00:00Z", "hr": 80, "sbp": 120, "rr": 16, "spo2": 98}
    obs_t1 = {"observation_id": 2, "timestamp": "2026-03-01T10:30:00Z", "hr": 92, "sbp": 115, "rr": 20, "spo2": 95}
    obs_t2 = {"observation_id": 3, "timestamp": "2026-03-01T11:00:00Z", "hr": 110, "sbp": 100, "rr": 26, "spo2": 90}

    pt = {"patient_id": "PT-TEST-01", "age": 55.0, "gender": "Male"}
    enc = {"encounter_id": "ENC-TEST-01", "arrival_time": "2026-03-01T09:45:00Z", "initial_triage_level": 3}

    features = LongitudinalFeatureExtractor.extract_trajectory_features(pt, enc, [obs_t0, obs_t1, obs_t2])
    assert features["observation_count"] == 3.0
    assert features["hr"] == 110.0
    assert features["delta_hr"] == 18.0  # 110 - 92
    assert features["baseline_hr_delta"] == 30.0  # 110 - 80
    assert features["delta_spo2"] == -5.0  # 90 - 95
    assert features["baseline_spo2_delta"] == -8.0  # 90 - 98

def test_2_trajectory_deltas_and_velocities():
    """
    Test 2: Sequential rates of change and regression slopes are correctly computed.
    """
    obs_t0 = {"observation_id": 1, "timestamp": "2026-03-01T10:00:00Z", "hr": 80, "sbp": 120, "rr": 16, "spo2": 98}
    obs_t1 = {"observation_id": 2, "timestamp": "2026-03-01T10:20:00Z", "hr": 100, "sbp": 110, "rr": 22, "spo2": 92}

    pt = {"patient_id": "PT-TEST-02", "age": 68.0, "gender": "Female"}
    enc = {"encounter_id": "ENC-TEST-02", "arrival_time": "2026-03-01T09:50:00Z", "initial_triage_level": 4}

    features = LongitudinalFeatureExtractor.extract_trajectory_features(pt, enc, [obs_t0, obs_t1])
    
    # 20 minutes elapsed
    assert features["minutes_since_prior_obs"] == 20.0
    assert features["velocity_hr"] == round(20.0 / 20.0, 3)  # +1.0 bpm/min
    assert features["velocity_spo2"] == round(-6.0 / 20.0, 3)  # -0.30 %/min
    assert features["rolling_min_spo2"] == 92.0
    assert features["rolling_max_hr"] == 100.0

def test_3_temporal_anti_leakage_guards():
    """
    Test 3: Anti-leakage guards reject future observation timestamps and prohibited fields.
    """
    obs_t0 = {"observation_id": 1, "timestamp": "2026-03-01T10:00:00Z", "hr": 80, "sbp": 120, "rr": 16, "spo2": 98}
    obs_t1 = {"observation_id": 2, "timestamp": "2026-03-01T10:30:00Z", "hr": 95, "sbp": 110, "rr": 20, "spo2": 94}
    obs_future = {"observation_id": 3, "timestamp": "2026-03-01T11:00:00Z", "hr": 130, "sbp": 80, "rr": 32, "spo2": 85}

    pt = {"patient_id": "PT-TEST-03", "age": 45.0, "gender": "Male"}
    enc = {"encounter_id": "ENC-TEST-03", "arrival_time": "2026-03-01T09:50:00Z", "initial_triage_level": 3}

    # Cutoff at 10:30:00 -> obs_future should be ignored
    features = LongitudinalFeatureExtractor.extract_trajectory_features(
        pt, enc, [obs_t0, obs_t1, obs_future], prediction_timestamp="2026-03-01T10:30:00Z"
    )
    assert features["observation_count"] == 2.0
    assert features["hr"] == 95.0

    # Prohibited leakage field test
    leaky_enc = {**enc, "icu_admitted_24h": 1}
    try:
        LongitudinalFeatureExtractor.extract_trajectory_features(pt, leaky_enc, [obs_t0])
        assert False, "Should have raised ValueError on prohibited leakage field!"
    except ValueError as e:
        assert "CRITICAL DATA LEAKAGE" in str(e)

def test_4_deterministic_safety_interlock():
    """
    Test 4: Catastrophic vital signs trigger immediate deterministic safety escalation.
    """
    engine = DeteriorationInferenceEngine(model_version="1.0")
    
    obs_catastrophic = [
        {"observation_id": 1, "timestamp": "2026-03-01T10:00:00Z", "hr": 84, "sbp": 120, "rr": 16, "spo2": 96},
        {"observation_id": 2, "timestamp": "2026-03-01T10:45:00Z", "hr": 140, "sbp": 65, "rr": 36, "spo2": 82, "gcs": 8}
    ]
    pt = {"patient_id": "PT-SAFE-01", "age": 72.0, "gender": "Female"}
    enc = {"encounter_id": "ENC-SAFE-01", "arrival_time": "2026-03-01T09:40:00Z", "initial_triage_level": 3}

    res = engine.predict_deterioration_trajectory(pt, enc, obs_catastrophic)
    assert res["safety_net_triggered"] is True
    assert res["risk_category"] == "CRITICAL"
    assert res["recommended_priority"] == 1
    assert len(res["safety_triggers"]) >= 2

def test_5_calibrated_ml_trajectory_inference():
    """
    Test 5: Calibrated ML trajectory model outputs probability, risk category, and explainability.
    """
    engine = DeteriorationInferenceEngine(model_version="1.0")

    obs = [
        {"observation_id": 1, "timestamp": "2026-03-01T10:00:00Z", "hr": 88, "sbp": 125, "rr": 18, "spo2": 96, "temp": 37.8},
        {"observation_id": 2, "timestamp": "2026-03-01T10:35:00Z", "hr": 112, "sbp": 102, "rr": 24, "spo2": 92, "temp": 38.6},
        {"observation_id": 3, "timestamp": "2026-03-01T11:15:00Z", "hr": 126, "sbp": 94, "rr": 28, "spo2": 89, "temp": 39.1}
    ]
    pt = {"patient_id": "PT-ML-01", "age": 60.0, "gender": "Male"}
    enc = {"encounter_id": "ENC-ML-01", "arrival_time": "2026-03-01T09:45:00Z", "initial_triage_level": 4, "chief_complaint": "High fever and cough"}

    res = engine.predict_deterioration_trajectory(pt, enc, obs)
    assert 0.0 <= res["deterioration_probability"] <= 1.0
    assert res["risk_category"] in ["HIGH", "CRITICAL"]
    assert res["escalation_recommended"] is True
    assert res["recommended_priority"] in [1, 2]
    
    expl = res["explanation"]
    assert "vitals_comparison" in expl
    assert len(expl["vitals_comparison"]) >= 4

def test_6_explainable_comparison_generation():
    """
    Test 6: Transparent explanation contains exact delta values and factor groups.
    """
    engine = DeteriorationInferenceEngine(model_version="1.0")
    
    obs = [
        {"observation_id": 1, "timestamp": "2026-03-01T10:00:00Z", "hr": 84, "sbp": 125, "rr": 18, "spo2": 97},
        {"observation_id": 2, "timestamp": "2026-03-01T10:30:00Z", "hr": 98, "sbp": 118, "rr": 22, "spo2": 94},
        {"observation_id": 3, "timestamp": "2026-03-01T11:00:00Z", "hr": 124, "sbp": 98, "rr": 30, "spo2": 89}
    ]
    pt = {"patient_id": "PT-EXPL-01", "age": 52.0, "gender": "Female"}
    enc = {"encounter_id": "ENC-EXPL-01", "arrival_time": "2026-03-01T09:50:00Z", "initial_triage_level": 4, "chief_complaint": "Shortness of breath"}

    res = engine.predict_deterioration_trajectory(pt, enc, obs)
    expl = res["explanation"]
    
    spo2_row = next(r for r in expl["vitals_comparison"] if "SpO2" in r["vital"])
    assert "97%" in spo2_row["baseline_t0"]
    assert "89%" in spo2_row["current_tn"]
    assert "-8.0%" in spo2_row["delta"]
