"""
Integration Test Suite for Task 4: Age-Aware + Data-Quality + Safety-First Triage Intelligence.
Tests end-to-end MLInferenceService, API routers, data completeness tracking,
age-aware interpretations, and safety-first escalation logic.
"""
import os
import sys
import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__))))

from models import (
    Base, Hospital, Staff, StaffRoleEnum, Patient, EDEncounter,
    ClinicalObservation, AIRiskAssessment, TriageAssessment, EncounterStatusEnum
)
from services.ml_inference_service import MLInferenceService
from ml_pipeline.arrival_inference_engine import ArrivalTriageInferenceEngine
from ml_pipeline.arrival_feature_extractor import ArrivalFeatureExtractor

def create_in_memory_db():
    engine = create_engine("sqlite:///:memory:", echo=False)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    hosp = Hospital(
        name="Metropolitan Trauma Center",
        hospital_code="METRO-ED",
        address="100 Medical Center Blvd, Chicago, IL",
        is_active=True
    )
    session.add(hosp)

    nurse = Staff(
        hospital_id="METRO-ED",
        staff_id="NURSE-001",
        name="Nurse Jackie",
        email="nurse@metro.org",
        role=StaffRoleEnum.TRIAGE_NURSE,
        password_hash="fakehash"
    )
    session.add(nurse)
    session.commit()
    return session

def test_1_pediatric_arrival_intelligence():
    """
    Test 1: Pediatric patient evaluated with age-aware context.
    """
    engine = MLInferenceService.get_arrival_engine(model_version="1.1")

    pt = {"patient_id": "P-PED-INT-01", "age": 3.5, "gender": "Female"}
    enc = {"encounter_id": "E-PED-INT-01", "chief_complaint": "Barking cough and stridor"}
    obs = {"hr": 140, "sbp": 90, "rr": 34, "spo2": 93, "temp": 38.6}

    res = engine.predict_arrival_triage(pt, enc, obs)
    assert res["age_group"] == "PEDIATRIC"
    assert res["predicted_priority"] in [1, 2, 3]
    assert any("Pediatric" in f for f in res["contributing_factors"])

def test_2_geriatric_arrival_intelligence():
    """
    Test 2: Geriatric patient with blunted response and early tachypnea.
    """
    engine = MLInferenceService.get_arrival_engine(model_version="1.1")

    pt = {"patient_id": "P-GER-INT-01", "age": 82.0, "gender": "Male"}
    enc = {"encounter_id": "E-GER-INT-01", "chief_complaint": "Confusion and weakness"}
    obs = {"hr": 96, "sbp": 98, "rr": 24, "spo2": 92}

    res = engine.predict_arrival_triage(pt, enc, obs)
    assert res["age_group"] == "GERIATRIC"
    assert res["predicted_priority"] in [1, 2, 3]
    assert any("Geriatric" in f for f in res["contributing_factors"])

def test_3_zero_history_and_completeness_scoring():
    """
    Test 3: Zero-history patient receives completeness grading and limitation disclosure.
    """
    engine = MLInferenceService.get_arrival_engine(model_version="1.1")

    pt = {"patient_id": "P-ZERO-INT-01", "age": 44.0, "gender": "Male", "medical_history": "First visit / Zero prior history"}
    enc = {"encounter_id": "E-ZERO-INT-01", "chief_complaint": "Chest tightness and nausea"}
    obs = {"hr": 92, "sbp": 130, "rr": 18, "spo2": 98}

    res = engine.predict_arrival_triage(pt, enc, obs)
    assert res["data_completeness_score"] > 0.0
    assert len(res["data_limitations"]) >= 1
    assert any("first-time" in lim.lower() or "limited" in lim.lower() for lim in res["data_limitations"])

def test_4_symptom_negation_in_arrival_inference():
    """
    Test 4: Negated clinical text does not trigger false positive symptom categories.
    """
    engine = MLInferenceService.get_arrival_engine(model_version="1.1")

    pt = {"patient_id": "P-NEG-INT-01", "age": 38.0, "gender": "Female"}
    enc = {"encounter_id": "E-NEG-INT-01", "chief_complaint": "Severe right lower quadrant belly pain, denies shortness of breath"}
    obs = {"hr": 84, "sbp": 120, "rr": 16, "spo2": 99, "pain_score": 8}

    res = engine.predict_arrival_triage(pt, enc, obs)
    feats = res["features_snapshot"]
    assert feats["complaint_respiratory"] == 0.0  # Negated
    assert feats["complaint_abdominal"] == 1.0     # Present

