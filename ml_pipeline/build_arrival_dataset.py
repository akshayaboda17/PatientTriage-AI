"""
Point-of-Arrival (T0) Clinical Triage Dataset Generator for PatientTriage.ai (Task 4 v1.1).
Generates multi-class ESI 1–5 triage cohorts incorporating pediatric, adult, geriatric,
zero-history, missing vital, clinical negation, and ambiguous presentation scenarios.
Applies strict patient-level group splitting (0% patient overlap).
"""
import os
import sys
import json
import datetime
import numpy as np
import pandas as pd
from typing import Dict, Any, List, Tuple

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from ml_pipeline.arrival_schema import (
    ARRIVAL_ALL_FEATURE_COLUMNS,
    ARRIVAL_TARGET_COLUMN,
    ARRIVAL_TARGET_CLASSES
)
from ml_pipeline.arrival_feature_extractor import ArrivalFeatureExtractor

def generate_arrival_patient(
    patient_id: str,
    encounter_id: str,
    rng: np.random.RandomState
) -> Tuple[Dict[str, Any], Dict[str, Any], Dict[str, Any], int]:
    """
    Generates a realistic emergency department arrival presentation.
    Returns (patient_data, encounter_data, arrival_obs, target_esi_level).
    """
    # 1. Age Distribution: Pediatric (15%), Adult (55%), Geriatric (30%)
    age_cohort = rng.choice(["pediatric", "adult", "geriatric"], p=[0.15, 0.55, 0.30])
    if age_cohort == "pediatric":
        age = round(float(rng.uniform(0.5, 17.5)), 1)
    elif age_cohort == "geriatric":
        age = round(float(rng.uniform(65.0, 96.0)), 1)
    else:
        age = round(float(rng.uniform(18.0, 64.9)), 1)

    gender = rng.choice(["Male", "Female"])
    arrival_mode = rng.choice(["Walk-in", "Ambulance", "Wheelchair"], p=[0.60, 0.30, 0.10])

    # 2. History Type: Known History (70%), Zero-History (15%), Unknown (15%)
    hist_type = rng.choice(["known", "zero_history", "unknown"], p=[0.70, 0.15, 0.15])
    if hist_type == "zero_history":
        med_hist = "First visit / Zero prior history"
        allergies = "None"
    elif hist_type == "unknown":
        med_hist = "Unknown history / unable to obtain"
        allergies = "Unknown"
    else:
        chronic_options = [
            "Hypertension, Type 2 Diabetes", "Asthma, Seasonal Allergies",
            "Coronary Artery Disease, Stent 2022", "COPD, 40 pack-year smoker",
            "Chronic Kidney Disease Stage 3", "Atrial Fibrillation on Eliquis",
            "None reported / Healthy"
        ]
        med_hist = rng.choice(chronic_options)
        allergies = rng.choice(["NKDA", "Penicillin", "Sulfa", "Latex", "None"])

    # 3. Presenting Chief Complaint & Acuity Archetype
    # Acuities: ESI 1 (5%), ESI 2 (20%), ESI 3 (40%), ESI 4 (25%), ESI 5 (10%)
    acuity_archetype = rng.choice([1, 2, 3, 4, 5], p=[0.05, 0.20, 0.40, 0.25, 0.10])

    complaints_esi1 = [
        "Unresponsive, profound cyanosis and agonal respirations",
        "Sudden cardiac arrest, CPR in progress",
        "Massive trauma, severe head injury and shock",
        "Severe anaphylaxis with stridor and hypotension"
    ]
    complaints_esi2 = [
        "Crushing retrosternal chest pain radiating to left arm and diaphoresis",
        "Acute severe dyspnea, severe wheezing and tripoding",
        "Sudden onset right-sided weakness, facial droop and slurred speech",
        "Severe sepsis: high fever, altered mental status and hypotension",
        "Severe abdominal pain radiating to back, rigid abdomen"
    ]
    complaints_esi3 = [
        "Moderate shortness of breath, denies chest pain",
        "Persistent lower right quadrant abdominal pain and nausea",
        "High fever and productive cough, negative for syncope",
        "Severe migraine headache, denies neurological deficits",
        "Dizziness and nausea with generalized weakness (ambiguous presentation)",
        "Fatigue and weakness with vague chest discomfort"
    ]
    complaints_esi4 = [
        "Ankle pain and swelling after slip and fall, denies head trauma",
        "Wrist pain and contusion, no numbness",
        "Superficial arm laceration, bleeding controlled",
        "Dysuria and urinary urgency, denies fever or flank pain",
        "Mild sore throat and congestion, no shortness of breath"
    ]
    complaints_esi5 = [
        "Suture removal for healed laceration",
        "Medication refill request, no acute complaints",
        "Minor finger abrasion, denies pain",
        "Work clearance note request, completely asymptomatic"
    ]

    if acuity_archetype == 1:
        chief_complaint = rng.choice(complaints_esi1)
    elif acuity_archetype == 2:
        chief_complaint = rng.choice(complaints_esi2)
    elif acuity_archetype == 3:
        chief_complaint = rng.choice(complaints_esi3)
    elif acuity_archetype == 4:
        chief_complaint = rng.choice(complaints_esi4)
    else:
        chief_complaint = rng.choice(complaints_esi5)

    # 4. Generate Age-Aware Physiological Baseline Vitals for Acuity Archetype
    if acuity_archetype == 1: # Resuscitation
        if age_cohort == "pediatric":
            hr = float(rng.choice([rng.normal(185, 10), rng.normal(45, 5)]))
            sbp = float(rng.normal(65, 8))
            rr = float(rng.choice([rng.normal(55, 6), rng.normal(6, 2)]))
            spo2 = float(rng.normal(78, 6))
            gcs = float(rng.randint(3, 8))
        else:
            hr = float(rng.choice([rng.normal(145, 12), rng.normal(38, 5)]))
            sbp = float(rng.normal(65, 10))
            rr = float(rng.choice([rng.normal(40, 4), rng.normal(6, 2)]))
            spo2 = float(rng.normal(80, 5))
            gcs = float(rng.randint(3, 8))
        temp = float(rng.normal(36.0, 1.0))
        pain = 0.0

    elif acuity_archetype == 2: # Emergent
        if age_cohort == "pediatric":
            hr = float(rng.normal(155, 12))
            sbp = float(rng.normal(82, 8))
            rr = float(rng.normal(38, 4))
            spo2 = float(rng.normal(89, 3))
        elif age_cohort == "geriatric":
            hr = float(rng.normal(108, 12)) # Blunted tachycardia in geriatrics
            sbp = float(rng.normal(94, 12))
            rr = float(rng.normal(26, 3))
            spo2 = float(rng.normal(90, 2.5))
        else: # Adult
            hr = float(rng.normal(122, 12))
            sbp = float(rng.normal(96, 12))
            rr = float(rng.normal(28, 3))
            spo2 = float(rng.normal(91, 2))
        temp = float(rng.normal(38.4, 0.8))
        gcs = float(rng.choice([13, 14, 15], p=[0.2, 0.3, 0.5]))
        pain = float(rng.randint(7, 11))

    elif acuity_archetype == 3: # Urgent
        if age_cohort == "pediatric":
            hr = float(rng.normal(125, 10))
            sbp = float(rng.normal(95, 8))
            rr = float(rng.normal(26, 3))
            spo2 = float(rng.normal(95, 1.5))
        elif age_cohort == "geriatric":
            hr = float(rng.normal(88, 10))
            sbp = float(rng.normal(135, 15))
            rr = float(rng.normal(20, 2))
            spo2 = float(rng.normal(94, 1.5))
        else: # Adult
            hr = float(rng.normal(92, 10))
            sbp = float(rng.normal(128, 12))
            rr = float(rng.normal(19, 2))
            spo2 = float(rng.normal(96, 1.5))
        temp = float(rng.normal(37.6, 0.5))
        gcs = 15.0
        pain = float(rng.randint(4, 8))

    elif acuity_archetype == 4: # Less Urgent
        if age_cohort == "pediatric":
            hr = float(rng.normal(105, 8))
            sbp = float(rng.normal(100, 6))
            rr = float(rng.normal(22, 2))
            spo2 = float(rng.normal(98, 1))
        elif age_cohort == "geriatric":
            hr = float(rng.normal(76, 8))
            sbp = float(rng.normal(130, 12))
            rr = float(rng.normal(16, 2))
            spo2 = float(rng.normal(96, 1))
        else: # Adult
            hr = float(rng.normal(78, 8))
            sbp = float(rng.normal(122, 10))
            rr = float(rng.normal(15, 2))
            spo2 = float(rng.normal(98, 1))
        temp = float(rng.normal(36.8, 0.3))
        gcs = 15.0
        pain = float(rng.randint(2, 6))

    else: # Non-Urgent (ESI 5)
        if age_cohort == "pediatric":
            hr = float(rng.normal(98, 6))
            sbp = float(rng.normal(102, 5))
            rr = float(rng.normal(20, 2))
        else:
            hr = float(rng.normal(72, 6))
            sbp = float(rng.normal(118, 8))
            rr = float(rng.normal(14, 1.5))
        spo2 = float(rng.normal(99, 0.8))
        temp = float(rng.normal(36.7, 0.2))
        gcs = 15.0
        pain = float(rng.randint(0, 3))

    # Clamp to valid physiological ranges
    hr = float(np.clip(round(hr, 1), 25.0, 260.0))
    sbp = float(np.clip(round(sbp, 1), 40.0, 260.0))
    dbp = float(np.clip(round(sbp * 0.65 + rng.normal(0, 4), 1), 25.0, 140.0))
    rr = float(np.clip(round(rr, 1), 6.0, 65.0))
    spo2 = float(np.clip(round(spo2, 1), 50.0, 100.0))
    temp = float(np.clip(round(temp, 2), 34.0, 41.5))
    gcs = float(np.clip(round(gcs, 1), 3.0, 15.0))
    pain = float(np.clip(round(pain, 1), 0.0, 10.0))

    # 5. Simulate Realistic Bedside Missingness
    # Missing SpO2 (6%), Missing Temp (10%), Missing Pain (12%), Missing DBP (8%), Missing GCS (8%)
    raw_spo2 = None if rng.rand() < 0.06 else spo2
    raw_temp = None if rng.rand() < 0.10 else temp
    raw_pain = None if rng.rand() < 0.12 else pain
    raw_dbp = None if rng.rand() < 0.08 else dbp
    raw_gcs = None if rng.rand() < 0.08 else gcs

    patient_data = {
        "patient_id": patient_id,
        "age": age,
        "gender": gender,
        "medical_history": med_hist,
        "allergies": allergies
    }

    encounter_data = {
        "encounter_id": encounter_id,
        "patient_id": patient_id,
        "arrival_time": datetime.datetime(2026, 3, 1, 10, 0, 0).isoformat(),
        "arrival_mode": arrival_mode,
        "chief_complaint": chief_complaint
    }

    arrival_obs = {
        "observation_id": 1,
        "timestamp": encounter_data["arrival_time"],
        "hr": hr,
        "sbp": sbp,
        "dbp": raw_dbp,
        "rr": rr,
        "spo2": raw_spo2,
        "temp": raw_temp,
        "gcs": raw_gcs,
        "pain_score": raw_pain
    }

    return patient_data, encounter_data, arrival_obs, acuity_archetype

