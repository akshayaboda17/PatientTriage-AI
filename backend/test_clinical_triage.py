import unittest
import os
import sys
import datetime
from fastapi.testclient import TestClient

# Add workspace path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from backend.main import app, get_db
from backend.models import (
    Base, engine, SessionLocal, Hospital, Staff, Role, Permission, Patient, Encounter, VitalSigns, TriageAssessment, AuditLog, seed_database
)

class TestClinicalTriage(unittest.TestCase):
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

        # Custom seeding for isolation checks
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
        doc_a = Staff(
            staff_id="DOC_A",
            hospital_id="HOSP_A",
            full_name="Doctor Alpha",
            employee_id="EMP-D01",
            official_email="doc_a@hospitalalpha.com",
            phone_number="555-0002",
            department="Emergency",
            designation="Physician",
            role_id="EMERGENCY_PHYSICIAN",
            password_hash=get_hash("DocAlpha1!"),
            status="ACTIVE"
        )
        tech_a = Staff(
            staff_id="TECH_A",
            hospital_id="HOSP_A",
            full_name="Tech Alpha",
            employee_id="EMP-T01",
            official_email="tech_a@hospitalalpha.com",
            phone_number="555-0003",
            department="Emergency",
            designation="Technician",
            role_id="EMERGENCY_TECHNICIAN",
            password_hash=get_hash("TechAlpha1!"),
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
        self.db.add(doc_a)
        self.db.add(tech_a)
        self.db.add(nurse_b)
        self.db.commit()

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

        enc_a = Encounter(
            encounter_id="ENC-A100",
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
        self.db.add(enc_a)
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

    def test_01_create_triage_draft_and_completed(self):
        token = self.get_token("nurse_a@hospitalalpha.com", "NurseAlpha1!", "HOSP_A")
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Create Draft Triage Assessment
        res = self.client.post("/api/v1/encounters/ENC-A100/triage", headers=headers, json={
            "presenting_complaint": "Acute lower back pain",
            "symptom_onset": "Gradual",
            "symptom_severity": 4,
            "associated_symptoms": "Numbness in toes",
            "medical_history": "Osteoarthritis",
            "medications": "Ibuprofen 400mg PRN",
            "allergies": "No known allergies",
            "triage_notes": "Patient conscious and alert",
            "clinical_priority": "MEDIUM",
            "status": "DRAFT"
        })
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["status"], "DRAFT")

        # Verify Encounter status updated to TRIAGE_IN_PROGRESS
        enc = self.db.query(Encounter).filter_by(encounter_id="ENC-A100").first()
        self.assertEqual(enc.status, "TRIAGE_IN_PROGRESS")

        # 2. Complete Triage Assessment (required fields present)
        res = self.client.patch("/api/v1/encounters/ENC-A100/triage", headers=headers, json={
            "status": "COMPLETED"
        })
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["status"], "COMPLETED")

        # Verify Encounter status updated to TRIAGED
        self.db.refresh(enc)
        self.assertEqual(enc.status, "TRIAGED")

    def test_02_unauthorized_triage_creation(self):
        token = self.get_token("tech_a@hospitalalpha.com", "TechAlpha1!", "HOSP_A")
        headers = {"Authorization": f"Bearer {token}"}

        # Technician attempts to start triage -> should get 403
        res = self.client.post("/api/v1/encounters/ENC-A100/triage", headers=headers, json={
            "presenting_complaint": "Sprained wrist",
            "status": "DRAFT"
        })
        self.assertEqual(res.status_code, 403)

    def test_03_cross_hospital_isolation(self):
        # Nurse A (Hospital A) tries to access or triage Hospital B encounter (ENC-B200)
        token = self.get_token("nurse_a@hospitalalpha.com", "NurseAlpha1!", "HOSP_A")
        headers = {"Authorization": f"Bearer {token}"}

        # Try to view Hospital B triage
        res = self.client.get("/api/v1/encounters/ENC-B200/triage", headers=headers)
        self.assertEqual(res.status_code, 404)

        # Try to create triage for Hospital B encounter
        res = self.client.post("/api/v1/encounters/ENC-B200/triage", headers=headers, json={
            "presenting_complaint": "Chest discomfort",
            "status": "DRAFT"
        })
        self.assertEqual(res.status_code, 404)

    def test_04_vital_creation_and_latest(self):
        token = self.get_token("nurse_a@hospitalalpha.com", "NurseAlpha1!", "HOSP_A")
        headers = {"Authorization": f"Bearer {token}"}

        # Record first vitals
        res = self.client.post("/api/v1/encounters/ENC-A100/vitals", headers=headers, json={
            "heart_rate": 85,
            "respiratory_rate": 18,
            "systolic_bp": 120,
            "diastolic_bp": 80,
            "spo2": 98,
            "temperature": 36.8,
            "oxygen_support": "None",
            "weight": 70.0,
            "height": 175.0
        })
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["heart_rate"], 85)
        self.assertEqual(res.json()["recorded_by"], "NUR_A")

        # Record second vitals
        res2 = self.client.post("/api/v1/encounters/ENC-A100/vitals", headers=headers, json={
            "heart_rate": 95,
            "respiratory_rate": 20,
            "systolic_bp": 125,
            "diastolic_bp": 85,
            "spo2": 97,
            "temperature": 37.1,
            "oxygen_support": "None"
        })
        self.assertEqual(res2.status_code, 200)

        # Fetch latest vitals -> should be the second one (HR 95)
        res_latest = self.client.get("/api/v1/encounters/ENC-A100/vitals/latest", headers=headers)
        self.assertEqual(res_latest.status_code, 200)
        self.assertEqual(res_latest.json()["heart_rate"], 95)

        # Fetch history -> should contain both records
        res_hist = self.client.get("/api/v1/encounters/ENC-A100/vitals", headers=headers)
        self.assertEqual(res_hist.status_code, 200)
        self.assertEqual(len(res_hist.json()), 2)

    def test_05_invalid_vitals_input(self):
        token = self.get_token("nurse_a@hospitalalpha.com", "NurseAlpha1!", "HOSP_A")
        headers = {"Authorization": f"Bearer {token}"}

        # Try setting SpO2 to out-of-bounds percentage -> must fail 400
        res = self.client.post("/api/v1/encounters/ENC-A100/vitals", headers=headers, json={
            "spo2": 150
        })
        self.assertEqual(res.status_code, 400)

        # Try setting temperature out of numeric range -> must fail 400
        res2 = self.client.post("/api/v1/encounters/ENC-A100/vitals", headers=headers, json={
            "temperature": 12.0
        })
        self.assertEqual(res2.status_code, 400)

    def test_06_extreme_but_valid_clinical_vital(self):
        token = self.get_token("nurse_a@hospitalalpha.com", "NurseAlpha1!", "HOSP_A")
        headers = {"Authorization": f"Bearer {token}"}

        # Record extreme abnormal SpO2 of 45% -> should be accepted (45% is valid percentage)
        res = self.client.post("/api/v1/encounters/ENC-A100/vitals", headers=headers, json={
            "spo2": 45
        })
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["spo2"], 45)

    def test_07_vitals_corrections_and_audits(self):
        token = self.get_token("nurse_a@hospitalalpha.com", "NurseAlpha1!", "HOSP_A")
        headers = {"Authorization": f"Bearer {token}"}

        # Create vitals entry
        v_res = self.client.post("/api/v1/encounters/ENC-A100/vitals", headers=headers, json={
            "heart_rate": 180
        })
        vital_id = v_res.json()["vital_id"]

        # Update/Correct vitals
        res = self.client.patch(f"/api/v1/vitals/{vital_id}", headers=headers, json={
            "heart_rate": 108,
            "correction_reason": "Typo, entered HR 180 instead of 108"
        })
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["heart_rate"], 108)
        self.assertTrue(res.json()["is_corrected"])

        # Verify audit log exists
        audits = self.db.query(AuditLog).filter(AuditLog.hospital_id == "HOSP_A").all()
        correction_logged = any(
            log.action == f"Corrected vital signs {vital_id}" and "Typo" in log.details
            for log in audits
        )
        self.assertTrue(correction_logged)

    def test_08_invalid_status_transitions(self):
        token = self.get_token("nurse_a@hospitalalpha.com", "NurseAlpha1!", "HOSP_A")
        headers = {"Authorization": f"Bearer {token}"}

        # Attempt to complete triage with missing Presenting Complaint -> must fail 400
        res = self.client.post("/api/v1/encounters/ENC-A100/triage", headers=headers, json={
            "presenting_complaint": "",
            "status": "COMPLETED",
            "clinical_priority": "MEDIUM"
        })
        self.assertEqual(res.status_code, 400)

    def test_09_deactivated_staff(self):
        # Deactivate Nurse A in database
        nur = self.db.query(Staff).filter_by(staff_id="NUR_A").first()
        nur.status = "DEACTIVATED"
        self.db.commit()

        # Attempt to get login token as Nurse A -> should fail due to account status
        res = self.client.post("/api/v1/auth/login", json={
            "hospital_id": "HOSP_A",
            "username": "nurse_a@hospitalalpha.com",
            "password": "NurseAlpha1!"
        })
        self.assertEqual(res.status_code, 403)

    def test_10_role_permissions(self):
        # 1. Physician cannot create triage but can view
        token_doc = self.get_token("doc_a@hospitalalpha.com", "DocAlpha1!", "HOSP_A")
        headers_doc = {"Authorization": f"Bearer {token_doc}"}

        res = self.client.post("/api/v1/encounters/ENC-A100/triage", headers=headers_doc, json={
            "presenting_complaint": "Flu symptoms",
            "status": "DRAFT"
        })
        self.assertEqual(res.status_code, 403)

        # But physician can view vitals
        res_view = self.client.get("/api/v1/encounters/ENC-A100/vitals", headers=headers_doc)
        self.assertEqual(res_view.status_code, 200)

if __name__ == "__main__":
    unittest.main()
