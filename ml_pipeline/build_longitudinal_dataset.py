"""
Synthetic Longitudinal Clinical Trajectory Dataset Generator for PatientTriage.ai (Task 3).
Generates realistic multi-observation ED sequences [T0 -> T1 -> ... -> Tn], extracts trajectory features,
enforces zero future leakage, and applies strict group-level patient splitting (0% overlap).
"""
import os
import sys
import json
import random
import datetime
import numpy as np
import pandas as pd
from typing import Dict, Any, List, Tuple

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from ml_pipeline.longitudinal_schema import (
    LONGITUDINAL_FEATURE_COLUMNS,
    LONGITUDINAL_TARGET_COLUMN,
    LONGITUDINAL_EVENT_COLUMN
)
from ml_pipeline.longitudinal_feature_extractor import LongitudinalFeatureExtractor

def generate_patient_trajectory(
    patient_id: str,
    encounter_id: str,
    rng: np.random.RandomState
) -> Tuple[Dict[str, Any], Dict[str, Any], List[Dict[str, Any]], int]:
    """
    Generates an ED patient visit with 2 to 5 repeated vital sign observations over time.
    Assigns realistic physiological trajectories (Stable, Sepsis, Hypoxia, Shock, Recovery).
    Returns (patient_data, encounter_data, observations, future_critical_outcome).
    """
    age = float(np.clip(rng.normal(52.0, 18.0), 1.0, 94.0))
    gender = rng.choice(["Male", "Female"])
    arrival_mode = rng.choice(["Walk-in", "Ambulance", "Wheelchair"], p=[0.60, 0.32, 0.08])
    
    complaints = [
        "Acute chest pain", "Severe dyspnea and shortness of breath",
        "High fever and productive cough", "Severe abdominal pain",
        "Trauma from fall / laceration", "Generalized weakness and dizziness",
        "Headache and blurred vision", "Ankle injury and swelling"
    ]
    chief_complaint = rng.choice(complaints)

    # Patient trajectory archetype
    # 0: Stable / Non-urgent (45%)
    # 1: Sepsis / Infection Decompensation (18%)
    # 2: Hypoxic Respiratory Deterioration (15%)
    # 3: Hemodynamic Shock / Hypotension (12%)
    # 4: Moderate / Resolved under care (10%)
    archetype = rng.choice([0, 1, 2, 3, 4], p=[0.45, 0.18, 0.15, 0.12, 0.10])
    
    # Future Critical Outcome Label (Target)
    if archetype in [1, 2, 3]:
        # High probability of critical outcome (ICU, intubation, vasopressors, mortality)
        future_critical_outcome = 1 if rng.rand() < 0.82 else 0
    elif archetype == 4:
        future_critical_outcome = 1 if rng.rand() < 0.20 else 0
    else:
        future_critical_outcome = 1 if rng.rand() < 0.05 else 0

    # Initial arrival ESI
    if archetype in [1, 2, 3]:
        initial_esi = rng.choice([2, 3, 4], p=[0.35, 0.45, 0.20])
    elif archetype == 4:
        initial_esi = rng.choice([3, 4], p=[0.60, 0.40])
    else:
        initial_esi = rng.choice([3, 4, 5], p=[0.25, 0.55, 0.20])

    t0_time = datetime.datetime(2026, 3, 1, 8, 0, 0) + datetime.timedelta(
        minutes=float(rng.randint(0, 10000))
    )

    patient_data = {
        "patient_id": patient_id,
        "age": age,
        "gender": gender,
        "medical_history": "Hypertension, Hyperlipidemia" if age > 50 else "None",
        "allergies": "NKDA"
    }

    encounter_data = {
        "encounter_id": encounter_id,
        "patient_id": patient_id,
        "arrival_time": t0_time.isoformat(),
        "arrival_mode": arrival_mode,
        "chief_complaint": chief_complaint,
        "initial_triage_level": initial_esi
    }

    # Number of sequential observations (2 to 5)
    num_obs = rng.randint(2, 6)
    
    # Baseline Vitals at T0
    if archetype == 0: # Stable
        hr_base = rng.normal(76, 8)
        sbp_base = rng.normal(122, 10)
        rr_base = rng.normal(15, 2)
        spo2_base = rng.normal(98, 1)
        temp_base = rng.normal(36.8, 0.3)
        gcs_base = 15
        pain_base = rng.randint(0, 6)
    elif archetype == 1: # Sepsis Decompensation
        hr_base = rng.normal(94, 8)
        sbp_base = rng.normal(118, 12)
        rr_base = rng.normal(19, 2)
        spo2_base = rng.normal(96, 2)
        temp_base = rng.normal(38.2, 0.5)
        gcs_base = 15
        pain_base = rng.randint(2, 7)
    elif archetype == 2: # Hypoxic Respiratory Failure
        hr_base = rng.normal(88, 8)
        sbp_base = rng.normal(130, 14)
        rr_base = rng.normal(21, 3)
        spo2_base = rng.normal(94, 2)
        temp_base = rng.normal(37.1, 0.4)
        gcs_base = 15
        pain_base = rng.randint(2, 6)
    elif archetype == 3: # Hemodynamic Shock
        hr_base = rng.normal(96, 10)
        sbp_base = rng.normal(108, 10)
        rr_base = rng.normal(18, 2)
        spo2_base = rng.normal(97, 2)
        temp_base = rng.normal(36.6, 0.4)
        gcs_base = 15
        pain_base = rng.randint(3, 8)
    else: # Moderate/Recovery
        hr_base = rng.normal(86, 8)
        sbp_base = rng.normal(124, 12)
        rr_base = rng.normal(17, 2)
        spo2_base = rng.normal(97, 1)
        temp_base = rng.normal(37.0, 0.3)
        gcs_base = 15
        pain_base = rng.randint(4, 9)

    observations = []
    curr_time = t0_time

    for obs_idx in range(num_obs):
        if obs_idx == 0:
            hr, sbp, rr, spo2, temp, gcs, pain = hr_base, sbp_base, rr_base, spo2_base, temp_base, gcs_base, pain_base
        else:
            dt_mins = float(rng.choice([15, 25, 30, 45, 60]))
            curr_time = curr_time + datetime.timedelta(minutes=dt_mins)
            step_frac = obs_idx / max(1.0, float(num_obs - 1))

            if archetype == 0: # Stable
                hr = hr_base + rng.normal(0, 3)
                sbp = sbp_base + rng.normal(0, 4)
                rr = rr_base + rng.normal(0, 1)
                spo2 = spo2_base + rng.normal(0, 0.5)
                temp = temp_base + rng.normal(0, 0.1)
                gcs = 15
                pain = max(0, pain_base - obs_idx)
            elif archetype == 1: # Sepsis Progression
                hr = hr_base + (step_frac * rng.normal(32, 6))
                sbp = sbp_base - (step_frac * rng.normal(28, 6))
                rr = rr_base + (step_frac * rng.normal(10, 2))
                spo2 = spo2_base - (step_frac * rng.normal(6, 1.5))
                temp = temp_base + (step_frac * rng.normal(1.2, 0.3))
                gcs = 14 if step_frac > 0.6 else 15
                pain = pain_base + rng.randint(0, 2)
            elif archetype == 2: # Hypoxia Progression
                hr = hr_base + (step_frac * rng.normal(28, 5))
                sbp = sbp_base - (step_frac * rng.normal(14, 6))
                rr = rr_base + (step_frac * rng.normal(14, 3))
                spo2 = spo2_base - (step_frac * rng.normal(12, 2.5))
                temp = temp_base + rng.normal(0, 0.2)
                gcs = 13 if (step_frac > 0.7 and spo2 < 88) else 15
                pain = pain_base
            elif archetype == 3: # Shock Progression
                hr = hr_base + (step_frac * rng.normal(36, 6))
                sbp = sbp_base - (step_frac * rng.normal(38, 6))
                rr = rr_base + (step_frac * rng.normal(8, 2))
                spo2 = spo2_base - (step_frac * rng.normal(7, 2))
                temp = temp_base - (step_frac * rng.normal(0.6, 0.2))
                gcs = 12 if (step_frac > 0.6 and sbp < 80) else 15
                pain = pain_base + rng.randint(0, 3)
            else: # Recovery
                hr = hr_base - (step_frac * rng.normal(10, 3))
                sbp = sbp_base + rng.normal(0, 4)
                rr = rr_base - (step_frac * rng.normal(2, 1))
                spo2 = min(100.0, spo2_base + (step_frac * rng.normal(1.5, 0.5)))
                temp = temp_base - (step_frac * rng.normal(0.3, 0.1))
                gcs = 15
                pain = max(0, pain_base - int(step_frac * 4))

        # Clamp to physiological bounds
        hr = float(np.clip(hr, 35.0, 210.0))
        sbp = float(np.clip(sbp, 55.0, 240.0))
        dbp = float(np.clip(round(sbp * 0.65 + rng.normal(0, 3), 1), 30.0, 140.0))
        rr = float(np.clip(rr, 6.0, 55.0))
        spo2 = float(np.clip(spo2, 60.0, 100.0))
        temp = float(np.clip(temp, 34.0, 41.5))
        gcs = float(np.clip(gcs, 3.0, 15.0))
        pain = float(np.clip(pain, 0.0, 10.0))

        observations.append({
            "observation_id": obs_idx + 1,
            "timestamp": curr_time.isoformat(),
            "hr": round(hr, 1),
            "sbp": round(sbp, 1),
            "dbp": round(dbp, 1),
            "rr": round(rr, 1),
            "spo2": round(spo2, 1),
            "temp": round(temp, 2),
            "gcs": round(gcs, 1),
            "pain_score": round(pain, 1)
        })

    return patient_data, encounter_data, observations, future_critical_outcome

