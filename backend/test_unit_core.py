import os
import sys
import unittest
import datetime
from pydantic import ValidationError

# Add backend directory to path
sys.path.append(os.path.abspath(os.path.dirname(__file__)))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'ai_engine')))

from models import (
    StaffRoleEnum, EncounterStatusEnum, AlertSeverityEnum, AlertStatusEnum,
    AIRiskCategoryEnum, AIAgreementEnum, ClinicalDecisionEnum,
    OverrideReasonCategoryEnum, ActorTypeEnum, AuditResultEnum
)
from services.rbac import (
    ROLE_PERMISSIONS, get_staff_permissions, hash_password, verify_password,
    create_session, revoke_session, is_session_revoked_or_expired,
    ACTIVE_SESSIONS, REVOKED_TOKENS
)
from services.audit_service import AuditService
from services.deterioration_detector import DeteriorationDetector
from main import (
    VitalSignInput, AIAssessmentOutputSchema, ClinicalDecisionRequest,
    TriageCreateRequest, PatientCreateRequest, ObservationCorrectionRequest,
    check_login_rate_limit, record_login_failure, reset_login_rate_limit,
    LOGIN_FAILED_ATTEMPTS
)

class TestUnitCore(unittest.TestCase):
    """
    Unit testing pure business logic, permissions, range validators,
    sanitizers, and deterministic algorithms independently.
    """

    def setUp(self):
        ACTIVE_SESSIONS.clear()
        REVOKED_TOKENS.clear()
        LOGIN_FAILED_ATTEMPTS.clear()

    # -------------------------------------------------------------
    # 1. RBAC & Permission Logic
    # -------------------------------------------------------------
    def test_unit_rbac_physician_permissions(self):
        """Unit Test: Emergency Physician has full clinical decision & AI override permissions."""
        perms = get_staff_permissions(StaffRoleEnum.EMERGENCY_PHYSICIAN)
        self.assertIn("clinical_decision:create", perms)
        self.assertIn("clinical_decision:view", perms)
        self.assertIn("ai:override", perms)
        self.assertIn("ai:view", perms)
        self.assertIn("alert:acknowledge", perms)
        self.assertNotIn("staff:create", perms)

    def test_unit_rbac_triage_nurse_permissions(self):
        """Unit Test: Triage Nurse has triage/vitals permissions but is denied AI override & staff management."""
        perms = get_staff_permissions(StaffRoleEnum.TRIAGE_NURSE)
        self.assertIn("triage:create", perms)
        self.assertIn("vitals:create", perms)
        self.assertIn("alert:acknowledge", perms)
        self.assertNotIn("ai:override", perms)
        self.assertNotIn("clinical_decision:create", perms)
        self.assertNotIn("staff:create", perms)

    def test_unit_rbac_hospital_admin_permissions(self):
        """Unit Test: Hospital Admin has staff provisioning and audit inspection permissions."""
        perms = get_staff_permissions(StaffRoleEnum.HOSPITAL_ADMIN)
        self.assertIn("staff:create", perms)
        self.assertIn("staff:update", perms)
        self.assertIn("audit:view", perms)
        self.assertIn("hospital:view", perms)
        self.assertNotIn("ai:override", perms)

    def test_unit_rbac_clinical_director_permissions(self):
        """Unit Test: Clinical Director has comprehensive clinical and governance permissions."""
        perms = get_staff_permissions(StaffRoleEnum.CLINICAL_DIRECTOR)
        self.assertIn("clinical_decision:create", perms)
        self.assertIn("ai:override", perms)
        self.assertIn("audit:view", perms)
        self.assertIn("dashboard:view", perms)

    # -------------------------------------------------------------
    # 2. Cryptographic Passwords & Session Tokens
    # -------------------------------------------------------------
    def test_unit_password_hashing_and_verification(self):
        """Unit Test: PBKDF2 password hashing creates unique salted hashes and verifies in constant time."""
        raw_pw = "DoctorSecurePass2026!"
        h1 = hash_password(raw_pw)
        h2 = hash_password(raw_pw)
        self.assertNotEqual(h1, h2, "Salts must be unique per hash generation")
        self.assertTrue(verify_password(raw_pw, h1))
        self.assertTrue(verify_password(raw_pw, h2))
        self.assertFalse(verify_password("WrongPassword!", h1))

    def test_unit_session_lifecycle(self):
        """Unit Test: Session tokens expire and support explicit revocation."""
        token = create_session("DOC_01", "HOSP_DEMO", expires_in_seconds=3600)
        self.assertFalse(is_session_revoked_or_expired(token))
        revoke_session(token)
        self.assertTrue(is_session_revoked_or_expired(token))

    # -------------------------------------------------------------
    # 3. Vital Sign Range Validation (Pydantic Schemas)
    # -------------------------------------------------------------
    def test_unit_vitals_valid_ranges(self):
        """Unit Test: Clinically valid vital signs pass Pydantic schema validation."""
        valid_data = {
            "hr": 78, "sbp": 120, "dbp": 80, "rr": 16, "spo2": 98,
            "temp": 37.0, "gcs": 15, "pain_score": 2, "notes": "Patient resting comfortably"
        }
        v = VitalSignInput(**valid_data)
        self.assertEqual(v.hr, 78)
        self.assertEqual(v.spo2, 98)

    def test_unit_vitals_out_of_range_rejected(self):
        """Unit Test: Out-of-range vitals (e.g. SpO2 > 100, HR > 300, GCS < 3) raise validation errors."""
        with self.assertRaises(ValidationError):
            VitalSignInput(hr=78, sbp=120, rr=16, spo2=105) # SpO2 > 100

        with self.assertRaises(ValidationError):
            VitalSignInput(hr=350, sbp=120, rr=16, spo2=98) # HR > 300

        with self.assertRaises(ValidationError):
            VitalSignInput(hr=78, sbp=120, rr=16, spo2=98, gcs=2) # GCS < 3

        with self.assertRaises(ValidationError):
            VitalSignInput(hr=78, sbp=120, rr=16, spo2=98, pain_score=15) # Pain > 10

    # -------------------------------------------------------------
    # 4. AI Output Schema & Normalization
    # -------------------------------------------------------------
    def test_unit_ai_output_schema_valid(self):
        """Unit Test: Valid AI risk output validates successfully."""
        out = AIAssessmentOutputSchema(
            risk_score=0.85,
            risk_category=AIRiskCategoryEnum.HIGH,
            predicted_level=2,
            confidence=0.85
        )
        self.assertEqual(out.risk_score, 0.85)
        self.assertEqual(out.predicted_level, 2)

    def test_unit_ai_output_schema_invalid(self):
        """Unit Test: Malformed AI output (out-of-range scores or levels) is rejected."""
        with self.assertRaises(ValidationError):
            AIAssessmentOutputSchema(risk_score=1.5, risk_category=AIRiskCategoryEnum.HIGH, predicted_level=2)
        with self.assertRaises(ValidationError):
            AIAssessmentOutputSchema(risk_score=-0.2, risk_category=AIRiskCategoryEnum.LOW, predicted_level=4)
        with self.assertRaises(ValidationError):
            AIAssessmentOutputSchema(risk_score=0.5, risk_category=AIRiskCategoryEnum.LOW, predicted_level=6)

    # -------------------------------------------------------------
    # 5. Audit Metadata Sanitization
    # -------------------------------------------------------------
    def test_unit_audit_metadata_sanitization(self):
        """Unit Test: Audit service automatically redacts sensitive credentials from logged metadata."""
        raw_meta = {
            "user_name": "Alice",
            "password": "SuperSecretPassword123!",
            "auth_token": "Bearer PT_SES_XYZ",
            "jwt": "eyJhbGciOi...",
            "patient_mrn": "MRN-12345"
        }
        sanitized = AuditService.sanitize_metadata(raw_meta)
        self.assertEqual(sanitized["password"], "[REDACTED]")
        self.assertEqual(sanitized["auth_token"], "[REDACTED]")
        self.assertEqual(sanitized["jwt"], "[REDACTED]")
        self.assertEqual(sanitized["user_name"], "Alice")
        self.assertEqual(sanitized["patient_mrn"], "MRN-12345")

    # -------------------------------------------------------------
    # 6. Deterioration Detection Rules Unit Logic
    # -------------------------------------------------------------
    def test_unit_deterioration_detector_rules(self):
        """Unit Test: Deterioration detector correctly detects rapid heart rate escalation."""
        detector = DeteriorationDetector()
        
        # Create mock longitudinal observations
        now = datetime.datetime.utcnow()
        obs_baseline = type('Obs', (), {
            'hr': 75, 'sbp': 120, 'dbp': 80, 'rr': 16, 'spo2': 98,
            'temp': 37.0, 'gcs': 15, 'timestamp': now - datetime.timedelta(minutes=30)
        })()
        obs_current = type('Obs', (), {
            'hr': 135, 'sbp': 90, 'dbp': 60, 'rr': 28, 'spo2': 88,
            'temp': 38.5, 'gcs': 13, 'timestamp': now
        })()

        result = detector.evaluate_longitudinal_trend([obs_baseline, obs_current])
        self.assertTrue(result["detected"])
        self.assertIn(result["severity"], [AlertSeverityEnum.CRITICAL.value, AlertSeverityEnum.HIGH.value])

    def test_unit_deterioration_stable_patient_no_alerts(self):
        """Unit Test: Stable vitals generate zero deterioration alerts."""
        detector = DeteriorationDetector()
        now = datetime.datetime.utcnow()
        obs1 = type('Obs', (), {
            'hr': 72, 'sbp': 120, 'dbp': 80, 'rr': 16, 'spo2': 99,
            'temp': 36.8, 'gcs': 15, 'timestamp': now - datetime.timedelta(minutes=30)
        })()
        obs2 = type('Obs', (), {
            'hr': 74, 'sbp': 122, 'dbp': 82, 'rr': 15, 'spo2': 98,
            'temp': 36.9, 'gcs': 15, 'timestamp': now
        })()

        result = detector.evaluate_longitudinal_trend([obs1, obs2])
        self.assertFalse(result["detected"])

    # -------------------------------------------------------------
    # 7. Rate Limiter Sliding Window Logic
    # -------------------------------------------------------------
    def test_unit_rate_limiting_sliding_window(self):
        """Unit Test: Rate limiter permits up to 5 failures and blocks the 6th."""
        key = "127.0.0.1:TEST_USER"
        reset_login_rate_limit(key)
        for _ in range(5):
            self.assertTrue(check_login_rate_limit(key))
            record_login_failure(key)
        self.assertFalse(check_login_rate_limit(key), "6th attempt within window must be rate-limited")
        reset_login_rate_limit(key)
        self.assertTrue(check_login_rate_limit(key))

if __name__ == "__main__":
    unittest.main()
