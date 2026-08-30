import os
import json
import sys

# Add project root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from ml_pipeline.synthetic_cohort_generator import PhysiologicallyGroundedCohortGenerator
from ml_pipeline.dataset_builder import DatasetBuilder
from ml_pipeline.dataset_validator import DatasetValidator
from ml_pipeline.schema import ALL_FEATURE_COLUMNS, TARGET_COLUMNS

def run_pipeline():
    print("=" * 80)
    print("PATIENTTRIAGE.AI — ML DATA PREPARATION PIPELINE EXECUTION")
    print("=" * 80)

    # 1. Generate Development Clinical Cohort
    print("\n[1/4] Generating Physiologically Grounded Development Cohort (5,000 encounters)...")
    generator = PhysiologicallyGroundedCohortGenerator(seed=42)
    df_raw = generator.generate_cohort_dataset(n_patients=5000)
    print(f"  --> Generated {len(df_raw)} longitudinal observation timepoints across {df_raw['patient_id'].nunique()} unique patients.")
    print(f"  --> Positive Critical Outcome Rate (24h): {df_raw['composite_critical_outcome_24h'].mean():.2%}")

    # 2. Grouped Train/Val/Test Splitting
    print("\n[2/4] Performing Grouped Patient Splitting (70% Train / 15% Val / 15% Test)...")
    df_train, df_val, df_test = DatasetBuilder.split_grouped_dataset(
        df=df_raw,
        train_ratio=0.70,
        val_ratio=0.15,
        test_ratio=0.15,
        seed=42
    )
    print(f"  --> Train Partition: {len(df_train)} observations ({df_train['patient_id'].nunique()} patients)")
    print(f"  --> Val Partition:   {len(df_val)} observations ({df_val['patient_id'].nunique()} patients)")
    print(f"  --> Test Partition:  {len(df_test)} observations ({df_test['patient_id'].nunique()} patients)")

    # 3. Comprehensive Dataset Validation
    print("\n[3/4] Running Automated Dataset Validation Suite...")
    val_report = DatasetValidator.validate_dataset(df_train=df_train, df_val=df_val, df_test=df_test)
    
    for check_name, passed in val_report["checks"].items():
        status = "[PASS]" if passed else "[FAIL]"
        print(f"  {status} Check: {check_name}")

    if not val_report["is_valid"]:
        print(f"\n[ERROR] Validation failed with errors: {val_report['errors']}")
        sys.exit(1)
    else:
        print("\n  [SUCCESS] All data validation checks passed with ZERO data leakage and ZERO patient overlap!")

    # 4. Serialize Versioned Dataset and Manifest
    print("\n[4/4] Serializing Versioned Partitions & Cryptographic Manifest (v1.0)...")
    manifest = DatasetBuilder.save_versioned_dataset(
        df_train=df_train,
        df_val=df_val,
        df_test=df_test,
        version="v1.0"
    )

    print("\n" + "=" * 80)
    print("DATASET GENERATION & PARTITIONING COMPLETE")
    print("=" * 80)
    print(json.dumps(manifest, indent=2))

if __name__ == "__main__":
    run_pipeline()
