import unittest
import sys
import os
import datetime
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Add project root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from models import (
    Base, Hospital, Staff, StaffRoleEnum, Patient,
    EDEncounter, EncounterStatusEnum, ClinicalObservation,
    AIRiskAssessment, AIExplanation, AIRiskCategoryEnum,
    AuditLog
)
from services.rbac import ACTIVE_SESSIONS, REVOKED_TOKENS, get_db
from main import app

class TestMLIntegrationWorkflow(unittest.TestCase):
    """
    Comprehensive verification of the ML Model (v1.0) Integration into the
    PatientTriage.ai Clinical Workflow.
    """

    @classmethod
    def setUpClass(cls):
        cls.test_db_url = "sqlite:///./test_ml_integration.db"
        cls.engine = create_engine(cls.test_db_url, connect_args={"check_same_thread": False})
        cls.TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=cls.engine)
        Base.metadata.create_all(bind=cls.engine)

        def override_get_db():
            db = cls.TestingSessionLocal()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override_get_db
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=cls.engine)
        if os.path.exists("./test_ml_integration.db"):
            try:
                os.remove("./test_ml_integration.db")
            except Exception:
                pass

    def setUp(self):
        ACTIVE_SESSIONS.clear()
        REVOKED_TOKENS.clear()
        self.db = self.TestingSessionLocal()
        
        # Clean test tables
        self.db.query(AuditLog).delete()
        self.db.query(AIExplanation).delete()
        self.db.query(AIRiskAssessment).delete()
        self.db.query(ClinicalObservation).delete()
        self.db.query(EDEncounter).delete()
        self.db.query(Patient).delete()
        self.db.query(Staff).delete()
        self.db.query(Hospital).delete()
        self.db.commit()

        # Seed Hospitals
        hospA = Hospital(hospital_code="HOSP_A", name="Hospital Alpha")
        hospB = Hospital(hospital_code="HOSP_B", name="Hospital Beta")
        self.db.add_all([hospA, hospB])
        self.db.commit()

        # Seed Staff
        self.doc_a = Staff(hospital_id="HOSP_A", staff_id="DOC_A", name="Dr. A", email="doc_a@hosp.org", role=StaffRoleEnum.EMERGENCY_PHYSICIAN, password_hash="h")
        self.nurse_a = Staff(hospital_id="HOSP_A", staff_id="NUR_A", name="Nurse A", email="nur_a@hosp.org", role=StaffRoleEnum.TRIAGE_NURSE, password_hash="h")
        self.doc_b = Staff(hospital_id="HOSP_B", staff_id="DOC_B", name="Dr. B", email="doc_b@hosp.org", role=StaffRoleEnum.EMERGENCY_PHYSICIAN, password_hash="h")
        self.db.add_all([self.doc_a, self.nurse_a, self.doc_b])
        self.db.commit()

        # Authorize Active Sessions
        import time
        self.token_doc_a = "token-doc-a"
        ACTIVE_SESSIONS[self.token_doc_a] = {
            "staff_id": "DOC_A", "hospital_id": "HOSP_A", "role": StaffRoleEnum.EMERGENCY_PHYSICIAN.value,
            "created_at": datetime.datetime.utcnow(), "last_activity": datetime.datetime.utcnow(),
            "expires_at": time.time() + 3600
        }

        self.token_doc_b = "token-doc-b"
        ACTIVE_SESSIONS[self.token_doc_b] = {
            "staff_id": "DOC_B", "hospital_id": "HOSP_B", "role": StaffRoleEnum.EMERGENCY_PHYSICIAN.value,
            "created_at": datetime.datetime.utcnow(), "last_activity": datetime.datetime.utcnow(),
            "expires_at": time.time() + 3600
        }

        # Seed Patient & Encounter in HOSP_A
        self.patient_a = Patient(hospital_id="HOSP_A", patient_id="PT-001", first_name="John", last_name="Doe", age=58.0, gender="Male")
        self.db.add(self.patient_a)
        self.db.commit()

        self.encounter_a = EDEncounter(
            hospital_id="HOSP_A", patient_id="PT-001", encounter_id="ENC-001",
            arrival_time=datetime.datetime.utcnow() - datetime.timedelta(minutes=30),
            arrival_mode="Ambulance", chief_complaint="Severe shortness of breath, hypoxia",
            status=EncounterStatusEnum.WAITING
        )
        self.db.add(self.encounter_a)
        self.db.commit()

        # Seed Observations
        self.obs1 = ClinicalObservation(
            hospital_id="HOSP_A", patient_id="PT-001", encounter_id="ENC-001",
            timestamp=datetime.datetime.utcnow() - datetime.timedelta(minutes=25),
            hr=112, sbp=128, dbp=78, rr=24, spo2=92, temp=37.8, gcs=15, recorded_by="NUR_A"
        )
        self.obs2 = ClinicalObservation(
            hospital_id="HOSP_A", patient_id="PT-001", encounter_id="ENC-001",
            timestamp=datetime.datetime.utcnow() - datetime.timedelta(minutes=5),
            hr=126, sbp=118, dbp=72, rr=28, spo2=88, temp=38.1, gcs=14, recorded_by="NUR_A"
        )
        self.db.add_all([self.obs1, self.obs2])
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_01_successful_model_loading_and_inference(self):
        """Test 1: Generates calibrated ML risk prediction using model v1.0."""
        res = self.client.post(
            "/api/encounters/ENC-001/ai-assessment",
            headers={"Authorization": f"Bearer {self.token_doc_a}", "X-Hospital-Id": "HOSP_A"}
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        
        self.assertIn("assessment", data)
        self.assertIn("explanation", data)
        
        assessment = data["assessment"]
        self.assertEqual(assessment["model_version"], "1.0")
        self.assertEqual(assessment["model_name"], "PatientTriage Decompensation Risk Classifier")
        self.assertTrue(0.0 <= assessment["risk_probability"] <= 1.0)
        self.assertTrue(0.0 <= assessment["risk_score"] <= 100.0)
        self.assertIn(assessment["predicted_triage_level"], [1, 2, 3, 4, 5])
        self.assertIn(assessment["risk_category"], ["LOW", "MODERATE", "HIGH", "CRITICAL"])

    def test_02_feature_snapshot_and_probability_persistence(self):
        """Test 2: Persists exact input feature snapshot and probability in database."""
        self.client.post(
            "/api/encounters/ENC-001/ai-assessment",
            headers={"Authorization": f"Bearer {self.token_doc_a}", "X-Hospital-Id": "HOSP_A"}
        )
        
        record = self.db.query(AIRiskAssessment).filter(AIRiskAssessment.encounter_id == "ENC-001").first()
        self.assertIsNotNone(record)
        self.assertEqual(record.model_version, "1.0")
        self.assertIsNotNone(record.input_features_json)
        self.assertIn("shock_index", record.input_features_json)
        self.assertIn("velocity_spo2", record.input_features_json)
        self.assertEqual(len(record.input_features_json), 40)

    def test_03_explainability_synchronization(self):
        """Test 3: AIExplanation is generated and synchronized with the exact prediction."""
        res = self.client.post(
            "/api/encounters/ENC-001/ai-assessment",
            headers={"Authorization": f"Bearer {self.token_doc_a}", "X-Hospital-Id": "HOSP_A"}
        )
        exp = res.json()["explanation"]
        self.assertIn("top_features", exp)
        self.assertIn("summary", exp)
        self.assertGreater(len(exp["top_features"]), 0)

    def test_04_audit_event_generation(self):
        """Test 4: Generates immutable AI_ASSESSMENT_GENERATED audit event."""
        self.client.post(
            "/api/encounters/ENC-001/ai-assessment",
            headers={"Authorization": f"Bearer {self.token_doc_a}", "X-Hospital-Id": "HOSP_A"}
        )
        audit = self.db.query(AuditLog).filter(
            AuditLog.action == "AI_ASSESSMENT_GENERATED",
            AuditLog.encounter_id == "ENC-001"
        ).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.actor_type.value, "AI_SYSTEM")
        self.assertEqual(audit.hospital_id, "HOSP_A")

    def test_05_cross_hospital_isolation_rejection(self):
        """Test 5: Hospital B physician cannot trigger AI assessment for Hospital A encounter (404/403)."""
        res = self.client.post(
            "/api/encounters/ENC-001/ai-assessment",
            headers={"Authorization": f"Bearer {self.token_doc_b}", "X-Hospital-Id": "HOSP_B"}
        )
        self.assertEqual(res.status_code, 404)

    def test_06_unauthenticated_request_rejected(self):
        """Test 6: Request without valid bearer token is rejected with 401."""
        res = self.client.post("/api/encounters/ENC-001/ai-assessment")
        self.assertEqual(res.status_code, 401)

    def test_07_historical_prediction_preservation(self):
        """Test 7: Generating multiple predictions preserves historical versions without overwriting."""
        self.client.post(
            "/api/encounters/ENC-001/ai-assessment",
            headers={"Authorization": f"Bearer {self.token_doc_a}", "X-Hospital-Id": "HOSP_A"}
        )
        self.client.post(
            "/api/encounters/ENC-001/ai-assessment",
            headers={"Authorization": f"Bearer {self.token_doc_a}", "X-Hospital-Id": "HOSP_A"}
        )
        assessments = self.db.query(AIRiskAssessment).filter(AIRiskAssessment.encounter_id == "ENC-001").all()
        self.assertEqual(len(assessments), 2)
        for a in assessments:
            self.assertEqual(a.model_version, "1.0")

    def test_08_clinical_safety_non_autonomous(self):
        """Test 8: AI assessment does NOT alter encounter status or create a physician disposition."""
        self.client.post(
            "/api/encounters/ENC-001/ai-assessment",
            headers={"Authorization": f"Bearer {self.token_doc_a}", "X-Hospital-Id": "HOSP_A"}
        )
        enc = self.db.query(EDEncounter).filter(EDEncounter.encounter_id == "ENC-001").first()
        self.assertEqual(enc.status, EncounterStatusEnum.WAITING)

if __name__ == "__main__":
    unittest.main()
