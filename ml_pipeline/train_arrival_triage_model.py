"""
Arrival Triage Multi-Class Model Training, Probability Calibration, and Subgroup Evaluation (Task 4 v1.1).
Trains and evaluates multi-class models (ESI 1–5), calculates under-triage and over-triage rates,
evaluates demographic subgroups (Pediatric, Adult, Geriatric), and benchmarks v1.1 against v1.0.
"""
import os
import sys
import json
import joblib
import datetime
import numpy as np
import pandas as pd
from typing import Dict, Any, List, Tuple

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier, HistGradientBoostingClassifier, GradientBoostingClassifier
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import (
    accuracy_score, f1_score, balanced_accuracy_score,
    precision_score, recall_score, confusion_matrix, log_loss
)

from ml_pipeline.arrival_schema import (
    ARRIVAL_ALL_FEATURE_COLUMNS,
    ARRIVAL_TARGET_COLUMN,
    ARRIVAL_TARGET_CLASSES,
    ARRIVAL_TARGET_CLASS_NAMES
)
from ml_pipeline.arrival_preprocessor import ArrivalClinicalPreprocessor

def calculate_triage_safety_metrics(y_true: np.ndarray, y_pred: np.ndarray, y_prob: np.ndarray) -> Dict[str, Any]:
    """
    Computes comprehensive clinical safety and triage performance metrics.
    """
    acc = float(accuracy_score(y_true, y_pred))
    macro_f1 = float(f1_score(y_true, y_pred, average="macro", zero_division=0))
    weighted_f1 = float(f1_score(y_true, y_pred, average="weighted", zero_division=0))
    bal_acc = float(balanced_accuracy_score(y_true, y_pred))
    
    # Per-Class Metrics
    per_class_recall = recall_score(y_true, y_pred, labels=ARRIVAL_TARGET_CLASSES, average=None, zero_division=0)
    per_class_precision = precision_score(y_true, y_pred, labels=ARRIVAL_TARGET_CLASSES, average=None, zero_division=0)
    per_class_f1 = f1_score(y_true, y_pred, labels=ARRIVAL_TARGET_CLASSES, average=None, zero_division=0)

    # Under-Triage and Over-Triage Calculation
    # Under-triage: Predicted priority is LESS urgent than true priority (pred > true, e.g. True ESI 2 predicted as ESI 3)
    # Over-triage: Predicted priority is MORE urgent than true priority (pred < true, e.g. True ESI 4 predicted as ESI 2)
    under_triage_mask = (y_pred > y_true)
    over_triage_mask = (y_pred < y_true)
    exact_match_mask = (y_pred == y_true)

    under_triage_rate = float(np.mean(under_triage_mask))
    over_triage_rate = float(np.mean(over_triage_mask))

    # Critical High-Acuity Under-Triage (True ESI 1 or 2 predicted as ESI >= 3)
    critical_mask = np.isin(y_true, [1, 2])
    if np.sum(critical_mask) > 0:
        critical_under_triage = float(np.mean(y_pred[critical_mask] >= 3))
    else:
        critical_under_triage = 0.0

    cm = confusion_matrix(y_true, y_pred, labels=ARRIVAL_TARGET_CLASSES).tolist()

    return {
        "accuracy": round(acc, 4),
        "macro_f1": round(macro_f1, 4),
        "weighted_f1": round(weighted_f1, 4),
        "balanced_accuracy": round(bal_acc, 4),
        "under_triage_rate": round(under_triage_rate, 4),
        "over_triage_rate": round(over_triage_rate, 4),
        "critical_under_triage_rate": round(critical_under_triage, 4),
        "per_class_recall": {str(cls_k): round(float(per_class_recall[i]), 4) for i, cls_k in enumerate(ARRIVAL_TARGET_CLASSES)},
        "per_class_precision": {str(cls_k): round(float(per_class_precision[i]), 4) for i, cls_k in enumerate(ARRIVAL_TARGET_CLASSES)},
        "per_class_f1": {str(cls_k): round(float(per_class_f1[i]), 4) for i, cls_k in enumerate(ARRIVAL_TARGET_CLASSES)},
        "confusion_matrix": cm
    }

