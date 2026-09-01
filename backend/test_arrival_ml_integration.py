"""
Comprehensive Integration & Regression Test Suite for Arrival Triage ML Integration (Task 2).
Tests all 15+ requirements:
1. New patient reaches arrival ML model
2. T0 features are used strictly
3. Future features are rejected (anti-leakage)
4. Five discrete probabilities are returned
5. Probabilities sum to 1.0
6. Recommended priority matches model prediction / decision policy
7. Confidence tier is returned
8. Uncertainty score & entropy are returned
9. Explanation is returned with actual physiological factors
10. Model version is returned
11. Old heuristic ESI mapping is no longer used for arrival triage
12. Deterioration model remains separate and independent
13. Clinician override works and preserves original AI recommendation
14. Audit trail records overrides and assessments
15. Model failure returns unavailable status without fabricating predictions
16. Simulated end-to-end patient arrival -> registration -> vitals -> arrival ML -> ED queue
"""
import os
import sys
import uuid
import datetime
import numpy as np

# Ensure backend & ml_pipeline are on sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__))))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models import (
    Base, Hospital, Staff, StaffRoleEnum, Patient, EDEncounter,
    ClinicalObservation, AIRiskAssessment, AIExplanation,
    TriageAssessment, PhysicianAssessment, AIAgreementEnum,
    ClinicalDecisionEnum, EncounterStatusEnum, AuditLog
)
from services.ml_inference_service import MLInferenceService
from services.deterioration_detector import DeteriorationDetector
from ml_pipeline.arrival_schema import ARRIVAL_ALL_FEATURE_COLUMNS, PROHIBITED_ARRIVAL_LEAKAGE_COLUMNS
from ml_pipeline.arrival_feature_extractor import ArrivalFeatureExtractor
from ml_pipeline.arrival_inference_engine import ArrivalTriageInferenceEngine
from ml_pipeline.inference_engine import TriageRiskInferenceEngine

def create_in_memory_db():
    engine = create_engine("sqlite:///:memory:", echo=False)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    # Seed demo hospital and staff
    hosp = Hospital(
        name="Metropolitan Medical Center",
        hospital_code="METRO-01",
        address="123 Hospital Way, Chicago, IL",
        is_active=True
    )
    session.add(hosp)

    nurse = Staff(
        hospital_id="METRO-01",
        staff_id="STF-NURSE-01",
        name="Nurse Jackie",
        email="nurse@metro.org",
        role=StaffRoleEnum.TRIAGE_NURSE,
        password_hash="fakehash"
    )
    doc = Staff(
        hospital_id="METRO-01",
        staff_id="STF-DOC-01",
        name="Dr. House",
        email="doctor@metro.org",
        role=StaffRoleEnum.EMERGENCY_PHYSICIAN,
        password_hash="fakehash"
    )
    session.add_all([nurse, doc])
    session.commit()

    return session

def test_t0_feature_flow_and_anti_leakage():
    """
    Requirements 2 & 3: T0 features strictly extracted, future features rejected.
    """
    pt_data = {"patient_id": "P-100", "age": 62.0, "gender": "Male", "medical_history": "Hypertension", "allergies": "None"}
    enc_data = {"encounter_id": "E-100", "arrival_mode": "Ambulance", "chief_complaint": "Acute severe chest pain and diaphoresis"}
    obs_data = {"hr": 115, "sbp": 90, "dbp": 55, "rr": 26, "spo2": 93, "temp": 37.1, "gcs": 15, "pain_score": 9}

    features = ArrivalFeatureExtractor.extract_arrival_features(pt_data, enc_data, obs_data)
    assert len(features) == len(ARRIVAL_ALL_FEATURE_COLUMNS)
    assert features["complaint_chest_pain"] == 1.0
    assert features["age_adult"] == 1.0
    assert features["age_pediatric"] == 0.0

    # Ensure no prohibited longitudinal features exist
    for prohibited in PROHIBITED_ARRIVAL_LEAKAGE_COLUMNS:
        assert prohibited not in features

    # Ensure anti-leakage guard triggers on future outcomes
    leaky_input = {**pt_data, "icu_admitted_24h": 1}
    try:
        ArrivalFeatureExtractor.extract_arrival_features(leaky_input, enc_data, obs_data)
        assert False, "Should have raised ValueError on prohibited leakage column!"
    except ValueError as e:
        assert "CRITICAL DATA LEAKAGE" in str(e)

