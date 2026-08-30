import os
import sys
import unittest
import datetime

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.append(os.path.abspath(os.path.dirname(__file__)))
from main import app, create_access_token, get_db
from models import AuditLog, Base, Encounter, EncounterPriority, EncounterStatus, Hospital, Patient, Permission, Role, Staff


TEST_DB_PATH = "./test_encounters.db"
engine = create_engine(f"sqlite:///{TEST_DB_PATH}", connect_args={"check_same_thread": False})
TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


class EncounterApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.drop_all(engine)
        Base.metadata.create_all(engine)
        db = TestingSession()
        try:
            permissions = [
                "patient:view", "encounter:create", "encounter:view", "encounter:update",
                "encounter:assign", "encounter:status_update", "encounter:disposition",
            ]
            for permission_id in permissions:
                db.add(Permission(permission_id=permission_id, description="test"))
            nurse_role = Role(role_id="TRIAGE_NURSE", name="Triage Nurse")
            physician_role = Role(role_id="EMERGENCY_PHYSICIAN", name="Physician")
            db.add_all([nurse_role, physician_role])
            db.commit()
            permission_map = {item.permission_id: item for item in db.query(Permission).all()}
            nurse_role.permissions = [permission_map[item] for item in ["patient:view", "encounter:create", "encounter:view", "encounter:update", "encounter:assign", "encounter:status_update"]]
            physician_role.permissions = [permission_map[item] for item in ["patient:view", "encounter:view", "encounter:update", "encounter:status_update", "encounter:disposition"]]
            db.add_all([
                Hospital(hospital_id="HOSP_A", name="Alpha", hospital_type="Test", address="1 A Street", city="A", state="AA", country="US", postal_code="00001", registration_number="A-1"),
                Hospital(hospital_id="HOSP_B", name="Beta", hospital_type="Test", address="1 B Street", city="B", state="BB", country="US", postal_code="00002", registration_number="B-1"),
            ])
            db.add_all([
                cls.staff("NUR_A", "HOSP_A", "TRIAGE_NURSE", "Nurse A"),
                cls.staff("DOC_A", "HOSP_A", "EMERGENCY_PHYSICIAN", "Doctor A"),
                cls.staff("NUR_B", "HOSP_B", "TRIAGE_NURSE", "Nurse B"),
                cls.staff("DOC_B", "HOSP_B", "EMERGENCY_PHYSICIAN", "Doctor B"),
                Patient(patient_id="PT-A", hospital_id="HOSP_A", first_name="Alex", last_name="Alpha", age=40),
                Patient(patient_id="PT-B", hospital_id="HOSP_B", first_name="Blair", last_name="Beta", age=50),
            ])
            db.commit()
        finally:
            db.close()

    @staticmethod
    def staff(staff_id, hospital_id, role_id, name):
        return Staff(
            staff_id=staff_id, hospital_id=hospital_id, full_name=name, employee_id=f"EMP-{staff_id}",
            official_email=f"{staff_id.lower()}@example.test", phone_number="555-0100", department="ED",
            designation=role_id, role_id=role_id, password_hash="unused", status="ACTIVE",
        )

    @classmethod
    def tearDownClass(cls):
        engine.dispose()
        if os.path.exists(TEST_DB_PATH):
            os.remove(TEST_DB_PATH)

    def setUp(self):
        db = TestingSession()
        db.query(AuditLog).delete()
        db.query(Encounter).delete()
        nurse = db.query(Staff).filter_by(staff_id="NUR_A", hospital_id="HOSP_A").first()
        nurse.status = "ACTIVE"
        db.commit()
        db.close()
        self.client = TestClient(app)
        self.nurse_headers = self.headers("NUR_A", "HOSP_A", "TRIAGE_NURSE")
        self.doctor_headers = self.headers("DOC_A", "HOSP_A", "EMERGENCY_PHYSICIAN")
        self.other_hospital_headers = self.headers("DOC_B", "HOSP_B", "EMERGENCY_PHYSICIAN")

    @staticmethod
    def headers(staff_id, hospital_id, role):
        token = create_access_token({"staff_id": staff_id, "hospital_id": hospital_id, "role": role})
        return {"Authorization": f"Bearer {token}"}

    def create_encounter(self):
        response = self.client.post("/api/v1/encounters", headers=self.nurse_headers, json={
            "patient_id": "PT-A", "arrival_method": "WALK_IN", "chief_complaint": "Chest pain",
        })
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def test_create_encounter_and_prevent_duplicate_active_visit(self):
        encounter = self.create_encounter()
        self.assertEqual(encounter["patient_id"], "PT-A")
        self.assertEqual(encounter["current_status"], "WAITING_FOR_TRIAGE")
        self.assertTrue(encounter["encounter_id"].startswith("ENC-"))
        duplicate = self.client.post("/api/v1/encounters", headers=self.nurse_headers, json={
            "patient_id": "PT-A", "arrival_method": "WALK_IN", "chief_complaint": "Repeat visit",
        })
        self.assertEqual(duplicate.status_code, 409)

    def test_cross_hospital_patient_and_encounter_access_are_hidden(self):
        denied_create = self.client.post("/api/v1/encounters", headers=self.nurse_headers, json={
            "patient_id": "PT-B", "arrival_method": "WALK_IN", "chief_complaint": "Cross hospital attempt",
        })
        self.assertEqual(denied_create.status_code, 404)
        encounter = self.create_encounter()
        denied_get = self.client.get(f"/api/v1/encounters/{encounter['encounter_id']}", headers=self.other_hospital_headers)
        self.assertEqual(denied_get.status_code, 404)

    def test_status_transition_is_validated_and_audited(self):
        encounter = self.create_encounter()
        invalid = self.client.patch(f"/api/v1/encounters/{encounter['encounter_id']}/status", headers=self.nurse_headers, json={"status": "DISCHARGED", "expected_version": encounter["version"]})
        self.assertEqual(invalid.status_code, 400)
        valid = self.client.patch(f"/api/v1/encounters/{encounter['encounter_id']}/status", headers=self.nurse_headers, json={"status": "TRIAGE_IN_PROGRESS", "expected_version": encounter["version"]})
        self.assertEqual(valid.status_code, 200, valid.text)
        self.assertEqual(valid.json()["current_status"], "TRIAGE_IN_PROGRESS")
        db = TestingSession()
        self.assertTrue(db.query(AuditLog).filter(AuditLog.entity_id == encounter["encounter_id"], AuditLog.action == "Changed encounter status").first())
        db.close()

    def test_assignment_requires_active_same_hospital_eligible_staff(self):
        encounter = self.create_encounter()
        invalid = self.client.patch(f"/api/v1/encounters/{encounter['encounter_id']}/assignment", headers=self.nurse_headers, json={"assigned_nurse_id": "NUR_B", "expected_version": encounter["version"]})
        self.assertEqual(invalid.status_code, 400)
        valid = self.client.patch(f"/api/v1/encounters/{encounter['encounter_id']}/assignment", headers=self.nurse_headers, json={"assigned_nurse_id": "NUR_A", "assigned_physician_id": "DOC_A", "expected_version": encounter["version"]})
        self.assertEqual(valid.status_code, 200, valid.text)
        self.assertEqual(valid.json()["assigned_physician_id"], "DOC_A")

    def test_active_queue_isolated_and_priority_ordered(self):
        db = TestingSession()
        db.add_all([
            Encounter(encounter_id="ENC-A-LOW", hospital_id="HOSP_A", patient_id="PT-A", arrival_time=datetime.datetime(2026, 1, 1, 10, 20), arrival_method="WALK_IN", chief_complaint="Low", current_status=EncounterStatus.WAITING_FOR_TRIAGE, priority=EncounterPriority.LOW, created_by="NUR_A"),
            Encounter(encounter_id="ENC-A-HIGH", hospital_id="HOSP_A", patient_id="PT-A", arrival_time=datetime.datetime(2026, 1, 1, 10, 30), arrival_method="WALK_IN", chief_complaint="High", current_status=EncounterStatus.WAITING_FOR_TRIAGE, priority=EncounterPriority.HIGH, created_by="NUR_A"),
            Encounter(encounter_id="ENC-B-HIGH", hospital_id="HOSP_B", patient_id="PT-B", arrival_time=datetime.datetime(2026, 1, 1, 10, 10), arrival_method="WALK_IN", chief_complaint="Other hospital", current_status=EncounterStatus.WAITING_FOR_TRIAGE, priority=EncounterPriority.HIGH, created_by="NUR_B"),
        ])
        db.commit(); db.close()
        response = self.client.get("/api/v1/encounters", headers=self.nurse_headers)
        self.assertEqual(response.status_code, 200, response.text)
        items = response.json()["items"]
        self.assertEqual([item["encounter_id"] for item in items], ["ENC-A-HIGH", "ENC-A-LOW"])

    def test_deactivated_staff_is_denied(self):
        db = TestingSession(); db.query(Staff).filter_by(staff_id="NUR_A", hospital_id="HOSP_A").first().status = "DEACTIVATED"; db.commit(); db.close()
        response = self.client.get("/api/v1/encounters", headers=self.nurse_headers)
        self.assertEqual(response.status_code, 403)


if __name__ == "__main__":
    unittest.main()