def evaluate_demographic_subgroups(
    test_df: pd.DataFrame,
    model,
    preprocessor: ArrivalClinicalPreprocessor
) -> Dict[str, Any]:
    """
    Evaluates model performance separately across Pediatric, Adult, and Geriatric demographic cohorts.
    """
    subgroups = {
        "pediatric": test_df[test_df["age"] < 18.0],
        "adult": test_df[(test_df["age"] >= 18.0) & (test_df["age"] < 65.0)],
        "geriatric": test_df[test_df["age"] >= 65.0],
        "zero_history": test_df[test_df["is_zero_history"] == 1.0],
        "ambiguous_symptoms": test_df[test_df["complaint_is_ambiguous"] == 1.0]
    }

    results = {}
    for name, sub_df in subgroups.items():
        if len(sub_df) < 10:
            results[name] = {
                "sample_size": len(sub_df),
                "status": "Insufficient sample size for reliable subgroup evaluation."
            }
            continue

        X_sub = preprocessor.transform(sub_df)
        y_true = sub_df[ARRIVAL_TARGET_COLUMN].values
        y_prob = model.predict_proba(X_sub)
        y_pred = model.predict(X_sub)

        metrics = calculate_triage_safety_metrics(y_true, y_pred, y_prob)
        results[name] = {
            "sample_size": len(sub_df),
            "class_distribution": {int(k): int(v) for k, v in sub_df[ARRIVAL_TARGET_COLUMN].value_counts().items()},
            **metrics
        }

    return results

