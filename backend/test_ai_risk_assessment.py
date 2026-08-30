import datetime
import os
import sys
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.append(os.path.abspath(os.path.dirname(__file__)))
from main import app, create_access_token, get_db
from models import AIRiskAssessment, Base, Encounter, Hospital, Patient, Permission, Role, Staff, VitalSigns

DB_PATH = "./test_ai_risk.db"
engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})
TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
def override_db():
    db = TestSession()
    try: yield db
    finally: db.close()
app.dependency_overrides[get_db] = override_db

class TestAIRiskAssessment(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.drop_all(engine); Base.metadata.create_all(engine)
        db = TestSession()
        for key in ("ai:view",): db.add(Permission(permission_id=key, description="test"))
        role = Role(role_id="CLINICIAN", name="Clinician"); role.permissions.append(db.query(Permission).filter_by(permission_id="ai:view").first())
        db.add_all([role, Role(role_id="NO_AI", name="No AI"), Hospital(hospital_id="HOSP_A", name="A", hospital_type="Test", address="A", city="A", state="A", country="US", postal_code="1", registration_number="A"), Hospital(hospital_id="HOSP_B", name="B", hospital_type="Test", address="B", city="B", state="B", country="US", postal_code="2", registration_number="B")]); db.flush()
        db.add_all([cls.staff("CLIN_A", "HOSP_A", "CLINICIAN"), cls.staff("NOAI_A", "HOSP_A", "NO_AI"), cls.staff("CLIN_B", "HOSP_B", "CLINICIAN"), Patient(patient_id="PT_A", hospital_id="HOSP_A", first_name="A", last_name="One", age=54, gender="Male"), Patient(patient_id="PT_B", hospital_id="HOSP_B", first_name="B", last_name="Two", age=54, gender="Male")]); db.flush()
        db.add_all([Encounter(encounter_id="ENC_A", patient_id="PT_A", hospital_id="HOSP_A", status="TRIAGED"), Encounter(encounter_id="ENC_B", patient_id="PT_B", hospital_id="HOSP_B", status="TRIAGED")]); db.commit(); db.close()
    @staticmethod
    def staff(staff_id, hospital_id, role_id):
        return Staff(staff_id=staff_id, hospital_id=hospital_id, full_name=staff_id, employee_id=staff_id, official_email=f"{staff_id}@test", phone_number="1", department="ED", designation="Clinician", role_id=role_id, password_hash="x", status="ACTIVE")
    @classmethod
    def tearDownClass(cls):
        engine.dispose()
        if os.path.exists(DB_PATH): os.remove(DB_PATH)
    def setUp(self):
        db = TestSession(); db.query(AIRiskAssessment).delete(); db.query(VitalSigns).delete(); db.commit(); db.close(); self.client = TestClient(app)
    def headers(self, staff_id, hospital_id, role):
        return {"Authorization": f"Bearer {create_access_token({'staff_id': staff_id, 'hospital_id': hospital_id, 'role': role})}"}
    def vitals(self):
        db = TestSession(); enc = db.query(Encounter).filter_by(encounter_id="ENC_A").first(); db.add(VitalSigns(encounter_id=enc.id, hospital_id="HOSP_A", recorded_by="CLIN_A", heart_rate=121, systolic_bp=104, respiratory_rate=28, spo2=89, gcs=15)); db.commit(); db.close()
    def test_generation_history_and_provenance(self):
        self.vitals(); headers = self.headers("CLIN_A", "HOSP_A", "CLINICIAN")
        with patch("main.ExistingTriageClassifierRiskAdapter") as adapter:
            adapter.return_value.predict.return_value = type("R", (), {"score": .82, "category": "HIGH", "model_name": "Test", "model_version": "1"})()
            first = self.client.post("/api/v1/encounters/ENC_A/ai/risk-assessments", headers=headers); second = self.client.post("/api/v1/encounters/ENC_A/ai/risk-assessments", headers=headers)
        self.assertEqual(first.status_code, 200); self.assertEqual(first.json()["risk_score"], .82); self.assertEqual(second.status_code, 200)
        history = self.client.get("/api/v1/encounters/ENC_A/ai/risk-assessments", headers=headers).json(); self.assertEqual(len(history), 2); self.assertEqual(history[0]["input_schema_version"], "1.0")
    def test_missing_data_is_unavailable_not_low(self):
        response = self.client.post("/api/v1/encounters/ENC_A/ai/risk-assessments", headers=self.headers("CLIN_A", "HOSP_A", "CLINICIAN"))
        self.assertEqual(response.status_code, 200); self.assertEqual(response.json()["status"], "UNAVAILABLE"); self.assertIsNone(response.json()["risk_score"])
    def test_rbac_and_hospital_isolation(self):
        forbidden = self.client.get("/api/v1/encounters/ENC_A/ai/risk-assessments", headers=self.headers("NOAI_A", "HOSP_A", "NO_AI")); self.assertEqual(forbidden.status_code, 403)
        hidden = self.client.get("/api/v1/encounters/ENC_A/ai/risk-assessments", headers=self.headers("CLIN_B", "HOSP_B", "CLINICIAN")); self.assertEqual(hidden.status_code, 404)
    def test_invalid_model_output_is_not_stored_as_valid(self):
        self.vitals(); headers = self.headers("CLIN_A", "HOSP_A", "CLINICIAN")
        with patch("main.ExistingTriageClassifierRiskAdapter") as adapter:
            adapter.return_value.predict.side_effect = __import__("main").InvalidModelOutput("bad")
            response = self.client.post("/api/v1/encounters/ENC_A/ai/risk-assessments", headers=headers)
        self.assertEqual(response.status_code, 503); self.assertEqual(response.json()["detail"], "AI risk assessment is temporarily unavailable.")
        history = self.client.get("/api/v1/encounters/ENC_A/ai/risk-assessments", headers=headers).json()
        self.assertEqual(history[0]["status"], "FAILED"); self.assertEqual(history[0]["failure_code"], "INVALID_MODEL_OUTPUT")

if __name__ == "__main__": unittest.main()