def build_arrival_dataset(num_patients: int = 5000, seed: int = 42) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    Builds synthetic arrival triage dataset for Task 4 v1.1.
    Splits strictly by patient_id: 70% Train, 15% Val, 15% Test.
    """
    rng = np.random.RandomState(seed)
    records = []

    for i in range(num_patients):
        pid = f"PT-{200000 + i}"
        enc_id = f"ENC-{200000 + i}"

        pt_data, enc_data, arr_obs, target_esi = generate_arrival_patient(pid, enc_id, rng)

        feats = ArrivalFeatureExtractor.extract_arrival_features(
            patient_data=pt_data,
            encounter_data=enc_data,
            arrival_obs=arr_obs
        )

        row = {
            "patient_id": pid,
            "encounter_id": enc_id,
            **feats,
            ARRIVAL_TARGET_COLUMN: target_esi
        }
        records.append(row)

    df_full = pd.DataFrame(records)

    # ----------------------------------------------------
    # Strict Patient-Level Partitioning (0% Patient Overlap)
    # ----------------------------------------------------
    unique_patients = df_full["patient_id"].unique()
    rng.shuffle(unique_patients)

    n_train = int(len(unique_patients) * 0.70)
    n_val = int(len(unique_patients) * 0.15)

    train_patients = set(unique_patients[:n_train])
    val_patients = set(unique_patients[n_train:n_train + n_val])
    test_patients = set(unique_patients[n_train + n_val:])

    train_df = df_full[df_full["patient_id"].isin(train_patients)].copy().reset_index(drop=True)
    val_df = df_full[df_full["patient_id"].isin(val_patients)].copy().reset_index(drop=True)
    test_df = df_full[df_full["patient_id"].isin(test_patients)].copy().reset_index(drop=True)

    return train_df, val_df, test_df

if __name__ == "__main__":
    base_dir = os.path.dirname(__file__)
    data_dir = os.path.join(base_dir, "data")
    os.makedirs(data_dir, exist_ok=True)

    print("Generating enriched Task 4 arrival triage datasets (v1.1)...")
    train_df, val_df, test_df = build_arrival_dataset(num_patients=5000, seed=42)

    train_path = os.path.join(data_dir, "dataset_arrival_v1.1_train.csv")
    val_path = os.path.join(data_dir, "dataset_arrival_v1.1_val.csv")
    test_path = os.path.join(data_dir, "dataset_arrival_v1.1_test.csv")
    manifest_path = os.path.join(data_dir, "manifest_arrival_v1.1.json")

    train_df.to_csv(train_path, index=False)
    val_df.to_csv(val_path, index=False)
    test_df.to_csv(test_path, index=False)

    manifest = {
        "dataset_name": "PatientTriage Age-Aware & Data-Quality Arrival Triage Dataset",
        "dataset_version": "1.1",
        "generation_timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "total_samples": len(train_df) + len(val_df) + len(test_df),
        "feature_count": len(ARRIVAL_ALL_FEATURE_COLUMNS),
        "target_column": ARRIVAL_TARGET_COLUMN,
        "splits": {
            "train": {
                "unique_patients": int(train_df["patient_id"].nunique()),
                "total_samples": len(train_df),
                "pediatric_count": int(train_df["age_pediatric"].sum()),
                "adult_count": int(train_df["age_adult"].sum()),
                "geriatric_count": int(train_df["age_geriatric"].sum()),
                "zero_history_count": int(train_df["is_zero_history"].sum()),
                "class_distribution": {int(k): int(v) for k, v in train_df[ARRIVAL_TARGET_COLUMN].value_counts().items()}
            },
            "val": {
                "unique_patients": int(val_df["patient_id"].nunique()),
                "total_samples": len(val_df),
                "pediatric_count": int(val_df["age_pediatric"].sum()),
                "adult_count": int(val_df["age_adult"].sum()),
                "geriatric_count": int(val_df["age_geriatric"].sum()),
                "zero_history_count": int(val_df["is_zero_history"].sum()),
                "class_distribution": {int(k): int(v) for k, v in val_df[ARRIVAL_TARGET_COLUMN].value_counts().items()}
            },
            "test": {
                "unique_patients": int(test_df["patient_id"].nunique()),
                "total_samples": len(test_df),
                "pediatric_count": int(test_df["age_pediatric"].sum()),
                "adult_count": int(test_df["age_adult"].sum()),
                "geriatric_count": int(test_df["age_geriatric"].sum()),
                "zero_history_count": int(test_df["is_zero_history"].sum()),
                "class_distribution": {int(k): int(v) for k, v in test_df[ARRIVAL_TARGET_COLUMN].value_counts().items()}
            }
        }
    }

    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"[SUCCESS] Arrival dataset v1.1 generated:")
    print(f"  Train: {len(train_df)} samples across {train_df['patient_id'].nunique()} unique patients")
    print(f"  Val:   {len(val_df)} samples across {val_df['patient_id'].nunique()} unique patients")
    print(f"  Test:  {len(test_df)} samples across {test_df['patient_id'].nunique()} unique patients")