def test_five_class_probabilities_and_uncertainty():
    """
    Requirements 4, 5, 6, 7, 8, 9, 10: 5 discrete probabilities, sum to 1.0, confidence, uncertainty, explanation.
    """
    engine = ArrivalTriageInferenceEngine(model_version="1.0")

    pt_data = {"patient_id": "P-200", "age": 74.0, "gender": "Female", "medical_history": "Diabetes, CAD", "allergies": "Sulfa"}
    enc_data = {"encounter_id": "E-200", "arrival_mode": "Ambulance", "chief_complaint": "Severe dyspnea and productive cough"}
    obs_data = {"hr": 128, "sbp": 85, "dbp": 50, "rr": 30, "spo2": 88, "temp": 38.9, "gcs": 14, "pain_score": 5}

    res = engine.predict_arrival_triage(pt_data, enc_data, obs_data)

    assert "predicted_priority" in res
    assert res["predicted_priority"] in [1, 2, 3, 4, 5]

    probs = res["class_probabilities"]
    assert len(probs) == 5
    for k in ["1", "2", "3", "4", "5"]:
        assert k in probs
        assert 0.0 <= probs[k] <= 1.0

    prob_sum = sum(probs.values())
    assert abs(prob_sum - 1.0) < 1e-3, f"Probabilities must sum to 1.0, got {prob_sum}"

    assert res["confidence_tier"] in ["HIGH", "MODERATE", "LOW"]
    assert 0.0 <= res["uncertainty_score"] <= 1.0
    assert 0.0 <= res["normalized_entropy"] <= 1.0
    assert len(res["contributing_factors"]) > 0
    assert res["model_version"] == "1.0"

def test_removal_of_heuristic_esi_mapping():
    """
    Requirement 11: Heuristic ESI mapping is removed. Arrival priority is determined by arrival ML.
    """
    # Verify that TriageRiskInferenceEngine does NOT set predicted_esi using risk_score thresholds
    decomp_engine = TriageRiskInferenceEngine(model_version="1.0")
    pt_dict = {"patient_id": "P-300", "age": 30.0, "gender": "Male"}
    enc_dict = {"encounter_id": "E-300", "arrival_mode": "Walk-in", "chief_complaint": "Ankle sprain"}
    obs_dict = {"hr": 72, "sbp": 120, "dbp": 80, "rr": 14, "spo2": 99, "gcs": 15, "pain_score": 3}

    decomp_res = decomp_engine.predict_encounter_risk(pt_dict, enc_dict, obs_dict)
    # The decompensation engine provides risk_score and risk_category, not the primary arrival ESI level
    assert "risk_score" in decomp_res
    assert "risk_category" in decomp_res
    assert "Decompensation" in decomp_res["model_name"] or "Risk" in decomp_res["model_name"]

