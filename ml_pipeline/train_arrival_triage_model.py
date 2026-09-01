"""
Dedicated Arrival Triage ML Model Training, Calibration & Benchmarking Pipeline.
Trains multi-class / ordinal ESI Level 1–5 classifiers exclusively on T0 arrival features.
Evaluates clinical metrics (Macro F1, Balanced Accuracy, Under-Triage, Over-Triage, Brier Score),
calibrates probabilities via CalibratedClassifierCV, and serializes versioned candidate bundles.
"""
import os
import sys
import time
import json
import joblib
import platform
import numpy as np
import pandas as pd
import sklearn
from typing import Dict, Any, List, Tuple
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier, HistGradientBoostingClassifier
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import (
    accuracy_score, f1_score, balanced_accuracy_score,
    precision_score, recall_score, confusion_matrix, log_loss
)

# Add project root to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from ml_pipeline.arrival_schema import (
    ARRIVAL_ALL_FEATURE_COLUMNS,
    ARRIVAL_NUMERICAL_FEATURE_COLUMNS,
    ARRIVAL_CATEGORICAL_BINARY_FEATURE_COLUMNS,
    ARRIVAL_TARGET_COLUMN,
    ARRIVAL_TARGET_CLASSES,
    ARRIVAL_TARGET_CLASS_NAMES,
    PROHIBITED_ARRIVAL_LEAKAGE_COLUMNS
)
from ml_pipeline.arrival_preprocessor import ArrivalClinicalPreprocessor

