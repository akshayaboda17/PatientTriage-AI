import datetime
import uuid
import sys
import os

sys.path.append(os.path.dirname(__file__))

from models import (
    SessionLocal, Hospital, Staff, StaffRoleEnum, Patient,
    EDEncounter, EncounterStatusEnum, TriageAssessment,
    ClinicalObservation, AIRiskAssessment, AIRiskCategoryEnum,
    AIExplanation, ClinicalAlert, AlertSeverityEnum, AlertStatusEnum,
    DetectionSourceEnum, PhysicianAssessment, AIAgreementEnum, ClinicalDecisionEnum
)

def seed_hospitals_and_cohorts():
    db = SessionLocal()
    now = datetime.datetime.utcnow()

    # 1. Hospitals
    hospitals = [
        {"code": "DEMO001", "name": "Demo General Hospital", "address": "100 Medical Center Way"},
        {"code": "CITY001", "name": "CityCare Center", "address": "500 Healthcare Blvd"},
        {"code": "METRO002", "name": "Metro Health Medical Center", "address": "200 Metro Plaza"}
    ]
    for h in hospitals:
        existing = db.query(Hospital).filter(Hospital.hospital_code == h["code"]).first()
        if not existing:
            db.add(Hospital(hospital_code=h["code"], name=h["name"], address=h["address"], is_active=True))
    db.commit()

    # 2. Staff Accounts
    staff_accounts = [
        {"staff_id": "ADMIN001", "name": "Sarah Connor, MHA", "email": "admin@demohospital.org", "role": StaffRoleEnum.HOSPITAL_ADMIN, "hosp": "DEMO001"},
        {"staff_id": "DIR001", "name": "Dr. James Wilson, MD", "email": "director@demohospital.org", "role": StaffRoleEnum.CLINICAL_DIRECTOR, "hosp": "DEMO001"},
        {"staff_id": "DOC001", "name": "Dr. Gregory House, MD", "email": "doc001@demohospital.org", "role": StaffRoleEnum.EMERGENCY_PHYSICIAN, "hosp": "DEMO001"},
        {"staff_id": "NUR001", "name": "Jackie Peyton, RN", "email": "nur001@demohospital.org", "role": StaffRoleEnum.TRIAGE_NURSE, "hosp": "DEMO001"},
        {"staff_id": "TECH001", "name": "John Carter, EMT-P", "email": "tech001@demohospital.org", "role": StaffRoleEnum.EMERGENCY_TECHNICIAN, "hosp": "DEMO001"},
        {"staff_id": "DOC002_METRO", "name": "Dr. Allison Cameron, MD", "email": "doc002@metrohealth.org", "role": StaffRoleEnum.EMERGENCY_PHYSICIAN, "hosp": "METRO002"},
        # CityCare Center Staff
        {"staff_id": "STF-CITY-ADMIN", "name": "Akshaya", "email": "akshaya@citycare.org", "role": StaffRoleEnum.HOSPITAL_ADMIN, "hosp": "CITY001"},
        {"staff_id": "DOC-CITY-01", "name": "Dr. Akshaya, MD", "email": "dr.akshaya@citycare.org", "role": StaffRoleEnum.EMERGENCY_PHYSICIAN, "hosp": "CITY001"},
        {"staff_id": "NUR-CITY-01", "name": "Priya Sharma, RN", "email": "nurse.priya@citycare.org", "role": StaffRoleEnum.TRIAGE_NURSE, "hosp": "CITY001"}
    ]
    for s in staff_accounts:
        existing = db.query(Staff).filter(Staff.staff_id == s["staff_id"]).first()
        if not existing:
            db.add(Staff(
                hospital_id=s["hosp"],
                staff_id=s["staff_id"],
                name=s["name"],
                email=s["email"],
                role=s["role"],
                password_hash="hashed_pw_demo",
                is_active=True
            ))
    db.commit()

    # 3. Seed Cohort for CITY001
    city_patients = [
        {
            "id": "PT-CITY-BD380F", "enc_id": "ENC-CITY-BD380F", "name": ("Mohammed", "Khan"),
            "age": 71.0, "gender": "Male", "mrn": "MRN-CITY-001", "arrival": "Ambulance",
            "complaint": "Worsening shortness of breath and cough for three days, significantly worse today",
            "history": "COPD, Hypertension, Smoking (30 pack-years)", "allergies": "Penicillin",
            "triage_lvl": 1, "acuity": "Resuscitation", "pain": 8, "wait_mins": 0,
            "status": EncounterStatusEnum.IN_TREATMENT, "bed": "BED-07",
            "vitals": [{"hr": 112, "sbp": 148, "dbp": 88, "rr": 28, "spo2": 88, "temp": 37.8, "gcs": 15, "dt": 40}],
            "ai_risk": {"score": 94.0, "prob": 0.952, "cat": AIRiskCategoryEnum.HIGH, "lvl": 1, "conf": 0.92},
            "alerts": []
        },
        {
            "id": "PT-CITY-5E31DA", "enc_id": "ENC-CITY-5E31DA", "name": ("Rahul", "Sharma"),
            "age": 54.0, "gender": "Male", "mrn": "MRN-CITY-002", "arrival": "Ambulance",
            "complaint": "Sudden chest pressure with shortness of breath and sweating for 30 minutes.",
            "history": "Hyperlipidemia, Family history of premature CAD", "allergies": "Aspirin",
            "triage_lvl": 2, "acuity": "Emergent", "pain": 7, "wait_mins": 0,
            "status": EncounterStatusEnum.IN_TREATMENT, "bed": "BED-01",
            "vitals": [{"hr": 98, "sbp": 142, "dbp": 92, "rr": 20, "spo2": 96, "temp": 36.9, "gcs": 15, "dt": 35}],
            "ai_risk": {"score": 86.0, "prob": 0.884, "cat": AIRiskCategoryEnum.HIGH, "lvl": 2, "conf": 0.85},
            "alerts": []
        },
        {
            "id": "PT-CITY-EADC4F", "enc_id": "ENC-CITY-EBFAF0", "name": ("Vikram", "Singh"),
            "age": 48.0, "gender": "Male", "mrn": "MRN-CITY-003", "arrival": "Walk-in",
            "complaint": "Severe acute headache with visual changes and photophobia for 2 hours",
            "history": "Migraines, Hypertension", "allergies": "None Reported",
            "triage_lvl": 2, "acuity": "Emergent", "pain": 8, "wait_mins": 14,
            "status": EncounterStatusEnum.WAITING, "bed": None,
            "vitals": [{"hr": 82, "sbp": 158, "dbp": 96, "rr": 16, "spo2": 99, "temp": 37.1, "gcs": 15, "dt": 14}],
            "ai_risk": {"score": 68.0, "prob": 0.690, "cat": AIRiskCategoryEnum.HIGH, "lvl": 2, "conf": 0.76},
            "alerts": []
        },
        {
            "id": "PT-CITY-004", "enc_id": "ENC-CITY-004", "name": ("Ananya", "Patel"),
            "age": 8.0, "gender": "Female", "mrn": "MRN-CITY-004", "arrival": "Walk-in",
            "complaint": "Pediatric acute wheezing, subcostal retractions, albuterol inhaler ineffective",
            "history": "Childhood Asthma", "allergies": "Peanuts",
            "triage_lvl": 2, "acuity": "Emergent", "pain": 3, "wait_mins": 10,
            "status": EncounterStatusEnum.WAITING, "bed": None,
            "vitals": [{"hr": 134, "sbp": 104, "dbp": 62, "rr": 32, "spo2": 93, "temp": 37.4, "gcs": 15, "dt": 10}],
            "ai_risk": {"score": 70.0, "prob": 0.720, "cat": AIRiskCategoryEnum.HIGH, "lvl": 2, "conf": 0.62},
            "alerts": []
        },
        {
            "id": "PT-CITY-005", "enc_id": "ENC-CITY-005", "name": ("Dev", "Kapoor"),
            "age": 31.0, "gender": "Male", "mrn": "MRN-CITY-005", "arrival": "Walk-in",
            "complaint": "Mild right thumb laceration from kitchen knife, bleeding controlled",
            "history": "None", "allergies": "No known drug allergies",
            "triage_lvl": 5, "acuity": "Non-Urgent", "pain": 2, "wait_mins": 25,
            "status": EncounterStatusEnum.WAITING, "bed": None,
            "vitals": [{"hr": 68, "sbp": 118, "dbp": 74, "rr": 14, "spo2": 99, "temp": 36.8, "gcs": 15, "dt": 25}],
            "ai_risk": {"score": 7.5, "prob": 0.038, "cat": AIRiskCategoryEnum.LOW, "lvl": 5, "conf": 0.95},
            "alerts": []
        },
        {
            "id": "PT-CITY-006", "enc_id": "ENC-CITY-006", "name": ("Suresh", "Menon"),
            "age": 62.0, "gender": "Male", "mrn": "MRN-CITY-006", "arrival": "Walk-in",
            "complaint": "Right lower quadrant abdominal pain with rebound tenderness",
            "history": "GERD", "allergies": "Sulfa",
            "triage_lvl": 3, "acuity": "Urgent", "pain": 6, "wait_mins": 35,
            "status": EncounterStatusEnum.WAITING, "bed": None,
            "vitals": [{"hr": 92, "sbp": 134, "dbp": 82, "rr": 18, "spo2": 98, "temp": 38.0, "gcs": 15, "dt": 35}],
            "ai_risk": {"score": 52.0, "prob": 0.510, "cat": AIRiskCategoryEnum.MODERATE, "lvl": 3, "conf": 0.74},
            "alerts": []
        }
    ]

    for arc in city_patients:
        p = db.query(Patient).filter(Patient.patient_id == arc["id"]).first()
        if not p:
            p = Patient(
                hospital_id="CITY001",
                patient_id=arc["id"],
                mrn=arc["mrn"],
                first_name=arc["name"][0],
                last_name=arc["name"][1],
                age=arc["age"],
                gender=arc["gender"],
                arrival_mode=arc["arrival"],
                medical_history=arc["history"],
                allergies=arc["allergies"],
                created_by="NUR-CITY-01"
            )
            db.add(p)
            db.commit()

        enc = db.query(EDEncounter).filter(EDEncounter.encounter_id == arc["enc_id"]).first()
        if not enc:
            arrival_time = now - datetime.timedelta(minutes=arc["wait_mins"] if arc["status"] == EncounterStatusEnum.WAITING else 60)
            enc = EDEncounter(
                hospital_id="CITY001",
                patient_id=arc["id"],
                encounter_id=arc["enc_id"],
                arrival_time=arrival_time,
                arrival_mode=arc["arrival"],
                chief_complaint=arc["complaint"],
                status=arc["status"],
                bed_number=arc["bed"]
            )
            db.add(enc)
            db.commit()

            tr = TriageAssessment(
                hospital_id="CITY001",
                patient_id=arc["id"],
                encounter_id=arc["enc_id"],
                triage_level=arc["triage_lvl"],
                acuity_category=arc["acuity"],
                chief_complaint=arc["complaint"],
                pain_score=arc["pain"],
                mobility="Stretcher" if arc["arrival"] == "Ambulance" else "Ambulatory",
                assessed_by="NUR-CITY-01"
            )
            db.add(tr)
            db.commit()

            for idx, obs_data in enumerate(arc["vitals"]):
                obs_time = now - datetime.timedelta(minutes=obs_data.get("dt", 10))
                obs = ClinicalObservation(
                    hospital_id="CITY001",
                    patient_id=arc["id"],
                    encounter_id=arc["enc_id"],
                    hr=obs_data["hr"],
                    sbp=obs_data["sbp"],
                    dbp=obs_data["dbp"],
                    rr=obs_data["rr"],
                    spo2=obs_data["spo2"],
                    temp=obs_data["temp"],
                    gcs=obs_data.get("gcs", 15),
                    pain_score=arc["pain"],
                    timestamp=obs_time,
                    recorded_by="NUR-CITY-01",
                    notes=f"Clinical observation #{idx+1}"
                )
                db.add(obs)
                db.commit()

            ai_data = arc["ai_risk"]
            ai_risk_obj = AIRiskAssessment(
                assessment_id=f"AI-{arc['enc_id']}",
                hospital_id="CITY001",
                patient_id=arc["id"],
                encounter_id=arc["enc_id"],
                risk_score=ai_data["score"],
                risk_probability=ai_data["prob"],
                risk_category=ai_data["cat"],
                predicted_triage_level=ai_data["lvl"],
                confidence_score=ai_data["conf"],
                model_name="PatientTriage Clinical Decompensation Classifier",
                model_version="1.0",
                assessed_at=now - datetime.timedelta(minutes=20)
            )
            db.add(ai_risk_obj)
            db.commit()

            shap_obj = AIExplanation(
                hospital_id="CITY001",
                patient_id=arc["id"],
                encounter_id=arc["enc_id"],
                risk_assessment_id=ai_risk_obj.id,
                explanation_method="SHAP (Tree/Linear Attribution)",
                top_features=[
                    {"feature": "Heart Rate", "importance": 0.35 if ai_data["score"] > 50 else -0.20, "impact": "elevating" if ai_data["score"] > 50 else "reducing", "value": f"{arc['vitals'][-1]['hr']} bpm"},
                    {"feature": "SpO2 Oxygen Saturation", "importance": 0.30 if arc['vitals'][-1]['spo2'] < 95 else -0.25, "impact": "elevating" if arc['vitals'][-1]['spo2'] < 95 else "reducing", "value": f"{arc['vitals'][-1]['spo2']}%"},
                    {"feature": "Systolic Blood Pressure", "importance": 0.20, "impact": "elevating", "value": f"{arc['vitals'][-1]['sbp']} mmHg"}
                ],
                summary=f"Model estimated {ai_data['cat'].value} risk based on physiological trajectory."
            )
            db.add(shap_obj)
            db.commit()

    print("Seeding complete. CITY001 Encounters:", db.query(EDEncounter).filter(EDEncounter.hospital_id == "CITY001").count())
    db.close()

if __name__ == "__main__":
    seed_hospitals_and_cohorts()