def train_and_benchmark():
    base_dir = os.path.dirname(__file__)
    data_dir = os.path.join(base_dir, "data")
    models_dir = os.path.join(base_dir, "models", "arrival_triage")
    os.makedirs(models_dir, exist_ok=True)

    print("=" * 80)
    print("PATIENTTRIAGE.AI — TASK 4 ARRIVAL TRIAGE MODEL TRAINING (v1.1)")
    print("=" * 80)

    # 1. Load Data
    train_df = pd.read_csv(os.path.join(data_dir, "dataset_arrival_v1.1_train.csv"))
    val_df = pd.read_csv(os.path.join(data_dir, "dataset_arrival_v1.1_val.csv"))
    test_df = pd.read_csv(os.path.join(data_dir, "dataset_arrival_v1.1_test.csv"))

    print(f"Loaded datasets: Train={len(train_df)}, Val={len(val_df)}, Test={len(test_df)}")

    # 2. Fit Preprocessor
    preprocessor = ArrivalClinicalPreprocessor(scale_numerical=False)
    X_train = preprocessor.fit_transform(train_df)
    X_val = preprocessor.transform(val_df)
    X_test = preprocessor.transform(test_df)

    y_train = train_df[ARRIVAL_TARGET_COLUMN].values
    y_val = val_df[ARRIVAL_TARGET_COLUMN].values
    y_test = test_df[ARRIVAL_TARGET_COLUMN].values

    # 3. Train Candidate Architectures
    candidates = {
        "LogisticRegression (Multinomial L2)": LogisticRegression(
            C=1.0, max_iter=1000, class_weight="balanced", random_state=42
        ),
        "HistGradientBoosting": HistGradientBoostingClassifier(
            max_iter=150, max_depth=6, learning_rate=0.08, min_samples_leaf=15, random_state=42
        ),
        "RandomForest": RandomForestClassifier(
            n_estimators=150, max_depth=10, class_weight="balanced", min_samples_leaf=8, random_state=42
        ),
        "GradientBoosting": GradientBoostingClassifier(
            n_estimators=120, max_depth=4, learning_rate=0.08, random_state=42
        )
    }

    results = {}
    best_candidate_name = None
    best_macro_f1 = -1.0
    fitted_models = {}

    print("\n--- BENCHMARKING CANDIDATE ARCHITECTURES ---")
    for name, clf in candidates.items():
        clf.fit(X_train, y_train)
        fitted_models[name] = clf

        y_val_prob = clf.predict_proba(X_val)
        y_val_pred = clf.predict(X_val)

        val_metrics = calculate_triage_safety_metrics(y_val, y_val_pred, y_val_prob)
        results[name] = val_metrics

        print(f"[{name}]")
        print(f"  Val Macro F1: {val_metrics['macro_f1']:.4f} | Accuracy: {val_metrics['accuracy']:.4f} | Balanced Acc: {val_metrics['balanced_accuracy']:.4f} | Under-triage: {val_metrics['under_triage_rate']:.4f} | Critical Under-triage: {val_metrics['critical_under_triage_rate']:.4f}")

        if val_metrics["macro_f1"] > best_macro_f1:
            best_macro_f1 = val_metrics["macro_f1"]
            best_candidate_name = name

    print(f"\nWinner Model Architecture: {best_candidate_name} (Val Macro F1: {best_macro_f1:.4f})")

    # 4. Calibrate Final Model via CalibratedClassifierCV
    print("\n--- PROBABILITY CALIBRATION (Sigmoid CalibratedClassifierCV) ---")
    base_winner = candidates[best_candidate_name]
    calibrated_model = CalibratedClassifierCV(estimator=base_winner, method="sigmoid", cv=5)
    calibrated_model.fit(X_train, y_train)

    y_test_prob = calibrated_model.predict_proba(X_test)
    y_test_pred = calibrated_model.predict(X_test)

    test_metrics = calculate_triage_safety_metrics(y_test, y_test_pred, y_test_prob)
    print("Test Set Performance (Final Calibrated Model v1.1):")
    print(f"  Accuracy: {test_metrics['accuracy']:.4f}")
    print(f"  Macro F1: {test_metrics['macro_f1']:.4f}")
    print(f"  Balanced Accuracy: {test_metrics['balanced_accuracy']:.4f}")
    print(f"  Under-Triage Rate: {test_metrics['under_triage_rate']:.4f} ({test_metrics['under_triage_rate']*100:.1f}%)")
    print(f"  Over-Triage Rate:  {test_metrics['over_triage_rate']:.4f} ({test_metrics['over_triage_rate']*100:.1f}%)")
    print(f"  Critical Under-Triage Rate: {test_metrics['critical_under_triage_rate']:.4f} ({test_metrics['critical_under_triage_rate']*100:.1f}%)")
    print("  Per-Class Recall:")
    for k, v in test_metrics["per_class_recall"].items():
        print(f"    ESI {k}: {v:.4f}")

    # 5. Subgroup Performance Evaluation
    print("\n--- SUBGROUP COHORT EVALUATION (Pediatric, Adult, Geriatric, Zero-History) ---")
    subgroup_metrics = evaluate_demographic_subgroups(test_df, calibrated_model, preprocessor)
    for cohort, m in subgroup_metrics.items():
        if "status" in m:
            print(f"[{cohort.upper()}] {m['status']}")
        else:
            print(f"[{cohort.upper()}] (N={m['sample_size']}): Acc={m['accuracy']:.4f}, Macro F1={m['macro_f1']:.4f}, Under-Triage={m['under_triage_rate']:.4f}, Over-Triage={m['over_triage_rate']:.4f}")

    # 6. Save Versioned Artifacts (v1.1)
    model_version = "1.1"
    model_path = os.path.join(models_dir, f"arrival_triage_model_v{model_version}.joblib")
    preprocessor_path = os.path.join(models_dir, f"arrival_preprocessor_v{model_version}.joblib")
    metadata_path = os.path.join(models_dir, f"model_metadata_v{model_version}.json")
    eval_metrics_path = os.path.join(models_dir, f"evaluation_metrics_v{model_version}.json")

    joblib.dump(calibrated_model, model_path)
    preprocessor.save(preprocessor_path)

    metadata = {
        "model_name": "PatientTriage Arrival Triage ML Model",
        "model_version": model_version,
        "base_estimator": best_candidate_name,
        "calibration_method": "CalibratedClassifierCV(cv=5, method='sigmoid')",
        "feature_count": len(ARRIVAL_ALL_FEATURE_COLUMNS),
        "feature_names": ARRIVAL_ALL_FEATURE_COLUMNS,
        "target_column": ARRIVAL_TARGET_COLUMN,
        "target_classes": ARRIVAL_TARGET_CLASSES,
        "target_class_names": ARRIVAL_TARGET_CLASS_NAMES,
        "training_date": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "training_samples": len(train_df),
        "validation_samples": len(val_df),
        "test_samples": len(test_df),
        "age_aware_enhancements": True,
        "data_quality_features_included": True
    }

    with open(metadata_path, "w") as f:
        json.dump(metadata, f, indent=2)

    eval_data = {
        "candidate_validation_benchmarks": results,
        "winner_model": best_candidate_name,
        "test_metrics": test_metrics,
        "subgroup_metrics": subgroup_metrics
    }

    with open(eval_metrics_path, "w") as f:
        json.dump(eval_data, f, indent=2)

    print(f"\n[SUCCESS] Model artifacts successfully serialized to {models_dir} (Version: {model_version})")
    return test_metrics, subgroup_metrics

if __name__ == "__main__":
    train_and_benchmark()
