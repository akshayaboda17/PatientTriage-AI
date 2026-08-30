import os
import sys
import datetime
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Add current backend folder to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from models import (
    Base, Hospital, Staff, StaffRoleEnum, Patient, EDEncounter,
    EncounterStatusEnum, ClinicalObservation, AIRiskAssessment,
    AIRiskCategoryEnum, ClinicalAlert, AlertStatusEnum, AlertSeverityEnum,
    AuditLog
)
from services.deterioration_detector import DeteriorationDetector
from services.alert_service import AlertService
from services.rbac import get_staff_permissions
from main import app, get_db

# Setup dedicated test SQLite DB file
TEST_DB_FILE = os.path.abspath(os.path.join(os.path.dirname(__file__), "test_triage.db"))
TEST_DB_URL = f"sqlite:///{TEST_DB_FILE}"
engine_test = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine_test)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)

def setup_database():
    Base.metadata.drop_all(bind=engine_test)
    Base.metadata.create_all(bind=engine_test)
    db = TestingSessionLocal()

    # Seed test hospitals
    h1 = Hospital(hospital_code="HOSP_A", name="Hospital Alpha", is_active=True)
    h2 = Hospital(hospital_code="HOSP_B", name="Hospital Beta", is_active=True)
    db.add_all([h1, h2])
    db.commit()

    # Seed test staff
    s_doc_a = Staff(hospital_id="HOSP_A", staff_id="DOC_A", name="Dr. Alpha", email="doc_a@alpha.org", role=StaffRoleEnum.EMERGENCY_PHYSICIAN, password_hash="pw", is_active=True)
    s_nur_a = Staff(hospital_id="HOSP_A", staff_id="NUR_A", name="Nurse Alpha", email="nur_a@alpha.org", role=StaffRoleEnum.TRIAGE_NURSE, password_hash="pw", is_active=True)
    s_adm_a = Staff(hospital_id="HOSP_A", staff_id="ADM_A", name="Admin Alpha", email="adm_a@alpha.org", role=StaffRoleEnum.HOSPITAL_ADMIN, password_hash="pw", is_active=True)
    s_doc_b = Staff(hospital_id="HOSP_B", staff_id="DOC_B", name="Dr. Beta", email="doc_b@beta.org", role=StaffRoleEnum.EMERGENCY_PHYSICIAN, password_hash="pw", is_active=True)
    s_deact = Staff(hospital_id="HOSP_A", staff_id="DOC_DEACT", name="Dr. Deactivated", email="deact@alpha.org", role=StaffRoleEnum.EMERGENCY_PHYSICIAN, password_hash="pw", is_active=False)

    db.add_all([s_doc_a, s_nur_a, s_adm_a, s_doc_b, s_deact])
    db.commit()

    # Seed test patient and encounter
    p1 = Patient(hospital_id="HOSP_A", patient_id="PT-TEST-01", mrn="MRN-01", first_name="John", last_name="Doe", age=50.0, gender="Male")
    p2 = Patient(hospital_id="HOSP_B", patient_id="PT-TEST-02", mrn="MRN-02", first_name="Jane", last_name="Smith", age=30.0, gender="Female")
    db.add_all([p1, p2])
    db.commit()

    enc1 = EDEncounter(hospital_id="HOSP_A", patient_id="PT-TEST-01", encounter_id="ENC-TEST-01", chief_complaint="Chest tightness", status=EncounterStatusEnum.WAITING)
    enc2 = EDEncounter(hospital_id="HOSP_B", patient_id="PT-TEST-02", encounter_id="ENC-TEST-02", chief_complaint="Ankle sprain", status=EncounterStatusEnum.WAITING)
    db.add_all([enc1, enc2])
    db.commit()

    db.close()
    try:
        yield
    finally:
        pass

# ==========================================
# 1. Detection Engine Unit Tests
# ==========================================

def test_longitudinal_trend_detection():
    detector = DeteriorationDetector()
    t0 = datetime.datetime(2026, 8, 30, 10, 0)
    t1 = datetime.datetime(2026, 8, 30, 10, 20)
    t2 = datetime.datetime(2026, 8, 30, 10, 40)

    obs = [
        ClinicalObservation(timestamp=t0, hr=92, sbp=128, rr=18, spo2=97),
        ClinicalObservation(timestamp=t1, hr=108, sbp=122, rr=23, spo2=93),
        ClinicalObservation(timestamp=t2, hr=121, sbp=118, rr=29, spo2=89)
    ]

    result = detector.evaluate_longitudinal_trend(obs, patient_age=50.0)
    assert result["detected"] is True
    assert result["status"] == "POTENTIAL_DETERIORATION"
    assert result["rule_id"] == "RULE-DET-COMPOSITE-01"
    assert len(result["signals"]) == 3
    
    # Check signals
    spo2_sig = next(s for s in result["signals"] if s["feature"] == "spo2")
    assert spo2_sig["previous_value"] == 93
    assert spo2_sig["current_value"] == 89
    assert spo2_sig["change"] == -4

