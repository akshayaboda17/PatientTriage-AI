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

from models import (
    Base, Hospital, Staff, StaffRoleEnum, Patient, EDEncounter, 
    EncounterStatusEnum, ClinicalObservation, TriageAssessment, 
    AIRiskAssessment, AIExplanation, AIRiskCategoryEnum, 
    ClinicalAlert, AlertStatusEnum, AlertSeverityEnum, DetectionSourceEnum,
    AIAgreementEnum, ClinicalDecisionEnum, OverrideReasonCategoryEnum,
    PhysicianAssessment, AuditLog
)
from main import app, get_db

TEST_DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "test_physician.db"))
test_engine = create_engine(f"sqlite:///{TEST_DB_PATH}", connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

class TestPhysicianReviewWorkflow(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        test_engine.dispose()
        if os.path.exists(TEST_DB_PATH):
            try:
                os.remove(TEST_DB_PATH)
            except Exception:
                pass
        Base.metadata.create_all(bind=test_engine)
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        test_engine.dispose()
        if os.path.exists(TEST_DB_PATH):
            try:
                os.remove(TEST_DB_PATH)
            except Exception:
                pass

    def setUp(self):
        self.client = TestClient(app)
        self.db = TestingSessionLocal()
        self._seed_test_data()

    def tearDown(self):
        self.db.close()

    def _seed_test_data(self):
        # Clear existing
        self.db.query(AuditLog).delete()
        self.db.query(PhysicianAssessment).delete()
        self.db.query(ClinicalAlert).delete()
        self.db.query(AIExplanation).delete()
        self.db.query(AIRiskAssessment).delete()
        self.db.query(TriageAssessment).delete()
        self.db.query(ClinicalObservation).delete()
        self.db.query(EDEncounter).delete()
        self.db.query(Patient).delete()
        self.db.query(Staff).delete()
        self.db.query(Hospital).delete()
        self.db.commit()

        # Hospitals
        hosp_a = Hospital(hospital_code="HOSP_A", name="St. Mary ED", is_active=True)
        hosp_b = Hospital(hospital_code="HOSP_B", name="Metro City Hospital", is_active=True)
        self.db.add_all([hosp_a, hosp_b])
        self.db.commit()

        # Staff
        doc_a = Staff(staff_id="DOC_A", hospital_id="HOSP_A", name="Dr. Gregory House", email="doc_a@hospital.com", password_hash="hash_doc", role=StaffRoleEnum.EMERGENCY_PHYSICIAN, is_active=True)
        nurse_a = Staff(staff_id="NURSE_A", hospital_id="HOSP_A", name="Nurse Kelly", email="nurse_a@hospital.com", password_hash="hash_nurse", role=StaffRoleEnum.TRIAGE_NURSE, is_active=True)
        admin_a = Staff(staff_id="ADMIN_A", hospital_id="HOSP_A", name="Admin John", email="admin_a@hospital.com", password_hash="hash_admin", role=StaffRoleEnum.HOSPITAL_ADMIN, is_active=True)
        doc_deact = Staff(staff_id="DOC_DEACT", hospital_id="HOSP_A", name="Dr. Deactivated", email="doc_deact@hospital.com", password_hash="hash_deact", role=StaffRoleEnum.EMERGENCY_PHYSICIAN, is_active=False)
        doc_b = Staff(staff_id="DOC_B", hospital_id="HOSP_B", name="Dr. Wilson (Metro)", email="doc_b@metro.com", password_hash="hash_doc_b", role=StaffRoleEnum.EMERGENCY_PHYSICIAN, is_active=True)
        self.db.add_all([doc_a, nurse_a, admin_a, doc_deact, doc_b])
        self.db.commit()

        # Patient in HOSP_A
        patient_a = Patient(
            patient_id="PT-100", hospital_id="HOSP_A", mrn="MRN-100",
            first_name="Marcus", last_name="Vance", age=54, gender="Male"
        )
        self.db.add(patient_a)
        self.db.commit()

        # Encounter in HOSP_A
        enc_a = EDEncounter(
            encounter_id="ENC-100", hospital_id="HOSP_A", patient_id="PT-100",
            chief_complaint="Severe chest pain and dyspnea", status=EncounterStatusEnum.IN_TREATMENT,
            arrival_time=datetime.datetime.utcnow() - datetime.timedelta(minutes=45)
        )
        self.db.add(enc_a)
        self.db.commit()

        # Triage Assessment (Task 5)
        triage = TriageAssessment(
            hospital_id="HOSP_A", encounter_id="ENC-100", patient_id="PT-100",
            triage_level=2, acuity_category="Emergent", chief_complaint="Severe chest pain",
            assessed_by="NURSE_A"
        )
        self.db.add(triage)

        # Observations (Task 6)
        t0 = datetime.datetime.utcnow() - datetime.timedelta(minutes=40)
        t1 = datetime.datetime.utcnow() - datetime.timedelta(minutes=20)
        obs1 = ClinicalObservation(hospital_id="HOSP_A", patient_id="PT-100", encounter_id="ENC-100", timestamp=t0, hr=98, sbp=128, dbp=82, rr=18, spo2=96, temp=37.1, gcs=15, recorded_by="NURSE_A")
        obs2 = ClinicalObservation(hospital_id="HOSP_A", patient_id="PT-100", encounter_id="ENC-100", timestamp=t1, hr=118, sbp=116, dbp=74, rr=26, spo2=90, temp=37.4, gcs=15, recorded_by="NURSE_A")
        self.db.add_all([obs1, obs2])

        # AI Risk Assessment (Task 7) - HIGH 82%
        ai_risk = AIRiskAssessment(
            assessment_id="AI-ENC-100-01", hospital_id="HOSP_A", encounter_id="ENC-100", patient_id="PT-100",
            model_name="PatientTriage-XGB-Risk", model_version="1.2.0",
            risk_score=82.0, risk_category=AIRiskCategoryEnum.HIGH,
            predicted_triage_level=2, confidence_score=88.5, shock_index=1.01, qsofa=1
        )
        self.db.add(ai_risk)
        self.db.commit()

        # AI Explanation (Task 8)
        ai_exp = AIExplanation(
            risk_assessment_id=ai_risk.id, hospital_id="HOSP_A", patient_id="PT-100", encounter_id="ENC-100",
            explanation_method="SHAP",
            top_features=[
                {"feature": "Oxygen Saturation (SpO2)", "value": "90%", "impact": "+35% risk"},
                {"feature": "Respiratory Rate (RR)", "value": "26/min", "impact": "+28% risk"}
            ],
            summary="Elevated risk primarily driven by acute oxygen desaturation."
        )
        self.db.add(ai_exp)

        # Task 9 Alert
        alert = ClinicalAlert(
            alert_id="ALERT-100-01", hospital_id="HOSP_A", patient_id="PT-100", encounter_id="ENC-100",
            alert_type="Cardio-Respiratory Decompensation", severity=AlertSeverityEnum.HIGH,
            status=AlertStatusEnum.UNACKNOWLEDGED, detection_source=DetectionSourceEnum.RULE_BASED,
            detection_rule_id="RULE-DET-COMPOSITE-01", detection_version="1.0",
            summary="Rapid desaturation SpO2 96% -> 90% and tachypnea RR 18 -> 26.",
            evidence=[{"feature": "spo2", "current_value": 90, "previous_value": 96, "change": -6, "unit": "%"}]
        )
        self.db.add(alert)
        self.db.commit()

    def test_01_clinical_review_workspace_retrieval(self):
        """Test 1: Physician retrieves consolidated Clinical Review Workspace."""
        headers = {"X-Staff-Id": "DOC_A", "X-Hospital-Id": "HOSP_A"}
        res = self.client.get("/api/encounters/ENC-100/clinical-review", headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()

        # Verify all Task 5-9 components are present
        self.assertIn("patient", data)
        self.assertEqual(data["patient"]["patient_id"], "PT-100")
        self.assertIn("triage", data)
        self.assertEqual(data["triage"]["triage_level"], 2)
        self.assertIn("observations", data)
        self.assertEqual(len(data["observations"]), 2)
        self.assertIn("ai_risk", data)
        self.assertEqual(data["ai_risk"]["risk_category"], "HIGH")
        self.assertEqual(data["ai_risk"]["risk_score"], 82.0)
        self.assertIn("ai_explanation", data)
        self.assertEqual(data["ai_explanation"]["explanation_method"], "SHAP")
        self.assertIn("alerts", data)
        self.assertEqual(len(data["alerts"]), 1)
        self.assertEqual(data["alerts"][0]["status"], "UNACKNOWLEDGED")
        self.assertIn("timeline", data)

    def test_02_physician_agrees_with_ai(self):
        """Test 2: Physician records agreement with AI risk assessment and saves clinical decision."""
        headers = {"X-Staff-Id": "DOC_A", "X-Hospital-Id": "HOSP_A"}
        payload = {
            "clinical_assessment": "Patient in acute respiratory distress, lung exam shows bilateral expiratory wheezes.",
            "ai_agreement": "AGREED",
            "clinician_assigned_risk": "HIGH",
            "clinical_notes": "Agreed with high risk category. Oxygen support started.",
            "clinical_decision": "CONTINUE_EVALUATION"
        }
        res = self.client.post("/api/encounters/ENC-100/clinical-decision", headers=headers, json=payload)
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["status"], "SUCCESS")
        assessment = body["assessment"]
        self.assertEqual(assessment["ai_agreement"], "AGREED")
        self.assertEqual(assessment["clinical_decision"], "CONTINUE_EVALUATION")
        self.assertEqual(assessment["physician_id"], "DOC_A")
        self.assertEqual(assessment["ai_risk_category_at_review"], "HIGH")

        # Verify record in DB
        db_pa = self.db.query(PhysicianAssessment).filter_by(assessment_id=assessment["assessment_id"]).first()
        self.assertIsNotNone(db_pa)
        self.assertEqual(db_pa.ai_agreement, AIAgreementEnum.AGREED)

    def test_03_physician_overrides_ai_with_reason(self):
        """Test 3: Physician overrides AI risk assessment from HIGH to MODERATE with mandatory reason."""
        headers = {"X-Staff-Id": "DOC_A", "X-Hospital-Id": "HOSP_A"}
        payload = {
            "clinical_assessment": "Patient anxiety significantly contributing to tachypnea; SpO2 improved to 97% on room air after reassurance.",
            "ai_agreement": "OVERRIDDEN",
            "clinician_assigned_risk": "MODERATE",
            "override_reason": "Clinical context not represented in model input",
            "clinical_notes": "Observed rapid improvement post-anxiolysis; gestalt risk is moderate.",
            "clinical_decision": "CONTINUE_EVALUATION"
        }
        res = self.client.post("/api/encounters/ENC-100/clinical-decision", headers=headers, json=payload)
        self.assertEqual(res.status_code, 200)
        assessment = res.json()["assessment"]
        self.assertEqual(assessment["ai_agreement"], "OVERRIDDEN")
        self.assertEqual(assessment["clinician_assigned_risk"], "MODERATE")
        self.assertEqual(assessment["override_reason"], "Clinical context not represented in model input")

    def test_04_ai_immutability_guarantee(self):
        """Test 4: Crucial Safety Test — Overriding AI does NOT mutate the original AI risk assessment."""
        headers = {"X-Staff-Id": "DOC_A", "X-Hospital-Id": "HOSP_A"}
        payload = {
            "clinical_assessment": "Overriding AI risk score based on bedside ultrasound findings.",
            "ai_agreement": "OVERRIDDEN",
            "clinician_assigned_risk": "LOW",
            "override_reason": "Physical examination findings",
            "clinical_decision": "DISCHARGE_HOME"
        }
        res = self.client.post("/api/encounters/ENC-100/clinical-decision", headers=headers, json=payload)
        self.assertEqual(res.status_code, 200)

        # Query the original AI assessment directly from DB
        ai_record = self.db.query(AIRiskAssessment).filter(AIRiskAssessment.encounter_id == "ENC-100").first()
        self.assertIsNotNone(ai_record)
        self.assertEqual(ai_record.risk_category, AIRiskCategoryEnum.HIGH)
        self.assertEqual(ai_record.risk_score, 82.0)
        self.assertEqual(ai_record.predicted_triage_level, 2)

        # Verify AI explanation is also untouched
        exp_record = self.db.query(AIExplanation).filter(AIExplanation.risk_assessment_id == ai_record.id).first()
        self.assertIsNotNone(exp_record)
        self.assertEqual(exp_record.explanation_method, "SHAP")

    def test_05_mandatory_override_reason_validation(self):
        """Test 5: Attempting to override AI without an override reason fails validation (422)."""
        headers = {"X-Staff-Id": "DOC_A", "X-Hospital-Id": "HOSP_A"}
        payload = {
            "clinical_assessment": "Overriding without explanation.",
            "ai_agreement": "OVERRIDDEN",
            "clinician_assigned_risk": "LOW",
            "override_reason": "", # Missing required reason
            "clinical_decision": "CONTINUE_EVALUATION"
        }
        res = self.client.post("/api/encounters/ENC-100/clinical-decision", headers=headers, json=payload)
        self.assertEqual(res.status_code, 422)

    def test_06_unauthorized_role_rejection(self):
        """Test 6: Triage Nurse and Admin cannot submit physician clinical decisions (403 Forbidden)."""
        # Triage Nurse attempt
        headers_nurse = {"X-Staff-Id": "NURSE_A", "X-Hospital-Id": "HOSP_A"}
        payload = {
            "clinical_assessment": "Nurse attempting clinical decision.",
            "ai_agreement": "AGREED",
            "clinical_decision": "ADMIT_INPATIENT"
        }
        res_nurse = self.client.post("/api/encounters/ENC-100/clinical-decision", headers=headers_nurse, json=payload)
        self.assertEqual(res_nurse.status_code, 403)

        # Admin attempt
        headers_admin = {"X-Staff-Id": "ADMIN_A", "X-Hospital-Id": "HOSP_A"}
        res_admin = self.client.post("/api/encounters/ENC-100/clinical-decision", headers=headers_admin, json=payload)
        self.assertEqual(res_admin.status_code, 403)

    def test_07_cross_hospital_isolation_rejection(self):
        """Test 7: Physician from Hospital B cannot review or record decisions for Hospital A encounter (403)."""
        headers_b = {"X-Staff-Id": "DOC_B", "X-Hospital-Id": "HOSP_B"}
        payload = {
            "clinical_assessment": "Cross-hospital attempt.",
            "ai_agreement": "AGREED",
            "clinical_decision": "ESCALATE_CARE"
        }
        res = self.client.post("/api/encounters/ENC-100/clinical-decision", headers=headers_b, json=payload)
        self.assertEqual(res.status_code, 403)

    def test_08_deactivated_staff_rejection(self):
        """Test 8: Deactivated physician account is rejected (403 Forbidden)."""
        headers_deact = {"X-Staff-Id": "DOC_DEACT", "X-Hospital-Id": "HOSP_A"}
        payload = {
            "clinical_assessment": "Deactivated account attempt.",
            "ai_agreement": "AGREED",
            "clinical_decision": "CONTINUE_EVALUATION"
        }
        res = self.client.post("/api/encounters/ENC-100/clinical-decision", headers=headers_deact, json=payload)
        self.assertEqual(res.status_code, 403)

    def test_09_multiple_physician_reviews_history(self):
        """Test 9: Multiple physician reviews are preserved chronologically in history without data loss."""
        headers = {"X-Staff-Id": "DOC_A", "X-Hospital-Id": "HOSP_A"}
        
        # Decision 1: Initial decision
        self.client.post("/api/encounters/ENC-100/clinical-decision", headers=headers, json={
            "clinical_assessment": "Initial review: Agree with high risk, ordering nebulizer.",
            "ai_agreement": "AGREED",
            "clinical_decision": "CONTINUE_EVALUATION"
        })

        # Decision 2: Re-evaluation after intervention
        self.client.post("/api/encounters/ENC-100/clinical-decision", headers=headers, json={
            "clinical_assessment": "Post-treatment review: Wheezing resolved, patient comfortable.",
            "ai_agreement": "OVERRIDDEN",
            "clinician_assigned_risk": "MODERATE",
            "override_reason": "Recent clinical treatment / intervention response",
            "clinical_decision": "OBSERVATION_UNIT"
        })

        res = self.client.get("/api/encounters/ENC-100/physician-assessments", headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["count"], 2)
        self.assertEqual(data["assessments"][0]["clinical_decision"], "OBSERVATION_UNIT")
        self.assertEqual(data["assessments"][1]["clinical_decision"], "CONTINUE_EVALUATION")

    def test_10_audit_trail_logging(self):
        """Test 10: Clinical decisions and AI overrides are logged in the tamper-resistant audit trail."""
        headers = {"X-Staff-Id": "DOC_A", "X-Hospital-Id": "HOSP_A"}
        self.client.post("/api/encounters/ENC-100/clinical-decision", headers=headers, json={
            "clinical_assessment": "Audit test assessment.",
            "ai_agreement": "OVERRIDDEN",
            "clinician_assigned_risk": "MODERATE",
            "override_reason": "Point-of-care diagnostics / lab discrepancy",
            "clinical_decision": "ESCALATE_CARE"
        })

        logs = self.db.query(AuditLog).filter(
            AuditLog.hospital_id == "HOSP_A",
            AuditLog.action == "AI_OVERRIDDEN"
        ).all()
        self.assertTrue(len(logs) > 0)
        last_log = logs[-1]
        self.assertEqual(last_log.staff_id, "DOC_A")
        self.assertEqual(last_log.entity_type, "PhysicianAssessment")
        self.assertIn("ai_agreement", last_log.metadata_json)
        self.assertEqual(last_log.metadata_json["override_reason"], "Point-of-care diagnostics / lab discrepancy")

if __name__ == "__main__":
    unittest.main()
