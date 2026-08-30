import unittest
import sys
import os
import time
import datetime
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Add project root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from models import (
    Base, Hospital, Staff, StaffRoleEnum, Patient,
    EDEncounter, EncounterStatusEnum, ClinicalObservation,
    AIRiskAssessment, AIExplanation, AIRiskCategoryEnum,
    ClinicalGroundTruthOutcome, MLModelRegistry, MLDatasetRegistry,
    MLMonitoringLog, MLModelStatusEnum, AuditLog
)
from services.rbac import ACTIVE_SESSIONS, REVOKED_TOKENS, get_db
from ml_pipeline.mlops_service import MLOpsService
from main import app

class TestMLOpsLifecycle(unittest.TestCase):
    """
    Automated verification of the Controlled Continuous-Learning & MLOps lifecycle
    for PatientTriage.ai.
    """

    @classmethod
    def setUpClass(cls):
        cls.test_db_url = "sqlite:///./test_mlops.db"
        cls.engine = create_engine(cls.test_db_url, connect_args={"check_same_thread": False})
        cls.TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=cls.engine)
        Base.metadata.create_all(bind=cls.engine)

        def override_get_db():
            db = cls.TestingSessionLocal()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override_get_db
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=cls.engine)
        if os.path.exists("./test_mlops.db"):
            try:
                os.remove("./test_mlops.db")
            except Exception:
                pass

    def setUp(self):
        ACTIVE_SESSIONS.clear()
        REVOKED_TOKENS.clear()
        self.db = self.TestingSessionLocal()

        self.db.query(AuditLog).delete()
        self.db.query(MLMonitoringLog).delete()
        self.db.query(ClinicalGroundTruthOutcome).delete()
        self.db.query(MLModelRegistry).delete()
        self.db.query(MLDatasetRegistry).delete()
        self.db.query(AIExplanation).delete()
        self.db.query(AIRiskAssessment).delete()
        self.db.query(ClinicalObservation).delete()
        self.db.query(EDEncounter).delete()
        self.db.query(Patient).delete()
        self.db.query(Staff).delete()
        self.db.query(Hospital).delete()
        self.db.commit()

        # Seed Hospitals
        hospA = Hospital(hospital_code="HOSP_A", name="Hospital Alpha")
        hospB = Hospital(hospital_code="HOSP_B", name="Hospital Beta")
        self.db.add_all([hospA, hospB])
        self.db.commit()

        # Seed Staff (Director with Governance permission, Nurse without)
        self.director = Staff(
            hospital_id="HOSP_A", staff_id="DIR_A", name="Dr. Director",
            email="dir@hosp.org", role=StaffRoleEnum.CLINICAL_DIRECTOR, password_hash="h"
        )
        self.admin = Staff(
            hospital_id="HOSP_A", staff_id="ADM_A", name="Admin A",
            email="admin@hosp.org", role=StaffRoleEnum.HOSPITAL_ADMIN, password_hash="h"
        )
        self.nurse = Staff(
            hospital_id="HOSP_A", staff_id="NUR_A", name="Nurse A",
            email="nurse@hosp.org", role=StaffRoleEnum.TRIAGE_NURSE, password_hash="h"
        )
        self.db.add_all([self.director, self.admin, self.nurse])
        self.db.commit()

        # Authorize Sessions
        self.token_dir = "token-dir"
        ACTIVE_SESSIONS[self.token_dir] = {
            "staff_id": "DIR_A", "hospital_id": "HOSP_A", "role": StaffRoleEnum.CLINICAL_DIRECTOR.value,
            "created_at": datetime.datetime.utcnow(), "last_activity": datetime.datetime.utcnow(),
            "expires_at": time.time() + 3600
        }

        self.token_admin = "token-admin"
        ACTIVE_SESSIONS[self.token_admin] = {
            "staff_id": "ADM_A", "hospital_id": "HOSP_A", "role": StaffRoleEnum.HOSPITAL_ADMIN.value,
            "created_at": datetime.datetime.utcnow(), "last_activity": datetime.datetime.utcnow(),
            "expires_at": time.time() + 3600
        }

        self.token_nurse = "token-nurse"
        ACTIVE_SESSIONS[self.token_nurse] = {
            "staff_id": "NUR_A", "hospital_id": "HOSP_A", "role": StaffRoleEnum.TRIAGE_NURSE.value,
            "created_at": datetime.datetime.utcnow(), "last_activity": datetime.datetime.utcnow(),
            "expires_at": time.time() + 3600
        }

        # Seed Production Model v1.0
        self.model_v1 = MLModelRegistry(
            model_name="PatientTriage Decompensation Risk Classifier",
            model_version="1.0",
            model_type="LogisticRegression (L2)",
            feature_schema_version="1.0",
            dataset_version="v1.0",
            status=MLModelStatusEnum.PRODUCTION,
            validation_metrics_json={"auroc": 1.0, "auprc": 1.0, "sensitivity": 1.0, "brier_score": 0.0},
            test_metrics_json={"auroc": 1.0, "auprc": 1.0, "sensitivity": 0.9963, "specificity": 1.0, "brier_score": 0.0009},
            hyperparameters_json={"max_iter": 1000},
            artifact_path="ml_pipeline/models/triage_risk_model_v1.0.joblib",
            trained_at=datetime.datetime.utcnow(),
            deployed_at=datetime.datetime.utcnow()
        )
        self.db.add(self.model_v1)
        self.db.commit()

        # Seed Patient & Encounter
        self.patient = Patient(hospital_id="HOSP_A", patient_id="PT-MLOPS-01", first_name="Arthur", last_name="Dent", age=42.0, gender="Male")
        self.db.add(self.patient)
        self.db.commit()

        self.encounter = EDEncounter(
            hospital_id="HOSP_A", patient_id="PT-MLOPS-01", encounter_id="ENC-MLOPS-01",
            arrival_time=datetime.datetime.utcnow() - datetime.timedelta(hours=6),
            arrival_mode="Walk-in", chief_complaint="Severe abdominal pain",
            status=EncounterStatusEnum.IN_TREATMENT
        )
        self.db.add(self.encounter)
        self.db.commit()

        # Seed Prediction with valid feature snapshot
        self.pred = AIRiskAssessment(
            assessment_id="AI-PRED-01",
            hospital_id="HOSP_A",
            patient_id="PT-MLOPS-01",
            encounter_id="ENC-MLOPS-01",
            risk_score=45.0,
            risk_probability=0.45,
            risk_category=AIRiskCategoryEnum.MODERATE,
            predicted_triage_level=3,
            confidence_score=75.0,
            shock_index=0.8,
            qsofa=0,
            mews=1,
            model_name="PatientTriage Model",
            model_version="1.0",
            input_features_json={"age": 42.0, "hr": 88.0, "sbp": 120.0, "spo2": 98.0, "shock_index": 0.8},
            assessed_at=datetime.datetime.utcnow() - datetime.timedelta(hours=5)
        )
        self.db.add(self.pred)
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_01_outcome_eligibility_success(self):
        """Test 1: Valid outcome after prediction is marked as ELIGIBLE."""
        outcome = MLOpsService.record_ground_truth_outcome(
            db=self.db,
            hospital_id="HOSP_A",
            patient_id="PT-MLOPS-01",
            encounter_id="ENC-MLOPS-01",
            icu_admitted=True,
            outcome_time=datetime.datetime.utcnow() - datetime.timedelta(hours=1),
            staff_id="DIR_A"
        )
        self.assertEqual(outcome.eligibility_status, "ELIGIBLE")
        self.assertEqual(outcome.composite_critical_outcome_24h, 1)

    def test_02_temporal_leakage_exclusion(self):
        """Test 4: Outcome occurring before prediction is flagged as EXCLUDED_TEMPORAL_LEAKAGE."""
        outcome = MLOpsService.record_ground_truth_outcome(
            db=self.db,
            hospital_id="HOSP_A",
            patient_id="PT-MLOPS-01",
            encounter_id="ENC-MLOPS-01",
            icu_admitted=True,
            outcome_time=datetime.datetime.utcnow() - datetime.timedelta(hours=10), # BEFORE prediction
            staff_id="DIR_A"
        )
        self.assertEqual(outcome.eligibility_status, "EXCLUDED_TEMPORAL_LEAKAGE")

    def test_03_dataset_versioning_and_registry(self):
        """Test 5: Builds versioned dataset and registers metadata with exclusion tracking."""
        MLOpsService.record_ground_truth_outcome(
            db=self.db, hospital_id="HOSP_A", patient_id="PT-MLOPS-01", encounter_id="ENC-MLOPS-01",
            icu_admitted=True, outcome_time=datetime.datetime.utcnow() - datetime.timedelta(hours=1)
        )

        dataset = MLOpsService.build_versioned_dataset(
            db=self.db,
            dataset_version="v1.1",
            actor_id="ADM_A"
        )
        self.assertEqual(dataset.dataset_version, "v1.1")
        self.assertEqual(dataset.eligible_count, 1)

    def test_04_candidate_training_and_validation_gate(self):
        """Test 6, 7, 9: Trains candidate v1.1, validates acceptance criteria, and marks APPROVED."""
        candidate = MLOpsService.train_candidate_model(
            db=self.db,
            dataset_version="v1.0",
            candidate_version="1.1",
            actor_id="ADM_A"
        )
        self.assertEqual(candidate.status, MLModelStatusEnum.CANDIDATE)

        passed, res = MLOpsService.validate_and_compare_candidate(
            db=self.db,
            candidate_version="1.1",
            actor_id="DIR_A"
        )
        self.assertTrue(passed)
        self.assertEqual(res["status"], "APPROVED")

    def test_05_candidate_rejection_on_inferior_metrics(self):
        """Test 8: Candidate model failing acceptance criteria is marked REJECTED."""
        bad_candidate = MLModelRegistry(
            model_name="Inferior Model",
            model_version="0.9-bad",
            model_type="DecisionTree",
            dataset_version="v1.0",
            status=MLModelStatusEnum.CANDIDATE,
            validation_metrics_json={"auroc": 0.65, "auprc": 0.50, "sensitivity": 0.60, "brier_score": 0.18} # Fails criteria
        )
        self.db.add(bad_candidate)
        self.db.commit()

        passed, res = MLOpsService.validate_and_compare_candidate(
            db=self.db,
            candidate_version="0.9-bad",
            actor_id="DIR_A"
        )
        self.assertFalse(passed)
        self.assertEqual(res["status"], "REJECTED")

    def test_06_model_deployment_and_retirement(self):
        """Test 10 & 11: Promotes approved candidate to PRODUCTION and retires previous version."""
        candidate = MLOpsService.train_candidate_model(
            db=self.db, dataset_version="v1.0", candidate_version="1.1", actor_id="ADM_A"
        )
        MLOpsService.validate_and_compare_candidate(db=self.db, candidate_version="1.1", actor_id="DIR_A")

        deployed = MLOpsService.deploy_to_production(
            db=self.db,
            target_version="1.1",
            staff_id="ADM_A",
            staff_role="HOSPITAL_ADMIN"
        )
        self.assertEqual(deployed.status, MLModelStatusEnum.PRODUCTION)

        old_prod = self.db.query(MLModelRegistry).filter(MLModelRegistry.model_version == "1.0").first()
        self.assertEqual(old_prod.status, MLModelStatusEnum.RETIRED)

    def test_07_model_rollback(self):
        """Test 12: Rolls back production model to prior approved version."""
        self.test_06_model_deployment_and_retirement()

        restored = MLOpsService.rollback_production_model(
            db=self.db,
            rollback_to_version="1.0",
            staff_id="ADM_A",
            staff_role="HOSPITAL_ADMIN"
        )
        self.assertEqual(restored.status, MLModelStatusEnum.PRODUCTION)
        self.assertEqual(restored.model_version, "1.0")

    def test_08_rbac_unauthorized_governance_rejection(self):
        """Test 16: Triage Nurse without admin/director permissions cannot deploy models (403)."""
        res = self.client.post(
            "/api/mlops/models/1.0/deploy",
            headers={"Authorization": f"Bearer {self.token_nurse}", "X-Hospital-Id": "HOSP_A"}
        )
        self.assertEqual(res.status_code, 403)

    def test_09_audit_trail_logging(self):
        """Test 18: Verifies MLOps lifecycle actions generate audit log events."""
        MLOpsService.record_ground_truth_outcome(
            db=self.db, hospital_id="HOSP_A", patient_id="PT-MLOPS-01", encounter_id="ENC-MLOPS-01",
            icu_admitted=True, outcome_time=datetime.datetime.utcnow() - datetime.timedelta(hours=1),
            staff_id="DIR_A"
        )
        audit = self.db.query(AuditLog).filter(
            AuditLog.action == "GROUND_TRUTH_OUTCOME_RECORDED"
        ).first()
        self.assertIsNotNone(audit)

    def test_10_drift_and_performance_monitoring(self):
        """Test 14 & 15: Computes real-time MLOps metrics, latency, and drift status."""
        metrics = MLOpsService.compute_monitoring_metrics(
            db=self.db,
            hospital_id="HOSP_A"
        )
        self.assertIn("total_predictions", metrics)
        self.assertIn("override_rate", metrics)
        self.assertIn("data_drift_status", metrics)
        self.assertEqual(metrics["data_drift_status"], "NORMAL")

if __name__ == "__main__":
    unittest.main()
