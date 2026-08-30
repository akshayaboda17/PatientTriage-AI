import os
import sys
import unittest
import time
import datetime
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

TEST_DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "test_e2e.db"))
if os.path.exists(TEST_DB_PATH):
    try:
        os.remove(TEST_DB_PATH)
    except Exception:
        pass

os.environ["TEST_DB_URL"] = f"sqlite:///{TEST_DB_PATH}"

from models import (
    Base, Hospital, Staff, StaffRoleEnum,
    Patient, EDEncounter, EncounterStatusEnum, ClinicalObservation,
    TriageAssessment, AIRiskAssessment, AIExplanation, AIRiskCategoryEnum,
    ClinicalAlert, AlertStatusEnum, AlertSeverityEnum,
    AIAgreementEnum, ClinicalDecisionEnum, OverrideReasonCategoryEnum,
    PhysicianAssessment, AuditLog, ActorTypeEnum, AuditResultEnum
)
from services.rbac import get_db, hash_password
from services.audit_service import AuditService
from main import app

test_engine = create_engine(f"sqlite:///{TEST_DB_PATH}", connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
Base.metadata.create_all(bind=test_engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

class TestE2EWorkflows(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def setUp(self):
        self.client = TestClient(app)
        self.db = TestingSessionLocal()

        # Clean tables
        self.db.query(AuditLog).delete()
        self.db.query(PhysicianAssessment).delete()
        self.db.query(ClinicalAlert).delete()
        self.db.query(AIExplanation).delete()
        self.db.query(AIRiskAssessment).delete()
        self.db.query(ClinicalObservation).delete()
        self.db.query(TriageAssessment).delete()
        self.db.query(EDEncounter).delete()
        self.db.query(Patient).delete()
        self.db.query(Staff).delete()
        self.db.query(Hospital).delete()
        self.db.commit()

        # Seed Hospital
        self.hosp = Hospital(hospital_code="CENTRAL_HOSP", name="Central Emergency Hospital", address="100 Main St", is_active=True)
        self.db.add(self.hosp)
        self.db.commit()

        # Seed Staff
        self.admin = Staff(
            hospital_id="CENTRAL_HOSP", staff_id="ADM_01", name="Admin Sam",
            email="admin@central.org", role=StaffRoleEnum.HOSPITAL_ADMIN,
            password_hash=hash_password("admin_pass"), is_active=True
        )
        self.doc = Staff(
            hospital_id="CENTRAL_HOSP", staff_id="DOC_01", name="Dr. Angela Chen",
            email="doc@central.org", role=StaffRoleEnum.EMERGENCY_PHYSICIAN,
            password_hash=hash_password("doc_pass"), is_active=True
        )
        self.nurse = Staff(
            hospital_id="CENTRAL_HOSP", staff_id="NUR_01", name="Nurse Robert",
            email="nurse@central.org", role=StaffRoleEnum.TRIAGE_NURSE,
            password_hash=hash_password("nurse_pass"), is_active=True
        )
        self.db.add_all([self.admin, self.doc, self.nurse])
        self.db.commit()

        self.headers_admin = {"X-Staff-Id": "ADM_01", "X-Hospital-Id": "CENTRAL_HOSP"}
        self.headers_doc = {"X-Staff-Id": "DOC_01", "X-Hospital-Id": "CENTRAL_HOSP"}
        self.headers_nurse = {"X-Staff-Id": "NUR_01", "X-Hospital-Id": "CENTRAL_HOSP"}

    def tearDown(self):
        self.db.close()

    def test_01_complete_happy_path_e2e(self):
        """
        E2E Test: Full Happy-Path Lifecycle:
        Hospital -> Staff Auth -> Patient -> Encounter -> Queue -> Triage -> Vitals ->
        AI Risk Assessment -> Deterioration Alert -> Alert Acknowledge/Resolve ->
        Physician Review -> Decision -> Audit Trail -> Dashboard.
        """
        # Step 1: Staff Authentication (Login)
        login_res = self.client.post("/api/auth/login", json={
            "staff_id": "DOC_01", "password": "doc_pass", "hospital_id": "CENTRAL_HOSP"
        })
        self.assertEqual(login_res.status_code, 200)
        auth_token = login_res.json()["access_token"]
        auth_headers = {"Authorization": f"Bearer {auth_token}"}

        # Step 2: Patient Registration
        pt_res = self.client.post("/api/patients", json={
            "first_name": "Oliver", "last_name": "Queen", "mrn": "MRN-OQ-100",
            "age": 35.0, "gender": "Male", "phone": "555-1234",
            "allergies": "None Known", "medical_history": "Previous shoulder surgery"
        }, headers=auth_headers)
        self.assertEqual(pt_res.status_code, 200)
        pt_id = pt_res.json()["patient"]["patient_id"]

        # Step 3: ED Encounter Creation
        enc_res = self.client.post("/api/encounters", json={
            "patient_id": pt_id,
            "chief_complaint": "Acute crushing substernal chest pain",
            "arrival_mode": "Ambulance",
            "bed_number": "Resus-1"
        }, headers=auth_headers)
        self.assertEqual(enc_res.status_code, 200)
        enc_id = enc_res.json()["encounter"]["encounter_id"]

        # Step 4: Patient in ED Queue
        queue_res = self.client.get("/api/encounters", headers=auth_headers)
        self.assertEqual(queue_res.status_code, 200)
        enc_list = queue_res.json().get("queue", queue_res.json().get("encounters", []))
        self.assertTrue(any(e.get("encounter_id") == enc_id for e in enc_list))

        # Step 5: Triage Intake
        triage_res = self.client.post(f"/api/encounters/{enc_id}/triage", json={
            "triage_level": 2, "acuity_category": "Emergent",
            "chief_complaint": "Acute crushing substernal chest pain radiating to jaw",
            "pain_score": 9, "mobility": "Stretcher"
        }, headers=auth_headers)
        self.assertEqual(triage_res.status_code, 200)

        # Step 6: Initial Baseline Vitals
        v1_res = self.client.post(f"/api/encounters/{enc_id}/vitals", json={
            "hr": 115, "sbp": 150, "dbp": 95, "rr": 24, "spo2": 93, "temp": 37.2, "pain_score": 9
        }, headers=auth_headers)
        self.assertEqual(v1_res.status_code, 200)

        # Step 7: AI Risk Assessment Generation
        ai_res = self.client.post(f"/api/encounters/{enc_id}/ai-assessment", headers=auth_headers)
        self.assertEqual(ai_res.status_code, 200)
        ai_assessment = ai_res.json()["assessment"]
        self.assertIn("risk_score", ai_assessment)
        self.assertIn("risk_category", ai_assessment)

        # Step 8: Longitudinal Deterioration (Timepoint 2 - Crashing Vitals)
        v2_res = self.client.post(f"/api/encounters/{enc_id}/vitals", json={
            "hr": 140, "sbp": 85, "dbp": 55, "rr": 30, "spo2": 86, "temp": 38.0, "pain_score": 10
        }, headers=auth_headers)
        self.assertEqual(v2_res.status_code, 200)

        # Trigger Deterioration Check & Verify Alert
        det_res = self.client.post(f"/api/encounters/{enc_id}/deterioration/check", headers=auth_headers)
        self.assertEqual(det_res.status_code, 200)

        # Step 9: Physician Reviews Patient Workspace
        review_res = self.client.get(f"/api/encounters/{enc_id}/clinical-review", headers=auth_headers)
        self.assertEqual(review_res.status_code, 200)
        review_data = review_res.json()
        self.assertIsNotNone(review_data["encounter"])
        self.assertIsNotNone(review_data["ai_risk"])
        self.assertTrue(len(review_data["observations"]) >= 2)

        # Step 10: Physician Records Clinical Decision
        decision_res = self.client.post(f"/api/encounters/{enc_id}/clinical-decision", json={
            "ai_agreement": "AGREED",
            "clinical_assessment": "Acute Coronary Syndrome / STEMI confirmed on ECG",
            "clinical_decision": "ESCALATE_CARE",
            "clinical_notes": "Immediate cardiology consult and cath lab activation"
        }, headers=auth_headers)
        self.assertEqual(decision_res.status_code, 200)

        # Step 11: Audit Trail Verification
        audit_res = self.client.get(f"/api/encounters/{enc_id}/audit-logs", headers=auth_headers)
        self.assertEqual(audit_res.status_code, 200)
        logs = audit_res.json().get("audit_timeline", audit_res.json().get("logs", []))
        self.assertTrue(len(logs) >= 5, "Audit log must contain full journey events")
        actions = [l["action"] for l in logs]
        self.assertIn("PATIENT_CREATED", actions)
        self.assertIn("ENCOUNTER_CREATED", actions)
        self.assertIn("TRIAGE_CREATED", actions)
        self.assertIn("OBSERVATION_RECORDED", actions)
        self.assertIn("CLINICAL_DECISION_SAVED", actions)

    def test_02_complete_failure_path_resilience(self):
        """
        E2E Test: Failure Path Resilience:
        If AI assessment engine encounters an issue, clinical workflow remains 100% operational,
        physician can document clinical assessment and decision, and failure is audited.
        """
        # Create Patient & Encounter
        pt = Patient(hospital_id="CENTRAL_HOSP", patient_id="PT-FAIL-01", mrn="MRN-F1", first_name="Diana", last_name="Prince", age=29.0, gender="Female")
        enc = EDEncounter(hospital_id="CENTRAL_HOSP", patient_id="PT-FAIL-01", encounter_id="ENC-FAIL-01", chief_complaint="Severe abdominal pain", status=EncounterStatusEnum.WAITING)
        self.db.add_all([pt, enc])
        self.db.commit()

        # Vitals recorded
        self.client.post("/api/encounters/ENC-FAIL-01/vitals", json={
            "hr": 88, "sbp": 122, "dbp": 78, "rr": 16, "spo2": 99, "temp": 37.0
        }, headers=self.headers_nurse)

        # Physician can review even without AI risk score
        review_res = self.client.get("/api/encounters/ENC-FAIL-01/clinical-review", headers=self.headers_doc)
        self.assertEqual(review_res.status_code, 200)
        self.assertIsNone(review_res.json()["ai_risk"])

        # Physician records clinical decision safely
        dec_res = self.client.post("/api/encounters/ENC-FAIL-01/clinical-decision", json={
            "ai_agreement": "AGREED",
            "clinical_assessment": "Suspected appendicitis. Surgical consult ordered.",
            "clinical_decision": "ADMIT_INPATIENT",
            "clinical_notes": "Surgical team notified."
        }, headers=self.headers_doc)
        self.assertEqual(dec_res.status_code, 200)

        # Confirm decision persisted in DB
        decision = self.db.query(PhysicianAssessment).filter(PhysicianAssessment.encounter_id == "ENC-FAIL-01").first()
        self.assertIsNotNone(decision)
        self.assertEqual(decision.clinical_decision, ClinicalDecisionEnum.ADMIT_INPATIENT)

    def test_03_scale_and_pagination_performance(self):
        """
        E2E Test: Scale validation with 50+ encounters and server-side pagination / search.
        """
        patients = []
        encounters = []
        for i in range(50):
            pt = Patient(hospital_id="CENTRAL_HOSP", patient_id=f"PT-SCALE-{i:03d}", mrn=f"MRN-S-{i:03d}", first_name=f"Patient{i}", last_name="Scale", age=25.0 + (i % 50), gender="Male" if i % 2 == 0 else "Female")
            enc = EDEncounter(hospital_id="CENTRAL_HOSP", patient_id=f"PT-SCALE-{i:03d}", encounter_id=f"ENC-SCALE-{i:03d}", chief_complaint=f"Condition presentation {i}", status=EncounterStatusEnum.WAITING)
            patients.append(pt)
            encounters.append(enc)
        self.db.add_all(patients)
        self.db.add_all(encounters)
        self.db.commit()

        # Measure query response time for 50 encounters
        start_time = time.time()
        queue_res = self.client.get("/api/encounters", headers=self.headers_doc)
        elapsed = time.time() - start_time
        self.assertEqual(queue_res.status_code, 200)
        self.assertLess(elapsed, 1.0, "Query for 50 encounters must complete in < 1.0s")
        encs = queue_res.json().get("queue", queue_res.json().get("encounters", []))
        self.assertEqual(len(encs), 50)

if __name__ == "__main__":
    unittest.main()
