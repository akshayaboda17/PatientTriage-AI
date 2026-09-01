"""
Comprehensive Unit Test Suite for Task 4: Age-Aware + Data-Quality + Safety-First Triage Intelligence.
Tests all 10 required ambiguity and clinical edge cases:
- Case 1: Ambiguous Symptoms (dizziness + nausea + weakness)
- Case 2: Pediatric Patient (Age 4)
- Case 3: Geriatric Patient (Age 78)
- Case 4: Adult Patient (Age 42)
- Case 5: Zero-History Patient (First Visit)
- Case 6: Missing SpO2 Parameter
- Case 7: Missing / Unknown Medical History
- Case 8: Explicitly Denied Symptom ("denies chest pain")
- Case 9: Invalid Clinical Input Validation (SpO2 > 100%, Negative HR)
- Case 10: High-Acuity Symptoms with Uncertain ML Probabilities
"""
import os
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

from ml_pipeline.arrival_schema import ARRIVAL_ALL_FEATURE_COLUMNS
from ml_pipeline.arrival_feature_extractor import ArrivalFeatureExtractor
from ml_pipeline.arrival_inference_engine import ArrivalTriageInferenceEngine
from ml_pipeline.data_quality_engine import DataQualityEngine
from ml_pipeline.age_reference_provider import AgeAwareReferenceProvider

def test_case_1_ambiguous_symptoms():
    """
    Case 1: Ambiguous non-specific multi-system presentation.
    """
    pt = {"patient_id": "PT-AMB-01", "age": 52.0, "gender": "Female"}
    enc = {"encounter_id": "ENC-AMB-01", "chief_complaint": "Dizziness and nausea with generalized weakness"}
    obs = {"hr": 88, "sbp": 124, "rr": 18, "spo2": 97}

    feats = ArrivalFeatureExtractor.extract_arrival_features(pt, enc, obs)
    assert feats["complaint_is_ambiguous"] == 1.0

    engine = ArrivalTriageInferenceEngine(model_version="1.1")
    res = engine.predict_arrival_triage(pt, enc, obs)
    assert res["data_completeness_score"] > 0.0
    assert any("non-specific" in lim.lower() for lim in res["data_limitations"])

def test_case_2_pediatric_patient():
    """
    Case 2: Pediatric patient (Age 4) receives age-aware feature extraction.
    """
    pt = {"patient_id": "PT-PED-01", "age": 4.0, "gender": "Male"}
    enc = {"encounter_id": "ENC-PED-01", "chief_complaint": "High fever and cough"}
    obs = {"hr": 130, "sbp": 95, "rr": 26, "spo2": 96, "temp": 38.8}

    feats = ArrivalFeatureExtractor.extract_arrival_features(pt, enc, obs)
    assert feats["age_pediatric"] == 1.0
    assert feats["age_adult"] == 0.0
    assert feats["age_geriatric"] == 0.0

    engine = ArrivalTriageInferenceEngine(model_version="1.1")
    res = engine.predict_arrival_triage(pt, enc, obs)
    assert res["age_group"] == "PEDIATRIC"
    assert any("Pediatric" in f for f in res["contributing_factors"])

def test_case_3_geriatric_patient():
    """
    Case 3: Geriatric patient (Age 78) with blunted autonomic response.
    """
    pt = {"patient_id": "PT-GER-01", "age": 78.0, "gender": "Female"}
    enc = {"encounter_id": "ENC-GER-01", "chief_complaint": "Generalized fatigue and mild confusion"}
    obs = {"hr": 98, "sbp": 105, "rr": 23, "spo2": 93}

    feats = ArrivalFeatureExtractor.extract_arrival_features(pt, enc, obs)
    assert feats["age_geriatric"] == 1.0
    assert feats["geriatric_blunted_tachycardia"] == 1.0
    assert feats["geriatric_tachypnea"] == 1.0

    engine = ArrivalTriageInferenceEngine(model_version="1.1")
    res = engine.predict_arrival_triage(pt, enc, obs)
    assert res["age_group"] == "GERIATRIC"
    assert any("Geriatric" in f for f in res["contributing_factors"])

def test_case_4_adult_patient():
    """
    Case 4: Standard adult presentation (Age 42).
    """
    pt = {"patient_id": "PT-ADU-01", "age": 42.0, "gender": "Male"}
    enc = {"encounter_id": "ENC-ADU-01", "chief_complaint": "Acute lower right abdominal pain"}
    obs = {"hr": 84, "sbp": 122, "rr": 16, "spo2": 98, "pain_score": 7}

    feats = ArrivalFeatureExtractor.extract_arrival_features(pt, enc, obs)
    assert feats["age_adult"] == 1.0
    assert feats["complaint_abdominal"] == 1.0

    engine = ArrivalTriageInferenceEngine(model_version="1.1")
    res = engine.predict_arrival_triage(pt, enc, obs)
    assert res["age_group"] == "ADULT"