def test_no_deterioration_on_stable_vitals():
    detector = DeteriorationDetector()
    t0 = datetime.datetime(2026, 8, 30, 10, 0)
    t1 = datetime.datetime(2026, 8, 30, 10, 20)

    obs = [
        ClinicalObservation(timestamp=t0, hr=75, sbp=120, rr=16, spo2=98),
        ClinicalObservation(timestamp=t1, hr=76, sbp=122, rr=16, spo2=98)
    ]

    result = detector.evaluate_longitudinal_trend(obs, patient_age=50.0)
    assert result["detected"] is False
    assert result["status"] == "NO_CONCERNING_CHANGE"
    assert len(result["signals"]) == 0

def test_missing_insufficient_data_protection():
    detector = DeteriorationDetector()
    # Single observation only
    obs = [ClinicalObservation(timestamp=datetime.datetime.utcnow(), hr=80, sbp=120, rr=16, spo2=98)]
    
    result = detector.evaluate_longitudinal_trend(obs, patient_age=50.0)
    assert result["detected"] is False
    assert result["status"] == "ASSESSMENT_UNAVAILABLE"
    assert "Insufficient" in result["summary"]

# ==========================================
# 2. Alert Deduplication & Lifecycle Tests
# ==========================================

def test_alert_deduplication():
    db = TestingSessionLocal()
    detector = DeteriorationDetector()
    t0 = datetime.datetime(2026, 8, 30, 10, 0)
    t1 = datetime.datetime(2026, 8, 30, 10, 20)
    obs = [
        ClinicalObservation(timestamp=t0, hr=92, sbp=128, rr=18, spo2=97),
        ClinicalObservation(timestamp=t1, hr=121, sbp=118, rr=29, spo2=89)
    ]
    det_res = detector.evaluate_longitudinal_trend(obs)

    # First evaluation -> creates alert
    alert1, is_new1, msg1 = AlertService.create_or_update_alert(
        db, "HOSP_A", "PT-TEST-01", "ENC-TEST-01", det_res
    )
    assert is_new1 is True
    assert alert1.status == AlertStatusEnum.UNACKNOWLEDGED

    # Second evaluation with unchanged condition -> deduplicated, does NOT create alert 2
    alert2, is_new2, msg2 = AlertService.create_or_update_alert(
        db, "HOSP_A", "PT-TEST-01", "ENC-TEST-01", det_res
    )
    assert is_new2 is False
    assert alert2.alert_id == alert1.alert_id
    assert db.query(ClinicalAlert).count() == 1
    db.close()

def test_alert_lifecycle_transitions():
    db = TestingSessionLocal()
    doc_staff = db.query(Staff).filter(Staff.staff_id == "DOC_A").first()
    
    # Create Alert
    alert = ClinicalAlert(
        alert_id="ALERT-TEST-99",
        hospital_id="HOSP_A",
        patient_id="PT-TEST-01",
        encounter_id="ENC-TEST-01",
        severity=AlertSeverityEnum.HIGH,
        status=AlertStatusEnum.UNACKNOWLEDGED,
        detection_rule_id="RULE-DET-COMPOSITE-01",
        summary="Test deterioration alert",
        evidence=[]
    )
    db.add(alert)
    db.commit()

    # 1. Acknowledge
    ack_alert = AlertService.acknowledge_alert(db, "ALERT-TEST-99", doc_staff)
    assert ack_alert.status == AlertStatusEnum.ACKNOWLEDGED
    assert ack_alert.acknowledged_by_id == "DOC_A"
    assert ack_alert.acknowledged_at is not None

    # 2. Resolve
    res_alert = AlertService.resolve_alert(db, "ALERT-TEST-99", doc_staff, "Patient stabilized on O2 therapy")
    assert res_alert.status == AlertStatusEnum.RESOLVED
    assert res_alert.resolved_by_id == "DOC_A"
    assert res_alert.resolution_reason == "Patient stabilized on O2 therapy"

    # 3. Cannot re-resolve
    failed_re_resolve = False
    try:
        AlertService.resolve_alert(db, "ALERT-TEST-99", doc_staff, "Duplicate resolution attempt")
    except Exception:
        failed_re_resolve = True
    assert failed_re_resolve is True

    db.close()

