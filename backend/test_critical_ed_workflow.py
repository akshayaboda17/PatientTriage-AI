import os
import unittest
import datetime
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

TEST_DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "test_ed_workflow.db"))
if os.path.exists(TEST_DB_PATH):
    try:
        os.remove(TEST_DB_PATH)
    except Exception:
        pass

os.environ["TEST_DB_URL"] = f"sqlite:///{TEST_DB_PATH}"

from models import (
    Base, Hospital, Staff, StaffRoleEnum,
    Patient, EDEncounter, EncounterStatusEnum, ClinicalObservation,
    TriageAssessment, AIRiskAssessment, ClinicalAlert, AlertStatusEnum,
    PhysicianAssessment, AIAgreementEnum, ClinicalDecisionEnum, AuditLog
)
from services.rbac import get_db, hash_password
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


class TestCriticalEDWorkflow(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
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

        # Clean tables
        self.db.query(AuditLog).delete()
        self.db.query(PhysicianAssessment).delete()
        self.db.query(ClinicalAlert).delete()
        self.db.query(AIRiskAssessment).delete()
        self.db.query(ClinicalObservation).delete()
        self.db.query(TriageAssessment).delete()
        self.db.query(EDEncounter).delete()
        self.db.query(Patient).delete()
        self.db.query(Staff).delete()
        self.db.query(Hospital).delete()
        self.db.commit()

        # Seed Hospital
        self.hosp = Hospital(hospital_code="METRO_ED", name="Metropolitan ED", is_active=True)
        self.db.add(self.hosp)
        self.db.commit()

        # Seed Staff
        self.doc = Staff(
            hospital_id="METRO_ED", staff_id="DOC_01", name="Dr. Meredith Grey",
            email="doc@metro.org", role=StaffRoleEnum.EMERGENCY_PHYSICIAN,
            password_hash=hash_password("doc_pass"), is_active=True
        )
        self.nurse = Staff(
            hospital_id="METRO_ED", staff_id="NUR_01", name="Nurse Clara",
            email="nurse@metro.org", role=StaffRoleEnum.TRIAGE_NURSE,
            password_hash=hash_password("nurse_pass"), is_active=True
        )
        self.db.add_all([self.doc, self.nurse])
        self.db.commit()

        self.headers_doc = {"X-Staff-Id": "DOC_01", "X-Hospital-Id": "METRO_ED"}
        self.headers_nurse = {"X-Staff-Id": "NUR_01", "X-Hospital-Id": "METRO_ED"}

    def tearDown(self):
        self.db.close()

    def test_complete_ed_patient_journey(self):
        """
        Comprehensive test of the full clinical lifecycle:
        1. Register new patient
        2. Intake & Arrival Bedside Vitals (T0)
        3. Initial Triage recorded -> Patient in active queue
        4. No bed available -> Remains in active queue with status WAITING and bed_number=None
        5. Time elapses -> Safe wait threshold exceeded (REASSESSMENT REQUIRED)
        6. Reassessment recorded with updated priority
        7. Care space becomes available -> Assign bed -> Status becomes IN_TREATMENT
        8. Physician reviews and signs clinical decision
        9. Patient is discharged -> Bed is released, status becomes DISCHARGED
        10. Active queue excludes discharged patient
        11. Historical encounter remains preserved in database
        """
        # Step 1: Register new patient
        pat_payload = {
            "first_name": "Arthur",
            "last_name": "Dent",
            "age": 48.0,
            "gender": "Male",
            "mrn": "MRN-ART-01"
        }
        res_pat = self.client.post("/api/patients", headers=self.headers_nurse, json=pat_payload)
        self.assertEqual(res_pat.status_code, 200)
        patient_id = res_pat.json()["patient"]["patient_id"]

        # Step 2: Create Encounter (No bed assigned initially)
        enc_payload = {
            "patient_id": patient_id,
            "chief_complaint": "Acute substernal chest discomfort and diaphoresis",
            "arrival_mode": "Ambulance",
            "bed_number": None  # No bed available yet
        }
        res_enc = self.client.post("/api/encounters", headers=self.headers_nurse, json=enc_payload)
        self.assertEqual(res_enc.status_code, 200)
        encounter_id = res_enc.json()["encounter"]["encounter_id"]

        # Step 3: Record T0 Vitals & Triage
        vitals_payload = {
            "hr": 102,
            "sbp": 138,
            "dbp": 88,
            "rr": 20,
            "spo2": 95,
            "temp": 37.1,
            "pain_score": 7
        }
        res_vit = self.client.post(f"/api/encounters/{encounter_id}/vitals", headers=self.headers_nurse, json=vitals_payload)
        self.assertEqual(res_vit.status_code, 200)

        triage_payload = {
            "triage_level": 2,
            "acuity_category": "Emergent",
            "chief_complaint": "Acute chest discomfort",
            "pain_score": 7
        }
        res_tri = self.client.post(f"/api/encounters/{encounter_id}/triage", headers=self.headers_nurse, json=triage_payload)
        self.assertEqual(res_tri.status_code, 200)

        # Step 4: Verify Patient is in Active Queue with status WAITING / unbedded
        res_queue = self.client.get("/api/encounters", headers=self.headers_nurse)
        self.assertEqual(res_queue.status_code, 200)
        queue = res_queue.json()["queue"]
        queued_patient = next((p for p in queue if p["encounter_id"] == encounter_id), None)
        self.assertIsNotNone(queued_patient, "Patient must be present in active queue")
        self.assertIsNone(queued_patient["bed_number"], "No fake bed should be assigned")

        # Step 5: Priority Reassessment
        reassess_payload = {
            "new_triage_level": 2,
            "acuity_category": "Emergent",
            "reassessment_reason": "Persistent pain, reassessment completed while awaiting care space",
            "vitals_delta_summary": "Vitals stable, SpO2 95%"
        }
        res_reassess = self.client.post(f"/api/encounters/{encounter_id}/reassess-priority", headers=self.headers_nurse, json=reassess_payload)
        self.assertEqual(res_reassess.status_code, 200)

        # Step 6: Care space becomes available -> Assign Bed
        bed_payload = {
            "status": "IN_TREATMENT",
            "bed_number": "BAY-04"
        }
        res_bed = self.client.put(f"/api/encounters/{encounter_id}/status", headers=self.headers_nurse, json=bed_payload)
        self.assertEqual(res_bed.status_code, 200)
        self.assertEqual(res_bed.json()["encounter"]["bed_number"], "BAY-04")
        self.assertEqual(res_bed.json()["encounter"]["status"], "IN_TREATMENT")

        # Step 7: Physician Reviews and Signs Clinical Decision
        review_payload = {
            "ai_agreement": "AGREED",
            "clinician_assigned_risk": "HIGH",
            "clinical_assessment": "ECG shows sinus tachycardia without acute STEMI. Trop negative.",
            "clinical_decision": "DISCHARGE_HOME",
            "clinical_notes": "Symptom resolution following antacid & analgesia. Outpatient cardiology referral."
        }
        res_rev = self.client.post(f"/api/encounters/{encounter_id}/physician-review", headers=self.headers_doc, json=review_payload)
        self.assertEqual(res_rev.status_code, 200)

        # Step 8: Discharge Patient from ED
        discharge_payload = {
            "destination": "Home",
            "disposition_notes": "Discharged home in stable condition with outpatient follow-up instructions."
        }
        res_disch = self.client.post(f"/api/encounters/{encounter_id}/discharge", headers=self.headers_nurse, json=discharge_payload)
        self.assertEqual(res_disch.status_code, 200)

        # Step 9: Verify Active Queue NO LONGER includes discharged patient
        res_queue_after = self.client.get("/api/encounters", headers=self.headers_nurse)
        self.assertEqual(res_queue_after.status_code, 200)
        active_ids = [p["encounter_id"] for p in res_queue_after.json()["queue"]]
        self.assertNotIn(encounter_id, active_ids, "Discharged patient must not appear in active queue")

        # Step 10: Verify Patient and Encounter are STILL preserved in database
        db_enc = self.db.query(EDEncounter).filter_by(encounter_id=encounter_id).first()
        self.assertIsNotNone(db_enc, "Encounter record must be preserved in DB")
        self.assertEqual(db_enc.status, EncounterStatusEnum.DISCHARGED)
        self.assertIsNone(db_enc.bed_number, "Bed must be released on discharge")

        # Step 11: Verify Historical Encounters Query returns the discharged patient
        res_hist = self.client.get("/api/encounters?status_filter=DISCHARGED", headers=self.headers_nurse)
        self.assertEqual(res_hist.status_code, 200)
        hist_ids = [p["encounter_id"] for p in res_hist.json()["queue"]]
        self.assertIn(encounter_id, hist_ids, "Discharged patient must be queryable in historical records")

        # Step 12: Verify PATIENT_DISCHARGED audit log exists
        audit_rec = self.db.query(AuditLog).filter_by(action="PATIENT_DISCHARGED", encounter_id=encounter_id).first()
        self.assertIsNotNone(audit_rec, "PATIENT_DISCHARGED audit log must exist")
        self.assertEqual(audit_rec.metadata_json["destination"], "Home")


if __name__ == "__main__":
    unittest.main()
