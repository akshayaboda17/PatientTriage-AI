import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from models import (
    Hospital, Staff, StaffRoleEnum, Patient,
    EDEncounter, EncounterStatusEnum, TriageAssessment,
    ClinicalObservation, AIRiskAssessment, AIRiskCategoryEnum,
    AIExplanation
)
from services.alert_service import AlertService
from services.deterioration_detector import DeteriorationDetector
from services.rbac import get_db

router = APIRouter(tags=["Demo Data Seeding"])
deterioration_detector = DeteriorationDetector()

@router.post("/api/demo/seed")
def seed_demo_data(db: Session = Depends(get_db)):
    """
    Seeds rich synthetic demo data for Demo General Hospital (DEMO001) & Metro Health (METRO002),
    including realistic patients, longitudinal observation trajectories, and deterioration scenarios.
    """
    # 1. Hospitals
    hosp1 = db.query(Hospital).filter(Hospital.hospital_code == "DEMO001").first()
    if not hosp1:
        hosp1 = Hospital(hospital_code="DEMO001", name="Demo General Hospital", address="100 Medical Center Way, Suite 100")
        db.add(hosp1)
    
    hosp2 = db.query(Hospital).filter(Hospital.hospital_code == "METRO002").first()
    if not hosp2:
        hosp2 = Hospital(hospital_code="METRO002", name="Metro Health Medical Center", address="500 University Blvd")
        db.add(hosp2)
    db.commit()

    # 2. Staff
    demo_staff = [
        {"staff_id": "ADMIN001", "name": "Sarah Connor, MHA", "email": "admin@demohospital.org", "role": StaffRoleEnum.HOSPITAL_ADMIN, "hosp": "DEMO001"},
        {"staff_id": "DIR001", "name": "Dr. James Wilson, MD", "email": "director@demohospital.org", "role": StaffRoleEnum.CLINICAL_DIRECTOR, "hosp": "DEMO001"},
        {"staff_id": "DOC001", "name": "Dr. Gregory House, MD", "email": "doc001@demohospital.org", "role": StaffRoleEnum.EMERGENCY_PHYSICIAN, "hosp": "DEMO001"},
        {"staff_id": "NUR001", "name": "Nurse Jackie Peyton, RN", "email": "nur001@demohospital.org", "role": StaffRoleEnum.TRIAGE_NURSE, "hosp": "DEMO001"},
        {"staff_id": "TECH001", "name": "John Carter, EMT-P", "email": "tech001@demohospital.org", "role": StaffRoleEnum.EMERGENCY_TECHNICIAN, "hosp": "DEMO001"},
        {"staff_id": "DOC002_METRO", "name": "Dr. Allison Cameron, MD", "email": "doc002@metrohealth.org", "role": StaffRoleEnum.EMERGENCY_PHYSICIAN, "hosp": "METRO002"}
    ]
    for s in demo_staff:
        existing = db.query(Staff).filter(Staff.staff_id == s["staff_id"]).first()
        if not existing:
            staff_obj = Staff(
                hospital_id=s["hosp"],
                staff_id=s["staff_id"],
                name=s["name"],
                email=s["email"],
                role=s["role"],
                password_hash="hashed_pw_demo"
            )
            db.add(staff_obj)
    db.commit()

    # 3. Synthetic Patients and Longitudinal Scenarios
    # Patient 1: PT-DEMO-001 (Classic Deterioration: Worsening Asthma / Hypoxia)
    p1 = db.query(Patient).filter(Patient.patient_id == "PT-DEMO-001").first()
    if not p1:
        p1 = Patient(
            hospital_id="DEMO001",
            patient_id="PT-DEMO-001",
            mrn="MRN-88201",
            first_name="Marcus",
            last_name="Vance",
            age=54.0,
            gender="Male",
            arrival_mode="Walk-in",
            created_by="NUR001"
        )
        db.add(p1)
        db.commit()

        # Encounter
        enc1 = EDEncounter(
            hospital_id="DEMO001",
            patient_id="PT-DEMO-001",
            encounter_id="ENC-DEMO-001",
            arrival_time=datetime.datetime.utcnow() - datetime.timedelta(minutes=65),
            arrival_mode="Walk-in",
            chief_complaint="Shortness of breath, persistent dry cough",
            status=EncounterStatusEnum.WAITING,
            bed_number="ED-Wait-04"
        )
        db.add(enc1)
        db.commit()

        # Triage Assessment (Task 5)
        tr1 = TriageAssessment(
            hospital_id="DEMO001",
            patient_id="PT-DEMO-001",
            encounter_id="ENC-DEMO-001",
            triage_level=3,
            acuity_category="Urgent",
            chief_complaint="Shortness of breath, persistent dry cough",
            pain_score=3,
            mobility="Ambulatory",
            assessed_by="NUR001",
            assessed_at=datetime.datetime.utcnow() - datetime.timedelta(minutes=60),
            notes="History of moderate persistent asthma. SpO2 on room air 97% initially."
        )
        db.add(tr1)

        # Historical Observations (Task 6)
        t0 = datetime.datetime.utcnow() - datetime.timedelta(minutes=60)
        t1 = datetime.datetime.utcnow() - datetime.timedelta(minutes=35)
        t2 = datetime.datetime.utcnow() - datetime.timedelta(minutes=10)

        obs1 = ClinicalObservation(
            hospital_id="DEMO001", patient_id="PT-DEMO-001", encounter_id="ENC-DEMO-001",
            timestamp=t0, hr=92, sbp=128, dbp=82, rr=18, spo2=97, temp=37.1, gcs=15, recorded_by="NUR001"
        )
        obs2 = ClinicalObservation(
            hospital_id="DEMO001", patient_id="PT-DEMO-001", encounter_id="ENC-DEMO-001",
            timestamp=t1, hr=108, sbp=122, dbp=78, rr=23, spo2=93, temp=37.3, gcs=15, recorded_by="NUR001"
        )
        obs3 = ClinicalObservation(
            hospital_id="DEMO001", patient_id="PT-DEMO-001", encounter_id="ENC-DEMO-001",
            timestamp=t2, hr=121, sbp=118, dbp=74, rr=29, spo2=89, temp=37.4, gcs=15, recorded_by="NUR001"
        )
        db.add_all([obs1, obs2, obs3])
        db.commit()

        # AI Risk Assessment (Task 7)
        risk1 = AIRiskAssessment(
            hospital_id="DEMO001", patient_id="PT-DEMO-001", encounter_id="ENC-DEMO-001",
            risk_score=78.5, risk_category=AIRiskCategoryEnum.HIGH, predicted_triage_level=2,
            confidence_score=84.0, shock_index=1.02, qsofa=1,
            assessed_at=datetime.datetime.utcnow() - datetime.timedelta(minutes=30)
        )
        db.add(risk1)
        db.commit()

        # Explainable AI (Task 8)
        exp1 = AIExplanation(
            hospital_id="DEMO001", patient_id="PT-DEMO-001", encounter_id="ENC-DEMO-001",
            risk_assessment_id=risk1.id,
            top_features=[
                {"feature": "Oxygen Saturation", "impact": "+35%", "direction": "elevating risk", "value": "89%"},
                {"feature": "Respiratory Rate", "impact": "+28%", "direction": "elevating risk", "value": "29/min"},
                {"feature": "Heart Rate", "impact": "+18%", "direction": "elevating risk", "value": "121 bpm"}
            ],
            summary="High acute risk driven primarily by hypoxic decompensation and compensatory tachypnea."
        )
        db.add(exp1)
        db.commit()

        # Trigger Deterioration Detection & Create Task 9 Clinical Alert
        det_result = deterioration_detector.evaluate_longitudinal_trend([obs1, obs2, obs3], patient_age=54.0)
        if det_result.get("detected"):
            AlertService.create_or_update_alert(
                db=db, hospital_id="DEMO001", patient_id="PT-DEMO-001", encounter_id="ENC-DEMO-001", detection_result=det_result
            )

    # Patient 2: PT-DEMO-002 (Stable Geriatric Patient - High Risk Baseline, No Deterioration)
    p2 = db.query(Patient).filter(Patient.patient_id == "PT-DEMO-002").first()
    if not p2:
        p2 = Patient(
            hospital_id="DEMO001",
            patient_id="PT-DEMO-002",
            mrn="MRN-88202",
            first_name="Eleanor",
            last_name="Rigby",
            age=76.0,
            gender="Female",
            arrival_mode="Ambulance",
            created_by="NUR001"
        )
        db.add(p2)
        db.commit()

        enc2 = EDEncounter(
            hospital_id="DEMO001", patient_id="PT-DEMO-002", encounter_id="ENC-DEMO-002",
            arrival_time=datetime.datetime.utcnow() - datetime.timedelta(minutes=45),
            arrival_mode="Ambulance", chief_complaint="Fall with right hip contusion, baseline hypertension",
            status=EncounterStatusEnum.IN_TREATMENT, bed_number="Bed-03"
        )
        db.add(enc2)
        db.commit()

        tr2 = TriageAssessment(
            hospital_id="DEMO001", patient_id="PT-DEMO-002", encounter_id="ENC-DEMO-002",
            triage_level=3, acuity_category="Urgent", chief_complaint="Mechanical fall, hip pain",
            pain_score=6, mobility="Stretcher", assessed_by="NUR001"
        )
        db.add(tr2)

        # Stable vitals sequence
        obs_a = ClinicalObservation(
            hospital_id="DEMO001", patient_id="PT-DEMO-002", encounter_id="ENC-DEMO-002",
            timestamp=datetime.datetime.utcnow() - datetime.timedelta(minutes=40),
            hr=78, sbp=142, dbp=88, rr=16, spo2=98, temp=36.8, gcs=15, recorded_by="NUR001"
        )
        obs_b = ClinicalObservation(
            hospital_id="DEMO001", patient_id="PT-DEMO-002", encounter_id="ENC-DEMO-002",
            timestamp=datetime.datetime.utcnow() - datetime.timedelta(minutes=15),
            hr=76, sbp=140, dbp=86, rr=16, spo2=98, temp=36.8, gcs=15, recorded_by="NUR001"
        )
        db.add_all([obs_a, obs_b])
        db.commit()

        risk2 = AIRiskAssessment(
            hospital_id="DEMO001", patient_id="PT-DEMO-002", encounter_id="ENC-DEMO-002",
            risk_score=68.0, risk_category=AIRiskCategoryEnum.HIGH, predicted_triage_level=2,
            confidence_score=75.0, shock_index=0.55, qsofa=0
        )
        db.add(risk2)
        db.commit()

    # Patient 3: PT-DEMO-003 (Moderate Risk + Sepsis / Shock Progression Deterioration)
    p3 = db.query(Patient).filter(Patient.patient_id == "PT-DEMO-003").first()
    if not p3:
        p3 = Patient(
            hospital_id="DEMO001",
            patient_id="PT-DEMO-003",
            mrn="MRN-88203",
            first_name="David",
            last_name="Chen",
            age=42.0,
            gender="Male",
            arrival_mode="Walk-in",
            created_by="NUR001"
        )
        db.add(p3)
        db.commit()

        enc3 = EDEncounter(
            hospital_id="DEMO001", patient_id="PT-DEMO-003", encounter_id="ENC-DEMO-003",
            arrival_time=datetime.datetime.utcnow() - datetime.timedelta(minutes=80),
            arrival_mode="Walk-in", chief_complaint="High fever, chills, urinary discomfort",
            status=EncounterStatusEnum.WAITING, bed_number="ED-Wait-09"
        )
        db.add(enc3)
        db.commit()

        tr3 = TriageAssessment(
            hospital_id="DEMO001", patient_id="PT-DEMO-003", encounter_id="ENC-DEMO-003",
            triage_level=3, acuity_category="Urgent", chief_complaint="Fever and dysuria",
            pain_score=4, mobility="Ambulatory", assessed_by="NUR001"
        )
        db.add(tr3)

        obs_c1 = ClinicalObservation(
            hospital_id="DEMO001", patient_id="PT-DEMO-003", encounter_id="ENC-DEMO-003",
            timestamp=datetime.datetime.utcnow() - datetime.timedelta(minutes=75),
            hr=88, sbp=124, dbp=78, rr=18, spo2=98, temp=38.6, gcs=15, recorded_by="NUR001"
        )
        obs_c2 = ClinicalObservation(
            hospital_id="DEMO001", patient_id="PT-DEMO-003", encounter_id="ENC-DEMO-003",
            timestamp=datetime.datetime.utcnow() - datetime.timedelta(minutes=15),
            hr=118, sbp=96, dbp=58, rr=24, spo2=96, temp=39.2, gcs=15, recorded_by="NUR001"
        )
        db.add_all([obs_c1, obs_c2])
        db.commit()

        det_result3 = deterioration_detector.evaluate_longitudinal_trend([obs_c1, obs_c2], patient_age=42.0)
        if det_result3.get("detected"):
            AlertService.create_or_update_alert(
                db=db, hospital_id="DEMO001", patient_id="PT-DEMO-003", encounter_id="ENC-DEMO-003", detection_result=det_result3
            )

    return {
        "status": "success",
        "message": "Synthetic demo data successfully initialized for DEMO001 & METRO002."
    }