# ==========================================
# 3. API & Security Authorization Tests
# ==========================================

def test_api_acknowledge_success():
    db = TestingSessionLocal()
    alert = ClinicalAlert(
        alert_id="ALERT-API-01",
        hospital_id="HOSP_A",
        patient_id="PT-TEST-01",
        encounter_id="ENC-TEST-01",
        severity=AlertSeverityEnum.HIGH,
        status=AlertStatusEnum.UNACKNOWLEDGED,
        detection_rule_id="RULE-DET-COMPOSITE-01",
        summary="API test alert",
        evidence=[]
    )
    db.add(alert)
    db.commit()
    db.close()

    headers = {"X-Staff-Id": "DOC_A", "X-Hospital-Id": "HOSP_A"}
    res = client.post("/api/alerts/ALERT-API-01/acknowledge", headers=headers)
    assert res.status_code == 200
    assert res.json()["alert"]["status"] == "ACKNOWLEDGED"

def test_api_unauthorized_role_rejection():
    db = TestingSessionLocal()
    alert = db.query(ClinicalAlert).filter(ClinicalAlert.alert_id == "ALERT-API-01").first()
    if not alert:
        alert = ClinicalAlert(
            alert_id="ALERT-API-01",
            hospital_id="HOSP_A",
            patient_id="PT-TEST-01",
            encounter_id="ENC-TEST-01",
            severity=AlertSeverityEnum.HIGH,
            status=AlertStatusEnum.UNACKNOWLEDGED,
            detection_rule_id="RULE-DET-COMPOSITE-01",
            summary="API test alert",
            evidence=[]
        )
        db.add(alert)
        db.commit()
    db.close()

    # Admin lacks alert:acknowledge permission
    headers = {"X-Staff-Id": "ADM_A", "X-Hospital-Id": "HOSP_A"}
    res = client.post("/api/alerts/ALERT-API-01/acknowledge", headers=headers)
    assert res.status_code == 403
    assert "Access denied" in res.json()["detail"]

def test_api_cross_hospital_isolation_rejection():
    db = TestingSessionLocal()
    alert = db.query(ClinicalAlert).filter(ClinicalAlert.alert_id == "ALERT-API-01").first()
    if not alert:
        alert = ClinicalAlert(
            alert_id="ALERT-API-01",
            hospital_id="HOSP_A",
            patient_id="PT-TEST-01",
            encounter_id="ENC-TEST-01",
            severity=AlertSeverityEnum.HIGH,
            status=AlertStatusEnum.UNACKNOWLEDGED,
            detection_rule_id="RULE-DET-COMPOSITE-01",
            summary="API test alert",
            evidence=[]
        )
        db.add(alert)
        db.commit()
    db.close()

    # DOC_B from HOSP_B attempts to access HOSP_A alert
    headers = {"X-Staff-Id": "DOC_B", "X-Hospital-Id": "HOSP_B"}
    res = client.post("/api/alerts/ALERT-API-01/acknowledge", headers=headers)
    assert res.status_code == 403
    assert "Cross-hospital" in res.json()["detail"]

def test_api_deactivated_staff_rejection():
    headers = {"X-Staff-Id": "DOC_DEACT", "X-Hospital-Id": "HOSP_A"}
    res = client.get("/api/alerts", headers=headers)
    assert res.status_code == 403
    assert "deactivated" in res.json()["detail"]

# ==========================================
# 4. Task 7 Independence Test
# ==========================================

def test_task7_ai_high_risk_does_not_force_deterioration_without_trend():
    detector = DeteriorationDetector()
    t0 = datetime.datetime(2026, 8, 30, 10, 0)
    t1 = datetime.datetime(2026, 8, 30, 10, 20)

    # High risk baseline (e.g. chronic high HR / elderly), but completely STABLE over time
    obs = [
        ClinicalObservation(timestamp=t0, hr=102, sbp=130, rr=18, spo2=95),
        ClinicalObservation(timestamp=t1, hr=101, sbp=132, rr=18, spo2=95)
    ]

    result = detector.evaluate_longitudinal_trend(obs, patient_age=78.0)
    # Must NOT detect deterioration merely because patient is high risk
    assert result["detected"] is False
    assert result["status"] == "NO_CONCERNING_CHANGE"
