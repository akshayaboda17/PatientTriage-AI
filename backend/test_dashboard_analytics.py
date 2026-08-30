import datetime
import os
import sys

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from models import (
    AIRiskAssessment,
    AIRiskCategoryEnum,
    AlertSeverityEnum,
    AlertStatusEnum,
    Base,
    ClinicalAlert,
    EDEncounter,
    EncounterStatusEnum,
    Hospital,
    Patient,
    Staff,
    StaffRoleEnum,
    TriageAssessment,
)
from services.dashboard_service import (
    get_dashboard_analytics,
    get_dashboard_drilldown,
    get_dashboard_summary,
)
from services.rbac import get_staff_permissions


TEST_DB_FILE = os.path.abspath(os.path.join(os.path.dirname(__file__), "test_dashboard.db"))
TEST_DB_URL = f"sqlite:///{TEST_DB_FILE}"
engine_test = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine_test)


def reset_db():
    Base.metadata.drop_all(bind=engine_test)
    Base.metadata.create_all(bind=engine_test)
    db = TestingSessionLocal()

    db.add_all([
        Hospital(hospital_code="HOSP_A", name="Hospital Alpha", is_active=True),
        Hospital(hospital_code="HOSP_B", name="Hospital Beta", is_active=True),
    ])
    db.commit()

    db.add_all([
        Staff(hospital_id="HOSP_A", staff_id="DIR_A", name="Director Alpha", email="dir@alpha.org", role=StaffRoleEnum.CLINICAL_DIRECTOR, password_hash="pw", is_active=True),
        Staff(hospital_id="HOSP_A", staff_id="TECH_A", name="Tech Alpha", email="tech@alpha.org", role=StaffRoleEnum.EMERGENCY_TECHNICIAN, password_hash="pw", is_active=True),
        Staff(hospital_id="HOSP_B", staff_id="DIR_B", name="Director Beta", email="dir@beta.org", role=StaffRoleEnum.CLINICAL_DIRECTOR, password_hash="pw", is_active=True),
    ])
    db.commit()

    base = datetime.datetime(2026, 8, 30, 10, 0, 0)
    patient_rows = [
        ("PT-A-1", "Alex", "One"),
        ("PT-A-2", "Blair", "Two"),
        ("PT-A-3", "Casey", "Three"),
        ("PT-A-4", "Dana", "Four"),
        ("PT-A-5", "Ellis", "Five"),
        ("PT-A-6", "Finley", "Six"),
        ("PT-B-1", "Beta", "Patient"),
    ]
    for patient_id, first_name, last_name in patient_rows:
        hospital_id = "HOSP_B" if patient_id.startswith("PT-B") else "HOSP_A"
        db.add(Patient(
            hospital_id=hospital_id,
            patient_id=patient_id,
            first_name=first_name,
            last_name=last_name,
            age=40.0,
            gender="Female",
        ))
    db.commit()

    encounter_specs = [
        ("ENC-A-1", "PT-A-1", EncounterStatusEnum.WAITING, base),
        ("ENC-A-2", "PT-A-2", EncounterStatusEnum.WAITING, base + datetime.timedelta(minutes=1)),
        ("ENC-A-3", "PT-A-3", EncounterStatusEnum.WAITING, base + datetime.timedelta(minutes=2)),
        ("ENC-A-4", "PT-A-4", EncounterStatusEnum.IN_TRIAGE, base + datetime.timedelta(minutes=3)),
        ("ENC-A-5", "PT-A-5", EncounterStatusEnum.IN_TREATMENT, base + datetime.timedelta(minutes=4)),
        ("ENC-A-6", "PT-A-6", EncounterStatusEnum.DISCHARGED, base + datetime.timedelta(minutes=5)),
        ("ENC-B-1", "PT-B-1", EncounterStatusEnum.WAITING, base),
    ]
    for encounter_id, patient_id, enc_status, arrival in encounter_specs:
        db.add(EDEncounter(
            hospital_id="HOSP_B" if encounter_id.startswith("ENC-B") else "HOSP_A",
            patient_id=patient_id,
            encounter_id=encounter_id,
            arrival_time=arrival,
            chief_complaint="Synthetic test complaint",
            status=enc_status,
        ))
    db.commit()

    triage_specs = [
        ("ENC-A-3", "PT-A-3", 3, 10),
        ("ENC-A-5", "PT-A-5", 2, 15),
        ("ENC-A-6", "PT-A-6", 4, 5),
    ]
    for encounter_id, patient_id, level, minutes_after_arrival in triage_specs:
        enc = db.query(EDEncounter).filter(EDEncounter.encounter_id == encounter_id).first()
        db.add(TriageAssessment(
            hospital_id="HOSP_A",
            patient_id=patient_id,
            encounter_id=encounter_id,
            triage_level=level,
            acuity_category="Emergent" if level == 2 else "Urgent",
            assessed_by="NUR_A",
            assessed_at=enc.arrival_time + datetime.timedelta(minutes=minutes_after_arrival),
        ))
    db.commit()

    db.add_all([
        AIRiskAssessment(hospital_id="HOSP_A", patient_id="PT-A-3", encounter_id="ENC-A-3", risk_score=81, risk_category=AIRiskCategoryEnum.HIGH, predicted_triage_level=2, confidence_score=90, assessed_at=base + datetime.timedelta(minutes=20)),
        AIRiskAssessment(hospital_id="HOSP_A", patient_id="PT-A-5", encounter_id="ENC-A-5", risk_score=92, risk_category=AIRiskCategoryEnum.CRITICAL, predicted_triage_level=1, confidence_score=94, assessed_at=base + datetime.timedelta(minutes=21)),
        AIRiskAssessment(hospital_id="HOSP_B", patient_id="PT-B-1", encounter_id="ENC-B-1", risk_score=30, risk_category=AIRiskCategoryEnum.LOW, predicted_triage_level=4, confidence_score=70, assessed_at=base + datetime.timedelta(minutes=22)),
    ])
    db.commit()

    alert_rows = [
        ("ALERT-A-1", "ENC-A-3", "PT-A-3", AlertStatusEnum.UNACKNOWLEDGED),
        ("ALERT-A-2", "ENC-A-5", "PT-A-5", AlertStatusEnum.ACKNOWLEDGED),
        ("ALERT-A-3", "ENC-A-5", "PT-A-5", AlertStatusEnum.UNACKNOWLEDGED),
        ("ALERT-A-4", "ENC-A-6", "PT-A-6", AlertStatusEnum.RESOLVED),
        ("ALERT-B-1", "ENC-B-1", "PT-B-1", AlertStatusEnum.UNACKNOWLEDGED),
    ]
    for alert_id, encounter_id, patient_id, alert_status in alert_rows:
        db.add(ClinicalAlert(
            alert_id=alert_id,
            hospital_id="HOSP_B" if alert_id.startswith("ALERT-B") else "HOSP_A",
            patient_id=patient_id,
            encounter_id=encounter_id,
            severity=AlertSeverityEnum.HIGH,
            status=alert_status,
            detected_at=base + datetime.timedelta(minutes=30),
            acknowledged_at=base + datetime.timedelta(minutes=40) if alert_status == AlertStatusEnum.ACKNOWLEDGED else None,
            detection_rule_id="RULE-TEST",
            summary="Synthetic alert",
            evidence=[],
        ))
    db.commit()
    return db


