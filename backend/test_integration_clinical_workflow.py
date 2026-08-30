import os
import sys
import unittest
import datetime
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Setup test db
TEST_DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "test_integration.db"))
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

class TestIntegrationClinicalWorkflow(unittest.TestCase):
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
        self.hosp = Hospital(hospital_code="METRO_ED", name="Metropolitan ED", address="500 Healthcare Blvd", is_active=True)
        self.db.add(self.hosp)
        self.db.commit()

        # Seed Staff
        self.admin = Staff(
            hospital_id="METRO_ED", staff_id="ADMIN_01", name="Admin Alex",
            email="admin@metro.org", role=StaffRoleEnum.HOSPITAL_ADMIN,
            password_hash=hash_password("admin_pass"), is_active=True
        )
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
        self.db.add_all([self.admin, self.doc, self.nurse])
        self.db.commit()

        # Headers
        self.headers_admin = {"X-Staff-Id": "ADMIN_01", "X-Hospital-Id": "METRO_ED"}
        self.headers_doc = {"X-Staff-Id": "DOC_01", "X-Hospital-Id": "METRO_ED"}
        self.headers_nurse = {"X-Staff-Id": "NUR_01", "X-Hospital-Id": "METRO_ED"}

    def tearDown(self):
        self.db.close()

    def test_01_patient_registration_and_demographics(self):
        """Integration Test: Register new patient with full clinical demographics and verify audit trail."""
        payload = {
            "first_name": "Eleanor",
            "last_name": "Vance",
            "mrn": "MRN-EV-9021",
            "age": 34.0,
            "gender": "Female",
            "phone": "555-0199",
            "allergies": "Penicillin, Latex",
            "medical_history": "Asthma, Type 2 Diabetes"
        }
        res = self.client.post("/api/patients", json=payload, headers=self.headers_nurse)
        self.assertEqual(res.status_code, 200)
        pt = res.json()["patient"]
        self.assertEqual(pt["first_name"], "Eleanor")
        self.assertEqual(pt["mrn"], "MRN-EV-9021")
        self.assertEqual(pt["hospital_id"], "METRO_ED")

        # Verify audit event
        audit = self.db.query(AuditLog).filter(AuditLog.action == "PATIENT_CREATED").first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.staff_id, "NUR_01")
        self.assertEqual(audit.patient_id, pt["patient_id"])

    def test_02_encounter_creation_and_state_transitions(self):
        """Integration Test: Create encounter and cycle through clinical state transitions."""
        # Create Patient
        pt_res = self.client.post("/api/patients", json={
            "first_name": "Marcus", "last_name": "Brody", "mrn": "MRN-MB-11",
            "age": 58.0, "gender": "Male"
        }, headers=self.headers_nurse)
        pt_id = pt_res.json()["patient"]["patient_id"]

        # Create Encounter
        enc_res = self.client.post("/api/encounters", json={
            "patient_id": pt_id,
            "chief_complaint": "Acute epigastric pain and dizziness",
            "arrival_mode": "Ambulance",
            "bed_number": "Bay-04"
        }, headers=self.headers_nurse)
        self.assertEqual(enc_res.status_code, 200)
        enc_id = enc_res.json()["encounter"]["encounter_id"]
        self.assertEqual(enc_res.json()["encounter"]["status"], "WAITING")

        # State Transition: WAITING -> IN_TRIAGE
        res_triage_state = self.client.put(f"/api/encounters/{enc_id}/status", json={
            "status": "IN_TRIAGE", "bed_number": "Triage-1"
        }, headers=self.headers_nurse)
        self.assertEqual(res_triage_state.status_code, 200)
        self.assertEqual(res_triage_state.json()["encounter"]["status"], "IN_TRIAGE")

        # State Transition: IN_TRIAGE -> IN_TREATMENT
        res_treat_state = self.client.put(f"/api/encounters/{enc_id}/status", json={
            "status": "IN_TREATMENT", "bed_number": "ED-Bed-12"
        }, headers=self.headers_doc)
        self.assertEqual(res_treat_state.status_code, 200)
        self.assertEqual(res_treat_state.json()["encounter"]["status"], "IN_TREATMENT")

    def test_03_triage_and_longitudinal_vitals(self):
        """Integration Test: Record initial triage assessment and longitudinal observation timepoints."""
        # Setup Patient and Encounter
        pt = Patient(hospital_id="METRO_ED", patient_id="PT-INT-01", mrn="MRN-01", first_name="John", last_name="Watson", age=45.0, gender="Male")
        enc = EDEncounter(hospital_id="METRO_ED", patient_id="PT-INT-01", encounter_id="ENC-INT-01", chief_complaint="Chest tightness", status=EncounterStatusEnum.WAITING)
        self.db.add_all([pt, enc])
        self.db.commit()

        # Submit Triage
        triage_res = self.client.post("/api/encounters/ENC-INT-01/triage", json={
            "triage_level": 2,
            "acuity_category": "Emergent",
            "chief_complaint": "Chest tightness radiating to neck",
            "pain_score": 7,
            "mobility": "Wheelchair"
        }, headers=self.headers_nurse)
        self.assertEqual(triage_res.status_code, 200)

        # Record Timepoint 1: Baseline Vitals
        v1_res = self.client.post("/api/encounters/ENC-INT-01/vitals", json={
            "hr": 88, "sbp": 135, "dbp": 85, "rr": 18, "spo2": 96, "temp": 37.1, "pain_score": 7
        }, headers=self.headers_nurse)
        self.assertEqual(v1_res.status_code, 200)

        # Record Timepoint 2: Follow-up Vitals
        v2_res = self.client.post("/api/encounters/ENC-INT-01/vitals", json={
            "hr": 92, "sbp": 130, "dbp": 82, "rr": 19, "spo2": 95, "temp": 37.2, "pain_score": 6
        }, headers=self.headers_nurse)
        self.assertEqual(v2_res.status_code, 200)

        # Query Encounter Details to confirm both timepoints preserved chronologically
        enc_get = self.client.get("/api/encounters/ENC-INT-01", headers=self.headers_doc)
        self.assertEqual(enc_get.status_code, 200)
        obs_list = enc_get.json()["observations"]
        self.assertEqual(len(obs_list), 2)
        self.assertEqual(obs_list[0]["hr"], 88)
        self.assertEqual(obs_list[1]["hr"], 92)

    def test_04_observation_correction_audit_trail(self):
        """Integration Test: Correct an erroneous vital sign observation with full audit accountability."""
        pt = Patient(hospital_id="METRO_ED", patient_id="PT-INT-02", mrn="MRN-02", first_name="Sarah", last_name="Connor", age=33.0, gender="Female")
        enc = EDEncounter(hospital_id="METRO_ED", patient_id="PT-INT-02", encounter_id="ENC-INT-02", chief_complaint="Fever and chills", status=EncounterStatusEnum.WAITING)
        obs = ClinicalObservation(
            hospital_id="METRO_ED", patient_id="PT-INT-02", encounter_id="ENC-INT-02",
            hr=180, sbp=120, dbp=80, rr=16, spo2=98, temp=38.9, recorded_by="NUR_01"
        )
        self.db.add_all([pt, enc, obs])
        self.db.commit()

        # Correct HR from 180 to 80 (typographical error correction)
        corr_res = self.client.put(f"/api/encounters/ENC-INT-02/observations/{obs.id}", json={
            "hr": 80,
            "correction_reason": "Typographical transcription error corrected from 180 to 80 bpm"
        }, headers=self.headers_nurse)
        self.assertEqual(corr_res.status_code, 200)

        # Verify updated record preserves correction flag and reason
        self.db.expire_all()
        updated_obs = self.db.query(ClinicalObservation).filter(ClinicalObservation.id == obs.id).first()
        self.assertEqual(updated_obs.hr, 80)
        self.assertTrue(updated_obs.is_corrected)
        self.assertEqual(updated_obs.corrected_by, "NUR_01")
        self.assertIn("180", updated_obs.correction_reason)

        # Verify audit log recorded
        audit = self.db.query(AuditLog).filter(AuditLog.action == "OBSERVATION_CORRECTED").first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.staff_id, "NUR_01")

    def test_05_physician_review_and_ai_override_lifecycle(self):
        """Integration Test: Physician reviews patient, overrides AI risk level, and saves clinical disposition."""
        pt = Patient(hospital_id="METRO_ED", patient_id="PT-INT-03", mrn="MRN-03", first_name="Bruce", last_name="Wayne", age=40.0, gender="Male")
        enc = EDEncounter(hospital_id="METRO_ED", patient_id="PT-INT-03", encounter_id="ENC-INT-03", chief_complaint="Blunt thoracic trauma", status=EncounterStatusEnum.WAITING)
        obs = ClinicalObservation(
            hospital_id="METRO_ED", patient_id="PT-INT-03", encounter_id="ENC-INT-03",
            hr=105, sbp=110, dbp=70, rr=22, spo2=95, temp=37.0, recorded_by="NUR_01"
        )
        ai_risk = AIRiskAssessment(
            assessment_id="AI-METR-001", hospital_id="METRO_ED", patient_id="PT-INT-03", encounter_id="ENC-INT-03",
            risk_score=0.72, risk_category=AIRiskCategoryEnum.HIGH, predicted_triage_level=2, confidence_score=0.72
        )
        self.db.add_all([pt, enc, obs, ai_risk])
        self.db.commit()

        # Step 1: Physician loads consolidated Clinical Review Workspace
        review_res = self.client.get("/api/encounters/ENC-INT-03/clinical-review", headers=self.headers_doc)
        self.assertEqual(review_res.status_code, 200)
        data = review_res.json()
        self.assertIsNotNone(data["encounter"])
        self.assertIsNotNone(data["ai_risk"])

        # Step 2: Physician overrides AI from HIGH to CRITICAL with clinical findings
        override_payload = {
            "ai_agreement": "OVERRIDDEN",
            "clinician_assigned_risk": "CRITICAL",
            "override_reason": "Physical examination reveals tension pneumothorax requiring immediate decompression",
            "clinical_assessment": "Severe visual distress with tracheal deviation and absent breath sounds on right",
            "clinical_decision": "ESCALATE_CARE",
            "clinical_notes": "Immediate needle thoracostomy performed"
        }
        decision_res = self.client.post("/api/encounters/ENC-INT-03/clinical-decision", json=override_payload, headers=self.headers_doc)
        self.assertEqual(decision_res.status_code, 200)

        # Step 3: Verify Original AI Risk is NOT overwritten, but Physician Assessment is preserved
        original_ai = self.db.query(AIRiskAssessment).filter(AIRiskAssessment.encounter_id == "ENC-INT-03").first()
        self.assertEqual(original_ai.risk_category, AIRiskCategoryEnum.HIGH)
        self.assertEqual(original_ai.predicted_triage_level, 2)

        phys_rec = self.db.query(PhysicianAssessment).filter(PhysicianAssessment.encounter_id == "ENC-INT-03").first()
        self.assertIsNotNone(phys_rec)
        self.assertEqual(phys_rec.ai_agreement, AIAgreementEnum.OVERRIDDEN)
        self.assertEqual(phys_rec.clinician_assigned_risk, "CRITICAL")
        self.assertEqual(phys_rec.clinical_decision, ClinicalDecisionEnum.ESCALATE_CARE)

        # Step 4: Verify audit events recorded
        ai_override_audit = self.db.query(AuditLog).filter(AuditLog.action == "AI_OVERRIDDEN").first()
        self.assertIsNotNone(ai_override_audit)
        self.assertEqual(ai_override_audit.staff_id, "DOC_01")

    def test_06_dashboard_and_analytics_queries(self):
        """Integration Test: Verify ED dashboard and analytics calculate accurate counts and distributions."""
        # Seed 3 Encounters in different statuses
        pt1 = Patient(hospital_id="METRO_ED", patient_id="PT-D1", mrn="MRN-D1", first_name="A", last_name="A", age=20.0, gender="Male")
        pt2 = Patient(hospital_id="METRO_ED", patient_id="PT-D2", mrn="MRN-D2", first_name="B", last_name="B", age=30.0, gender="Female")
        pt3 = Patient(hospital_id="METRO_ED", patient_id="PT-D3", mrn="MRN-D3", first_name="C", last_name="C", age=40.0, gender="Male")
        enc1 = EDEncounter(hospital_id="METRO_ED", patient_id="PT-D1", encounter_id="ENC-D1", chief_complaint="Fever", status=EncounterStatusEnum.WAITING)
        enc2 = EDEncounter(hospital_id="METRO_ED", patient_id="PT-D2", encounter_id="ENC-D2", chief_complaint="Cough", status=EncounterStatusEnum.IN_TRIAGE)
        enc3 = EDEncounter(hospital_id="METRO_ED", patient_id="PT-D3", encounter_id="ENC-D3", chief_complaint="Trauma", status=EncounterStatusEnum.IN_TREATMENT)
        self.db.add_all([pt1, pt2, pt3, enc1, enc2, enc3])
        self.db.commit()

        # Query ED Queue
        queue_res = self.client.get("/api/encounters", headers=self.headers_doc)
        self.assertEqual(queue_res.status_code, 200)
        queue_data = queue_res.json().get("queue", queue_res.json().get("encounters", []))
        self.assertEqual(len(queue_data), 3)

        # Query Audit Log endpoint
        audit_res = self.client.get("/api/audit-logs", headers=self.headers_admin)
        self.assertEqual(audit_res.status_code, 200)
        self.assertIn("logs", audit_res.json())
        self.assertIn("total", audit_res.json())

if __name__ == "__main__":
    unittest.main()