def compute_arrival_triage_metrics(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    y_prob_matrix: np.ndarray,
    class_labels: List[int] = ARRIVAL_TARGET_CLASSES,
    df_features: pd.DataFrame = None
) -> Dict[str, Any]:
    """
    Computes rigorous clinical safety and multi-class classification evaluation metrics.
    """
    # 1. Standard Multi-Class Metrics
    acc = float(accuracy_score(y_true, y_pred))
    macro_f1 = float(f1_score(y_true, y_pred, average="macro", zero_division=0))
    weighted_f1 = float(f1_score(y_true, y_pred, average="weighted", zero_division=0))
    balanced_acc = float(balanced_accuracy_score(y_true, y_pred))

    # Per-Class Precision, Recall, F1
    per_class_precision = precision_score(y_true, y_pred, labels=class_labels, average=None, zero_division=0)
    per_class_recall = recall_score(y_true, y_pred, labels=class_labels, average=None, zero_division=0)
    per_class_f1 = f1_score(y_true, y_pred, labels=class_labels, average=None, zero_division=0)

    cm = confusion_matrix(y_true, y_pred, labels=class_labels)

    # 2. Clinical Under-Triage & Over-Triage Metrics (ESI 1 is highest acuity, 5 is lowest)
    # Under-Triage: Assigned less urgent priority than reality (y_pred > y_true)
    under_triage_mask = (y_pred > y_true)
    under_triage_count = int(np.sum(under_triage_mask))
    under_triage_rate = float(under_triage_count / len(y_true)) if len(y_true) > 0 else 0.0

    # Severe Under-Triage (>= 2 level gap, e.g. ESI 1 assigned ESI 3+)
    severe_under_triage_mask = (y_pred - y_true >= 2)
    severe_under_triage_count = int(np.sum(severe_under_triage_mask))
    severe_under_triage_rate = float(severe_under_triage_count / len(y_true)) if len(y_true) > 0 else 0.0

    # Over-Triage: Assigned more urgent priority than reality (y_pred < y_true)
    over_triage_mask = (y_pred < y_true)
    over_triage_count = int(np.sum(over_triage_mask))
    over_triage_rate = float(over_triage_count / len(y_true)) if len(y_true) > 0 else 0.0

    exact_agreement_rate = float(np.sum(y_pred == y_true) / len(y_true))

    # 3. Multi-Class Brier Score & Multi-Class Log Loss
    # Brier = (1/N) * sum_i sum_k (p_ik - y_ik)^2
    n_classes = len(class_labels)
    y_true_onehot = np.zeros((len(y_true), n_classes))
    for i, label in enumerate(y_true):
        class_idx = class_labels.index(label)
        y_true_onehot[i, class_idx] = 1.0

    multiclass_brier = float(np.mean(np.sum((y_prob_matrix - y_true_onehot) ** 2, axis=1)))
    
    try:
        m_log_loss = float(log_loss(y_true, y_prob_matrix, labels=class_labels))
    except Exception:
        m_log_loss = None

    metrics_dict = {
        "accuracy": round(acc, 4),
        "macro_f1": round(macro_f1, 4),
        "weighted_f1": round(weighted_f1, 4),
        "balanced_accuracy": round(balanced_acc, 4),
        "exact_agreement_rate": round(exact_agreement_rate, 4),
        "under_triage_rate": round(under_triage_rate, 4),
        "severe_under_triage_rate": round(severe_under_triage_rate, 4),
        "over_triage_rate": round(over_triage_rate, 4),
        "multiclass_brier_score": round(multiclass_brier, 4),
        "multiclass_log_loss": round(m_log_loss, 4) if m_log_loss is not None else None,
        "sample_count": len(y_true),
        "per_class_metrics": {
            str(cls_k): {
                "name": ARRIVAL_TARGET_CLASS_NAMES.get(cls_k, f"ESI {cls_k}"),
                "precision": round(float(per_class_precision[idx]), 4),
                "recall": round(float(per_class_recall[idx]), 4),
                "f1_score": round(float(per_class_f1[idx]), 4),
                "support": int(np.sum(y_true == cls_k))
            }
            for idx, cls_k in enumerate(class_labels)
        },
        "confusion_matrix": cm.tolist()
    }

    # 4. Stratified Subgroup Performance (Pediatric, Adult, Geriatric)
    if df_features is not None and "age" in df_features.columns:
        subgroups = {}
        age_col = df_features["age"].values

        ped_mask = (age_col < 18.0)
        adult_mask = ((age_col >= 18.0) & (age_col < 65.0))
        geri_mask = (age_col >= 65.0)

        for s_name, s_mask in [("Pediatric (<18y)", ped_mask), ("Adult (18-64y)", adult_mask), ("Geriatric (>=65y)", geri_mask)]:
            n_sub = int(np.sum(s_mask))
            if n_sub > 0:
                y_t_sub = y_true[s_mask]
                y_p_sub = y_pred[s_mask]
                ut_sub = float(np.sum(y_p_sub > y_t_sub) / n_sub)
                ot_sub = float(np.sum(y_p_sub < y_t_sub) / n_sub)
                acc_sub = float(accuracy_score(y_t_sub, y_p_sub))
                f1_sub = float(f1_score(y_t_sub, y_p_sub, average="macro", zero_division=0))
                subgroups[s_name] = {
                    "sample_count": n_sub,
                    "accuracy": round(acc_sub, 4),
                    "macro_f1": round(f1_sub, 4),
                    "under_triage_rate": round(ut_sub, 4),
                    "over_triage_rate": round(ot_sub, 4)
                }
            else:
                subgroups[s_name] = {"sample_count": 0, "status": "NO_SAMPLES"}

        metrics_dict["subgroup_performance"] = subgroups

    return metrics_dict