def test_dashboard_counts_privacy_and_hospital_isolation():
    db = reset_db()
    staff_a = db.query(Staff).filter(Staff.staff_id == "DIR_A").first()
    staff_b = db.query(Staff).filter(Staff.staff_id == "DIR_B").first()

    data = get_dashboard_summary(db, staff_a)
    assert data["metrics"]["active_encounters"] == 5
    assert data["metrics"]["waiting_for_triage"] == 2
    assert data["metrics"]["triage_in_progress"] == 1
    assert data["metrics"]["waiting_for_physician"] == 1
    assert data["metrics"]["under_evaluation"] == 1
    assert data["metrics"]["high_risk_encounters"] == 2
    assert data["metrics"]["active_alerts"] == 3
    assert data["metrics"]["average_arrival_to_triage_minutes"] == 12.5

    response_text = str(data)
    assert "Alex" not in response_text
    assert "Blair" not in response_text
    assert "Beta" not in response_text

    assert get_dashboard_summary(db, staff_b)["metrics"]["active_encounters"] == 1
    db.close()


def test_dashboard_permission_mapping_restriction():
    assert "dashboard:view" in get_staff_permissions(StaffRoleEnum.CLINICAL_DIRECTOR)
    assert "dashboard:view" in get_staff_permissions(StaffRoleEnum.EMERGENCY_PHYSICIAN)
    assert "dashboard:view" not in get_staff_permissions(StaffRoleEnum.EMERGENCY_TECHNICIAN)


def test_analytics_wait_median_alerts_and_ai_zero_division():
    db = reset_db()
    staff = db.query(Staff).filter(Staff.staff_id == "DIR_A").first()
    data = get_dashboard_analytics(
        db,
        staff,
        range_key="custom",
        start_date="2026-08-30T00:00:00",
        end_date="2026-08-31T00:00:00",
    )

    assert data["volume"]["total_encounters"] == 6
    assert data["wait_times"]["sample_size"] == 3
    assert data["wait_times"]["average_arrival_to_triage_minutes"] == 10
    assert data["wait_times"]["median_arrival_to_triage_minutes"] == 10
    assert data["alerts"]["total"] == 4
    assert data["alerts"]["by_status"]["UNACKNOWLEDGED"] == 2
    assert data["alerts"]["by_status"]["ACKNOWLEDGED"] == 1
    assert data["alerts"]["average_acknowledgement_minutes"] == 10
    assert data["ai_usage"]["override_rate"] == 0
    db.close()


def test_authorized_drilldown_is_hospital_scoped():
    db = reset_db()
    staff = db.query(Staff).filter(Staff.staff_id == "DIR_A").first()
    data = get_dashboard_drilldown(db, staff, "high_risk_encounters")

    assert data["count"] == 2
    assert {item["encounter_id"] for item in data["items"]} == {"ENC-A-3", "ENC-A-5"}
    assert "ENC-B-1" not in {item["encounter_id"] for item in data["items"]}
    db.close()