def build_longitudinal_dataset(num_patients: int = 4000, seed: int = 42) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    Builds sliced temporal longitudinal dataset.
    Splits strictly by patient_id: 70% Train, 15% Val, 15% Test.
    """
    rng = np.random.RandomState(seed)
    
    records = []
    
    for i in range(num_patients):
        pid = f"PT-{100000 + i}"
        enc_id = f"ENC-{100000 + i}"
        
        pt_data, enc_data, observations, target_label = generate_patient_trajectory(pid, enc_id, rng)
        
        # Slice temporal observation points: At each timepoint k (k >= 1), extract trajectory from T0..Tk
        for k in range(1, len(observations) + 1):
            obs_slice = observations[:k]
            pred_time = obs_slice[-1]["timestamp"]
            
            # Extract 48 longitudinal trajectory features
            feat_dict = LongitudinalFeatureExtractor.extract_trajectory_features(
                patient_data=pt_data,
                encounter_data=enc_data,
                observations=obs_slice,
                prediction_timestamp=pred_time
            )
            
            row = {
                "patient_id": pid,
                "encounter_id": enc_id,
                "slice_observation_index": k,
                "slice_timestamp": pred_time,
                **feat_dict,
                LONGITUDINAL_TARGET_COLUMN: target_label,
                LONGITUDINAL_EVENT_COLUMN: 1 if (target_label == 1 and feat_dict.get("mews_score", 0) >= 4) else 0
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
    
    print("Generating longitudinal clinical trajectory datasets...")
    train_df, val_df, test_df = build_longitudinal_dataset(num_patients=4500, seed=42)
    
    train_path = os.path.join(data_dir, "dataset_deterioration_v1.0_train.csv")
    val_path = os.path.join(data_dir, "dataset_deterioration_v1.0_val.csv")
    test_path = os.path.join(data_dir, "dataset_deterioration_v1.0_test.csv")
    manifest_path = os.path.join(data_dir, "manifest_deterioration_v1.0.json")
    
    train_df.to_csv(train_path, index=False)
    val_df.to_csv(val_path, index=False)
    test_df.to_csv(test_path, index=False)
    
    manifest = {
        "dataset_name": "PatientTriage Longitudinal Clinical Trajectory Dataset",
        "dataset_version": "1.0",
        "generation_timestamp": datetime.datetime.utcnow().isoformat(),
        "total_slices": len(train_df) + len(val_df) + len(test_df),
        "feature_count": len(LONGITUDINAL_FEATURE_COLUMNS),
        "target_column": LONGITUDINAL_TARGET_COLUMN,
        "splits": {
            "train": {
                "unique_patients": int(train_df["patient_id"].nunique()),
                "total_slices": len(train_df),
                "positive_prevalence": float(train_df[LONGITUDINAL_TARGET_COLUMN].mean())
            },
            "val": {
                "unique_patients": int(val_df["patient_id"].nunique()),
                "total_slices": len(val_df),
                "positive_prevalence": float(val_df[LONGITUDINAL_TARGET_COLUMN].mean())
            },
            "test": {
                "unique_patients": int(test_df["patient_id"].nunique()),
                "total_slices": len(test_df),
                "positive_prevalence": float(test_df[LONGITUDINAL_TARGET_COLUMN].mean())
            }
        }
    }
    
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
        
    print(f"[SUCCESS] Longitudinal dataset generated:")
    print(f"  Train: {len(train_df)} slices across {train_df['patient_id'].nunique()} unique patients")
    print(f"  Val:   {len(val_df)} slices across {val_df['patient_id'].nunique()} unique patients")
    print(f"  Test:  {len(test_df)} slices across {test_df['patient_id'].nunique()} unique patients")
