import os
import json
import hashlib
import numpy as np
import pandas as pd
from typing import Dict, Any, Tuple
from sklearn.model_selection import GroupShuffleSplit
from ml_pipeline.schema import (
    IDENTIFIER_COLUMNS,
    ALL_FEATURE_COLUMNS,
    TARGET_COLUMNS
)

class DatasetBuilder:
    """
    Constructs, anonymizes, splits, and serializes versioned ML dataset partitions.
    Enforces strict group-based splitting by patient/encounter to prevent cross-observation leakage.
    """

    @classmethod
    def split_grouped_dataset(
        cls,
        df: pd.DataFrame,
        train_ratio: float = 0.70,
        val_ratio: float = 0.15,
        test_ratio: float = 0.15,
        seed: int = 42
    ) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
        """
        Splits dataset into Train, Validation, and Test sets by 'patient_id' grouping.
        All longitudinal observations from a given patient remain strictly in the same split.
        """
        assert abs((train_ratio + val_ratio + test_ratio) - 1.0) < 1e-5, "Split ratios must sum to 1.0"
        
        # Step 1: Split into Train+Val vs Test
        test_size_fraction = test_ratio
        gss_test = GroupShuffleSplit(n_splits=1, test_size=test_size_fraction, random_state=seed)
        train_val_idx, test_idx = next(gss_test.split(df, groups=df["patient_id"]))
        
        df_train_val = df.iloc[train_val_idx].copy()
        df_test = df.iloc[test_idx].copy()

        # Step 2: Split Train+Val into Train vs Val
        val_size_fraction = val_ratio / (train_ratio + val_ratio)
        gss_val = GroupShuffleSplit(n_splits=1, test_size=val_size_fraction, random_state=seed)
        train_idx, val_idx = next(gss_val.split(df_train_val, groups=df_train_val["patient_id"]))

        df_train = df_train_val.iloc[train_idx].copy()
        df_val = df_train_val.iloc[val_idx].copy()

        # Verification: Zero patient overlap across splits
        train_patients = set(df_train["patient_id"].unique())
        val_patients = set(df_val["patient_id"].unique())
        test_patients = set(df_test["patient_id"].unique())

        assert len(train_patients.intersection(val_patients)) == 0, "DATA LEAKAGE: Patient overlap in Train and Val!"
        assert len(train_patients.intersection(test_patients)) == 0, "DATA LEAKAGE: Patient overlap in Train and Test!"
        assert len(val_patients.intersection(test_patients)) == 0, "DATA LEAKAGE: Patient overlap in Val and Test!"

        return df_train, df_val, df_test

    @classmethod
    def save_versioned_dataset(
        cls,
        df_train: pd.DataFrame,
        df_val: pd.DataFrame,
        df_test: pd.DataFrame,
        version: str = "v1.0",
        output_dir: str = None
    ) -> Dict[str, Any]:
        """
        Saves partitioned datasets (train, val, test) and creates a versioned cryptographic manifest.
        """
        if output_dir is None:
            base_dir = os.path.dirname(__file__)
            output_dir = os.path.join(base_dir, "data")
        
        os.makedirs(output_dir, exist_ok=True)

        train_path = os.path.join(output_dir, f"dataset_{version}_train.csv")
        val_path = os.path.join(output_dir, f"dataset_{version}_val.csv")
        test_path = os.path.join(output_dir, f"dataset_{version}_test.csv")
        manifest_path = os.path.join(output_dir, f"manifest_{version}.json")

        df_train.to_csv(train_path, index=False)
        df_val.to_csv(val_path, index=False)
        df_test.to_csv(test_path, index=False)

        # Compute SHA256 hashes
        def get_sha256(filepath):
            sha = hashlib.sha256()
            with open(filepath, "rb") as f:
                while chunk := f.read(8192):
                    sha.update(chunk)
            return sha.hexdigest()

        manifest = {
            "dataset_version": version,
            "created_at": pd.Timestamp.utcnow().isoformat(),
            "feature_count": len(ALL_FEATURE_COLUMNS),
            "feature_columns": ALL_FEATURE_COLUMNS,
            "target_columns": TARGET_COLUMNS,
            "partitions": {
                "train": {
                    "file": os.path.basename(train_path),
                    "rows": len(df_train),
                    "unique_patients": int(df_train["patient_id"].nunique()),
                    "positive_outcome_rate": float(df_train["composite_critical_outcome_24h"].mean()),
                    "sha256": get_sha256(train_path)
                },
                "val": {
                    "file": os.path.basename(val_path),
                    "rows": len(df_val),
                    "unique_patients": int(df_val["patient_id"].nunique()),
                    "positive_outcome_rate": float(df_val["composite_critical_outcome_24h"].mean()),
                    "sha256": get_sha256(val_path)
                },
                "test": {
                    "file": os.path.basename(test_path),
                    "rows": len(df_test),
                    "unique_patients": int(df_test["patient_id"].nunique()),
                    "positive_outcome_rate": float(df_test["composite_critical_outcome_24h"].mean()),
                    "sha256": get_sha256(test_path)
                }
            }
        }

        with open(manifest_path, "w") as f:
            json.dump(manifest, f, indent=2)

        return manifest
