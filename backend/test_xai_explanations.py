import unittest
import os
import sys
import datetime
from fastapi.testclient import TestClient

# Add workspace path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from backend.main import app, get_db
from backend.models import (
    Base, engine, SessionLocal, Hospital, Staff, Patient, Encounter, AIAssessment, AIExplanation, seed_database
)

class TestXAIExplanations(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        cls.client = TestClient(app)
        engine.dispose()

    def setUp(self):
        self.db = SessionLocal()
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        
        # Seed databases
        seed_database()

        # Seed Hospital A & B
        hosp_a = Hospital(
            hospital_id="HOSP_A",
            name="Hospital Alpha",
            hospital_type="General",
            address="123 Alpha St",
            city="AlphaCity",
            state="NY",
            country="USA",
            postal_code="10002",
            registration_number="REG-A",
            verification_status="VERIFIED"
        )
        hosp_b = Hospital(
            hospital_id="HOSP_B",
            name="Hospital Beta",
            hospital_type="General",
            address="123 Beta St",
            city="BetaCity",
            state="NY",
            country="USA",
            postal_code="10003",
            registration_number="REG-B",
            verification_status="VERIFIED"
        )
        self.db.add(hosp_a)
        self.db.add(hosp_b)
        self.db.commit()

        # Seed Staff
        from backend.models import get_hash
        nurse_a = Staff(
            staff_id="NUR_A",
            hospital_id="HOSP_A",
            full_name="Nurse Alpha",
            employee_id="EMP-N01",
            official_email="nurse_a@hospitalalpha.com",
            phone_number="555-0001",
            department="Triage",
            designation="Triage Nurse",
            role_id="TRIAGE_NURSE",
            password_hash=get_hash("NurseAlpha1!"),
            status="ACTIVE"
        )
        nurse_b = Staff(
            staff_id="NUR_B",
            hospital_id="HOSP_B",
            full_name="Nurse Beta",
            employee_id="EMP-N02",
            official_email="nurse_b@hospitalbeta.com",
            phone_number="555-0004",
            department="Triage",
            designation="Triage Nurse",
            role_id="TRIAGE_NURSE",
            password_hash=get_hash("NurseBeta1!"),
            status="ACTIVE"
        )
        self.db.add(nurse_a)
        self.db.add(nurse_b)
        self.db.commit()

        # Seed Patient
        pt_a = Patient(
            patient_id="PT-A100",
            hospital_id="HOSP_A",
            first_name="Alice",
            last_name="Smith",
            date_of_birth=datetime.date(1990, 5, 10),
            gender="Female",
            age=36.0,
            known_allergies="None"
        )
        self.db.add(pt_a)
        self.db.commit()

        # Seed Encounter
        enc_a = Encounter(
            encounter_id="ENC-A100",
            patient_id="PT-A100",
            hospital_id="HOSP_A",
            status="WAITING_FOR_TRIAGE",
            arrival_time=datetime.datetime.utcnow()
        )
        self.db.add(enc_a)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        engine.dispose()

    def get_token(self, username, password, hospital_id):
        res = self.client.post("/api/v1/auth/login", json={
            "hospital_id": hospital_id,
            "username": username,
            "password": password
        })
        return res.json()["access_token"]

    def test_01_triage_evaluate_persists_assessment(self):
        token = self.get_token("nurse_a@hospitalalpha.com", "NurseAlpha1!", "HOSP_A")
        headers = {"Authorization": f"Bearer {token}"}

        # Send evaluate request WITH encounter_id
        res = self.client.post("/api/v1/triage", headers=headers, json={
            "age": 45,
            "gender": "Female",
            "hr": 105,
            "sbp": 120,
            "rr": 18,
            "spo2": 96,
            "gcs": 15,
            "history_available": True,
            "setting": "Urban",
            "encounter_id": "ENC-A100"
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIsNotNone(data.get("assessment_id"))

        # Verify record exists in DB
        assessment_id = data["assessment_id"]
        db_assessment = self.db.query(AIAssessment).filter_by(assessment_id=assessment_id).first()
        self.assertIsNotNone(db_assessment)
        self.assertEqual(db_assessment.risk_category, f"Level {data['ai_suggested_level']}")
        self.assertEqual(db_assessment.model_name, "PatientTriage Risk Model")

        # Send evaluate request WITHOUT encounter_id -> assessment_id should be None
        res_no_enc = self.client.post("/api/v1/triage", headers=headers, json={
            "age": 45,
            "gender": "Female",
            "hr": 105,
            "sbp": 120,
            "rr": 18,
            "spo2": 96,
            "gcs": 15,
            "history_available": True,
            "setting": "Urban"
        })
        self.assertEqual(res_no_enc.status_code, 200)
        self.assertIsNone(res_no_enc.json().get("assessment_id"))

    def test_02_explanation_generation_and_features(self):
        token = self.get_token("nurse_a@hospitalalpha.com", "NurseAlpha1!", "HOSP_A")
        headers = {"Authorization": f"Bearer {token}"}

        # Create assessment
        res_eval = self.client.post("/api/v1/triage", headers=headers, json={
            "age": 45,
            "gender": "Female",
            "hr": 105,
            "sbp": 120,
            "rr": 18,
            "spo2": 96,
            "gcs": 15,
            "history_available": True,
            "setting": "Urban",
            "encounter_id": "ENC-A100"
        })
        assessment_id = res_eval.json()["assessment_id"]

        # Generate explanation
        res_exp = self.client.post(f"/api/v1/assessments/{assessment_id}/explanation", headers=headers)
        self.assertEqual(res_exp.status_code, 200)
        data = res_exp.json()

        # Check properties
        self.assertEqual(data["ai_assessment_id"], assessment_id)
        self.assertEqual(data["explanation_method"], "TreeInterpreter")
        self.assertEqual(data["explanation_version"], "1.0")
        self.assertEqual(data["status"], "AVAILABLE")
        self.assertTrue(len(data["feature_contributions"]) > 0)

        # Check structure of contribution
        first_feat = data["feature_contributions"][0]
        self.assertIn("feature_name", first_feat)
        self.assertIn("feature_value", first_feat)
        self.assertIn("contribution_value", first_feat)
        self.assertIn("direction", first_feat)
        self.assertIn("rank", first_feat)
        self.assertEqual(first_feat["rank"], 1)

    def test_03_redundant_caching(self):
        token = self.get_token("nurse_a@hospitalalpha.com", "NurseAlpha1!", "HOSP_A")
        headers = {"Authorization": f"Bearer {token}"}

        res_eval = self.client.post("/api/v1/triage", headers=headers, json={
            "age": 30,
            "gender": "Male",
            "hr": 80,
            "sbp": 120,
            "rr": 16,
            "spo2": 98,
            "gcs": 15,
            "encounter_id": "ENC-A100"
        })
        assessment_id = res_eval.json()["assessment_id"]

        # Compute first time
        res1 = self.client.post(f"/api/v1/assessments/{assessment_id}/explanation", headers=headers)
        exp_id_1 = res1.json()["explanation_id"]

        # Request second time -> should return the cached object (same ID)
        res2 = self.client.post(f"/api/v1/assessments/{assessment_id}/explanation", headers=headers)
        exp_id_2 = res2.json()["explanation_id"]
        self.assertEqual(exp_id_1, exp_id_2)

    def test_04_cross_hospital_isolation(self):
        token_a = self.get_token("nurse_a@hospitalalpha.com", "NurseAlpha1!", "HOSP_A")
        token_b = self.get_token("nurse_b@hospitalbeta.com", "NurseBeta1!", "HOSP_B")
        
        headers_a = {"Authorization": f"Bearer {token_a}"}
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # Create assessment in Hospital A
        res_eval = self.client.post("/api/v1/triage", headers=headers_a, json={
            "age": 30,
            "gender": "Male",
            "hr": 80,
            "sbp": 120,
            "rr": 16,
            "spo2": 98,
            "gcs": 15,
            "encounter_id": "ENC-A100"
        })
        assessment_id = res_eval.json()["assessment_id"]

        # Hospital B nurse attempts to view or generate explanation -> should be 404
        res_fail_view = self.client.get(f"/api/v1/assessments/{assessment_id}/explanation", headers=headers_b)
        self.assertEqual(res_fail_view.status_code, 404)

        res_fail_gen = self.client.post(f"/api/v1/assessments/{assessment_id}/explanation", headers=headers_b)
        self.assertEqual(res_fail_gen.status_code, 404)

    def test_05_explanation_failure_handling(self):
        token = self.get_token("nurse_a@hospitalalpha.com", "NurseAlpha1!", "HOSP_A")
        headers = {"Authorization": f"Bearer {token}"}

        # Non-existent assessment ID -> should return 404
        res = self.client.post("/api/v1/assessments/9999/explanation", headers=headers)
        self.assertEqual(res.status_code, 404)

if __name__ == "__main__":
    unittest.main()
