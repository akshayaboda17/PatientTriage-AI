"""
Synthetic 20-Patient Clinical Demonstration Seeder for PatientTriage.ai Round 2.
Generates a clinically diverse, realistic, and fully fictional cohort of 20 patient cases
demonstrating all Round 2 archetypes (Pediatric, Geriatric, Ambiguous, Zero-History,
Low-Confidence, Deterioration, Wait-Threshold Breaches, Surge-Mode, and Physician Overrides).
"""
import datetime
import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from models import (
    Hospital, Staff, StaffRoleEnum, Patient,
    EDEncounter, EncounterStatusEnum, TriageAssessment,
    ClinicalObservation, AIRiskAssessment, AIRiskCategoryEnum,
    AIExplanation, ClinicalAlert, AlertSeverityEnum, AlertStatusEnum,
    DetectionSourceEnum, PhysicianAssessment, AIAgreementEnum, ClinicalDecisionEnum
)
from services.rbac import get_db

router = APIRouter(tags=["Demo Data Seeding"])


@router.post("/api/demo/seed")
def seed_demo_data(db: Session = Depends(get_db)):
    """
    Seeds 20 realistic synthetic patient cases demonstrating all Round 2 Problem Track requirements.
    All data is completely synthetic with zero identifiable personal information.
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
        {"staff_id": "NUR001", "name": "Jackie Peyton, RN", "email": "nur001@demohospital.org", "role": StaffRoleEnum.TRIAGE_NURSE, "hosp": "DEMO001"},
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

    # 3. Complete 20 Synthetic Patient Archetypes
    # Clearly fictional names, realistic vitals, calibrated risk, and clinical scenarios
    archetypes = [
        # 1. High-risk adult (Acute STEMI / Sepsis)
        {
            "id": "PT-DEMO-001", "enc_id": "ENC-DEMO-001", "name": ("Marcus", "Vance"),
            "age": 54.0, "gender": "Male", "mrn": "MRN-88201", "arrival": "Ambulance",
            "complaint": "Acute retrosternal crushing chest pain, diaphoresis, radiating to left jaw",
            "history": "Hypertension, Hyperlipidemia, Previous PCI 2021", "allergies": "Aspirin",
            "triage_lvl": 1, "acuity": "Resuscitation", "pain": 9, "wait_mins": 8,
            "vitals": [{"hr": 118, "sbp": 88, "dbp": 56, "rr": 26, "spo2": 91, "temp": 37.1, "gcs": 15, "dt": 8}],
            "ai_risk": {"score": 92.5, "prob": 0.942, "cat": AIRiskCategoryEnum.HIGH, "lvl": 1, "conf": 0.88},
            "alerts": []
        },
        # 2. Low-risk adult (Mild ankle sprain)
        {
            "id": "PT-DEMO-002", "enc_id": "ENC-DEMO-002", "name": ("Emily", "Stone"),
            "age": 27.0, "gender": "Female", "mrn": "MRN-88202", "arrival": "Walk-in",
            "complaint": "Right lateral ankle inversion injury while jogging, able to bear partial weight",
            "history": "None reported", "allergies": "No known drug allergies",
            "triage_lvl": 5, "acuity": "Non-Urgent", "pain": 3, "wait_mins": 25,
            "vitals": [{"hr": 68, "sbp": 118, "dbp": 74, "rr": 14, "spo2": 99, "temp": 36.8, "gcs": 15, "dt": 25}],
            "ai_risk": {"score": 8.4, "prob": 0.041, "cat": AIRiskCategoryEnum.LOW, "lvl": 5, "conf": 0.95},
            "alerts": []
        },
        # 3. Moderate-risk adult (Acute abdominal pain)
        {
            "id": "PT-DEMO-003", "enc_id": "ENC-DEMO-003", "name": ("Robert", "Kowalski"),
            "age": 42.0, "gender": "Male", "mrn": "MRN-88203", "arrival": "Walk-in",
            "complaint": "Right lower quadrant abdominal pain x 12 hours, nausea, localized guarding",
            "history": "GERD", "allergies": "Penicillin",
            "triage_lvl": 3, "acuity": "Urgent", "pain": 6, "wait_mins": 30,
            "vitals": [{"hr": 92, "sbp": 134, "dbp": 82, "rr": 18, "spo2": 98, "temp": 37.9, "gcs": 15, "dt": 30}],
            "ai_risk": {"score": 48.2, "prob": 0.461, "cat": AIRiskCategoryEnum.MODERATE, "lvl": 3, "conf": 0.72},
            "alerts": []
        },
        # 4. Pediatric case (< 18) (10y Asthma exacerbation)
        {
            "id": "PT-DEMO-004", "enc_id": "ENC-DEMO-004", "name": ("Lucas", "Nguyen"),
            "age": 10.0, "gender": "Male", "mrn": "MRN-88204", "arrival": "Walk-in",
            "complaint": "Pediatric acute wheezing, subcostal retractions, albuterol inhaler ineffective",
            "history": "Childhood Asthma", "allergies": "Peanuts",
            "triage_lvl": 2, "acuity": "Emergent", "pain": 2, "wait_mins": 12,
            "vitals": [{"hr": 132, "sbp": 104, "dbp": 62, "rr": 32, "spo2": 93, "temp": 37.3, "gcs": 15, "dt": 12}],
            "ai_risk": {"score": 68.0, "prob": 0.710, "cat": AIRiskCategoryEnum.HIGH, "lvl": 2, "conf": 0.60},
            "alerts": []
        },
        # 5. Geriatric case (>= 65) (78y Sepsis / AMS)
        {
            "id": "PT-DEMO-005", "enc_id": "ENC-DEMO-005", "name": ("Eleanor", "Rigby"),
            "age": 78.0, "gender": "Female", "mrn": "MRN-88205", "arrival": "Ambulance",
            "complaint": "Geriatric acute confusion, lethargy, hypothermia, suspected urosepsis",
            "history": "Atrial Fibrillation, Type 2 Diabetes, CKD Stage 3", "allergies": "Sulfa",
            "triage_lvl": 2, "acuity": "Emergent", "pain": 0, "wait_mins": 14,
            "vitals": [{"hr": 104, "sbp": 94, "dbp": 58, "rr": 24, "spo2": 94, "temp": 35.8, "gcs": 13, "dt": 14}],
            "ai_risk": {"score": 86.4, "prob": 0.882, "cat": AIRiskCategoryEnum.HIGH, "lvl": 2, "conf": 0.78},
            "alerts": []
        },
        # 6. Ambiguous presentation (Vague malaise, silent hypotension)
        {
            "id": "PT-DEMO-006", "enc_id": "ENC-DEMO-006", "name": ("Arthur", "Pendelton"),
            "age": 63.0, "gender": "Male", "mrn": "MRN-88206", "arrival": "Walk-in",
            "complaint": "Vague generalized weakness, mild lightheadedness, denies chest pain or shortness of breath",
            "history": "Hypertension", "allergies": "None Known",
            "triage_lvl": 3, "acuity": "Urgent", "pain": 1, "wait_mins": 22,
            "vitals": [{"hr": 52, "sbp": 82, "dbp": 48, "rr": 16, "spo2": 96, "temp": 36.4, "gcs": 15, "dt": 22}],
            "ai_risk": {"score": 64.5, "prob": 0.655, "cat": AIRiskCategoryEnum.HIGH, "lvl": 2, "conf": 0.48},
            "alerts": []
        },
        # 7. Zero-history patient (First time ED encounter, unregistered)
        {
            "id": "PT-DEMO-007", "enc_id": "ENC-DEMO-007", "name": ("Unknown", "Visitor-07"),
            "age": 35.0, "gender": "Male", "mrn": "MRN-88207", "arrival": "Walk-in",
            "complaint": "Severe acute migraine with visual aura and persistent vomiting",
            "history": "Zero prior history", "allergies": "None reported",
            "triage_lvl": 3, "acuity": "Urgent", "pain": 8, "wait_mins": 28,
            "vitals": [{"hr": 88, "sbp": 126, "dbp": 78, "rr": 16, "spo2": 99, "temp": 37.0, "gcs": 15, "dt": 28}],
            "ai_risk": {"score": 32.0, "prob": 0.280, "cat": AIRiskCategoryEnum.LOW, "lvl": 4, "conf": 0.52},
            "alerts": []
        },
        # 8. Partial-history patient (Incomplete medical record)
        {
            "id": "PT-DEMO-008", "enc_id": "ENC-DEMO-008", "name": ("Chloe", "Bennett"),
            "age": 49.0, "gender": "Female", "mrn": "MRN-88208", "arrival": "Walk-in",
            "complaint": "Moderate left flank pain, hematuria, suspected nephrolithiasis",
            "history": "Renal cyst", "allergies": "",
            "triage_lvl": 3, "acuity": "Urgent", "pain": 7, "wait_mins": 35,
            "vitals": [{"hr": 84, "sbp": 138, "dbp": 86, "rr": 18, "spo2": 98, "temp": 37.1, "gcs": 15, "dt": 35}],
            "ai_risk": {"score": 36.5, "prob": 0.325, "cat": AIRiskCategoryEnum.LOW, "lvl": 4, "conf": 0.68},
            "alerts": []
        },
        # 9. Deteriorating patient (Longitudinal SpO2 drop + tachycardia)
        {
            "id": "PT-DEMO-009", "enc_id": "ENC-DEMO-009", "name": ("James", "O'Connor"),
            "age": 68.0, "gender": "Male", "mrn": "MRN-88209", "arrival": "Walk-in",
            "complaint": "Progressive exertional dyspnea, non-productive cough, worsening hypoxia",
            "history": "COPD, 40 pack-year tobacco use", "allergies": "Latex",
            "triage_lvl": 2, "acuity": "Emergent", "pain": 2, "wait_mins": 55,
            "vitals": [
                {"hr": 92, "sbp": 132, "dbp": 80, "rr": 20, "spo2": 95, "temp": 37.2, "gcs": 15, "dt": 55},
                {"hr": 114, "sbp": 118, "dbp": 72, "rr": 28, "spo2": 88, "temp": 37.6, "gcs": 14, "dt": 10}
            ],
            "ai_risk": {"score": 88.0, "prob": 0.895, "cat": AIRiskCategoryEnum.HIGH, "lvl": 2, "conf": 0.85},
            "alerts": [
                {
                    "type": "POTENTIAL_DETERIORATION", "sev": AlertSeverityEnum.CRITICAL,
                    "rule": "RULE-DET-HYPOXIA-01", "summary": "⚠️ Acute Oxygen Desaturation: SpO2 dropped from 95% to 88% with compensatory tachypnea (RR 28)."
                }
            ]
        },
        # 10. Stable patient (Superficial laceration)
        {
            "id": "PT-DEMO-010", "enc_id": "ENC-DEMO-010", "name": ("David", "Kim"),
            "age": 31.0, "gender": "Male", "mrn": "MRN-88210", "arrival": "Walk-in",
            "complaint": "Forearm glass laceration, bleeding controlled with direct pressure, neurovascularly intact",
            "history": "None reported", "allergies": "No known allergies",
            "triage_lvl": 4, "acuity": "Less Urgent", "pain": 4, "wait_mins": 40,
            "vitals": [{"hr": 72, "sbp": 122, "dbp": 76, "rr": 14, "spo2": 100, "temp": 36.7, "gcs": 15, "dt": 40}],
            "ai_risk": {"score": 12.0, "prob": 0.082, "cat": AIRiskCategoryEnum.LOW, "lvl": 4, "conf": 0.94},
            "alerts": []
        },
        # 11. Low-confidence prediction (Decision boundary proximity p=0.495)
        {
            "id": "PT-DEMO-011", "enc_id": "ENC-DEMO-011", "name": ("Maria", "Santos"),
            "age": 58.0, "gender": "Female", "mrn": "MRN-88211", "arrival": "Walk-in",
            "complaint": "Atypical mid-thoracic back ache, intermittent diaphoresis, unverified medical history",
            "history": "", "allergies": "",
            "triage_lvl": 3, "acuity": "Urgent", "pain": 5, "wait_mins": 26,
            "vitals": [{"hr": 86, "sbp": 130, "dbp": 80, "rr": 18, "spo2": 97, "temp": 36.9, "gcs": 15, "dt": 26}],
            "ai_risk": {"score": 51.0, "prob": 0.495, "cat": AIRiskCategoryEnum.MODERATE, "lvl": 3, "conf": 0.38},
            "alerts": []
        },
        # 12. Discordant presentation (Severe 10/10 crushing pain + completely normal vitals)
        {
            "id": "PT-DEMO-012", "enc_id": "ENC-DEMO-012", "name": ("Brandon", "Taylor"),
            "age": 44.0, "gender": "Male", "mrn": "MRN-88212", "arrival": "Walk-in",
            "complaint": "Reports 10/10 severe crushing chest pain, but eucardic, normotensive, speaking in full sentences",
            "history": "Anxiety disorder", "allergies": "None Reported",
            "triage_lvl": 2, "acuity": "Emergent", "pain": 10, "wait_mins": 18,
            "vitals": [{"hr": 74, "sbp": 120, "dbp": 78, "rr": 14, "spo2": 99, "temp": 36.8, "gcs": 15, "dt": 18}],
            "ai_risk": {"score": 58.0, "prob": 0.582, "cat": AIRiskCategoryEnum.MODERATE, "lvl": 2, "conf": 0.42},
            "alerts": []
        },
        # 13. Physician override case (AI predicted High, Doctor overrode to Moderate)
        {
            "id": "PT-DEMO-013", "enc_id": "ENC-DEMO-013", "name": ("Samuel", "Green"),
            "age": 52.0, "gender": "Male", "mrn": "MRN-88213", "arrival": "Walk-in",
            "complaint": "Benign palpitations following high caffeine intake, sinus tachycardia without ischemia",
            "history": "Asthma", "allergies": "Ibuprofen",
            "triage_lvl": 3, "acuity": "Urgent", "pain": 1, "wait_mins": 20,
            "vitals": [{"hr": 112, "sbp": 136, "dbp": 84, "rr": 18, "spo2": 99, "temp": 37.0, "gcs": 15, "dt": 20}],
            "ai_risk": {"score": 72.0, "prob": 0.740, "cat": AIRiskCategoryEnum.HIGH, "lvl": 2, "conf": 0.82},
            "alerts": [],
            "physician_review": {
                "agreement": AIAgreementEnum.OVERRIDDEN, "assigned_risk": "MODERATE",
                "decision": ClinicalDecisionEnum.OBSERVATION_UNIT,
                "reason": "Sinus tachycardia attributed to acute energy drink ingestion. Normal serial ECG and biomarkers.",
                "notes": "Patient stable. Repeat ECG in 1 hour."
            }
        },
        # 14. Patient exceeding safe wait threshold (ESI 2 waiting 36 mins > 15 min limit)
        {
            "id": "PT-DEMO-014", "enc_id": "ENC-DEMO-014", "name": ("Grace", "Hopper"),
            "age": 61.0, "gender": "Female", "mrn": "MRN-88214", "arrival": "Walk-in",
            "complaint": "Acute severe dizziness, ataxia, unilateral facial tingling",
            "history": "Hypertension, TIA 2023", "allergies": "Codeine",
            "triage_lvl": 2, "acuity": "Emergent", "pain": 3, "wait_mins": 36, # Exceeds 15m threshold!
            "vitals": [{"hr": 88, "sbp": 162, "dbp": 96, "rr": 18, "spo2": 97, "temp": 37.0, "gcs": 15, "dt": 36}],
            "ai_risk": {"score": 76.5, "prob": 0.785, "cat": AIRiskCategoryEnum.HIGH, "lvl": 2, "conf": 0.86},
            "alerts": [
                {
                    "type": "SAFE_WAIT_THRESHOLD_EXCEEDED", "sev": AlertSeverityEnum.CRITICAL,
                    "rule": "RULE-SAFE-WAIT-EXCEEDED-01",
                    "summary": "🚨 REASSESSMENT REQUIRED: Waiting time (36 min) exceeds safe threshold (15 min) for ESI 2 Emergent patient."
                }
            ]
        },
        # 15. Patient with worsening vitals (HR escalating, SBP dropping)
        {
            "id": "PT-DEMO-015", "enc_id": "ENC-DEMO-015", "name": ("Teresa", "Mayfield"),
            "age": 70.0, "gender": "Female", "mrn": "MRN-88215", "arrival": "Ambulance",
            "complaint": "Persistent fever, productive cough, worsening chills, purulent sputum",
            "history": "Type 2 Diabetes, CHF", "allergies": "Cephalosporins",
            "triage_lvl": 2, "acuity": "Emergent", "pain": 4, "wait_mins": 48,
            "vitals": [
                {"hr": 96, "sbp": 128, "dbp": 78, "rr": 20, "spo2": 95, "temp": 38.6, "gcs": 15, "dt": 48},
                {"hr": 122, "sbp": 98, "dbp": 60, "rr": 26, "spo2": 92, "temp": 39.1, "gcs": 14, "dt": 8}
            ],
            "ai_risk": {"score": 84.0, "prob": 0.862, "cat": AIRiskCategoryEnum.HIGH, "lvl": 2, "conf": 0.84},
            "alerts": [
                {
                    "type": "POTENTIAL_DETERIORATION", "sev": AlertSeverityEnum.CRITICAL,
                    "rule": "RULE-DET-COMPOSITE-01",
                    "summary": "⚠️ Sepsis Decompensation: HR increased by 26 bpm, SBP dropped by 30 mmHg, Shock Index > 1.2."
                }
            ]
        },
        # 16. Surge-mode patient (Admitted during 3x influx surge)
        {
            "id": "PT-DEMO-016", "enc_id": "ENC-DEMO-016", "name": ("Victor", "Alvarez"),
            "age": 39.0, "gender": "Male", "mrn": "MRN-88216", "arrival": "Walk-in",
            "complaint": "Moderate laceration and blunt contusion from workplace machinery incident",
            "history": "None Reported", "allergies": "No known drug allergies",
            "triage_lvl": 3, "acuity": "Urgent", "pain": 6, "wait_mins": 32,
            "vitals": [{"hr": 82, "sbp": 128, "dbp": 80, "rr": 16, "spo2": 99, "temp": 36.8, "gcs": 15, "dt": 32}],
            "ai_risk": {"score": 38.0, "prob": 0.350, "cat": AIRiskCategoryEnum.MODERATE, "lvl": 3, "conf": 0.76},
            "alerts": []
        },
        # 17. Normal-risk adult (Upper respiratory infection)
        {
            "id": "PT-DEMO-017", "enc_id": "ENC-DEMO-017", "name": ("Hannah", "Abbott"),
            "age": 24.0, "gender": "Female", "mrn": "MRN-88217", "arrival": "Walk-in",
            "complaint": "Sore throat, nasal congestion, mild dry cough for 3 days",
            "history": "None", "allergies": "NKDA",
            "triage_lvl": 5, "acuity": "Non-Urgent", "pain": 2, "wait_mins": 15,
            "vitals": [{"hr": 70, "sbp": 114, "dbp": 72, "rr": 14, "spo2": 99, "temp": 37.1, "gcs": 15, "dt": 15}],
            "ai_risk": {"score": 6.2, "prob": 0.035, "cat": AIRiskCategoryEnum.LOW, "lvl": 5, "conf": 0.96},
            "alerts": []
        },
        # 18. Another pediatric case (4y High fever & tachypnea)
        {
            "id": "PT-DEMO-018", "enc_id": "ENC-DEMO-018", "name": ("Mia", "Chen"),
            "age": 4.0, "gender": "Female", "mrn": "MRN-88218", "arrival": "Walk-in",
            "complaint": "Pediatric high febrile illness 39.4C, decreased oral intake, tachypnea",
            "history": "None", "allergies": "Amoxicillin rash",
            "triage_lvl": 2, "acuity": "Emergent", "pain": 3, "wait_mins": 10,
            "vitals": [{"hr": 145, "sbp": 95, "dbp": 55, "rr": 36, "spo2": 96, "temp": 39.4, "gcs": 14, "dt": 10}],
            "ai_risk": {"score": 74.0, "prob": 0.760, "cat": AIRiskCategoryEnum.HIGH, "lvl": 2, "conf": 0.58},
            "alerts": []
        },
        # 19. Another geriatric case (82y Syncope & CKD)
        {
            "id": "PT-DEMO-019", "enc_id": "ENC-DEMO-019", "name": ("George", "Sterling"),
            "age": 82.0, "gender": "Male", "mrn": "MRN-88219", "arrival": "Ambulance",
            "complaint": "Witnessed syncopal episode while standing, mild scalp contusion, bradycardia",
            "history": "Sick Sinus Syndrome, CKD Stage 4, Pacemaker Candidate", "allergies": "Contrast dye",
            "triage_lvl": 2, "acuity": "Emergent", "pain": 2, "wait_mins": 16,
            "vitals": [{"hr": 44, "sbp": 98, "dbp": 54, "rr": 16, "spo2": 95, "temp": 36.2, "gcs": 14, "dt": 16}],
            "ai_risk": {"score": 82.5, "prob": 0.850, "cat": AIRiskCategoryEnum.HIGH, "lvl": 2, "conf": 0.75},
            "alerts": []
        },
        # 20. Complex / mixed presentation (COPD + acute decompensated heart failure)
        {
            "id": "PT-DEMO-020", "enc_id": "ENC-DEMO-020", "name": ("Patricia", "Dubois"),
            "age": 73.0, "gender": "Female", "mrn": "MRN-88220", "arrival": "Ambulance",
            "complaint": "Acute respiratory distress, orthopnea, bilateral 3+ pitting pedal edema, crackles",
            "history": "HFrEF (EF 30%), Severe COPD, Atrial Fibrillation on Apixaban", "allergies": "Metoprolol",
            "triage_lvl": 1, "acuity": "Resuscitation", "pain": 4, "wait_mins": 5,
            "vitals": [{"hr": 116, "sbp": 178, "dbp": 102, "rr": 30, "spo2": 89, "temp": 37.1, "gcs": 15, "dt": 5}],
            "ai_risk": {"score": 95.0, "prob": 0.968, "cat": AIRiskCategoryEnum.HIGH, "lvl": 1, "conf": 0.90},
            "alerts": [
                {
                    "type": "POTENTIAL_DETERIORATION", "sev": AlertSeverityEnum.CRITICAL,
                    "rule": "RULE-DET-COMPOSITE-01",
                    "summary": "⚠️ Acute Pulmonary Edema / Respiratory Failure: SpO2 89% on room air with severe tachypnea (RR 30)."
                }
            ]
        }
    ]

    now = datetime.datetime.utcnow()

    # Iterate and populate all 20 archetypes cleanly
    for arc in archetypes:
        # Patient
        p = db.query(Patient).filter(Patient.patient_id == arc["id"]).first()
        if not p:
            p = Patient(
                hospital_id="DEMO001",
                patient_id=arc["id"],
                mrn=arc["mrn"],
                first_name=arc["name"][0],
                last_name=arc["name"][1],
                age=arc["age"],
                gender=arc["gender"],
                arrival_mode=arc["arrival"],
                medical_history=arc["history"],
                allergies=arc["allergies"],
                created_by="NUR001"
            )
            db.add(p)
            db.commit()

        # Encounter
        enc = db.query(EDEncounter).filter(EDEncounter.encounter_id == arc["enc_id"]).first()
        if not enc:
            arrival_time = now - datetime.timedelta(minutes=arc["wait_mins"])
            enc = EDEncounter(
                hospital_id="DEMO001",
                patient_id=arc["id"],
                encounter_id=arc["enc_id"],
                arrival_time=arrival_time,
                arrival_mode=arc["arrival"],
                chief_complaint=arc["complaint"],
                status=EncounterStatusEnum.WAITING,
                bed_number=None
            )
            db.add(enc)
            db.commit()

            # Triage
            tr = TriageAssessment(
                hospital_id="DEMO001",
                patient_id=arc["id"],
                encounter_id=arc["enc_id"],
                triage_level=arc["triage_lvl"],
                acuity_category=arc["acuity"],
                chief_complaint=arc["complaint"],
                pain_score=arc["pain"],
                mobility="Stretcher" if arc["arrival"] == "Ambulance" else "Ambulatory",
                assessed_by="NUR001"
            )
            db.add(tr)
            db.commit()

            # Observations
            for idx, obs_data in enumerate(arc["vitals"]):
                obs_time = now - datetime.timedelta(minutes=obs_data.get("dt", 10))
                obs = ClinicalObservation(
                    hospital_id="DEMO001",
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
                    recorded_by="NUR001",
                    notes=f"Triage observation timepoint #{idx+1}"
                )
                db.add(obs)
                db.commit()

            # AI Risk
            ai_data = arc["ai_risk"]
            ai_risk_obj = AIRiskAssessment(
                assessment_id=f"AI-{arc['enc_id']}",
                hospital_id="DEMO001",
                patient_id=arc["id"],
                encounter_id=arc["enc_id"],
                risk_score=ai_data["score"],
                risk_probability=ai_data["prob"],
                risk_category=ai_data["cat"],
                predicted_triage_level=ai_data["lvl"],
                confidence_score=ai_data["conf"],
                model_name="PatientTriage Clinical Decompensation Classifier",
                model_version="1.0",
                assessed_at=now - datetime.timedelta(minutes=arc["wait_mins"] - 2)
            )
            db.add(ai_risk_obj)
            db.commit()

            # SHAP Explanation
            top_feats = [
                {"feature": "Heart Rate", "importance": 0.35 if ai_data["score"] > 50 else -0.20, "impact": "elevating" if ai_data["score"] > 50 else "reducing", "value": f"{arc['vitals'][-1]['hr']} bpm"},
                {"feature": "SpO2 Oxygen Saturation", "importance": 0.30 if arc['vitals'][-1]['spo2'] < 95 else -0.25, "impact": "elevating" if arc['vitals'][-1]['spo2'] < 95 else "reducing", "value": f"{arc['vitals'][-1]['spo2']}%"},
                {"feature": "Systolic Blood Pressure", "importance": 0.20 if arc['vitals'][-1]['sbp'] < 95 or arc['vitals'][-1]['sbp'] > 160 else -0.15, "impact": "elevating" if arc['vitals'][-1]['sbp'] < 95 or arc['vitals'][-1]['sbp'] > 160 else "reducing", "value": f"{arc['vitals'][-1]['sbp']} mmHg"}
            ]
            shap_obj = AIExplanation(
                hospital_id="DEMO001",
                patient_id=arc["id"],
                encounter_id=arc["enc_id"],
                risk_assessment_id=ai_risk_obj.id,
                explanation_method="SHAP (Tree/Linear Attribution)",
                top_features=top_feats,
                summary=f"Model estimated {ai_data['cat'].value} risk (P={ai_data['prob']:.3f}) based on physiological vital trajectory and chief complaint features."
            )
            db.add(shap_obj)
            db.commit()

            # Alerts
            for alt in arc.get("alerts", []):
                alert_obj = ClinicalAlert(
                    alert_id=f"ALERT-{arc['enc_id']}-{uuid.uuid4().hex[:4].upper()}",
                    hospital_id="DEMO001",
                    patient_id=arc["id"],
                    encounter_id=arc["enc_id"],
                    alert_type=alt["type"],
                    severity=alt["sev"],
                    status=AlertStatusEnum.UNACKNOWLEDGED,
                    detected_at=now - datetime.timedelta(minutes=5),
                    detection_source=DetectionSourceEnum.RULE_BASED,
                    detection_rule_id=alt["rule"],
                    detection_version="1.0",
                    summary=alt["summary"],
                    evidence=alt.get("evidence", [{"feature": "clinical_rule", "feature_name": alt["rule"], "clinical_meaning": alt["summary"]}])
                )
                db.add(alert_obj)
                db.commit()

            # Physician Review if specified
            if "physician_review" in arc:
                pr = arc["physician_review"]
                pa = PhysicianAssessment(
                    assessment_id=f"PA-{arc['enc_id']}",
                    hospital_id="DEMO001",
                    patient_id=arc["id"],
                    encounter_id=arc["enc_id"],
                    physician_id="DOC001",
                    physician_name="Dr. Gregory House, MD",
                    physician_role="EMERGENCY_PHYSICIAN",
                    ai_agreement=pr["agreement"],
                    clinician_assigned_risk=pr["assigned_risk"],
                    override_reason=pr.get("reason"),
                    clinical_decision=pr["decision"],
                    clinical_notes=pr.get("notes"),
                    created_at=now - datetime.timedelta(minutes=10)
                )
                db.add(pa)
            db.commit()

    # Automatically allocate available beds so patients are in care and only wait when beds are occupied
    from services.bed_service import BedService
    BedService.auto_assign_beds(db, "DEMO001")

    return {
        "message": "Complete 20-Patient Synthetic Demo Cohort seeded successfully across all Round 2 clinical archetypes.",
        "total_patients": len(archetypes),
        "hospital_id": "DEMO001"
    }