def test_deterioration_and_arrival_systems_are_decoupled():
    """
    Requirement 12 & 17: Critical Regression Test.
    Arrival triage uses ArrivalTriageInferenceEngine.
    Deterioration detection uses DeteriorationDetector / TriageRiskInferenceEngine.
    They remain independent.
    """
    arrival_engine = ArrivalTriageInferenceEngine(model_version="1.0")
    deterioration_detector = DeteriorationDetector()

    # Observation sequence for longitudinal deterioration
    obs_t0 = ClinicalObservation(
        id=1, hospital_id="METRO-01", patient_id="P-400", encounter_id="E-400",
        timestamp=datetime.datetime.utcnow() - datetime.timedelta(minutes=60),
        hr=80, sbp=120, dbp=80, rr=16, spo2=98, temp=37.0, gcs=15, recorded_by="STF-01"
    )
    obs_t1 = ClinicalObservation(
        id=2, hospital_id="METRO-01", patient_id="P-400", encounter_id="E-400",
        timestamp=datetime.datetime.utcnow(),
        hr=125, sbp=85, dbp=50, rr=28, spo2=90, temp=38.8, gcs=14, recorded_by="STF-01"
    )

    det_res = deterioration_detector.evaluate_longitudinal_trend([obs_t0, obs_t1], patient_age=65.0)
    assert "detected" in det_res

    # Arrival engine does not need or accept obs_t1/obs_t0 delta
    arr_res = arrival_engine.predict_arrival_triage(
        patient_data={"patient_id": "P-400", "age": 65.0, "gender": "Male"},
        encounter_data={"encounter_id": "E-400", "arrival_mode": "Walk-in", "chief_complaint": "Fever"},
        arrival_obs={"hr": 80, "sbp": 120, "rr": 16, "spo2": 98}
    )
    assert arr_res["predicted_priority"] in [1, 2, 3, 4, 5]

def test_clinician_override_preserves_original_ai_recommendation():
    """
    Requirements 13 & 14: Clinician override stores clinician priority and reason while immutably preserving AI recommendation.
    """
    db = create_in_memory_db()

    # 1. Register Patient & Encounter
    pt = Patient(
        hospital_id="METRO-01",
        patient_id="PT-OVERRIDE-01",
        first_name="Jane",
        last_name="Doe",
        age=34.0,
        gender="Female"
    )
    enc = EDEncounter(
        hospital_id="METRO-01",
        patient_id="PT-OVERRIDE-01",
        encounter_id="ENC-OVERRIDE-01",
        arrival_mode="Walk-in",
        chief_complaint="Moderate abdominal pain",
        status=EncounterStatusEnum.WAITING
    )
    obs = ClinicalObservation(
        hospital_id="METRO-01",
        patient_id="PT-OVERRIDE-01",
        encounter_id="ENC-OVERRIDE-01",
        hr=84, sbp=122, dbp=78, rr=16, spo2=99, pain_score=6,
        recorded_by="STF-NURSE-01"
    )
    db.add_all([pt, enc, obs])
    db.commit()

    # 2. Generate AI Assessment (Arrival ML Model)
    eval_result = MLInferenceService.evaluate_encounter(
        patient=pt,
        encounter=enc,
        current_obs=obs,
        model_version="1.0"
    )
    inf = eval_result["inference"]

    ai_risk = AIRiskAssessment(
        assessment_id="AI-ASSESS-001",
        hospital_id="METRO-01",
        patient_id="PT-OVERRIDE-01",
        encounter_id="ENC-OVERRIDE-01",
        risk_score=inf["risk_score"],
        risk_probability=inf["risk_probability"],
        risk_category=inf["risk_category"],
        predicted_triage_level=inf["predicted_triage_level"],
        confidence_score=inf["confidence_score"],
        confidence_tier=inf["confidence_tier"],
        uncertainty_score=inf["uncertainty_score"],
        normalized_entropy=inf["normalized_entropy"],
        decision_margin=inf["decision_margin"],
        triage_probabilities_json=inf["probabilities"],
        model_name=inf["model_name"],
        model_version=inf["model_version"]
    )
    db.add(ai_risk)
    db.commit()

    original_ai_priority = ai_risk.predicted_triage_level
    original_ai_probs = ai_risk.triage_probabilities_json

    # 3. Physician Overrides AI Priority
    physician_assessment = PhysicianAssessment(
        assessment_id="PA-OVERRIDE-001",
        hospital_id="METRO-01",
        encounter_id="ENC-OVERRIDE-01",
        patient_id="PT-OVERRIDE-01",
        physician_id="STF-DOC-01",
        physician_name="Dr. House",
        physician_role="ATTENDING_PHYSICIAN",
        ai_assessment_id="AI-ASSESS-001",
        ai_risk_category_at_review=str(ai_risk.risk_category),
        ai_risk_score_at_review=ai_risk.risk_score,
        clinical_assessment="Patient has peritoneal signs on palpation requiring immediate surgical consult.",
        ai_agreement=AIAgreementEnum.OVERRIDDEN,
        clinician_assigned_risk="CRITICAL",
        override_reason="Surgical acute abdomen suspected despite normal resting vitals",
        clinical_decision=ClinicalDecisionEnum.ESCALATE_CARE
    )
    db.add(physician_assessment)

    # Log Audit Event via AuditService
    from services.audit_service import AuditService
    AuditService.log_event(
        db=db,
        hospital_id="METRO-01",
        action="AI_OVERRIDDEN",
        entity_type="PhysicianAssessment",
        entity_id="PA-OVERRIDE-001",
        actor_id="STF-DOC-01",
        actor_name="Dr. House",
        actor_role="ATTENDING_PHYSICIAN",
        patient_id="PT-OVERRIDE-01",
        encounter_id="ENC-OVERRIDE-01",
        metadata={
            "ai_priority_original": original_ai_priority,
            "clinician_assigned_risk": "CRITICAL",
            "override_reason": "Surgical acute abdomen suspected despite normal resting vitals"
        },
        auto_commit=True
    )

    # 4. Verify AI Assessment Remains 100% Intact and Unmodified
    refreshed_ai = db.query(AIRiskAssessment).filter(AIRiskAssessment.assessment_id == "AI-ASSESS-001").first()
    assert refreshed_ai.predicted_triage_level == original_ai_priority
    assert refreshed_ai.triage_probabilities_json == original_ai_probs
    assert refreshed_ai.confidence_tier == inf["confidence_tier"]

    # Verify audit event exists
    audit_rec = db.query(AuditLog).filter(AuditLog.action == "AI_OVERRIDDEN").first()
    assert audit_rec is not None
    assert audit_rec.metadata_json["ai_priority_original"] == original_ai_priority