def train_and_benchmark_arrival_triage_models():
    print("=" * 90)
    print("PATIENTTRIAGE.AI - DEDICATED ARRIVAL TRIAGE ML MODEL TRAINING & BENCHMARKING (v1.0)")
    print("=" * 90)

    base_dir = os.path.dirname(__file__)
    data_dir = os.path.join(base_dir, "data")
    models_dir = os.path.join(base_dir, "models", "arrival_triage")
    os.makedirs(models_dir, exist_ok=True)

    # 1. Load Arrival Datasets (T0 strictly)
    print("\n[1/6] Ingesting Verified Point-of-Arrival (T0) Dataset Partitions...")
    train_csv = os.path.join(data_dir, "dataset_arrival_v1.0_train.csv")
    val_csv = os.path.join(data_dir, "dataset_arrival_v1.0_val.csv")
    test_csv = os.path.join(data_dir, "dataset_arrival_v1.0_test.csv")

    if not os.path.exists(train_csv):
        print("  --> Generating arrival dataset partitions first...")
        from ml_pipeline.build_arrival_dataset import build_arrival_dataset_from_raw_cohorts
        build_arrival_dataset_from_raw_cohorts(
            input_train_csv=os.path.join(data_dir, "dataset_v1.0_train.csv"),
            input_val_csv=os.path.join(data_dir, "dataset_v1.0_val.csv"),
            input_test_csv=os.path.join(data_dir, "dataset_v1.0_test.csv"),
            output_dir=data_dir,
            version="v1.0"
        )

    df_train = pd.read_csv(train_csv)
    df_val = pd.read_csv(val_csv)
    df_test = pd.read_csv(test_csv)

    target_col = ARRIVAL_TARGET_COLUMN
    y_train = df_train[target_col].values.astype(int)
    y_val = df_val[target_col].values.astype(int)
    y_test = df_test[target_col].values.astype(int)

    print(f"  --> Train Partition: {len(df_train)} unique patients | Class Distribution: {dict(pd.Series(y_train).value_counts().sort_index())}")
    print(f"  --> Val Partition:   {len(df_val)} unique patients | Class Distribution: {dict(pd.Series(y_val).value_counts().sort_index())}")
    print(f"  --> Test Partition:  {len(df_test)} unique patients (HELD-OUT) | Class Distribution: {dict(pd.Series(y_test).value_counts().sort_index())}")

    # Anti-leakage assertion: Verify zero prohibited leakage fields exist
    for df_chk, name in [(df_train, "Train"), (df_val, "Val"), (df_test, "Test")]:
        for prohibited in PROHIBITED_ARRIVAL_LEAKAGE_COLUMNS:
            if prohibited in df_chk.columns:
                raise ValueError(f"CRITICAL LEAKAGE DETECTED in {name}: '{prohibited}' column found!")

    # 2. Fit Preprocessor exclusively on Training Set
    print("\n[2/6] Fitting Arrival Clinical Preprocessor on Train Partition (Zero Leakage)...")
    preprocessor = ArrivalClinicalPreprocessor(scale_numerical=True)
    X_train = preprocessor.fit_transform(df_train)
    X_val = preprocessor.transform(df_val)
    X_test = preprocessor.transform(df_test)
    print(f"  --> Arrival Feature Matrix: {X_train.shape[1]} features (all scaled float32)")

    # 3. Define Candidate Multi-Class Models
    print("\n[3/6] Defining Candidate Multi-Class Architectures...")
    candidate_models = {
        "Multinomial Logistic Regression (L2)": LogisticRegression(
            solver="lbfgs",
            max_iter=1000,
            class_weight="balanced",
            random_state=42
        ),
        "Random Forest Classifier (200 trees)": RandomForestClassifier(
            n_estimators=200,
            max_depth=12,
            min_samples_split=6,
            class_weight="balanced",
            random_state=42,
            n_jobs=-1
        ),
        "Gradient Boosting Classifier": GradientBoostingClassifier(
            n_estimators=150,
            learning_rate=0.06,
            max_depth=4,
            random_state=42
        ),
        "HistGradientBoosting Classifier": HistGradientBoostingClassifier(
            max_iter=150,
            learning_rate=0.06,
            max_depth=6,
            class_weight="balanced",
            random_state=42
        )
    }

    # 4. Train and Compare Models on Validation Set
    print("\n[4/6] Fitting Candidates & Evaluating Safety Metrics on Validation Set...")
    val_results = {}
    fitted_models = {}

    for name, model in candidate_models.items():
        t0 = time.time()
        model.fit(X_train, y_train)
        fit_time = time.time() - t0

        y_val_pred = model.predict(X_val)
        y_val_prob = model.predict_proba(X_val)

        metrics = compute_arrival_triage_metrics(
            y_true=y_val,
            y_pred=y_val_pred,
            y_prob_matrix=y_val_prob,
            class_labels=ARRIVAL_TARGET_CLASSES,
            df_features=df_val
        )
        metrics["train_time_sec"] = round(fit_time, 3)

        val_results[name] = metrics
        fitted_models[name] = model

    # Print Validation Benchmarking Table
    print("\n" + "=" * 105)
    print(f"{'Candidate Architecture':<38} | {'Acc':<6} | {'Macro F1':<8} | {'Bal Acc':<7} | {'Under-Trg':<9} | {'Sev Under':<9} | {'Over-Trg':<8} | {'Brier':<6} | {'Time'}")
    print("-" * 105)
    for name, m in val_results.items():
        print(
            f"{name:<38} | {m['accuracy']:<6.4f} | {m['macro_f1']:<8.4f} | {m['balanced_accuracy']:<7.4f} | "
            f"{m['under_triage_rate']:<9.4f} | {m['severe_under_triage_rate']:<9.4f} | {m['over_triage_rate']:<8.4f} | "
            f"{m['multiclass_brier_score']:<6.4f} | {m['train_time_sec']}s"
        )
    print("=" * 105)

    # 5. Model Selection & Probability Calibration
    # Criteria: Highest Validation Macro F1 + Lowest Under-Triage Rate
    best_raw_name = max(
        val_results,
        key=lambda k: (val_results[k]["macro_f1"], -val_results[k]["under_triage_rate"])
    )
    best_raw_model = fitted_models[best_raw_name]
    print(f"\n[5/6] Model Selection Winner: '{best_raw_name}' (Val Macro F1: {val_results[best_raw_name]['macro_f1']:.4f}, Under-Triage: {val_results[best_raw_name]['under_triage_rate']:.4f})")

    # Probability Calibration Step: CalibratedClassifierCV (method='sigmoid')
    print("  --> Fitting CalibratedClassifierCV (Sigmoidal Platt scaling via 5-fold CV on Train partition)...")
    calibrated_model = CalibratedClassifierCV(estimator=best_raw_model, cv=5, method="sigmoid")
    calibrated_model.fit(X_train, y_train)

    y_val_cal_pred = calibrated_model.predict(X_val)
    y_val_cal_prob = calibrated_model.predict_proba(X_val)
    cal_val_metrics = compute_arrival_triage_metrics(
        y_true=y_val,
        y_pred=y_val_cal_pred,
        y_prob_matrix=y_val_cal_prob,
        class_labels=ARRIVAL_TARGET_CLASSES,
        df_features=df_val
    )
    print(f"  --> Calibrated Validation Brier Score: {cal_val_metrics['multiclass_brier_score']:.4f} (Macro F1: {cal_val_metrics['macro_f1']:.4f})")

    # 6. Final Test Set Evaluation (Evaluating EXACTLY ONCE on Unseen Test Partition)
    print("\n[6/6] Freezing Model & Evaluating EXACTLY ONCE on Held-Out Test Partition (N=750)...")
    y_test_pred = calibrated_model.predict(X_test)
    y_test_prob = calibrated_model.predict_proba(X_test)

    final_test_metrics = compute_arrival_triage_metrics(
        y_true=y_test,
        y_pred=y_test_pred,
        y_prob_matrix=y_test_prob,
        class_labels=ARRIVAL_TARGET_CLASSES,
        df_features=df_test
    )

    print("\n" + "=" * 75)
    print("FINAL UNBIASED TEST EVALUATION - ARRIVAL TRIAGE MODEL (v1.0)")
    print("=" * 75)
    print(f"  * Test Accuracy:               {final_test_metrics['accuracy']:.4f}")
    print(f"  * Test Macro F1:               {final_test_metrics['macro_f1']:.4f}")
    print(f"  * Test Balanced Accuracy:      {final_test_metrics['balanced_accuracy']:.4f}")
    print(f"  * Exact Agreement Rate:        {final_test_metrics['exact_agreement_rate']:.4f}")
    print(f"  * Under-Triage Rate (UTR):     {final_test_metrics['under_triage_rate']:.4f} (Assigned less urgent priority)")
    print(f"  * Severe Under-Triage Rate:    {final_test_metrics['severe_under_triage_rate']:.4f} (>= 2 tier discrepancy)")
    print(f"  * Over-Triage Rate (OTR):      {final_test_metrics['over_triage_rate']:.4f}")
    print(f"  * Multiclass Brier Score:      {final_test_metrics['multiclass_brier_score']:.4f} (Calibration)")
    print("-" * 75)
    print("  Per-Class Performance (ESI 1 to 5):")
    for cls_k in ARRIVAL_TARGET_CLASSES:
        pcm = final_test_metrics["per_class_metrics"][str(cls_k)]
        print(f"    - {pcm['name']:<40} | Prec: {pcm['precision']:.4f} | Rec: {pcm['recall']:.4f} | F1: {pcm['f1_score']:.4f} | Support: {pcm['support']}")
    print("-" * 75)
    print("  Confusion Matrix (Rows: True, Cols: Pred ESI 1..5):")
    for r_idx, row in enumerate(final_test_metrics["confusion_matrix"]):
        print(f"    True ESI {r_idx+1}: {row}")
    print("-" * 75)
    print("  Stratified Subgroup Performance:")
    for s_name, s_m in final_test_metrics.get("subgroup_performance", {}).items():
        print(f"    - {s_name:<25} | N={s_m['sample_count']} | Acc: {s_m.get('accuracy', '-')} | Macro F1: {s_m.get('macro_f1', '-')} | UTR: {s_m.get('under_triage_rate', '-')}")
    print("=" * 75)

    # 7. Serialize Versioned Artifacts
    model_version = "1.0"
    model_artifact_path = os.path.join(models_dir, f"arrival_triage_model_v{model_version}.joblib")
    preprocessor_path = os.path.join(models_dir, f"arrival_preprocessor_v{model_version}.joblib")
    metadata_path = os.path.join(models_dir, f"model_metadata_v{model_version}.json")
    metrics_path = os.path.join(models_dir, f"evaluation_metrics_v{model_version}.json")

    joblib.dump(calibrated_model, model_artifact_path)
    preprocessor.save(preprocessor_path)

    metadata = {
        "model_name": "PatientTriage Arrival Acuity Classifier",
        "model_version": model_version,
        "model_type": type(calibrated_model).__name__,
        "base_estimator": best_raw_name,
        "calibration_method": "sigmoid_platt_cv5",
        "trained_at": pd.Timestamp.now("UTC").isoformat(),
        "random_seed": 42,
        "feature_schema_version": "1.0",
        "temporal_anchor": "T0_POINT_OF_ARRIVAL",
        "feature_count": len(ARRIVAL_ALL_FEATURE_COLUMNS),
        "feature_columns": ARRIVAL_ALL_FEATURE_COLUMNS,
        "numerical_feature_columns": ARRIVAL_NUMERICAL_FEATURE_COLUMNS,
        "categorical_feature_columns": ARRIVAL_CATEGORICAL_BINARY_FEATURE_COLUMNS,
        "target_column": target_col,
        "target_classes": ARRIVAL_TARGET_CLASSES,
        "target_class_names": ARRIVAL_TARGET_CLASS_NAMES,
        "dataset_metadata": {
            "train_samples": len(df_train),
            "val_samples": len(df_val),
            "test_samples": len(df_test),
            "class_distribution_train": {int(k): int(v) for k, v in df_train[target_col].value_counts().sort_index().items()},
            "class_distribution_val": {int(k): int(v) for k, v in df_val[target_col].value_counts().sort_index().items()},
            "class_distribution_test": {int(k): int(v) for k, v in df_test[target_col].value_counts().sort_index().items()}
        },
        "validation_benchmark": val_results,
        "final_test_metrics": final_test_metrics,
        "environment": {
            "python_version": platform.python_version(),
            "scikit_learn_version": sklearn.__version__,
            "platform": platform.platform()
        }
    }

    with open(metadata_path, "w") as f:
        json.dump(metadata, f, indent=2)

    with open(metrics_path, "w") as f:
        json.dump(final_test_metrics, f, indent=2)

    print(f"\n[SAVED ARTIFACTS]")
    print(f"  --> Saved Arrival Model Artifact:       {os.path.basename(model_artifact_path)}")
    print(f"  --> Saved Arrival Preprocessor:         {os.path.basename(preprocessor_path)}")
    print(f"  --> Saved Model Metadata:               {os.path.basename(metadata_path)}")
    print(f"  --> Saved Test Evaluation Metrics:      {os.path.basename(metrics_path)}")
    print("\n[SUCCESS] Arrival triage ML model training pipeline completed successfully!")

    return metadata

if __name__ == "__main__":
    train_and_benchmark_arrival_triage_models()
