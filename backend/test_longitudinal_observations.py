import unittest
import os
import sys
import datetime
from fastapi.testclient import TestClient

# Add workspace path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from backend.main import app, get_db
from backend.models import (
    Base, engine, SessionLocal, Hospital, Staff, Patient, Encounter, VitalSigns, AuditLog, seed_database
)

class TestLongitudinalObservations(unittest.TestCase):
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

        # Seed Patients
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
        pt_b = Patient(
            patient_id="PT-B200",
            hospital_id="HOSP_B",
            first_name="Bob",
            last_name="Jones",
            date_of_birth=datetime.date(1985, 8, 20),
            gender="Male",
            age=41.0,
            known_allergies="Peanuts"
        )
        self.db.add(pt_a)
        self.db.add(pt_b)
        self.db.commit()

        # Seed Encounters
        enc_a1 = Encounter(
            encounter_id="ENC-A100",
            patient_id="PT-A100",
            hospital_id="HOSP_A",
            status="WAITING_FOR_TRIAGE",
            arrival_time=datetime.datetime.utcnow()
        )
        enc_a2 = Encounter(
            encounter_id="ENC-A200",
            patient_id="PT-A100",
            hospital_id="HOSP_A",
            status="WAITING_FOR_TRIAGE",
            arrival_time=datetime.datetime.utcnow()
        )
        enc_b = Encounter(
            encounter_id="ENC-B200",
            patient_id="PT-B200",
            hospital_id="HOSP_B",
            status="WAITING_FOR_TRIAGE",
            arrival_time=datetime.datetime.utcnow()
        )
        self.db.add(enc_a1)
        self.db.add(enc_a2)
        self.db.add(enc_b)
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

    def test_01_multiple_historical_observations(self):
        token = self.get_token("nurse_a@hospitalalpha.com", "NurseAlpha1!", "HOSP_A")
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Log observation at 10:40
        t1 = datetime.datetime.utcnow() - datetime.timedelta(minutes=30)
        res1 = self.client.post("/api/v1/encounters/ENC-A100/observations", headers=headers, json={
            "heart_rate": 98,
            "spo2": 96,
            "respiratory_rate": 18,
            "source": "MONITOR"
        })
        self.assertEqual(res1.status_code, 200)

        # 2. Log observation at 10:55
        res2 = self.client.post("/api/v1/encounters/ENC-A100/observations", headers=headers, json={
            "heart_rate": 108,
            "spo2": 93,
            "respiratory_rate": 22,
            "source": "MONITOR"
        })
        self.assertEqual(res2.status_code, 200)

        # 3. Verify both observations are preserved in the DB
        enc = self.db.query(Encounter).filter_by(encounter_id="ENC-A100").first()
        vitals_count = self.db.query(VitalSigns).filter_by(encounter_id=enc.id).count()
        self.assertEqual(vitals_count, 2)

    def test_02_latest_observation(self):
        token = self.get_token("nurse_a@hospitalalpha.com", "NurseAlpha1!", "HOSP_A")
        headers = {"Authorization": f"Bearer {token}"}

        # Record older vital
        res1 = self.client.post("/api/v1/encounters/ENC-A100/observations", headers=headers, json={
            "heart_rate": 80,
            "spo2": 98
        })
        self.assertEqual(res1.status_code, 200)

        # Record newer vital
        res2 = self.client.post("/api/v1/encounters/ENC-A100/observations", headers=headers, json={
            "heart_rate": 90,
            "spo2": 95
        })
        self.assertEqual(res2.status_code, 200)

        # Fetch latest via observations latest endpoint
        res_latest = self.client.get("/api/v1/encounters/ENC-A100/observations/latest", headers=headers)
        self.assertEqual(res_latest.status_code, 200)
        data = res_latest.json()
        
        # Verify it has latest value of HR (90) and SpO2 (95)
        hr_obs = next(x for x in data if x["type"] == "heart_rate")
        spo2_obs = next(x for x in data if x["type"] == "spo2")
        self.assertEqual(hr_obs["value"], 90.0)
        self.assertEqual(spo2_obs["value"], 95.0)

    def test_03_structured_trends_endpoint(self):
        token = self.get_token("nurse_a@hospitalalpha.com", "NurseAlpha1!", "HOSP_A")
        headers = {"Authorization": f"Bearer {token}"}

        self.client.post("/api/v1/encounters/ENC-A100/observations", headers=headers, json={
            "heart_rate": 98,
            "spo2": 96,
            "source": "MONITOR"
        })

        res = self.client.get("/api/v1/encounters/ENC-A100/observations", headers=headers)
        self.assertEqual(res.status_code, 200)
        
        # Verify schema elements: type, value, unit, recorded_at, source
        first_item = res.json()[0]
        self.assertIn("type", first_item)
        self.assertIn("value", first_item)
        self.assertIn("unit", first_item)
        self.assertIn("recorded_at", first_item)
        self.assertIn("source", first_item)
        self.assertEqual(first_item["source"], "MONITOR")

    def test_04_source_and_parameter_validations(self):
        token = self.get_token("nurse_a@hospitalalpha.com", "NurseAlpha1!", "HOSP_A")
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Invalid GCS score (16) -> should fail 400
        res = self.client.post("/api/v1/encounters/ENC-A100/observations", headers=headers, json={
            "gcs": 16
        })
        self.assertEqual(res.status_code, 400)

        # 2. Invalid Pain Score (11) -> should fail 400
        res2 = self.client.post("/api/v1/encounters/ENC-A100/observations", headers=headers, json={
            "pain_score": 11
        })
        self.assertEqual(res2.status_code, 400)

        # 3. Invalid Blood Glucose (-50) -> should fail 400
        res3 = self.client.post("/api/v1/encounters/ENC-A100/observations", headers=headers, json={
            "blood_glucose": -50
        })
        self.assertEqual(res3.status_code, 400)

        # 4. Invalid Source -> should fail 400
        res4 = self.client.post("/api/v1/encounters/ENC-A100/observations", headers=headers, json={
            "source": "SMARTPHONE"
        })
        self.assertEqual(res4.status_code, 400)

        # 5. Extreme but valid clinic parameters -> should succeed
        res5 = self.client.post("/api/v1/encounters/ENC-A100/observations", headers=headers, json={
            "gcs": 3,
            "pain_score": 10,
            "blood_glucose": 450.5,
            "source": "MONITOR"
        })
        self.assertEqual(res5.status_code, 200)

    def test_05_cross_hospital_isolation(self):
        token_a = self.get_token("nurse_a@hospitalalpha.com", "NurseAlpha1!", "HOSP_A")
        headers_a = {"Authorization": f"Bearer {token_a}"}

        # Nurse A tries to query Hospital B observations -> should get 404
        res = self.client.get("/api/v1/encounters/ENC-B200/observations", headers=headers_a)
        self.assertEqual(res.status_code, 404)

        # Nurse A tries to post observations for Hospital B encounter -> should get 404
        res2 = self.client.post("/api/v1/encounters/ENC-B200/observations", headers=headers_a, json={
            "heart_rate": 80
        })
        self.assertEqual(res2.status_code, 404)

    def test_06_encounter_isolation(self):
        token = self.get_token("nurse_a@hospitalalpha.com", "NurseAlpha1!", "HOSP_A")
        headers = {"Authorization": f"Bearer {token}"}

        # Record vital on Encounter 1
        self.client.post("/api/v1/encounters/ENC-A100/observations", headers=headers, json={
            "heart_rate": 88
        })

        # Record vital on Encounter 2
        self.client.post("/api/v1/encounters/ENC-A200/observations", headers=headers, json={
            "heart_rate": 105
        })

        # Query Encounter 1 history
        res1 = self.client.get("/api/v1/encounters/ENC-A100/observations", headers=headers)
        hr_values_1 = [x["value"] for x in res1.json() if x["type"] == "heart_rate"]
        
        # Query Encounter 2 history
        res2 = self.client.get("/api/v1/encounters/ENC-A200/observations", headers=headers)
        hr_values_2 = [x["value"] for x in res2.json() if x["type"] == "heart_rate"]

        # Assert no leak
        self.assertIn(88.0, hr_values_1)
        self.assertNotIn(105.0, hr_values_1)
        self.assertIn(105.0, hr_values_2)
        self.assertNotIn(88.0, hr_values_2)

if __name__ == "__main__":
    unittest.main()
