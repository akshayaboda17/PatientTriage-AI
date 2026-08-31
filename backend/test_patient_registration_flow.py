import unittest
from fastapi.testclient import TestClient
from main import app
from models import Base, create_engine, sessionmaker, Hospital, Staff, StaffRoleEnum
from services.rbac import hash_password

class TestPatientRegistrationAndMLFlow(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.headers = {
            "X-Staff-Id": "DOC001",
            "X-Hospital-Id": "DEMO001"
        }

    def test_01_blank_intake_with_valid_age_54_and_auto_mrn(self):
        """Test Case: Valid intake with Age=54, empty MRN -> Server assigns MRN and calculates ML priority"""
        # Step 1: Create Patient
        pt_res = self.client.post("/api/patients", headers=self.headers, json={
            "first_name": "Arthur",
            "last_name": "Pendleton",
            "age": 54,
            "gender": "Male",
            "phone": "555-0199",
            "chief_complaint": "Acute crushing chest pressure radiating to jaw",
            "allergies": "Penicillin",
            "medical_history": "Hyperlipidemia"
        })
        self.assertEqual(pt_res.status_code, 200, pt_res.text)
        pt_data = pt_res.json()["patient"]
        self.assertEqual(pt_data["first_name"], "Arthur")
        self.assertEqual(pt_data["age"], 54.0)
        self.assertTrue(pt_data["mrn"].startswith("MRN-"), f"MRN was not auto-generated: {pt_data['mrn']}")
        patient_id = pt_data["patient_id"]

        # Step 2: Create Visit Encounter
        enc_res = self.client.post("/api/encounters", headers=self.headers, json={
            "patient_id": patient_id,
            "chief_complaint": "Acute crushing chest pressure radiating to jaw",
            "arrival_mode": "Ambulance (EMS)",
            "bed_number": "RESUS-01"
        })
        self.assertEqual(enc_res.status_code, 200, enc_res.text)
        enc_data = enc_res.json()["encounter"]
        encounter_id = enc_data["encounter_id"]

        # Step 3: Record Baseline Vitals
        vitals_res = self.client.post(f"/api/encounters/{encounter_id}/vitals", headers=self.headers, json={
            "hr": 128,
            "sbp": 86,
            "dbp": 52,
            "rr": 28,
            "spo2": 88,
            "temp": 37.4,
            "gcs": 14,
            "pain_score": 8,
            "notes": "Hypotensive and tachypneic on arrival."
        })
        self.assertEqual(vitals_res.status_code, 200, vitals_res.text)

        # Step 4: Execute ML Risk Assessment
        ai_res = self.client.post(f"/api/encounters/{encounter_id}/ai-assessment", headers=self.headers)
        self.assertEqual(ai_res.status_code, 200, ai_res.text)
        ai_data = ai_res.json()
        assessment = ai_data["assessment"]
        
        # Verify ML Assessment outputs
        self.assertIn("predicted_triage_level", assessment)
        self.assertIn(assessment["predicted_triage_level"], [1, 2, 3, 4, 5])
        self.assertIn("risk_probability", assessment)
        self.assertIn("confidence_score", assessment)
        self.assertIn("explanation", ai_data)

        # Step 5: Record Initial Triage
        triage_res = self.client.post(f"/api/encounters/{encounter_id}/triage", headers=self.headers, json={
            "triage_level": assessment["predicted_triage_level"],
            "acuity_category": "Critical / Emergency",
            "chief_complaint": "Acute crushing chest pressure",
            "pain_score": 8,
            "mobility": "Stretcher"
        })
        self.assertEqual(triage_res.status_code, 200, triage_res.text)

    def test_02_pediatric_age_3_intake(self):
        """Test Case: Valid intake with Age=3"""
        pt_res = self.client.post("/api/patients", headers=self.headers, json={
            "first_name": "Tommy",
            "last_name": "Miller",
            "age": 3,
            "gender": "Male",
            "chief_complaint": "Barking cough and stridor"
        })
        self.assertEqual(pt_res.status_code, 200, pt_res.text)
        pt_data = pt_res.json()["patient"]
        self.assertEqual(pt_data["age"], 3.0)

    def test_03_negative_age_rejection(self):
        """Test Case: Negative age (-5) must be rejected with 422 Unprocessable Entity"""
        pt_res = self.client.post("/api/patients", headers=self.headers, json={
            "first_name": "Invalid",
            "last_name": "AgeTest",
            "age": -5,
            "gender": "Female"
        })
        self.assertEqual(pt_res.status_code, 422)

    def test_04_invalid_age_above_maximum_rejection(self):
        """Test Case: Unrealistic age (150) must be rejected with 422"""
        pt_res = self.client.post("/api/patients", headers=self.headers, json={
            "first_name": "Invalid",
            "last_name": "AgeMaxTest",
            "age": 150,
            "gender": "Female"
        })
        self.assertEqual(pt_res.status_code, 422)

    def test_05_clinician_priority_override_preservation(self):
        """Test Case: Clinician overrides triage priority -> original AI prediction remains in history"""
        # Create Patient & Encounter
        pt_res = self.client.post("/api/patients", headers=self.headers, json={
            "first_name": "Elena",
            "last_name": "Gilbert",
            "age": 28,
            "gender": "Female"
        })
        patient_id = pt_res.json()["patient"]["patient_id"]
        enc_res = self.client.post("/api/encounters", headers=self.headers, json={
            "patient_id": patient_id,
            "chief_complaint": "Moderate abdominal cramps"
        })
        encounter_id = enc_res.json()["encounter"]["encounter_id"]

        # Vitals (normal)
        self.client.post(f"/api/encounters/{encounter_id}/vitals", headers=self.headers, json={
            "hr": 78, "sbp": 120, "dbp": 80, "rr": 16, "spo2": 99, "temp": 37.0, "gcs": 15, "pain_score": 4
        })

        # Run AI Assessment (AI predicts Level 3 or 4)
        ai_res = self.client.post(f"/api/encounters/{encounter_id}/ai-assessment", headers=self.headers)
        original_ai_level = ai_res.json()["assessment"]["predicted_triage_level"]

        # Initial Triage
        self.client.post(f"/api/encounters/{encounter_id}/triage", headers=self.headers, json={
            "triage_level": original_ai_level,
            "acuity_category": "Urgent"
        })

        # Clinician Overrides to Level 1 (Critical) with documented reason
        override_res = self.client.post(f"/api/encounters/{encounter_id}/triage", headers=self.headers, json={
            "triage_level": 1,
            "acuity_category": "Critical — Immediate Care",
            "notes": "Clinician Priority Override: Acute peritoneal signs detected on physical examination."
        })
        self.assertEqual(override_res.status_code, 200)

        # Verify that encounter details preserve both original AI assessment and new clinician triage
        details_res = self.client.get(f"/api/encounters/{encounter_id}", headers=self.headers)
        details = details_res.json()
        self.assertEqual(details["triage"]["triage_level"], 1, "Current triage was not updated to clinician override")
        self.assertEqual(details["ai_risk"]["predicted_triage_level"], original_ai_level, "Original AI prediction was overwritten")

if __name__ == "__main__":
    unittest.main()
