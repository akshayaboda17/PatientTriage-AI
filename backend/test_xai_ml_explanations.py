import unittest
import sys
import os
import time
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
from ml_pipeline.explainability_engine import ShapExplainabilityEngine
from ml_pipeline.schema import ALL_FEATURE_COLUMNS
from main import app

class TestXAIMLExplanations(unittest.TestCase):
    """
    Automated verification of genuine mathematical SHAP explainability
    for the versioned supervised ML candidate model (v1.0).
    """

    @classmethod
    def setUpClass(cls):
        cls.shap_engine = ShapExplainabilityEngine(model_version="1.0")
        cls.test_db_url = "sqlite:///./test_xai_ml.db"
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
        if os.path.exists("./test_xai_ml.db"):
            try:
                os.remove("./test_xai_ml.db")
            except Exception:
                pass

    def setUp(self):
        ACTIVE_SESSIONS.clear()
        REVOKED_TOKENS.clear()
        self.db = self.TestingSessionLocal()
        
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
        self.doc_b = Staff(hospital_id="HOSP_B", staff_id="DOC_B", name="Dr. B", email="doc_b@hosp.org", role=StaffRoleEnum.EMERGENCY_PHYSICIAN, password_hash="h")
        self.db.add_all([self.doc_a, self.doc_b])
        self.db.commit()

        # Authorize Sessions
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
        self.patient_a = Patient(hospital_id="HOSP_A", patient_id="PT-001", first_name="Jane", last_name="Doe", age=68.0, gender="Female")
        self.db.add(self.patient_a)
        self.db.commit()

        self.encounter_a = EDEncounter(
            hospital_id="HOSP_A", patient_id="PT-001", encounter_id="ENC-001",
            arrival_time=datetime.datetime.utcnow() - datetime.timedelta(minutes=45),
            arrival_mode="Ambulance", chief_complaint="Chest tightness, diaphoresis, dyspnea",
            status=EncounterStatusEnum.WAITING
        )
        self.db.add(self.encounter_a)
        self.db.commit()

        self.obs1 = ClinicalObservation(
            hospital_id="HOSP_A", patient_id="PT-001", encounter_id="ENC-001",
            timestamp=datetime.datetime.utcnow() - datetime.timedelta(minutes=10),
            hr=124, sbp=88, dbp=52, rr=26, spo2=90, temp=38.2, gcs=14, recorded_by="DOC_A"
        )
        self.db.add(self.obs1)
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_01_shap_engine_initialization_and_dimensions(self):
        """Test 1 & 4: SHAP engine loads and calculates Shapley values across all 40 features."""
        self.assertIsNotNone(self.shap_engine.model)
        self.assertEqual(len(self.shap_engine.feature_names), 40)
        self.assertEqual(self.shap_engine.model_version, "1.0")

        dummy_features = {col: 0.0 for col in ALL_FEATURE_COLUMNS}
        dummy_features["hr"] = 120.0
        dummy_features["sbp"] = 90.0
        dummy_features["spo2"] = 89.0
        dummy_features["shock_index"] = 1.33

        result = self.shap_engine.explain_prediction(dummy_features, risk_probability=0.85)
        self.assertEqual(result["status"], "AVAILABLE")
        self.assertIn("all_shap_contributions", result)
        self.assertEqual(len(result["all_shap_contributions"]), 40)
        self.assertIn("base_value", result)

    def test_02_explanation_corresponds_to_model_version_and_features(self):
        """Test 2 & 3: API creates explanation corresponding to exact model version and feature snapshot."""
        res = self.client.post(
            "/api/encounters/ENC-001/ai-assessment",
            headers={"Authorization": f"Bearer {self.token_doc_a}", "X-Hospital-Id": "HOSP_A"}
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()

        assessment = data["assessment"]
        explanation = data["explanation"]

        self.assertEqual(assessment["model_version"], "1.0")
        self.assertIn("input_features", assessment)
        self.assertEqual(len(assessment["input_features"]), 40)

        self.assertIn("top_features", explanation)
        self.assertGreater(len(explanation["top_features"]), 0)
        
        # Check non-causal explanation wording
        self.assertTrue(
            "contributed" in explanation["summary"].lower() or 
            "elevated" in explanation["summary"].lower() or
            "baseline" in explanation["summary"].lower()
        )

    def test_03_missing_invalid_feature_tolerance(self):
        """Test 5: Incomplete feature dictionary is handled gracefully by SHAP engine."""
        sparse_features = {"hr": 80.0, "sbp": 120.0}
        result = self.shap_engine.explain_prediction(sparse_features, risk_probability=0.2)
        self.assertEqual(result["status"], "AVAILABLE")
        self.assertIsInstance(result["top_features"], list)

    def test_04_safety_interlock_explanation(self):
        """Test 6: Safety net triggered explanation produces explicit clinical safety reason."""
        result = self.shap_engine.explain_prediction(
            features_dict={},
            risk_probability=1.0,
            safety_net_triggered=True,
            safety_triggers=["Critical Hypoxia (SpO2=80%)"]
        )
        self.assertEqual(result["explanation_method"], "Deterministic Clinical Safety Interlock")
        self.assertIn("Critical Hypoxia", result["summary"])

    def test_05_historical_explanation_preservation(self):
        """Test 7: Generating multiple assessments creates distinct historical explanations."""
        self.client.post(
            "/api/encounters/ENC-001/ai-assessment",
            headers={"Authorization": f"Bearer {self.token_doc_a}", "X-Hospital-Id": "HOSP_A"}
        )
        self.client.post(
            "/api/encounters/ENC-001/ai-assessment",
            headers={"Authorization": f"Bearer {self.token_doc_a}", "X-Hospital-Id": "HOSP_A"}
        )
        explanations = self.db.query(AIExplanation).filter(AIExplanation.encounter_id == "ENC-001").all()
        self.assertEqual(len(explanations), 2)
        self.assertNotEqual(explanations[0].id, explanations[1].id)

    def test_06_cross_hospital_isolation_and_rbac(self):
        """Test 8 & 9: Hospital B user cannot access Hospital A AI explanations; unauthenticated rejected."""
        # Unauthenticated
        res_unauth = self.client.post("/api/encounters/ENC-001/ai-assessment")
        self.assertEqual(res_unauth.status_code, 401)

        # Cross-hospital
        res_cross = self.client.post(
            "/api/encounters/ENC-001/ai-assessment",
            headers={"Authorization": f"Bearer {self.token_doc_b}", "X-Hospital-Id": "HOSP_B"}
        )
        self.assertEqual(res_cross.status_code, 404)

    def test_07_audit_event_logged(self):
        """Test 10: Successful inference and explanation generation logs audit event."""
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

if __name__ == "__main__":
    unittest.main()
