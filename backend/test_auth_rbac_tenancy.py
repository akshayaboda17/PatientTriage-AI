import unittest
import os
import sys
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Add backend directory to path
sys.path.append(os.path.abspath(os.path.dirname(__file__)))
from main import app, get_db
from models import Base, Hospital, Staff, Patient, Role, Permission, seed_database

# Set up test database
TEST_DB_PATH = "./test_triage_database.db"
SQLALCHEMY_DATABASE_URL = f"sqlite:///{TEST_DB_PATH}"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Override get_db dependency in FastAPI app
def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

class TestAuthRBACTenancy(unittest.TestCase):
    
    @classmethod
    def setUpClass(cls):
        # Create schema and seed roles/permissions
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        
        # Seed test db
        db = TestingSessionLocal()
        try:
            # Seed permissions and roles (similar to seed_database)
            permissions_data = [
                "patient:create", "patient:view", "patient:update",
                "triage:create", "triage:view", "triage:update",
                "vitals:create", "vitals:view", "ai:view", "ai:override",
                "alert:view", "alert:acknowledge",
                "staff:create", "staff:view", "staff:update", "staff:deactivate",
                "hospital:view", "hospital:update", "audit:view"
            ]
            for pid in permissions_data:
                db.add(Permission(permission_id=pid, description="Test description"))
            db.commit()

            roles_permissions_map = {
                "HOSPITAL_ADMINISTRATOR": [
                    "staff:create", "staff:view", "staff:update", "staff:deactivate",
                    "hospital:view", "hospital:update", "audit:view"
                ],
                "TRIAGE_NURSE": [
                    "patient:create", "patient:view", "triage:create", "triage:view",
                    "triage:update", "vitals:create", "vitals:view", "ai:view", "alert:view"
                ],
                "EMERGENCY_PHYSICIAN": [
                    "patient:view", "patient:update", "triage:view", "vitals:view",
                    "ai:view", "ai:override", "alert:view", "alert:acknowledge"
                ],
                "EMERGENCY_TECHNICIAN": [
                    "patient:view", "vitals:create", "vitals:view"
                ]
            }

            role_objs = {}
            for rid, perms in roles_permissions_map.items():
                r = Role(role_id=rid, name=rid.replace("_", " ").title())
                db.add(r)
                role_objs[rid] = r
            db.commit()

            perm_objs = {p.permission_id: p for p in db.query(Permission).all()}
            for rid, perms in roles_permissions_map.items():
                r_obj = role_objs[rid]
                for p_id in perms:
                    r_obj.permissions.append(perm_objs[p_id])
            db.commit()
            
        finally:
            db.close()

    @classmethod
    def tearDownClass(cls):
        # Remove test database
        engine.dispose()
        if os.path.exists(TEST_DB_PATH):
            try:
                os.remove(TEST_DB_PATH)
            except Exception:
                pass

    def setUp(self):
        self.client = TestClient(app)

    def test_01_hospital_registration(self):
        # Register Hospital A
        response = self.client.post("/api/v1/auth/register-hospital", json={
            "name": "Hospital Alpha",
            "hospital_id": "HOSP_A",
            "hospital_type": "Government",
            "address": "123 Alpha Way",
            "city": "Alpha City",
            "state": "AL",
            "country": "USA",
            "postal_code": "10001",
            "registration_number": "REG-A1",
            "admin_name": "Admin Alpha",
            "admin_employee_id": "EMP-A01",
            "admin_designation": "Administrator",
            "admin_email": "admin@hospitalalpha.com",
            "admin_phone": "555-0001",
            "admin_password": "AlphaPassword1!",
            "confirm_authorization": True
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["hospital_id"], "HOSP_A")

        # Register Hospital B
        response = self.client.post("/api/v1/auth/register-hospital", json={
            "name": "Hospital Beta",
            "hospital_id": "HOSP_B",
            "hospital_type": "Private",
            "address": "456 Beta St",
            "city": "Beta City",
            "state": "BE",
            "country": "USA",
            "postal_code": "20002",
            "registration_number": "REG-B2",
            "admin_name": "Admin Beta",
            "admin_employee_id": "EMP-B01",
            "admin_designation": "Administrator",
            "admin_email": "admin@hospitalbeta.com",
            "admin_phone": "555-0002",
            "admin_password": "BetaPassword2!",
            "confirm_authorization": True
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["hospital_id"], "HOSP_B")

    def test_02_login_and_validation(self):
        # Test valid login (HOSP_A Admin)
        response = self.client.post("/api/v1/auth/login", json={
            "hospital_id": "HOSP_A",
            "username": "admin@hospitalalpha.com",
            "password": "AlphaPassword1!"
        })
        self.assertEqual(response.status_code, 200)
        self.assertIn("access_token", response.json())
        token = response.json()["access_token"]

        # Test invalid password login
        response = self.client.post("/api/v1/auth/login", json={
            "hospital_id": "HOSP_A",
            "username": "admin@hospitalalpha.com",
            "password": "WrongPassword!"
        })
        self.assertEqual(response.status_code, 401)
        self.assertIn("Invalid Hospital ID", response.json()["detail"])

    def test_03_admin_onboarding_staff(self):
        # Login as Admin A
        admin_login = self.client.post("/api/v1/auth/login", json={
            "hospital_id": "HOSP_A",
            "username": "admin@hospitalalpha.com",
            "password": "AlphaPassword1!"
        })
        token_a = admin_login.json()["access_token"]
        headers_a = {"Authorization": f"Bearer {token_a}"}

        # Create Triage Nurse in HOSP_A
        res = self.client.post("/api/v1/staff", headers=headers_a, json={
            "staff_id": "NURSE_A",
            "full_name": "Nurse Alice",
            "employee_id": "EMP-N01",
            "official_email": "alice@hospitalalpha.com",
            "phone_number": "555-0201",
            "department": "Emergency",
            "designation": "Senior Nurse",
            "role_id": "TRIAGE_NURSE"
        })
        self.assertEqual(res.status_code, 200)
        token_nurse_a = res.json()["activation_token"]

        # Try logging in as PENDING Nurse A -> must fail
        login_pending = self.client.post("/api/v1/auth/login", json={
            "hospital_id": "HOSP_A",
            "username": "alice@hospitalalpha.com",
            "password": "NursePassword1!"
        })
        self.assertEqual(login_pending.status_code, 401)

        # Activate Triage Nurse A
        res_act = self.client.post("/api/v1/auth/activate-staff", json={
            "token": token_nurse_a,
            "password": "NursePassword1!"
        })
        self.assertEqual(res_act.status_code, 200)

        # Create Physician in HOSP_A
        res = self.client.post("/api/v1/staff", headers=headers_a, json={
            "staff_id": "PHYS_A",
            "full_name": "Dr. Aaron",
            "employee_id": "EMP-P01",
            "official_email": "aaron@hospitalalpha.com",
            "phone_number": "555-0301",
            "department": "Emergency",
            "designation": "MD Physician",
            "role_id": "EMERGENCY_PHYSICIAN"
        })
        self.assertEqual(res.status_code, 200)
        token_phys_a = res.json()["activation_token"]

        # Activate Physician A
        res_act = self.client.post("/api/v1/auth/activate-staff", json={
            "token": token_phys_a,
            "password": "PhysicianPassword1!"
        })
        self.assertEqual(res_act.status_code, 200)

        # Login as Admin B
        admin_b_login = self.client.post("/api/v1/auth/login", json={
            "hospital_id": "HOSP_B",
            "username": "admin@hospitalbeta.com",
            "password": "BetaPassword2!"
        })
        token_b = admin_b_login.json()["access_token"]
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # Create Physician in HOSP_B
        res = self.client.post("/api/v1/staff", headers=headers_b, json={
            "staff_id": "PHYS_B",
            "full_name": "Dr. Bella",
            "employee_id": "EMP-P02",
            "official_email": "bella@hospitalbeta.com",
            "phone_number": "555-0302",
            "department": "Emergency",
            "designation": "MD Physician",
            "role_id": "EMERGENCY_PHYSICIAN"
        })
        self.assertEqual(res.status_code, 200)
        token_phys_b = res.json()["activation_token"]

        # Activate Physician B
        res_act = self.client.post("/api/v1/auth/activate-staff", json={
            "token": token_phys_b,
            "password": "PhysicianPassword2!"
        })
        self.assertEqual(res_act.status_code, 200)

    def test_04_multi_tenant_isolation(self):
        # 1. Login as Nurse A
        nurse_a_login = self.client.post("/api/v1/auth/login", json={
            "hospital_id": "HOSP_A",
            "username": "alice@hospitalalpha.com",
            "password": "NursePassword1!"
        })
        token_nurse_a = nurse_a_login.json()["access_token"]
        headers_nurse_a = {"Authorization": f"Bearer {token_nurse_a}"}

        # Nurse A registers Patient A
        self.client.post("/api/v1/patients", headers=headers_nurse_a, json={
            "patient_id": "PT-A100",
            "age": 42,
            "gender": "Male",
            "arrival_mode": "Walk-in",
            "hr": 80, "sbp": 120, "dbp": 80, "rr": 16, "spo2": 98, "temp": 36.8, "gcs": 15, "pain_score": 2,
            "history_available": True
        })

        # 2. Login as Doctor B (from HOSP_B)
        doc_b_login = self.client.post("/api/v1/auth/login", json={
            "hospital_id": "HOSP_B",
            "username": "bella@hospitalbeta.com",
            "password": "PhysicianPassword2!"
        })
        token_doc_b = doc_b_login.json()["access_token"]
        headers_doc_b = {"Authorization": f"Bearer {token_doc_b}"}

        # Doctor B attempts to view patient list. Ensure HOSP_A patient (PT-A100) is NOT in list.
        res = self.client.get("/api/v1/patients", headers=headers_doc_b)
        self.assertEqual(res.status_code, 200)
        patient_ids = [p["patient_id"] for p in res.json()]
        self.assertNotIn("PT-A100", patient_ids)

        # Doctor B attempts to override triage for Patient A. Ensure 404 (isolation block)
        res = self.client.post("/api/v1/triage/override", headers=headers_doc_b, json={
            "patient_id": "PT-A100",
            "ai_suggested_level": 3,
            "ai_confidence_score": 0.9,
            "clinician_assigned_level": 2,
            "override_reason": "Clinical Intuition / Gestalt",
            "clinical_notes": "Attempted cross-tenant write",
            "top_3_drivers": []
        })
        self.assertEqual(res.status_code, 404) # Not found in Doctor B's hospital context

    def test_05_rbac_permissions(self):
        # Login as Nurse A
        nurse_a_login = self.client.post("/api/v1/auth/login", json={
            "hospital_id": "HOSP_A",
            "username": "alice@hospitalalpha.com",
            "password": "NursePassword1!"
        })
        token_nurse_a = nurse_a_login.json()["access_token"]
        headers_nurse_a = {"Authorization": f"Bearer {token_nurse_a}"}

        # Nurse A tries to override triage level (Physician only). Ensure blocked.
        res = self.client.post("/api/v1/triage/override", headers=headers_nurse_a, json={
            "patient_id": "PT-A100",
            "ai_suggested_level": 3,
            "ai_confidence_score": 0.85,
            "clinician_assigned_level": 2,
            "override_reason": "Clinical Intuition / Gestalt",
            "clinical_notes": "Patient looks pale",
            "top_3_drivers": []
        })
        self.assertEqual(res.status_code, 403) # Forbidden

        # Login as Doctor A (HOSP_A Emergency Physician)
        doc_a_login = self.client.post("/api/v1/auth/login", json={
            "hospital_id": "HOSP_A",
            "username": "aaron@hospitalalpha.com",
            "password": "PhysicianPassword1!"
        })
        token_doc_a = doc_a_login.json()["access_token"]
        headers_doc_a = {"Authorization": f"Bearer {token_doc_a}"}

        # Doctor A overrides. Ensure successful.
        res = self.client.post("/api/v1/triage/override", headers=headers_doc_a, json={
            "patient_id": "PT-A100",
            "ai_suggested_level": 3,
            "ai_confidence_score": 0.85,
            "clinician_assigned_level": 2,
            "override_reason": "Clinical Intuition / Gestalt",
            "clinical_notes": "Checked manually and Gestalt indicates ESI 2",
            "top_3_drivers": [{"feature": "gestalt", "weight": 20}]
        })
        self.assertEqual(res.status_code, 200)

    def test_06_deactivation_rules(self):
        # Login as Admin A
        admin_login = self.client.post("/api/v1/auth/login", json={
            "hospital_id": "HOSP_A",
            "username": "admin@hospitalalpha.com",
            "password": "AlphaPassword1!"
        })
        token_a = admin_login.json()["access_token"]
        headers_a = {"Authorization": f"Bearer {token_a}"}

        # Deactivate Nurse A
        res = self.client.post("/api/v1/staff/NURSE_A/deactivate", headers=headers_a)
        self.assertEqual(res.status_code, 200)

        # Attempt to login as Nurse A. Ensure blocked.
        res = self.client.post("/api/v1/auth/login", json={
            "hospital_id": "HOSP_A",
            "username": "alice@hospitalalpha.com",
            "password": "NursePassword1!"
        })
        self.assertEqual(res.status_code, 403)

    def test_07_rbac_role_modification_and_privilege_escalation(self):
        # Login as Admin A
        admin_login = self.client.post("/api/v1/auth/login", json={
            "hospital_id": "HOSP_A",
            "username": "admin@hospitalalpha.com",
            "password": "AlphaPassword1!"
        })
        token_a = admin_login.json()["access_token"]
        headers_a = {"Authorization": f"Bearer {token_a}"}

        # Admin A attempts self-privilege escalation (change own role) -> must fail 403
        res = self.client.patch("/api/v1/staff/ADMIN001/role", headers=headers_a, json={
            "new_role_id": "EMERGENCY_PHYSICIAN"
        })
        self.assertEqual(res.status_code, 403)

        # Login as Admin B
        admin_b_login = self.client.post("/api/v1/auth/login", json={
            "hospital_id": "HOSP_B",
            "username": "admin@hospitalbeta.com",
            "password": "BetaPassword2!"
        })
        token_b = admin_b_login.json()["access_token"]
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # Admin B attempts to modify PHYS_A's role (cross-tenant role change) -> must fail 404
        res = self.client.patch("/api/v1/staff/PHYS_A/role", headers=headers_b, json={
            "new_role_id": "CLINICAL_DIRECTOR"
        })
        self.assertEqual(res.status_code, 404)

        # Admin A modifies PHYS_A's role to CLINICAL_DIRECTOR -> must succeed 200
        res = self.client.patch("/api/v1/staff/PHYS_A/role", headers=headers_a, json={
            "new_role_id": "CLINICAL_DIRECTOR"
        })
        self.assertEqual(res.status_code, 200)

        # Retrieve audit logs and verify the role change is logged
        res_aud = self.client.get("/api/v1/audit-logs", headers=headers_a)
        self.assertEqual(res_aud.status_code, 200)
        logs = res_aud.json()
        role_change_logged = any(
            log["staff_id"] == "ADMIN001" and "Updated staff role for PHYS_A" in log["action"]
            for log in logs
        )
        self.assertTrue(role_change_logged)

if __name__ == "__main__":
    unittest.main()