def test_case_5_zero_history_patient():
    """
    Case 5: First-time patient with zero recorded medical history.
    """
    pt = {"patient_id": "PT-ZERO-01", "age": 35.0, "gender": "Male", "medical_history": "First visit / Zero prior history"}
    enc = {"encounter_id": "ENC-ZERO-01", "chief_complaint": "Chest tightness and palpitations"}
    obs = {"hr": 115, "sbp": 130, "rr": 20, "spo2": 96}

    feats = ArrivalFeatureExtractor.extract_arrival_features(pt, enc, obs)
    assert feats["is_zero_history"] == 1.0
    assert feats["has_known_history"] == 0.0

    engine = ArrivalTriageInferenceEngine(model_version="1.1")
    res = engine.predict_arrival_triage(pt, enc, obs)
    assert any("first-time" in lim.lower() or "limited" in lim.lower() for lim in res["data_limitations"])

def test_case_6_missing_spo2():
    """
    Case 6: Bedside pulse oximetry (SpO2) omitted at intake.
    """
    pt = {"patient_id": "PT-MIS-01", "age": 60.0, "gender": "Female"}
    enc = {"encounter_id": "ENC-MIS-01", "chief_complaint": "Severe productive cough"}
    obs = {"hr": 92, "sbp": 128, "rr": 22, "spo2": None}  # SpO2 omitted

    feats = ArrivalFeatureExtractor.extract_arrival_features(pt, enc, obs)
    assert feats["spo2_was_missing"] == 1.0
    assert feats["vital_missing_count"] >= 1.0

    engine = ArrivalTriageInferenceEngine(model_version="1.1")
    res = engine.predict_arrival_triage(pt, enc, obs)
    assert any("SpO2" in lim or "Oxygen" in lim for lim in res["data_limitations"])

def test_case_7_missing_history():
    """
    Case 7: Medical history explicitly unobtained / unknown.
    """
    pt = {"patient_id": "PT-UNK-01", "age": 50.0, "gender": "Male", "medical_history": "Unknown / unable to obtain"}
    enc = {"encounter_id": "ENC-UNK-01", "chief_complaint": "Ankle sprain"}
    obs = {"hr": 78, "sbp": 120, "rr": 16, "spo2": 99}

    feats = ArrivalFeatureExtractor.extract_arrival_features(pt, enc, obs)
    assert feats["history_is_unknown"] == 1.0
    assert feats["has_known_history"] == 0.0

    engine = ArrivalTriageInferenceEngine(model_version="1.1")
    res = engine.predict_arrival_triage(pt, enc, obs)
    assert any("unknown" in lim.lower() for lim in res["data_limitations"])

def test_case_8_explicitly_denied_symptom():
    """
    Case 8: Symptom text contains explicit negation ("denies chest pain").
    """
    pt = {"patient_id": "PT-NEG-01", "age": 48.0, "gender": "Female"}
    enc = {"encounter_id": "ENC-NEG-01", "chief_complaint": "Severe epigastric pain, denies chest pain"}
    obs = {"hr": 82, "sbp": 124, "rr": 16, "spo2": 98}

    feats = ArrivalFeatureExtractor.extract_arrival_features(pt, enc, obs)
    assert feats["complaint_chest_pain"] == 0.0  # Not triggered due to negation!
    assert feats["complaint_abdominal"] == 1.0
    assert feats["complaint_is_negated"] == 1.0

def test_case_9_invalid_clinical_input():
    """
    Case 9: Implausible/impossible clinical inputs raise clear validation errors.
    """
    pt_invalid_age = {"patient_id": "PT-INV-01", "age": -5.0}
    enc = {"encounter_id": "ENC-INV-01", "chief_complaint": "Fever"}
    obs_valid = {"hr": 80, "sbp": 120, "rr": 16, "spo2": 98}

    try:
        ArrivalFeatureExtractor.extract_arrival_features(pt_invalid_age, enc, obs_valid)
        assert False, "Should have raised ValueError on negative age!"
    except ValueError as e:
        assert "Age" in str(e)

    pt_valid = {"patient_id": "PT-INV-02", "age": 40.0}
    obs_invalid_spo2 = {"hr": 80, "sbp": 120, "rr": 16, "spo2": 140.0}  # Impossible SpO2

    try:
        ArrivalFeatureExtractor.extract_arrival_features(pt_valid, enc, obs_invalid_spo2)
        assert False, "Should have raised ValueError on impossible SpO2 > 100%!"
    except ValueError as e:
        assert "SpO2" in str(e) or "Oxygen" in str(e)

def test_case_10_high_acuity_uncertainty_escalation():
    """
    Case 10: High-acuity presentation with uncertain ML decision margin triggers safety escalation.
    """
    engine = ArrivalTriageInferenceEngine(model_version="1.1")

    pt = {"patient_id": "PT-ESC-01", "age": 62.0, "gender": "Male"}
    enc = {"encounter_id": "ENC-ESC-01", "chief_complaint": "Substernal chest pressure and dyspnea"}
    obs = {"hr": 110, "sbp": 98, "rr": 24, "spo2": 92, "pain_score": 8}

    res = engine.predict_arrival_triage(pt, enc, obs)
    assert res["predicted_priority"] in [1, 2]
    # Verify probability distribution sum is 1.0
    assert abs(sum(res["class_probabilities"].values()) - 1.0) < 1e-3
