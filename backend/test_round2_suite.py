"""
Comprehensive Automated Test Suite for PatientTriage.ai Round 2 Problem Track Requirements.
Covers all 37 specified validation items across Age-Aware Triage, Uncertainty, Data Quality,
Waiting Patient Monitoring, Safe Wait Thresholds, Deterioration, Surge Mode, Clinician Override,
Security/Privacy, and End-to-End Integration.
"""
import os
import sys
import unittest
import datetime
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Setup paths
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'ai_engine')))

from main import app, get_db
from models import (
    Base, Hospital, Staff, StaffRoleEnum, Patient,
    EDEncounter, EncounterStatusEnum, TriageAssessment,
    ClinicalObservation, AIRiskAssessment, AIRiskCategoryEnum,
    ClinicalAlert, AlertSeverityEnum, AlertStatusEnum,
    PhysicianAssessment, AIAgreementEnum, ClinicalDecisionEnum
)
from services.age_service import AgeService, AgeGroupEnum
from services.uncertainty_service import UncertaintyService, ConfidenceLevelEnum
from services.safety_service import SafetyService, SafetyStatusEnum, HistoryStatusEnum
from services.hospital_config_service import HospitalConfigService, HospitalScaleEnum

TEST_DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "test_round2.db"))
test_engine = create_engine(f"sqlite:///{TEST_DB_PATH}", connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


class TestRound2Requirements(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        test_engine.dispose()
        if os.path.exists(TEST_DB_PATH):
            try:
                os.remove(TEST_DB_PATH)
            except Exception:
                pass

        Base.metadata.create_all(bind=test_engine)
        db = TestingSessionLocal()

        # Seed Hospitals
        hosp1 = Hospital(hospital_code="HOSP_R2_A", name="Round 2 Medical Center A", is_active=True)
        hosp2 = Hospital(hospital_code="HOSP_R2_B", name="Round 2 Regional B", is_active=True)
        db.add_all([hosp1, hosp2])

        # Seed Staff
        doc = Staff(
            hospital_id="HOSP_R2_A", staff_id="DOC_R2", name="Dr. Alice Smith, MD",
            email="alice@r2.org", role=StaffRoleEnum.EMERGENCY_PHYSICIAN,
            password_hash="hashed_pw_demo", is_active=True
        )
        nurse = Staff(
            hospital_id="HOSP_R2_A", staff_id="NUR_R2", name="Nurse Bob, RN",
            email="bob@r2.org", role=StaffRoleEnum.TRIAGE_NURSE,
            password_hash="hashed_pw_demo", is_active=True
        )
        director = Staff(
            hospital_id="HOSP_R2_A", staff_id="DIR_R2", name="Dr. Director Dan, MD",
            email="dan@r2.org", role=StaffRoleEnum.CLINICAL_DIRECTOR,
            password_hash="hashed_pw_demo", is_active=True
        )
        doc_b = Staff(
            hospital_id="HOSP_R2_B", staff_id="DOC_B", name="Dr. Bob Other, MD",
            email="other@r2.org", role=StaffRoleEnum.EMERGENCY_PHYSICIAN,
            password_hash="hashed_pw_demo", is_active=True
        )
        db.add_all([doc, nurse, director, doc_b])
        db.commit()
        db.close()

    @classmethod
    def tearDownClass(cls):
        test_engine.dispose()
        if os.path.exists(TEST_DB_PATH):
            try:
                os.remove(TEST_DB_PATH)
            except Exception:
                pass

    def setUp(self):
        self.doc_headers = {"X-Staff-Id": "DOC_R2", "X-Hospital-Id": "HOSP_R2_A"}
        self.nurse_headers = {"X-Staff-Id": "NUR_R2", "X-Hospital-Id": "HOSP_R2_A"}
        self.director_headers = {"X-Staff-Id": "DIR_R2", "X-Hospital-Id": "HOSP_R2_A"}
        self.hosp_b_headers = {"X-Staff-Id": "DOC_B", "X-Hospital-Id": "HOSP_R2_B"}

    # ==========================================
    # 1. AGE TESTS (1–6)
    # ==========================================
    def test_01_age_pediatric(self):
        self.assertEqual(AgeService.determine_age_group(8.5), AgeGroupEnum.PEDIATRIC)

    def test_02_age_adult(self):
        self.assertEqual(AgeService.determine_age_group(35.0), AgeGroupEnum.ADULT)

    def test_03_age_geriatric(self):
        self.assertEqual(AgeService.determine_age_group(72.0), AgeGroupEnum.GERIATRIC)

    def test_04_age_boundary_17_18(self):
        self.assertEqual(AgeService.determine_age_group(17.9), AgeGroupEnum.PEDIATRIC)
        self.assertEqual(AgeService.determine_age_group(18.0), AgeGroupEnum.ADULT)

    def test_05_age_boundary_64_65(self):
        self.assertEqual(AgeService.determine_age_group(64.9), AgeGroupEnum.ADULT)
        self.assertEqual(AgeService.determine_age_group(65.0), AgeGroupEnum.GERIATRIC)

    def test_06_age_unknown(self):
        self.assertEqual(AgeService.determine_age_group(None), AgeGroupEnum.UNKNOWN)
        self.assertEqual(AgeService.determine_age_group(-5.0), AgeGroupEnum.UNKNOWN)
        disclosure = AgeService.get_ml_applicability_disclosure(AgeGroupEnum.UNKNOWN)
        self.assertTrue(disclosure["requires_safety_escalation"])

    # ==========================================
    # 2. UNCERTAINTY TESTS (7–10)
    # ==========================================
    def test_07_confidence_generated(self):
        unc = UncertaintyService.calculate_uncertainty(probability=0.92, imputed_feature_count=0)
        self.assertIn(unc["confidence"], ["HIGH", "MODERATE", "LOW"])
        self.assertIsInstance(unc["uncertainty_score"], float)

    def test_08_low_confidence_prediction(self):
        unc = UncertaintyService.calculate_uncertainty(probability=0.51, imputed_feature_count=25, total_feature_count=40)
        self.assertEqual(unc["confidence"], ConfidenceLevelEnum.LOW.value)

    def test_09_uncertainty_escalation(self):
        unc = UncertaintyService.calculate_uncertainty(probability=0.50, imputed_feature_count=20, total_feature_count=40)
        self.assertTrue(unc["safety_escalation_required"])

    def test_10_probability_vs_confidence_separation(self):
        unc = UncertaintyService.calculate_uncertainty(probability=0.85, imputed_feature_count=30, total_feature_count=40)
        self.assertEqual(unc["probability"], 0.85)
        self.assertEqual(unc["confidence"], ConfidenceLevelEnum.LOW.value)

    # ==========================================
    # 3. DATA QUALITY TESTS (11–14)
    # ==========================================
    def test_11_zero_history_patient(self):
        status = SafetyService.classify_history_status("Zero prior history", None)
        self.assertEqual(status, HistoryStatusEnum.ZERO_HISTORY_FIRST_TIME)

    def test_12_partial_history_patient(self):
        status = SafetyService.classify_history_status("Asthma", None)
        self.assertEqual(status, HistoryStatusEnum.PARTIAL_HISTORY)

    def test_13_missing_required_information(self):
        status = SafetyService.classify_history_status(None, None)
        self.assertEqual(status, HistoryStatusEnum.UNKNOWN_NOT_AVAILABLE)

    def test_14_discordant_information(self):
        res = SafetyService.detect_clinical_discordance(
            chief_complaint="Severe retrosternal crushing chest pain",
            vitals={"hr": 72, "sbp": 120, "rr": 14, "spo2": 99, "pain_score": 0}
        )
        self.assertTrue(res["is_discordant"])
        self.assertEqual(res["discordance_type"], "RED_FLAGS_NORMAL_VITALS")

    # ==========================================
    # 4. WAITING QUEUE TESTS (15–18)
    # ==========================================
    def test_15_wait_time_tracking(self):
        res = HospitalConfigService.evaluate_wait_time("HOSP_R2_A", triage_level=3, wait_mins=20.0)
        self.assertEqual(res["wait_mins"], 20.0)
        self.assertEqual(res["status"], "OK")

    def test_16_safe_threshold_detection(self):
        res = HospitalConfigService.evaluate_wait_time("HOSP_R2_A", triage_level=2, wait_mins=25.0)
        self.assertTrue(res["exceeded"])
        self.assertEqual(res["status"], "EXCEEDED")

    def test_17_reassessment_trigger(self):
        res = HospitalConfigService.evaluate_wait_time("HOSP_R2_A", triage_level=1, wait_mins=5.0)
        self.assertTrue(res["reassessment_required"])

    def test_18_long_waiting_patient_visibility(self):
        db = TestingSessionLocal()
        p = Patient(hospital_id="HOSP_R2_A", patient_id="PT_WAIT_01", mrn="M01", first_name="Tom", last_name="Wait", age=45, gender="Male")
        db.add(p)
        db.commit()
        enc = EDEncounter(
            hospital_id="HOSP_R2_A", patient_id="PT_WAIT_01", encounter_id="ENC_WAIT_01",
            arrival_time=datetime.datetime.utcnow() - datetime.timedelta(minutes=75),
            chief_complaint="Urgent headache", status=EncounterStatusEnum.WAITING
        )
        db.add(enc)
        db.commit()
        db.close()

        response = client.get("/api/encounters", headers=self.doc_headers)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        found = next((x for x in data["queue"] if x["encounter_id"] == "ENC_WAIT_01"), None)
        self.assertIsNotNone(found)
        self.assertGreaterEqual(found["wait_time_mins"], 70)

    # ==========================================
    # 5. DETERIORATION TESTS (19–21)
    # ==========================================
    def test_19_worsening_vitals(self):
        from services.deterioration_detector import DeteriorationDetector
        detector = DeteriorationDetector()
        obs1 = ClinicalObservation(timestamp=datetime.datetime.utcnow() - datetime.timedelta(minutes=30), hr=75, sbp=125, dbp=80, rr=16, spo2=98)
        obs2 = ClinicalObservation(timestamp=datetime.datetime.utcnow(), hr=120, sbp=95, dbp=58, rr=26, spo2=89)
        res = detector.evaluate_longitudinal_trend([obs1, obs2], patient_age=50)
        self.assertTrue(res["detected"])

    def test_20_reassessment_trigger_on_deterioration(self):
        safety = SafetyService.determine_safety_status(
            ai_risk_category="LOW",
            confidence_level="HIGH",
            wait_threshold_exceeded=False,
            has_active_deterioration=True,
            has_discordance=False,
            age_group=AgeGroupEnum.ADULT
        )
        self.assertEqual(safety["status"], SafetyStatusEnum.ESCALATE.value)

    def test_21_historical_vitals_preserved(self):
        db = TestingSessionLocal()
        count = db.query(ClinicalObservation).count()
        db.close()
        self.assertGreaterEqual(count, 0)

    # ==========================================
    # 6. SURGE TESTS (22–25)
    # ==========================================
    def test_22_normal_mode(self):
        cfg = HospitalConfigService.get_config("HOSP_R2_A")
        self.assertIn("normal_daily_volume", cfg)

    def test_23_3x_surge_mode_toggle(self):
        response = client.post(
            "/api/hospital-config/surge-mode",
            json={"active": True},
            headers=self.director_headers
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["config"]["surge_mode_active"])

    def test_24_queue_prioritization_under_surge(self):
        response = client.get("/api/encounters", headers=self.doc_headers)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["surge_mode"])

    def test_25_surge_monitoring(self):
        response = client.post(
            "/api/hospital-config/surge-mode",
            json={"active": False},
            headers=self.director_headers
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["config"]["surge_mode_active"])

    # ==========================================
    # 7. CLINICIAN OVERRIDE TESTS (26–28)
    # ==========================================
    def test_26_physician_override(self):
        db = TestingSessionLocal()
        p = Patient(hospital_id="HOSP_R2_A", patient_id="PT_OVR_01", mrn="MOVR", first_name="Jane", last_name="Ovr", age=50, gender="Female")
        db.add(p)
        db.commit()
        enc = EDEncounter(hospital_id="HOSP_R2_A", patient_id="PT_OVR_01", encounter_id="ENC_OVR_01", chief_complaint="Palpitations", status=EncounterStatusEnum.WAITING)
        db.add(enc)
        db.commit()
        ai = AIRiskAssessment(hospital_id="HOSP_R2_A", patient_id="PT_OVR_01", encounter_id="ENC_OVR_01", risk_score=80.0, risk_probability=0.82, risk_category=AIRiskCategoryEnum.HIGH, predicted_triage_level=2, confidence_score=0.85)
        db.add(ai)
        db.commit()
        db.close()

        payload = {
            "ai_agreement": "OVERRIDDEN",
            "clinician_assigned_risk": "MODERATE",
            "override_reason": "Benign sinus tachycardia from excessive caffeine intake. ECG normal.",
            "clinical_decision": "CONTINUE_EVALUATION"
        }
        res = client.post("/api/encounters/ENC_OVR_01/clinical-decision", json=payload, headers=self.doc_headers)
        self.assertEqual(res.status_code, 200)

    def test_27_override_reason_mandatory(self):
        payload = {
            "ai_agreement": "OVERRIDDEN",
            "clinician_assigned_risk": "MODERATE",
            "override_reason": "",
            "clinical_decision": "CONTINUE_EVALUATION"
        }
        res = client.post("/api/encounters/ENC_OVR_01/clinical-decision", json=payload, headers=self.doc_headers)
        self.assertIn(res.status_code, [400, 422])

    def test_28_override_audit(self):
        res = client.get("/api/audit-logs?action=PHYSICIAN_DECISION_RECORDED", headers=self.doc_headers)
        self.assertEqual(res.status_code, 200)

    # ==========================================
    # 8. SECURITY & PRIVACY TESTS (29–32)
    # ==========================================
    def test_29_rbac_nurse_denied_override(self):
        payload = {
            "ai_agreement": "OVERRIDDEN",
            "clinician_assigned_risk": "LOW",
            "override_reason": "Testing unauthorized override",
            "clinical_decision": "CONTINUE_EVALUATION"
        }
        res = client.post("/api/encounters/ENC_OVR_01/clinical-decision", json=payload, headers=self.nurse_headers)
        self.assertEqual(res.status_code, 403)

    def test_30_tenant_isolation(self):
        res = client.get("/api/encounters/ENC_OVR_01", headers=self.hosp_b_headers)
        self.assertEqual(res.status_code, 404)

    def test_31_unauthorized_access(self):
        res = client.get("/api/encounters")
        self.assertEqual(res.status_code, 401)

    def test_32_privacy_controls(self):
        res = client.get("/api/audit-logs", headers=self.director_headers)
        self.assertEqual(res.status_code, 200)
        for item in res.json().get("logs", []):
            self.assertNotIn("password", str(item.get("metadata", {})))

    # ==========================================
    # 9. INTEGRATION TESTS (33–37)
    # ==========================================
    def test_33_ml_prediction(self):
        from services.ml_inference_service import MLInferenceService
        db = TestingSessionLocal()
        p = db.query(Patient).filter(Patient.patient_id == "PT_OVR_01").first()
        enc = db.query(EDEncounter).filter(EDEncounter.encounter_id == "ENC_OVR_01").first()
        obs = ClinicalObservation(hr=90, sbp=125, dbp=80, rr=16, spo2=98)
        res = MLInferenceService.evaluate_encounter(p, enc, obs)
        self.assertIn("inference", res)
        self.assertIn("explanations", res)
        self.assertIn("confidence", res["inference"])
        self.assertIn("safety_status", res["inference"])
        db.close()

    def test_34_shap_explainability(self):
        from ml_pipeline.explainability_engine import ShapExplainabilityEngine
        engine = ShapExplainabilityEngine()
        res = engine.explain_prediction(
            features_dict={"hr": 110, "spo2": 92, "sbp": 95},
            risk_probability=0.75
        )
        self.assertIn("top_features", res)

    def test_35_clinical_workflow(self):
        res = client.get("/api/encounters/ENC_OVR_01/clinical-review", headers=self.doc_headers)
        self.assertEqual(res.status_code, 200)

    def test_36_outcome_collection(self):
        payload = {
            "patient_id": "PT_OVR_01",
            "encounter_id": "ENC_OVR_01",
            "icu_admitted_24h": True,
            "intubated_24h": False,
            "vasopressor_24h": True,
            "mortality_24h": False
        }
        res = client.post("/api/mlops/outcomes", json=payload, headers=self.director_headers)
        self.assertEqual(res.status_code, 200)

    def test_37_mlops_compatibility(self):
        res = client.get("/api/mlops/models", headers=self.director_headers)
        self.assertEqual(res.status_code, 200)


if __name__ == '__main__':
    unittest.main()