def test_5_missing_spo2_bedside_caveat():
    """
    Test 5: Omitted SpO2 parameter flags data limitation note without breaking inference.
    """
    engine = MLInferenceService.get_arrival_engine(model_version="1.1")

    pt = {"patient_id": "P-MIS-INT-01", "age": 55.0, "gender": "Male"}
    enc = {"encounter_id": "E-MIS-INT-01", "chief_complaint": "Ankle injury from fall"}
    obs = {"hr": 78, "sbp": 124, "rr": 16, "spo2": None}  # Omitted

    res = engine.predict_arrival_triage(pt, enc, obs)
    assert any("SpO2" in lim or "Oxygen" in lim for lim in res["data_limitations"])
    assert res["features_snapshot"]["spo2_was_missing"] == 1.0

def test_6_ambiguous_symptoms_and_safety_escalation():
    """
    Case 6: Ambiguous presentation evaluated safely.
    """
    engine = MLInferenceService.get_arrival_engine(model_version="1.1")

    pt = {"patient_id": "P-AMB-INT-01", "age": 67.0, "gender": "Female"}
    enc = {"encounter_id": "E-AMB-INT-01", "chief_complaint": "Dizziness and nausea with fatigue and weakness"}
    obs = {"hr": 88, "sbp": 122, "rr": 18, "spo2": 96}

    res = engine.predict_arrival_triage(pt, enc, obs)
    assert res["features_snapshot"]["complaint_is_ambiguous"] == 1.0
    assert any("non-specific" in lim.lower() for lim in res["data_limitations"])

def test_7_input_bounds_validation():
    """
    Test 7: Clinical bounds validation rejects impossible values.
    """
    # 1. Negative age
    try:
        ArrivalFeatureExtractor.extract_arrival_features(
            {"patient_id": "P-ERR-01", "age": -10.0},
            {"encounter_id": "E-ERR-01", "chief_complaint": "Fever"},
            {"hr": 80, "sbp": 120, "rr": 16, "spo2": 98}
        )
        assert False, "Should have raised ValueError on negative age"
    except ValueError as e:
        assert "Age" in str(e)

    # 2. Impossible SpO2 > 100%
    try:
        ArrivalFeatureExtractor.extract_arrival_features(
            {"patient_id": "P-ERR-02", "age": 45.0},
            {"encounter_id": "E-ERR-02", "chief_complaint": "Cough"},
            {"hr": 80, "sbp": 120, "rr": 16, "spo2": 150.0}
        )
        assert False, "Should have raised ValueError on SpO2 > 100%"
    except ValueError as e:
        assert "SpO2" in str(e) or "Oxygen" in str(e)

def run_all_task_4_tests():
    print("=" * 85)
    print("RUNNING PATIENTTRIAGE.AI — TASK 4 ARRIVAL INTELLIGENCE INTEGRATION SUITE")
    print("=" * 85)

    tests = [
        ("Test 1: Pediatric arrival intelligence & age-aware context", test_1_pediatric_arrival_intelligence),
        ("Test 2: Geriatric arrival intelligence & blunted response handling", test_2_geriatric_arrival_intelligence),
        ("Test 3: Zero-history patient completeness grading & limitation notes", test_3_zero_history_and_completeness_scoring),
        ("Test 4: Symptom clinical text negation parsing", test_4_symptom_negation_in_arrival_inference),
        ("Test 5: Missing bedside SpO2 caveat reporting", test_5_missing_spo2_bedside_caveat),
        ("Test 6: Ambiguous multi-system symptom presentation handling", test_6_ambiguous_symptoms_and_safety_escalation),
        ("Test 7: Clinical bounds validation & impossible value rejection", test_7_input_bounds_validation)
    ]

    passed = 0
    for name, test_fn in tests:
        try:
            test_fn()
            print(f"[PASS] {name}")
            passed += 1
        except Exception as e:
            print(f"[FAIL] {name}: {e}")
            import traceback
            traceback.print_exc()

    print("=" * 85)
    print(f"RESULTS: {passed}/{len(tests)} TESTS PASSED ({passed/len(tests)*100:.1f}% SUCCESS RATE)")
    print("=" * 85)
    return passed == len(tests)

if __name__ == "__main__":
    success = run_all_task_4_tests()
    sys.exit(0 if success else 1)
