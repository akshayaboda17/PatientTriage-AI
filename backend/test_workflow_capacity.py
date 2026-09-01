"""
Comprehensive Automated Verification Suite for:
1. Clinical Alerts & Deterioration System Fixes
2. ED Workflow, Queue, Bed Management, Explainability, Override, Discharge, and Surge Mode
"""
import os
import sys
import unittest
from fastapi.testclient import TestClient

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from main import app
from models import SessionLocal, Staff, StaffRoleEnum, EDEncounter, EncounterStatusEnum, ClinicalAlert, TriageAssessment, AIRiskAssessment
from services.hospital_config_service import HospitalConfigService, HospitalScaleEnum

client = TestClient(app)


class TestEDWorkflowAndCapacity(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.db = SessionLocal()
        cls.doc = cls.db.query(Staff).filter(Staff.role == StaffRoleEnum.EMERGENCY_PHYSICIAN).first()
        cls.nurse = cls.db.query(Staff).filter(Staff.role == StaffRoleEnum.TRIAGE_NURSE).first()
        cls.admin = cls.db.query(Staff).filter(Staff.role == StaffRoleEnum.HOSPITAL_ADMIN).first()
        
        cls.doc_headers = {"X-Staff-Id": cls.doc.staff_id, "X-Hospital-Id": cls.doc.hospital_id}
        cls.nurse_headers = {"X-Staff-Id": cls.nurse.staff_id, "X-Hospital-Id": cls.nurse.hospital_id}
        cls.admin_headers = {"X-Staff-Id": cls.admin.staff_id, "X-Hospital-Id": cls.admin.hospital_id}

    @classmethod
    def tearDownClass(cls):
        cls.db.close()

    # ==========================================
    # 1. ALERTS FIXES & PERMISSIONS
    # ==========================================
    def test_01_admin_can_view_alerts_without_403(self):
        """Admin role must have alert:view permission and receive 200 OK."""
        res = client.get("/api/alerts", headers=self.admin_headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("alerts", data)
        self.assertIn("metrics", data)

    def test_02_alert_serialization_has_patient_and_evidence(self):
        """ClinicalAlert.to_dict() must return patient_name, mrn, message alias, and evidence."""
        res = client.get("/api/alerts", headers=self.doc_headers)
        self.assertEqual(res.status_code, 200)
        alerts = res.json()["alerts"]
        if alerts:
            a = alerts[0]
            self.assertIn("patient_name", a)
            self.assertIn("patient_mrn", a)
            self.assertIn("message", a)
            self.assertIn("evidence", a)

    def test_03_monitoring_run_endpoint(self):
        """POST /api/monitoring/run executes deterioration scan and returns summary."""
        res = client.post("/api/monitoring/run", headers=self.doc_headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("monitoring_summary", data)

    # ==========================================
    # 2. ED QUEUE COMPREHENSION & METADATA
    # ==========================================
    def test_04_queue_surfaces_all_required_metadata(self):
        """Each queue item must provide patient name, age, gender, complaint, priority, AI risk, confidence, wait time, bed status, and explanation."""
        res = client.get("/api/encounters", headers=self.nurse_headers)
        self.assertEqual(res.status_code, 200)
        queue = res.json()["queue"]
        self.assertGreater(len(queue), 0)

        p = queue[0]
        self.assertIn("patient_name", p)
        self.assertIn("patient_age", p)
        self.assertIn("patient_gender", p)
        self.assertIn("chief_complaint", p)
        self.assertIn("triage_level", p)
        self.assertIn("ai_risk", p)
        self.assertIn("confidence", p)
        self.assertIn("wait_time_mins", p)
        self.assertIn("waiting_status_text", p)
        self.assertIn("recommended_care_service", p)
        self.assertIn("original_ai_level", p)

    def test_05_explainability_metadata(self):
        """Queue item must contain actual model output for immediate explainability."""
        res = client.get("/api/encounters", headers=self.doc_headers)
        queue = res.json()["queue"]
        explained_patients = [p for p in queue if p.get("ai_explanation")]
        self.assertGreater(len(explained_patients), 0)
        exp = explained_patients[0]["ai_explanation"]
        self.assertIn("top_features", exp)
        self.assertIn("summary", exp)

    # ==========================================
    # 3. CLINICIAN OVERRIDE PRESERVATION & AUDIT
    # ==========================================
    def test_06_clinician_override_preserves_original_ai(self):
        """Overriding care priority records clinician decision without overwriting original AI prediction."""
        # Find active encounter with AI evaluation
        ai_risk = self.db.query(AIRiskAssessment).join(EDEncounter).filter(
            EDEncounter.status.in_([EncounterStatusEnum.WAITING, EncounterStatusEnum.IN_TRIAGE, EncounterStatusEnum.IN_TREATMENT])
        ).first()
        self.assertIsNotNone(ai_risk)
        enc = ai_risk.encounter
        self.assertIsNotNone(enc)
        orig_ai_level = ai_risk.predicted_triage_level
        new_priority = 2 if orig_ai_level == 1 else 1

        # Record override
        res = client.post(
            f"/api/encounters/{enc.encounter_id}/override-priority",
            json={
                "new_priority": new_priority,
                "override_reason": "Acute distress noted during bedside clinician reassessment.",
                "clinical_notes": "Immediate resuscitation bay needed."
            },
            headers=self.doc_headers
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["clinician_priority"], new_priority)
        self.assertEqual(data["original_ai_level"], orig_ai_level)

        # Check queue output
        q_res = client.get("/api/encounters", headers=self.doc_headers)
        matching = [p for p in q_res.json()["queue"] if p["encounter_id"] == enc.encounter_id]
        self.assertEqual(len(matching), 1)
        overridden_p = matching[0]
        self.assertTrue(overridden_p["is_overridden"])
        self.assertEqual(overridden_p["triage_level"], new_priority)
        self.assertEqual(overridden_p["original_ai_level"], orig_ai_level)
        self.assertIsNotNone(overridden_p["override_info"])
        self.assertIn("Acute distress", overridden_p["override_info"]["reason"])

    # ==========================================
    # 4. DISCHARGE WORKFLOW & BED RELEASE
    # ==========================================
    def test_07_discharge_patient_removes_from_active_queue_and_frees_bed(self):
        """Discharging patient updates status to DISCHARGED, releases bed, and removes from active queue."""
        enc = self.db.query(EDEncounter).filter(
            EDEncounter.status.in_([EncounterStatusEnum.WAITING, EncounterStatusEnum.IN_TRIAGE, EncounterStatusEnum.IN_TREATMENT])
        ).first()
        self.assertIsNotNone(enc)

        # Discharge patient
        res = client.post(
            f"/api/encounters/{enc.encounter_id}/discharge",
            json={
                "destination": "Home",
                "disposition_notes": "Condition fully stabilized. Discharged home with outpatient follow-up."
            },
            headers=self.doc_headers
        )
        self.assertEqual(res.status_code, 200)

        # Verify encounter is no longer in default active queue
        active_q = client.get("/api/encounters", headers=self.doc_headers).json()["queue"]
        self.assertNotIn(enc.encounter_id, [p["encounter_id"] for p in active_q])

        # Verify encounter IS present in COMPLETED / DISCHARGED filter
        completed_q = client.get("/api/encounters?status_filter=COMPLETED", headers=self.doc_headers).json()["queue"]
        self.assertIn(enc.encounter_id, [p["encounter_id"] for p in completed_q])

    # ==========================================
    # 5. SURGE MODE PRESERVES CLINICAL PRIORITY
    # ==========================================
    def test_08_surge_mode_does_not_downgrade_priorities(self):
        """Surge mode must elevate sorting without altering any patient's clinical triage level."""
        # Get baseline triage levels
        baseline = client.get("/api/encounters", headers=self.doc_headers).json()["queue"]
        baseline_map = {p["encounter_id"]: p["triage_level"] for p in baseline}

        # Activate Surge Mode
        s_on = client.post("/api/hospital-config/surge-mode", json={"active": True}, headers=self.admin_headers)
        self.assertEqual(s_on.status_code, 200)

        surge_q = client.get("/api/encounters", headers=self.doc_headers).json()["queue"]
        for p in surge_q:
            if p["encounter_id"] in baseline_map:
                self.assertEqual(
                    p["triage_level"], baseline_map[p["encounter_id"]],
                    f"Patient {p['encounter_id']} clinical triage level was altered under surge mode!"
                )

        # Deactivate Surge Mode
        client.post("/api/hospital-config/surge-mode", json={"active": False}, headers=self.admin_headers)


if __name__ == '__main__':
    unittest.main()
