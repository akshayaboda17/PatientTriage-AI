import pandas as pd
import numpy as np
from typing import Dict, Any, List, Tuple
from ml_pipeline.schema import (
    ALL_FEATURE_COLUMNS,
    NUMERICAL_FEATURE_COLUMNS,
    CATEGORICAL_BINARY_FEATURE_COLUMNS,
    TARGET_COLUMNS,
    PROHIBITED_LEAKAGE_COLUMNS,
    FEATURE_BOUNDS
)

class DatasetValidator:
    """
    Automated validation suite verifying data integrity, schema compliance,
    anti-leakage guarantees, and group split isolation.
    """

    @classmethod
    def validate_dataset(
        cls,
        df_train: pd.DataFrame,
        df_val: pd.DataFrame,
        df_test: pd.DataFrame
    ) -> Dict[str, Any]:
        """
        Runs comprehensive validation checks across all dataset partitions.
        Returns a detailed validation report.
        """
        results: Dict[str, Any] = {
            "is_valid": True,
            "checks": {},
            "errors": [],
            "warnings": []
        }

        # Check 1: Schema Completeness
        missing_features_train = [c for c in ALL_FEATURE_COLUMNS if c not in df_train.columns]
        if missing_features_train:
            results["is_valid"] = False
            results["errors"].append(f"Train partition missing required schema features: {missing_features_train}")
        results["checks"]["schema_completeness"] = len(missing_features_train) == 0

        # Check 2: Target Columns Presence
        missing_targets = [c for c in TARGET_COLUMNS if c not in df_train.columns]
        if missing_targets:
            results["is_valid"] = False
            results["errors"].append(f"Dataset missing target columns: {missing_targets}")
        results["checks"]["targets_present"] = len(missing_targets) == 0

        # Check 3: Anti-Leakage Prohibited Columns
        leakage_found = []
        for prohibited in PROHIBITED_LEAKAGE_COLUMNS:
            for partition_name, df in [("train", df_train), ("val", df_val), ("test", df_test)]:
                if prohibited in df.columns:
                    leakage_found.append(f"{partition_name}:{prohibited}")
        if leakage_found:
            results["is_valid"] = False
            results["errors"].append(f"CRITICAL LEAKAGE DETECTED: Prohibited columns in dataset: {leakage_found}")
        results["checks"]["anti_leakage_clean"] = len(leakage_found) == 0

        # Check 4: Missingness / Null Check in Feature Matrix
        null_counts = {}
        for partition_name, df in [("train", df_train), ("val", df_val), ("test", df_test)]:
            features_df = df[ALL_FEATURE_COLUMNS]
            nulls = features_df.isnull().sum()
            total_nulls = int(nulls.sum())
            null_counts[partition_name] = total_nulls
            if total_nulls > 0:
                results["is_valid"] = False
                results["errors"].append(f"Unimputed nulls found in {partition_name} features: {nulls[nulls > 0].to_dict()}")
        results["checks"]["zero_unimputed_nulls"] = sum(null_counts.values()) == 0

        # Check 5: Group Isolation (Zero Patient Overlap)
        train_p = set(df_train["patient_id"].unique())
        val_p = set(df_val["patient_id"].unique())
        test_p = set(df_test["patient_id"].unique())

        tv_overlap = len(train_p.intersection(val_p))
        tt_overlap = len(train_p.intersection(test_p))
        vt_overlap = len(val_p.intersection(test_p))
        total_overlap = tv_overlap + tt_overlap + vt_overlap

        if total_overlap > 0:
            results["is_valid"] = False
            results["errors"].append(f"CRITICAL: Patient split overlap detected! Train-Val: {tv_overlap}, Train-Test: {tt_overlap}, Val-Test: {vt_overlap}")
        results["checks"]["group_isolation_clean"] = total_overlap == 0

        # Check 6: Clinical Range Bounds
        out_of_bounds = []
        for feature, bounds in FEATURE_BOUNDS.items():
            if feature in df_train.columns:
                min_val = df_train[feature].min()
                max_val = df_train[feature].max()
                if min_val < bounds["min"] or max_val > bounds["max"]:
                    out_of_bounds.append(f"{feature}: range [{min_val}, {max_val}] exceeds bounds [{bounds['min']}, {bounds['max']}]")
        if out_of_bounds:
            results["warnings"].extend(out_of_bounds)
        results["checks"]["clinical_bounds_valid"] = len(out_of_bounds) == 0

        # Check 7: Target Class Balance
        pos_rate_train = float(df_train["composite_critical_outcome_24h"].mean())
        pos_rate_val = float(df_val["composite_critical_outcome_24h"].mean())
        pos_rate_test = float(df_test["composite_critical_outcome_24h"].mean())

        results["class_distribution"] = {
            "train_positive_rate": round(pos_rate_train, 4),
            "val_positive_rate": round(pos_rate_val, 4),
            "test_positive_rate": round(pos_rate_test, 4)
        }

        # Check 8: Summary Statistics
        results["summary"] = {
            "total_samples": len(df_train) + len(df_val) + len(df_test),
            "train_samples": len(df_train),
            "val_samples": len(df_val),
            "test_samples": len(df_test),
            "total_unique_patients": len(train_p) + len(val_p) + len(test_p),
            "feature_dimension": len(ALL_FEATURE_COLUMNS)
        }

        return results
