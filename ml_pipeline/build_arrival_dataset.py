"""
Arrival Triage Dataset Builder for PatientTriage.ai.
Extracts strictly Point-of-Arrival (T0) observation records, applies ArrivalFeatureExtractor,
enforces patient-level group splitting with zero leakage, and creates a versioned manifest.
"""
import os
import sys
import json
import hashlib
import pandas as pd
import numpy as np
from typing import Dict, Any, Tuple
from sklearn.model_selection import GroupShuffleSplit

# Add project root to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from ml_pipeline.arrival_schema import (
    ARRIVAL_ALL_FEATURE_COLUMNS,
    ARRIVAL_TARGET_COLUMN,
    ARRIVAL_IDENTIFIER_COLUMNS,
    PROHIBITED_ARRIVAL_LEAKAGE_COLUMNS
)
from ml_pipeline.arrival_feature_extractor import ArrivalFeatureExtractor

def build_arrival_dataset_from_raw_cohorts(
    input_train_csv: str,
    input_val_csv: str,
    input_test_csv: str,
    output_dir: str,
    version: str = "v1.0"
) -> Dict[str, Any]:
    """
    Extracts strictly observation_index == 1 from existing cohort partitions,
    ensuring pure point-of-arrival features with zero longitudinal dependencies.
    """
    os.makedirs(output_dir, exist_ok=True)

    df_raw_train = pd.read_csv(input_train_csv)
    df_raw_val = pd.read_csv(input_val_csv)
    df_raw_test = pd.read_csv(input_test_csv)

    def extract_t0_rows(df_raw: pd.DataFrame) -> pd.DataFrame:
        # Filter strictly for T0 initial observation
        t0_df = df_raw[df_raw["observation_index"] == 1.0].copy()
        
        # Verify and re-extract through ArrivalFeatureExtractor
        rows = []
        for _, row in t0_df.iterrows():
            patient_data = {
                "patient_id": row["patient_id"],
                "age": row["age"],
                "gender": "Male" if row.get("gender_male") == 1 else "Female",
                "hospital_id": row.get("hospital_id", "DEMO001"),
                "medical_history": "Unknown",
                "allergies": "Unknown"
            }
            encounter_data = {
                "encounter_id": row["encounter_id"],
                "arrival_mode": "Walk-in" if row.get("arrival_mode_walkin") == 1 else (
                    "Ambulance" if row.get("arrival_mode_ambulance") == 1 else (
                        "Wheelchair" if row.get("arrival_mode_wheelchair") == 1 else "Other"
                    )
                ),
                "chief_complaint": ""
            }
            # Infer chief complaint category from binary columns
            complaint_map = {
                "complaint_chest_pain": "acute crushing chest pain",
                "complaint_respiratory": "severe shortness of breath dyspnea",
                "complaint_abdominal": "severe abdominal pain and nausea",
                "complaint_neurological": "headache dizziness syncope",
                "complaint_trauma": "trauma laceration fracture injury",
                "complaint_infection_fever": "high fever chills sepsis infection"
            }
            for col_k, text_desc in complaint_map.items():
                if row.get(col_k) == 1.0:
                    encounter_data["chief_complaint"] = text_desc
                    break

            arrival_obs = {
                "observation_id": 1,
                "timestamp": row.get("observation_timestamp"),
                "hr": row["hr"],
                "sbp": row["sbp"],
                "dbp": row["dbp"] if row.get("dbp_was_missing") == 0 else None,
                "rr": row["rr"],
                "spo2": row["spo2"],
                "temp": row["temp"] if row.get("temp_was_missing") == 0 else None,
                "gcs": row["gcs"] if row.get("gcs_was_missing") == 0 else None,
                "pain_score": row["pain_score"] if row.get("pain_was_missing") == 0 else None
            }

            features = ArrivalFeatureExtractor.extract_arrival_features(
                patient_data=patient_data,
                encounter_data=encounter_data,
                arrival_obs=arrival_obs
            )

            # Check that target is present
            target_val = int(row["triage_acuity_level"])
            assert 1 <= target_val <= 5, f"Invalid ESI target: {target_val}"

            row_dict = {
                "encounter_id": row["encounter_id"],
                "patient_id": row["patient_id"],
                "hospital_id": row.get("hospital_id", "DEMO001"),
                "observation_id": 1,
                "observation_timestamp": row.get("observation_timestamp"),
                **features,
                "triage_acuity_level": target_val
            }
            rows.append(row_dict)

        return pd.DataFrame(rows)

    df_arr_train = extract_t0_rows(df_raw_train)
    df_arr_val = extract_t0_rows(df_raw_val)
    df_arr_test = extract_t0_rows(df_raw_test)

    # Verification: Group Isolation by patient_id
    train_pts = set(df_arr_train["patient_id"].unique())
    val_pts = set(df_arr_val["patient_id"].unique())
    test_pts = set(df_arr_test["patient_id"].unique())

    assert len(train_pts.intersection(val_pts)) == 0, "DATA LEAKAGE: Patient overlap in Train and Val!"
    assert len(train_pts.intersection(test_pts)) == 0, "DATA LEAKAGE: Patient overlap in Train and Test!"
    assert len(val_pts.intersection(test_pts)) == 0, "DATA LEAKAGE: Patient overlap in Val and Test!"

    # Verify zero prohibited leakage columns in features
    for col in df_arr_train.columns:
        if col in PROHIBITED_ARRIVAL_LEAKAGE_COLUMNS:
            raise ValueError(f"CRITICAL LEAKAGE: Prohibited column '{col}' found in arrival dataset!")

    train_out_path = os.path.join(output_dir, f"dataset_arrival_{version}_train.csv")
    val_out_path = os.path.join(output_dir, f"dataset_arrival_{version}_val.csv")
    test_out_path = os.path.join(output_dir, f"dataset_arrival_{version}_test.csv")
    manifest_out_path = os.path.join(output_dir, f"manifest_arrival_{version}.json")

    df_arr_train.to_csv(train_out_path, index=False)
    df_arr_val.to_csv(val_out_path, index=False)
    df_arr_test.to_csv(test_out_path, index=False)

    def sha256_file(p):
        s = hashlib.sha256()
        with open(p, "rb") as f:
            while chunk := f.read(8192):
                s.update(chunk)
        return s.hexdigest()

    manifest = {
        "dataset_name": "PatientTriage Point-of-Arrival (T0) Dataset",
        "dataset_version": version,
        "created_at": pd.Timestamp.utcnow().isoformat(),
        "temporal_anchor": "T0_PRESENTATION_ONLY",
        "feature_count": len(ARRIVAL_ALL_FEATURE_COLUMNS),
        "feature_columns": ARRIVAL_ALL_FEATURE_COLUMNS,
        "target_column": ARRIVAL_TARGET_COLUMN,
        "target_classes": [1, 2, 3, 4, 5],
        "partitions": {
            "train": {
                "file": os.path.basename(train_out_path),
                "rows": len(df_arr_train),
                "unique_patients": int(df_arr_train["patient_id"].nunique()),
                "class_distribution": {int(k): int(v) for k, v in df_arr_train["triage_acuity_level"].value_counts().sort_index().items()},
                "sha256": sha256_file(train_out_path)
            },
            "val": {
                "file": os.path.basename(val_out_path),
                "rows": len(df_arr_val),
                "unique_patients": int(df_arr_val["patient_id"].nunique()),
                "class_distribution": {int(k): int(v) for k, v in df_arr_val["triage_acuity_level"].value_counts().sort_index().items()},
                "sha256": sha256_file(val_out_path)
            },
            "test": {
                "file": os.path.basename(test_out_path),
                "rows": len(df_arr_test),
                "unique_patients": int(df_arr_test["patient_id"].nunique()),
                "class_distribution": {int(k): int(v) for k, v in df_arr_test["triage_acuity_level"].value_counts().sort_index().items()},
                "sha256": sha256_file(test_out_path)
            }
        }
    }

    with open(manifest_out_path, "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"[SUCCESS] Built Arrival T0 Dataset:")
    print(f"  --> Train: {len(df_arr_train)} patients ({train_out_path})")
    print(f"  --> Val:   {len(df_arr_val)} patients ({val_out_path})")
    print(f"  --> Test:  {len(df_arr_test)} patients ({test_out_path})")
    print(f"  --> Manifest: {manifest_out_path}")

    return manifest

if __name__ == "__main__":
    base_dir = os.path.dirname(__file__)
    data_dir = os.path.join(base_dir, "data")
    build_arrival_dataset_from_raw_cohorts(
        input_train_csv=os.path.join(data_dir, "dataset_v1.0_train.csv"),
        input_val_csv=os.path.join(data_dir, "dataset_v1.0_val.csv"),
        input_test_csv=os.path.join(data_dir, "dataset_v1.0_test.csv"),
        output_dir=data_dir,
        version="v1.0"
    )
