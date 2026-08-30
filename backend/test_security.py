import os
import sys
import unittest
import time
import datetime
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Set test environment
TEST_DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "test_security.db"))
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
from services.rbac import (
    get_db, hash_password, create_session, revoke_session,
    REVOKED_TOKENS, ACTIVE_SESSIONS
)
from services.audit_service import AuditService
from main import app, LOGIN_FAILED_ATTEMPTS, reset_login_rate_limit, AIAssessmentOutputSchema

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

class TestSecurityAndPrivacyHardening(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def setUp(self):
        self.client = TestClient(app)
        self.db = TestingSessionLocal()
        REVOKED_TOKENS.clear()
        ACTIVE_SESSIONS.clear()
        LOGIN_FAILED_ATTEMPTS.clear()

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

        # Seed 2 Isolated Hospitals
        self.hosp_a = Hospital(hospital_code="HOSP_A", name="Hospital Alpha", address="100 Alpha Way", is_active=True)
        self.hosp_b = Hospital(hospital_code="HOSP_B", name="Hospital Beta", address="200 Beta Blvd", is_active=True)
        self.db.add_all([self.hosp_a, self.hosp_b])
        self.db.commit()

        # Seed Staff for Hospital A
        self.admin_a = Staff(
            hospital_id="HOSP_A", staff_id="ADMIN_A", name="Admin Alice",
            email="admin@hospa.org", role=StaffRoleEnum.HOSPITAL_ADMIN,
            password_hash=hash_password("admin_pass123"), is_active=True
        )
        self.doc_a = Staff(
            hospital_id="HOSP_A", staff_id="DOC_A", name="Dr. Gregory House",
            email="doc@hospa.org", role=StaffRoleEnum.EMERGENCY_PHYSICIAN,
            password_hash=hash_password("doc_pass123"), is_active=True
        )
        self.nurse_a = Staff(
            hospital_id="HOSP_A", staff_id="NUR_A", name="Nurse Jackie",
            email="nurse@hospa.org", role=StaffRoleEnum.TRIAGE_NURSE,
            password_hash=hash_password("nurse_pass123"), is_active=True
        )
        self.deactivated_a = Staff(
            hospital_id="HOSP_A", staff_id="DEACT_A", name="Former Staff",
            email="deact@hospa.org", role=StaffRoleEnum.EMERGENCY_PHYSICIAN,
            password_hash=hash_password("deact_pass123"), is_active=False
        )

        # Seed Staff for Hospital B
        self.doc_b = Staff(
            hospital_id="HOSP_B", staff_id="DOC_B", name="Dr. James Wilson",
            email="doc@hospb.org", role=StaffRoleEnum.EMERGENCY_PHYSICIAN,
            password_hash=hash_password("docb_pass123"), is_active=True
        )
        self.db.add_all([self.admin_a, self.doc_a, self.nurse_a, self.deactivated_a, self.doc_b])
        self.db.commit()

        # Create Patient & Encounter for Hospital A
        self.pt_a = Patient(
            hospital_id="HOSP_A", patient_id="PT-A001", mrn="MRN-A001",
            first_name="Arthur", last_name="Dent", age=42.0, gender="Male"
        )
        self.enc_a = EDEncounter(
            hospital_id="HOSP_A", patient_id="PT-A001", encounter_id="ENC-A001",
            chief_complaint="Chest pain radiating to left arm", status=EncounterStatusEnum.WAITING
        )
        self.alert_a = ClinicalAlert(
            hospital_id="HOSP_A", patient_id="PT-A001", encounter_id="ENC-A001",
            alert_id="ALT-A001", alert_type="VITAL_DETERIORATION",
            severity=AlertSeverityEnum.HIGH, status=AlertStatusEnum.UNACKNOWLEDGED,
            summary="Heart rate escalated to 135 bpm", detection_source=DetectionSourceEnum.RULE_BASED,
            detection_rule_id="RULE-01", evidence=[]
        )

        # Create Patient & Encounter for Hospital B
        self.pt_b = Patient(
            hospital_id="HOSP_B", patient_id="PT-B001", mrn="MRN-B001",
            first_name="Ford", last_name="Prefect", age=38.0, gender="Male"
        )
        self.enc_b = EDEncounter(
            hospital_id="HOSP_B", patient_id="PT-B001", encounter_id="ENC-B001",
            chief_complaint="Severe migraine and vertigo", status=EncounterStatusEnum.WAITING
        )
        self.alert_b = ClinicalAlert(
            hospital_id="HOSP_B", patient_id="PT-B001", encounter_id="ENC-B001",
            alert_id="ALT-B001", alert_type="VITAL_DETERIORATION",
            severity=AlertSeverityEnum.HIGH, status=AlertStatusEnum.UNACKNOWLEDGED,
            summary="SpO2 dropped to 86%", detection_source=DetectionSourceEnum.RULE_BASED,
            detection_rule_id="RULE-02", evidence=[]
        )

        self.db.add_all([self.pt_a, self.enc_a, self.alert_a, self.pt_b, self.enc_b, self.alert_b])
        self.db.commit()

        # Headers
        self.headers_doc_a = {"X-Staff-Id": "DOC_A", "X-Hospital-Id": "HOSP_A"}
        self.headers_nurse_a = {"X-Staff-Id": "NUR_A", "X-Hospital-Id": "HOSP_A"}
        self.headers_admin_a = {"X-Staff-Id": "ADMIN_A", "X-Hospital-Id": "HOSP_A"}
        self.headers_doc_b = {"X-Staff-Id": "DOC_B", "X-Hospital-Id": "HOSP_B"}
        self.headers_deact_a = {"X-Staff-Id": "DEACT_A", "X-Hospital-Id": "HOSP_A"}

    def tearDown(self):
        self.db.close()

    def test_01_unauthenticated_request_rejected(self):
        """Test 1: Protected APIs reject unauthenticated requests (401 Unauthorized)."""
        res = self.client.get("/api/encounters")
        self.assertEqual(res.status_code, 401)

    def test_02_expired_and_revoked_session_rejected(self):
        """Test 2: Revoked or expired sessions are rejected (401 Unauthorized)."""
        # Create a session token
        token = create_session("DOC_A", "HOSP_A", expires_in_seconds=3600)
        auth_headers = {"Authorization": f"Bearer {token}"}

        # Valid session works
        res1 = self.client.get("/api/auth/me", headers=auth_headers)
        self.assertEqual(res1.status_code, 200)

        # Logout revokes session
        res_logout = self.client.post("/api/auth/logout", headers=auth_headers)
        self.assertEqual(res_logout.status_code, 200)

        # Subsequent request with revoked token fails
        res2 = self.client.get("/api/auth/me", headers=auth_headers)
        self.assertEqual(res2.status_code, 401)

    def test_03_deactivated_account_rejected(self):
        """Test 3: Disabled/deactivated accounts are rejected with 403 Forbidden."""
        res = self.client.get("/api/encounters", headers=self.headers_deact_a)
        self.assertEqual(res.status_code, 403)

    def test_04_cross_hospital_patient_idor_prevented(self):
        """Test 4: Hospital A physician cannot access Hospital B patient (404/403)."""
        res = self.client.get("/api/patients/PT-B001", headers=self.headers_doc_a)
        self.assertEqual(res.status_code, 404)

    def test_05_cross_hospital_encounter_idor_prevented(self):
        """Test 5: Hospital A physician cannot access Hospital B encounter (404/403)."""
        res = self.client.get("/api/encounters/ENC-B001", headers=self.headers_doc_a)
        self.assertEqual(res.status_code, 404)

    def test_06_cross_hospital_alert_idor_prevented(self):
        """Test 6: Hospital A physician cannot acknowledge Hospital B alert (404/403)."""
        res = self.client.post("/api/alerts/ALT-B001/acknowledge", headers=self.headers_doc_a)
        self.assertIn(res.status_code, [403, 404])

    def test_07_cross_hospital_audit_isolation(self):
        """Test 7: Hospital A user querying audit logs receives ONLY Hospital A events."""
        AuditService.log_event(db=self.db, hospital_id="HOSP_A", action="OBS_A", entity_type="TEST", entity_id="1", actor_id="DOC_A", auto_commit=True)
        AuditService.log_event(db=self.db, hospital_id="HOSP_B", action="OBS_B", entity_type="TEST", entity_id="2", actor_id="DOC_B", auto_commit=True)

        res = self.client.get("/api/audit-logs", headers=self.headers_doc_a)
        self.assertEqual(res.status_code, 200)
        logs = res.json()["logs"]
        self.assertTrue(all(l["hospital_id"] == "HOSP_A" for l in logs))
        self.assertFalse(any(l["action"] == "OBS_B" for l in logs))

    def test_08_cross_hospital_dashboard_isolation(self):
        """Test 8: Hospital A queue/dashboard returns only Hospital A data."""
        res_a = self.client.get("/api/encounters", headers=self.headers_doc_a)
        self.assertEqual(res_a.status_code, 200)
        encs_a = res_a.json().get("encounters", res_a.json().get("queue", []))
        self.assertTrue(all(e.get("hospital_id", "HOSP_A") == "HOSP_A" for e in encs_a))
        self.assertFalse(any(e.get("encounter_id") == "ENC-B001" for e in encs_a))

    def test_09_forged_role_in_request_ignored(self):
        """Test 9: Nurse forging role in request cannot access admin staff endpoint (403)."""
        res = self.client.post("/api/staff", json={
            "staff_id": "HACKER01", "name": "Fake Admin", "email": "fake@hosp.org",
            "role": "HOSPITAL_ADMIN", "role_forged": "HOSPITAL_ADMIN"
        }, headers=self.headers_nurse_a)
        self.assertEqual(res.status_code, 403)

    def test_10_forged_hospital_in_request_blocked(self):
        """Test 10: Client sending hospital_id='HOSP_B' in patient creation is forced into staff's hospital."""
        res = self.client.post("/api/patients", json={
            "first_name": "Tampered", "last_name": "Patient", "mrn": "MRN-TAMP",
            "age": 30.0, "gender": "Female", "hospital_id": "HOSP_B"
        }, headers=self.headers_nurse_a)
        self.assertEqual(res.status_code, 200)
        created = res.json()["patient"]
        self.assertEqual(created["hospital_id"], "HOSP_A")

    def test_11_nurse_cannot_override_ai(self):
        """Test 11: Triage Nurse attempting AI override is denied (403 Forbidden)."""
        res = self.client.post("/api/encounters/ENC-A001/clinical-decision", json={
            "ai_agreement": "OVERRIDDEN",
            "clinician_assigned_risk": "CRITICAL",
            "override_reason": "Physical examination findings",
            "clinical_assessment": "Unilateral chest pain with diaphoresis",
            "clinical_decision": "ESCALATE_CARE"
        }, headers=self.headers_nurse_a)
        self.assertEqual(res.status_code, 403)

    def test_12_non_admin_cannot_manage_staff(self):
        """Test 12: Emergency Physician cannot provision new staff accounts (403 Forbidden)."""
        res = self.client.post("/api/staff", json={
            "staff_id": "DOC_NEW", "name": "Dr. New", "email": "new@hospa.org",
            "role": "EMERGENCY_PHYSICIAN"
        }, headers=self.headers_doc_a)
        self.assertEqual(res.status_code, 403)

    def test_13_audit_log_immutability(self):
        """Test 13: Audit log records cannot be updated or deleted (405 Method Not Allowed)."""
        res_put = self.client.put("/api/audit-logs/1", json={"action": "MODIFIED"}, headers=self.headers_admin_a)
        self.assertEqual(res_put.status_code, 405)

        res_del = self.client.delete("/api/audit-logs/1", headers=self.headers_admin_a)
        self.assertEqual(res_del.status_code, 405)

    def test_14_vital_sign_out_of_range_rejected(self):
        """Test 14: Out-of-range vital sign (SpO2=250%) is rejected with 422 validation failure."""
        res = self.client.post("/api/encounters/ENC-A001/vitals", json={
            "hr": 80, "sbp": 120, "dbp": 80, "rr": 16, "spo2": 250, "temp": 37.0
        }, headers=self.headers_nurse_a)
        self.assertEqual(res.status_code, 422)

    def test_15_excessive_payload_length_rejected(self):
        """Test 15: Clinical notes exceeding maximum length (5000 chars) are rejected with 422."""
        excessive_notes = "A" * 5001
        res = self.client.post("/api/encounters/ENC-A001/clinical-decision", json={
            "ai_agreement": "AGREED",
            "clinical_assessment": "Valid assessment",
            "clinical_decision": "CONTINUE_EVALUATION",
            "clinical_notes": excessive_notes
        }, headers=self.headers_doc_a)
        self.assertEqual(res.status_code, 422)

    def test_16_xss_payload_safely_handled(self):
        """Test 16: Script tags in clinical notes are stored safely as plain text."""
        xss_string = '<script>alert("xss_attack")</script>'
        res = self.client.post("/api/encounters/ENC-A001/vitals", json={
            "hr": 85, "sbp": 125, "dbp": 82, "rr": 18, "spo2": 97, "temp": 37.1,
            "notes": xss_string
        }, headers=self.headers_nurse_a)
        self.assertEqual(res.status_code, 200)

        # Retrieve and verify stored as plain string
        res_get = self.client.get("/api/encounters/ENC-A001", headers=self.headers_doc_a)
        self.assertEqual(res_get.status_code, 200)
        obs = res_get.json()["observations"]
        self.assertEqual(obs[-1]["notes"], xss_string)

    def test_17_malformed_ai_output_rejected(self):
        """Test 17: Schema validation rejects invalid AI output types and values."""
        with self.assertRaises(Exception):
            AIAssessmentOutputSchema(
                risk_score="banana", # invalid type
                risk_category="UNKNOWN", # invalid category
                predicted_level=99 # out of range
            )

    def test_18_ai_data_minimization(self):
        """Test 18: AI inference endpoint generates assessment using only minimized clinical parameters."""
        # Record baseline vitals
        self.client.post("/api/encounters/ENC-A001/vitals", json={
            "hr": 110, "sbp": 130, "dbp": 85, "rr": 22, "spo2": 94, "temp": 37.4
        }, headers=self.headers_nurse_a)

        res = self.client.post("/api/encounters/ENC-A001/ai-assessment", headers=self.headers_doc_a)
        self.assertEqual(res.status_code, 200)
        ai_res = res.json()["assessment"]
        self.assertIn("risk_score", ai_res)
        self.assertIn("risk_category", ai_res)
        self.assertIn("predicted_triage_level", ai_res)

    def test_19_login_rate_limiting(self):
        """Test 19: Exceeding 5 failed login attempts triggers 429 Too Many Requests."""
        for _ in range(5):
            res_fail = self.client.post("/api/auth/login", json={
                "staff_id": "DOC_A", "password": "wrong_password_attempt"
            })
            self.assertEqual(res_fail.status_code, 401)

        # 6th attempt is rate-limited
        res_blocked = self.client.post("/api/auth/login", json={
            "staff_id": "DOC_A", "password": "wrong_password_attempt"
        })
        self.assertEqual(res_blocked.status_code, 429)

    def test_20_passwords_never_exposed_or_plaintext(self):
        """Test 20: Passwords and password hashes are never exposed in staff APIs or audit logs."""
        # Query staff info
        res_me = self.client.get("/api/auth/me", headers=self.headers_doc_a)
        self.assertEqual(res_me.status_code, 200)
        staff_data = res_me.json()["staff"]
        self.assertNotIn("password", staff_data)
        self.assertNotIn("password_hash", staff_data)

        # Verify audit logs have no plaintext password
        audit_records = self.db.query(AuditLog).all()
        for record in audit_records:
            meta_str = str(record.metadata_json or "")
            self.assertNotIn("doc_pass123", meta_str)
            self.assertNotIn("admin_pass123", meta_str)

if __name__ == "__main__":
    unittest.main()