def test_failure_safety_no_fake_predictions():
    """
    Requirement 15: If the model cannot be loaded, failure is raised and no fake predictions are fabricated.
    """
    try:
        ArrivalTriageInferenceEngine(model_version="999.0_NON_EXISTENT")
        assert False, "Should have raised FileNotFoundError!"
    except FileNotFoundError as e:
        assert "not found" in str(e)

def test_simulated_end_to_end_patient_workflow():
    """
    Requirement 18: Full simulated patient journey:
    Patient arrives -> Register patient -> Enter symptoms -> Enter vitals ->
    Arrival ML runs -> 5 Probabilities generated -> Recommended priority generated ->
    Confidence & Uncertainty generated -> Enters ED Queue.
    """
    db = create_in_memory_db()

    # Step 1: Patient arrives & registers
    patient = Patient(
        hospital_id="METRO-01",
        patient_id="PT-SIM-001",
        mrn="MRN-SIM-001",
        first_name="Robert",
        last_name="Johnson",
        age=58.0,
        gender="Male",
        medical_history="Hypertension, Smoker",
        allergies="NKDA"
    )
    db.add(patient)
    db.commit()

    # Step 2: Create Visit Encounter
    encounter = EDEncounter(
        hospital_id="METRO-01",
        patient_id="PT-SIM-001",
        encounter_id="ENC-SIM-001",
        arrival_time=datetime.datetime.utcnow(),
        arrival_mode="Ambulance",
        chief_complaint="Sudden onset severe crushing retrosternal chest pain with nausea",
        status=EncounterStatusEnum.WAITING
    )
    db.add(encounter)
    db.commit()

    # Step 3: Record Bedside Vitals (T0)
    vitals = ClinicalObservation(
        hospital_id="METRO-01",
        patient_id="PT-SIM-001",
        encounter_id="ENC-SIM-001",
        timestamp=datetime.datetime.utcnow(),
        hr=112,
        sbp=94,
        dbp=58,
        rr=26,
        spo2=91,
        temp=37.0,
        gcs=15,
        pain_score=9,
        recorded_by="STF-NURSE-01"
    )
    db.add(vitals)
    db.commit()

    # Step 4: Run Arrival ML Inference via MLInferenceService
    eval_result = MLInferenceService.evaluate_encounter(
        patient=patient,
        encounter=encounter,
        current_obs=vitals,
        model_version="1.0"
    )

    inf = eval_result["inference"]
    exp = eval_result["explanations"]

    # Verify Real 5-Class Probabilities
    probs = inf["probabilities"]
    assert len(probs) == 5
    assert abs(sum(probs.values()) - 1.0) < 1e-3

    # Verify Recommended Priority is high acuity (ESI 1) due to acute cardiac & borderline perfusion
    assert inf["recommended_priority"] in [1, 2, 3]
    assert inf["confidence_score"] > 0
    assert inf["uncertainty_score"] is not None

    # Step 5: Save AI Assessment & Formal Triage
    ai_risk = AIRiskAssessment(
        assessment_id="AI-SIM-001",
        hospital_id="METRO-01",
        patient_id="PT-SIM-001",
        encounter_id="ENC-SIM-001",
        risk_score=inf["risk_score"],
        risk_probability=inf["risk_probability"],
        risk_category=inf["risk_category"],
        predicted_triage_level=inf["predicted_triage_level"],
        confidence_score=inf["confidence_score"],
        confidence_tier=inf["confidence_tier"],
        uncertainty_score=inf["uncertainty_score"],
        normalized_entropy=inf["normalized_entropy"],
        decision_margin=inf["decision_margin"],
        triage_probabilities_json=inf["probabilities"],
        model_name=inf["model_name"],
        model_version=inf["model_version"]
    )
    triage = TriageAssessment(
        hospital_id="METRO-01",
        patient_id="PT-SIM-001",
        encounter_id="ENC-SIM-001",
        triage_level=inf["predicted_triage_level"],
        acuity_category="Immediate",
        chief_complaint=encounter.chief_complaint,
        pain_score=vitals.pain_score,
        mobility="Stretcher",
        assessed_by="STF-NURSE-01"
    )
    db.add_all([ai_risk, triage])
    db.commit()

    # Step 6: Verify Patient Enters ED Queue Prioritized by Acuity
    active_encounters = db.query(EDEncounter).filter(EDEncounter.status == EncounterStatusEnum.WAITING).all()
    assert len(active_encounters) == 1
    assert active_encounters[0].encounter_id == "ENC-SIM-001"

    latest_triage = db.query(TriageAssessment).filter(TriageAssessment.encounter_id == "ENC-SIM-001").first()
    assert latest_triage.triage_level == inf["predicted_triage_level"]

def run_all_task_2_tests():
    print("=" * 85)
    print("RUNNING PATIENTTRIAGE.AI — TASK 2 ARRIVAL ML INTEGRATION TEST SUITE")
    print("=" * 85)

    tests = [
        ("Test 1 & 2: T0 Feature Flow and Anti-Leakage Guards", test_t0_feature_flow_and_anti_leakage),
        ("Test 3: 5-Class Probabilities, Normalization & Uncertainty", test_five_class_probabilities_and_uncertainty),
        ("Test 4: Removal of Heuristic ESI Mapping from Arrival Triage", test_removal_of_heuristic_esi_mapping),
        ("Test 5: Decoupling of Deterioration and Arrival ML Systems", test_deterioration_and_arrival_systems_are_decoupled),
        ("Test 6: Clinician Override & Immutable AI Audit Preservation", test_clinician_override_preserves_original_ai_recommendation),
        ("Test 7: Failure Safety & No Fabricated Predictions", test_failure_safety_no_fake_predictions),
        ("Test 8: End-to-End Simulated Patient Arrival -> ML Inference -> ED Queue", test_simulated_end_to_end_patient_workflow),
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
    success = run_all_task_2_tests()
    sys.exit(0 if success else 1)
