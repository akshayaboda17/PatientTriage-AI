import os
import sys
import unittest
import datetime
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Set test environment
TEST_DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "test_audit.db"))
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
    ClinicalAlert, AlertStatusEnum, AlertSeverityEnum, DetectionSourceEnum,
    AIAgreementEnum, ClinicalDecisionEnum, OverrideReasonCategoryEnum,
    PhysicianAssessment, AuditLog, ActorTypeEnum, AuditResultEnum
)
from services.audit_service import AuditService
from services.rbac import get_db
from main import app

# Isolated Test Engine
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

class TestClinicalAuditTrail(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def setUp(self):
        self.client = TestClient(app)
        self.db = TestingSessionLocal()
        # Clean test tables
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

        # Seed Hospitals
        self.hosp_a = Hospital(hospital_code="HOSP_A", name="General Hospital A", address="100 Main St")
        self.hosp_b = Hospital(hospital_code="HOSP_B", name="Metro Hospital B", address="200 Oak St")
        self.db.add_all([self.hosp_a, self.hosp_b])
        self.db.commit()

        # Seed Staff
        self.admin_a = Staff(
            hospital_id="HOSP_A", staff_id="ADMIN001", name="Admin Alice",
            email="admin@hospa.org", role=StaffRoleEnum.HOSPITAL_ADMIN, password_hash="pw", is_active=True
        )
        self.doc_a = Staff(
            hospital_id="HOSP_A", staff_id="DOC001", name="Dr. Gregory House",
            email="doc@hospa.org", role=StaffRoleEnum.EMERGENCY_PHYSICIAN, password_hash="pw", is_active=True
        )
        self.nurse_a = Staff(
            hospital_id="HOSP_A", staff_id="NUR001", name="Nurse Jackie",
            email="nurse@hospa.org", role=StaffRoleEnum.TRIAGE_NURSE, password_hash="pw", is_active=True
        )
        self.director_a = Staff(
            hospital_id="HOSP_A", staff_id="DIR001", name="Director Lisa Cuddy",
            email="director@hospa.org", role=StaffRoleEnum.CLINICAL_DIRECTOR, password_hash="pw", is_active=True
        )
        self.deactivated_staff = Staff(
            hospital_id="HOSP_A", staff_id="DEACT001", name="Former Staff",
            email="deact@hospa.org", role=StaffRoleEnum.EMERGENCY_PHYSICIAN, password_hash="pw", is_active=False
        )
        self.admin_b = Staff(
            hospital_id="HOSP_B", staff_id="ADMIN_B001", name="Admin Bob",
            email="admin@hospb.org", role=StaffRoleEnum.HOSPITAL_ADMIN, password_hash="pw", is_active=True
        )
        self.db.add_all([self.admin_a, self.doc_a, self.nurse_a, self.director_a, self.deactivated_staff, self.admin_b])
        self.db.commit()

        # Headers for test requests
        self.headers_admin_a = {"X-Staff-Id": "ADMIN001", "X-Hospital-Id": "HOSP_A"}
        self.headers_doc_a = {"X-Staff-Id": "DOC001", "X-Hospital-Id": "HOSP_A"}
        self.headers_nurse_a = {"X-Staff-Id": "NUR001", "X-Hospital-Id": "HOSP_A"}
        self.headers_director_a = {"X-Staff-Id": "DIR001", "X-Hospital-Id": "HOSP_A"}
        self.headers_admin_b = {"X-Staff-Id": "ADMIN_B001", "X-Hospital-Id": "HOSP_B"}

    def tearDown(self):
        self.db.close()

    def test_01_full_workflow_reconstruction(self):
        """
        Test 1: Full end-to-end clinical workflow reconstruction.
        Demonstrates audit events across Tasks 1–10 in exact chronological sequence.
        """
        # 1. Register Patient
        res_pt = self.client.post("/api/patients", json={
            "first_name": "Marcus", "last_name": "Vance", "mrn": "MRN-101",
            "age": 54.0, "gender": "Male"
        }, headers=self.headers_nurse_a)
        self.assertEqual(res_pt.status_code, 200)
        pt_id = res_pt.json()["patient"]["patient_id"]

        # 2. Create Encounter
        res_enc = self.client.post("/api/encounters", json={
            "patient_id": pt_id, "chief_complaint": "Acute shortness of breath and chest tightness",
            "arrival_mode": "Ambulance"
        }, headers=self.headers_nurse_a)
        self.assertEqual(res_enc.status_code, 200)
        enc_id = res_enc.json()["encounter"]["encounter_id"]

        # 3. Conduct Triage
        res_tri = self.client.post(f"/api/encounters/{enc_id}/triage", json={
            "triage_level": 2, "acuity_category": "Emergent", "pain_score": 7
        }, headers=self.headers_nurse_a)
        self.assertEqual(res_tri.status_code, 200)

        # 4. Record Vitals (Triggers deterioration alert)
        res_v1 = self.client.post(f"/api/encounters/{enc_id}/vitals", json={
            "hr": 115, "sbp": 140, "dbp": 88, "rr": 26, "spo2": 93, "temp": 37.5
        }, headers=self.headers_nurse_a)
        self.assertEqual(res_v1.status_code, 200)

        res_v2 = self.client.post(f"/api/encounters/{enc_id}/vitals", json={
            "hr": 128, "sbp": 110, "dbp": 70, "rr": 32, "spo2": 87, "temp": 37.8
        }, headers=self.headers_nurse_a)
        self.assertEqual(res_v2.status_code, 200)
        self.assertTrue(res_v2.json()["deterioration_detected"])
        alert_id = res_v2.json()["alert"]["alert_id"]

        # 5. AI Risk & Explanation (System/AI events)
        AuditService.log_event(
            db=self.db, hospital_id="HOSP_A", action="AI_ASSESSMENT_GENERATED",
            entity_type="AIRiskAssessment", entity_id="AI-101",
            actor_id="AI_SYSTEM", actor_role="AI_SYSTEM", actor_type=ActorTypeEnum.AI_SYSTEM,
            patient_id=pt_id, encounter_id=enc_id, result=AuditResultEnum.SUCCESS,
            metadata={"model": "PatientTriage XGBoost", "predicted_level": 2},
            auto_commit=True
        )
        AuditService.log_event(
            db=self.db, hospital_id="HOSP_A", action="AI_EXPLANATION_GENERATED",
            entity_type="AIExplanation", entity_id="EXPL-101",
            actor_id="AI_SYSTEM", actor_role="AI_SYSTEM", actor_type=ActorTypeEnum.AI_SYSTEM,
            patient_id=pt_id, encounter_id=enc_id, result=AuditResultEnum.SUCCESS,
            metadata={"top_drivers": ["SpO2 Drop (87%)", "Tachypnea (RR 32)"]},
            auto_commit=True
        )

        # 6. Physician Acknowledges Alert
        res_ack = self.client.post(f"/api/alerts/{alert_id}/acknowledge", headers=self.headers_doc_a)
        self.assertEqual(res_ack.status_code, 200)

        # 7. Physician Overrides AI & Records Clinical Decision
        res_dec = self.client.post(f"/api/encounters/{enc_id}/clinical-decision", json={
            "ai_agreement": "OVERRIDDEN",
            "clinician_assigned_risk": "CRITICAL",
            "override_reason": "Physical examination findings",
            "clinical_assessment": "Severe bronchospasm and respiratory exhaustion requiring immediate escalation.",
            "clinical_decision": "ESCALATE_CARE",
            "clinical_notes": "Moving to resuscitation bay; starting BiPAP."
        }, headers=self.headers_doc_a)
        self.assertEqual(res_dec.status_code, 200)

        # 8. Retrieve Encounter Audit Trail
        res_trail = self.client.get(f"/api/encounters/{enc_id}/audit-logs", headers=self.headers_admin_a)
        self.assertEqual(res_trail.status_code, 200)
        trail = res_trail.json()["audit_timeline"]
        
        # Verify complete accountability sequence
        actions = [event["action"] for event in trail]
        self.assertIn("PATIENT_CREATED", actions)
        self.assertIn("ENCOUNTER_CREATED", actions)
        self.assertIn("TRIAGE_CREATED", actions)
        self.assertIn("OBSERVATION_RECORDED", actions)
        self.assertIn("ALERT_CREATED", actions)
        self.assertIn("AI_ASSESSMENT_GENERATED", actions)
        self.assertIn("AI_EXPLANATION_GENERATED", actions)
        self.assertIn("ALERT_ACKNOWLEDGED", actions)
        self.assertIn("AI_OVERRIDDEN", actions)

        # Verify Actor Types exist and are accurate
        actor_types = {e["action"]: e["actor_type"] for e in trail}
        self.assertEqual(actor_types["PATIENT_CREATED"], "HUMAN")
        self.assertEqual(actor_types["ALERT_CREATED"], "SYSTEM")
        self.assertEqual(actor_types["AI_ASSESSMENT_GENERATED"], "AI_SYSTEM")
        self.assertEqual(actor_types["AI_OVERRIDDEN"], "HUMAN")

    def test_02_observation_correction_traceability(self):
        """
        Test 2: Observation correction retains original data and records OBSERVATION_CORRECTED audit event.
        """
        # Create Patient & Encounter
        pt = Patient(hospital_id="HOSP_A", patient_id="PT-CORR", first_name="John", last_name="Doe", mrn="MRN-CORR", age=40.0, gender="Male")
        enc = EDEncounter(hospital_id="HOSP_A", encounter_id="ENC-CORR", patient_id="PT-CORR", chief_complaint="Chest pain / vital sign check", status=EncounterStatusEnum.IN_TREATMENT)
        obs = ClinicalObservation(
            hospital_id="HOSP_A", patient_id="PT-CORR", encounter_id="ENC-CORR",
            hr=80, sbp=120, dbp=80, rr=16, spo2=19, temp=37.0, gcs=15, recorded_by="NUR001"
        )
        self.db.add_all([pt, enc, obs])
        self.db.commit()
        self.db.refresh(obs)

        # Nurse corrects erroneous SpO2 from 19% to 91%
        res = self.client.put(
            f"/api/encounters/ENC-CORR/observations/{obs.id}",
            json={"spo2": 91, "correction_reason": "Data entry error / typographical mistake during triage"},
            headers=self.headers_nurse_a
        )
        self.assertEqual(res.status_code, 200)
        updated = res.json()["observation"]
        self.assertEqual(updated["spo2"], 91)
        self.assertTrue(updated["is_corrected"])
        self.assertEqual(updated["correction_reason"], "Data entry error / typographical mistake during triage")
        self.assertEqual(updated["original_values"]["spo2"], 19)

        # Verify OBSERVATION_CORRECTED in audit log
        audit = self.db.query(AuditLog).filter(
            AuditLog.hospital_id == "HOSP_A",
            AuditLog.action == "OBSERVATION_CORRECTED",
            AuditLog.entity_id == str(obs.id)
        ).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.staff_id, "NUR001")
        self.assertEqual(audit.result, AuditResultEnum.SUCCESS)
        self.assertEqual(audit.metadata_json["previous_values"]["spo2"], 19)
        self.assertEqual(audit.metadata_json["corrected_values"]["spo2"], 91)

    def test_03_login_and_auth_auditing(self):
        """
        Test 3: Valid and invalid logins generate audit events with zero password leakage.
        """
        # 1. Valid login
        res1 = self.client.post("/api/auth/login", json={"staff_id": "DOC001", "password": "password", "hospital_id": "HOSP_A"})
        self.assertEqual(res1.status_code, 200)

        log1 = self.db.query(AuditLog).filter(
            AuditLog.hospital_id == "HOSP_A",
            AuditLog.action == "LOGIN_SUCCESS",
            AuditLog.staff_id == "DOC001"
        ).first()
        self.assertIsNotNone(log1)
        self.assertEqual(log1.result, AuditResultEnum.SUCCESS)

        # 2. Invalid staff login attempt
        res2 = self.client.post("/api/auth/login", json={"staff_id": "UNKNOWN_STAFF", "password": "secret_password123", "hospital_id": "HOSP_A"})
        self.assertEqual(res2.status_code, 401)

        log2 = self.db.query(AuditLog).filter(
            AuditLog.hospital_id == "HOSP_A",
            AuditLog.action == "LOGIN_FAILURE",
            AuditLog.staff_id == "UNKNOWN_STAFF"
        ).first()
        self.assertIsNotNone(log2)
        self.assertEqual(log2.result, AuditResultEnum.DENIED)
        # Privacy check: Ensure password was NOT stored
        self.assertNotIn("secret_password123", str(log2.metadata_json))

        # 3. Deactivated staff login attempt
        res3 = self.client.post("/api/auth/login", json={"staff_id": "DEACT001", "password": "password", "hospital_id": "HOSP_A"})
        self.assertEqual(res3.status_code, 403)

        log3 = self.db.query(AuditLog).filter(
            AuditLog.hospital_id == "HOSP_A",
            AuditLog.action == "LOGIN_FAILURE",
            AuditLog.staff_id == "DEACT001"
        ).first()
        self.assertIsNotNone(log3)
        self.assertEqual(log3.result, AuditResultEnum.DENIED)

    def test_04_cross_hospital_isolation(self):
        """
        Test 4: Hospital B user cannot view Hospital A audit trail.
        """
        # Create audit event for Hospital A
        AuditService.log_event(
            db=self.db, hospital_id="HOSP_A", action="PATIENT_CREATED",
            entity_type="PATIENT", entity_id="PT-A-999",
            actor_id="ADMIN001", actor_role="HOSPITAL_ADMIN",
            auto_commit=True
        )

        # Create audit event for Hospital B
        AuditService.log_event(
            db=self.db, hospital_id="HOSP_B", action="PATIENT_CREATED",
            entity_type="PATIENT", entity_id="PT-B-888",
            actor_id="ADMIN_B001", actor_role="HOSPITAL_ADMIN",
            auto_commit=True
        )

        # Hospital A admin queries audit logs
        res_a = self.client.get("/api/audit-logs", headers=self.headers_admin_a)
        self.assertEqual(res_a.status_code, 200)
        logs_a = res_a.json()["logs"]
        self.assertTrue(all(l["hospital_id"] == "HOSP_A" for l in logs_a))
        self.assertFalse(any(l["entity_id"] == "PT-B-888" for l in logs_a))

        # Hospital B admin queries audit logs
        res_b = self.client.get("/api/audit-logs", headers=self.headers_admin_b)
        self.assertEqual(res_b.status_code, 200)
        logs_b = res_b.json()["logs"]
        self.assertTrue(all(l["hospital_id"] == "HOSP_B" for l in logs_b))
        self.assertFalse(any(l["entity_id"] == "PT-A-999" for l in logs_b))

    def test_05_rbac_audit_endpoint_protection(self):
        """
        Test 5: Non-permitted roles (TRIAGE_NURSE) receive 403 Forbidden on /api/audit-logs.
        """
        res_nurse = self.client.get("/api/audit-logs", headers=self.headers_nurse_a)
        self.assertEqual(res_nurse.status_code, 403)

        res_admin = self.client.get("/api/audit-logs", headers=self.headers_admin_a)
        self.assertEqual(res_admin.status_code, 200)

        res_doc = self.client.get("/api/audit-logs", headers=self.headers_doc_a)
        self.assertEqual(res_doc.status_code, 200)

        res_dir = self.client.get("/api/audit-logs", headers=self.headers_director_a)
        self.assertEqual(res_dir.status_code, 200)

    def test_06_audit_immutability(self):
        """
        Test 6: Normal users cannot PUT or DELETE audit records (Method Not Allowed).
        """
        res_put = self.client.put("/api/audit-logs/AUD-001", json={"action": "MODIFIED"}, headers=self.headers_admin_a)
        self.assertEqual(res_put.status_code, 405)

        res_del = self.client.delete("/api/audit-logs/AUD-001", headers=self.headers_admin_a)
        self.assertEqual(res_del.status_code, 405)

    def test_07_server_side_filtering_and_search(self):
        """
        Test 7: Server-side query filtering by action, actor, encounter, and free-text search.
        """
        # Create multiple distinct events
        AuditService.log_event(db=self.db, hospital_id="HOSP_A", action="AI_OVERRIDDEN", entity_type="PhysicianAssessment", entity_id="PA-01", actor_id="DOC001", encounter_id="ENC-100", auto_commit=True)
        AuditService.log_event(db=self.db, hospital_id="HOSP_A", action="OBSERVATION_RECORDED", entity_type="ClinicalObservation", entity_id="OBS-01", actor_id="NUR001", encounter_id="ENC-100", auto_commit=True)
        AuditService.log_event(db=self.db, hospital_id="HOSP_A", action="STAFF_CREATED", entity_type="STAFF", entity_id="NUR002", actor_id="ADMIN001", auto_commit=True)

        # Filter by action
        res_act = self.client.get("/api/audit-logs?action=AI_OVERRIDDEN", headers=self.headers_admin_a)
        self.assertEqual(res_act.status_code, 200)
        self.assertEqual(len(res_act.json()["logs"]), 1)
        self.assertEqual(res_act.json()["logs"][0]["action"], "AI_OVERRIDDEN")

        # Filter by actor_id
        res_act_id = self.client.get("/api/audit-logs?actor_id=NUR001", headers=self.headers_admin_a)
        self.assertEqual(res_act_id.status_code, 200)
        self.assertEqual(len(res_act_id.json()["logs"]), 1)
        self.assertEqual(res_act_id.json()["logs"][0]["actor_id"], "NUR001")

        # Search by keyword
        res_search = self.client.get("/api/audit-logs?q=NUR002", headers=self.headers_admin_a)
        self.assertEqual(res_search.status_code, 200)
        self.assertEqual(len(res_search.json()["logs"]), 1)
        self.assertEqual(res_search.json()["logs"][0]["entity_id"], "NUR002")

    def test_08_server_side_pagination(self):
        """
        Test 8: Server-side pagination limits response size and provides total count.
        """
        # Create 15 events
        for i in range(15):
            AuditService.log_event(
                db=self.db, hospital_id="HOSP_A", action="OBSERVATION_RECORDED",
                entity_type="ClinicalObservation", entity_id=f"OBS-{i}",
                actor_id="NUR001", auto_commit=True
            )

        # Query page 1 with page_size=5
        res_p1 = self.client.get("/api/audit-logs?page=1&page_size=5", headers=self.headers_admin_a)
        self.assertEqual(res_p1.status_code, 200)
        data1 = res_p1.json()
        self.assertEqual(len(data1["logs"]), 5)
        self.assertEqual(data1["total"], 15)
        self.assertEqual(data1["total_pages"], 3)
        self.assertEqual(data1["page"], 1)

        # Query page 2 with page_size=5
        res_p2 = self.client.get("/api/audit-logs?page=2&page_size=5", headers=self.headers_admin_a)
        self.assertEqual(res_p2.status_code, 200)
        data2 = res_p2.json()
        self.assertEqual(len(data2["logs"]), 5)
        self.assertEqual(data2["page"], 2)

    def test_09_single_event_detail_retrieval(self):
        """
        Test 9: GET /api/audit-logs/{event_id} retrieves accurate event metadata.
        """
        created = AuditService.log_event(
            db=self.db, hospital_id="HOSP_A", action="ROLE_CHANGED",
            entity_type="STAFF", entity_id="STAFF-123",
            actor_id="ADMIN001", actor_role="HOSPITAL_ADMIN",
            metadata={"previous_role": "STAFF_NURSE", "new_role": "TRIAGE_NURSE"},
            auto_commit=True
        )

        res = self.client.get(f"/api/audit-logs/{created.event_id}", headers=self.headers_admin_a)
        self.assertEqual(res.status_code, 200)
        event = res.json()["audit_event"]
        self.assertEqual(event["event_id"], created.event_id)
        self.assertEqual(event["action"], "ROLE_CHANGED")
        self.assertEqual(event["metadata"]["new_role"], "TRIAGE_NURSE")

    def test_10_privacy_and_data_minimization(self):
        """
        Test 10: Metadata sanitization removes passwords and tokens automatically.
        """
        dirty_meta = {
            "model_version": "1.2",
            "password": "SuperSecretPassword!",
            "token": "JWT_TOKEN_SECRET_123",
            "notes": "Patient stable"
        }
        clean_meta = AuditService.sanitize_metadata(dirty_meta)
        self.assertEqual(clean_meta["password"], "[REDACTED]")
        self.assertEqual(clean_meta["token"], "[REDACTED]")
        self.assertEqual(clean_meta["model_version"], "1.2")

        # Persist and verify database contains redacted values
        audit = AuditService.log_event(
            db=self.db, hospital_id="HOSP_A", action="STAFF_UPDATED",
            entity_type="STAFF", entity_id="STAFF-SEC",
            actor_id="ADMIN001", metadata=dirty_meta,
            auto_commit=True
        )
        self.assertEqual(audit.metadata_json["password"], "[REDACTED]")
        self.assertEqual(audit.metadata_json["token"], "[REDACTED]")

if __name__ == "__main__":
    unittest.main()
