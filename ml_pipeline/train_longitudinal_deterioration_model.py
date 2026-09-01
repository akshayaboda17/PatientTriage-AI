"""
Model Training, Benchmarking, Probability Calibration, and Subgroup Evaluation for Longitudinal Patient Deterioration (Task 3).
Trains and compares Logistic Regression, Random Forest, HistGradientBoosting, and Calibrated Ensembles.
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
from sklearn.calibration import CalibratedClassifierCV, calibration_curve
from sklearn.metrics import (
    roc_auc_score, average_precision_score, precision_score, recall_score,
    f1_score, brier_score_loss, confusion_matrix, accuracy_score
)

from ml_pipeline.longitudinal_schema import (
    LONGITUDINAL_FEATURE_COLUMNS,
    LONGITUDINAL_TARGET_COLUMN
)
from ml_pipeline.longitudinal_preprocessor import LongitudinalPreprocessor

def calculate_safety_metrics(y_true: np.ndarray, y_pred: np.ndarray, y_prob: np.ndarray) -> Dict[str, float]:
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred).ravel()
    
    roc_auc = float(roc_auc_score(y_true, y_prob))
    pr_auc = float(average_precision_score(y_true, y_prob))
    precision = float(precision_score(y_true, y_pred, zero_division=0))
    recall = float(recall_score(y_true, y_pred, zero_division=0))
    f1 = float(f1_score(y_true, y_pred, zero_division=0))
    brier = float(brier_score_loss(y_true, y_prob))
    accuracy = float(accuracy_score(y_true, y_pred))
    
    fnr = float(fn / max(1, (fn + tp))) # Safety-critical False Negative Rate
    fpr = float(fp / max(1, (fp + tn))) # False Positive / Alert Burden Rate

    return {
        "roc_auc": round(roc_auc, 4),
        "pr_auc": round(pr_auc, 4),
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "brier_score": round(brier, 4),
        "accuracy": round(accuracy, 4),
        "false_negative_rate": round(fnr, 4),
        "false_positive_rate": round(fpr, 4),
        "true_positives": int(tp),
        "false_positives": int(fp),
        "true_negatives": int(tn),
        "false_negatives": int(fn)
    }

def evaluate_subgroups(test_df: pd.DataFrame, model, preprocessor: LongitudinalPreprocessor) -> Dict[str, Any]:
    """
    Evaluates performance across Pediatric, Adult, and Geriatric demographic cohorts.
    """
    subgroups = {
        "pediatric": test_df[test_df["age"] < 18.0],
        "adult": test_df[(test_df["age"] >= 18.0) & (test_df["age"] < 65.0)],
        "geriatric": test_df[test_df["age"] >= 65.0]
    }
    
    results = {}
    for name, sub_df in subgroups.items():
        if len(sub_df) == 0:
            continue
        X_sub = preprocessor.transform(sub_df)
        y_true = sub_df[LONGITUDINAL_TARGET_COLUMN].values
        y_prob = model.predict_proba(X_sub)[:, 1]
        y_pred = (y_prob >= 0.50).astype(int)
        
        metrics = calculate_safety_metrics(y_true, y_pred, y_prob)
        results[name] = {
            "sample_size": len(sub_df),
            "positive_count": int(np.sum(y_true)),
            "positive_rate": round(float(np.mean(y_true)), 4),
            **metrics
        }
    return results

def train_and_evaluate():
    base_dir = os.path.dirname(__file__)
    data_dir = os.path.join(base_dir, "data")
    models_dir = os.path.join(base_dir, "models", "deterioration")
    os.makedirs(models_dir, exist_ok=True)

    print("=" * 80)
    print("PATIENTTRIAGE.AI — TASK 3 LONGITUDINAL DETERIORATION MODEL TRAINING")
    print("=" * 80)

    # 1. Load Data
    train_df = pd.read_csv(os.path.join(data_dir, "dataset_deterioration_v1.0_train.csv"))
    val_df = pd.read_csv(os.path.join(data_dir, "dataset_deterioration_v1.0_val.csv"))
    test_df = pd.read_csv(os.path.join(data_dir, "dataset_deterioration_v1.0_test.csv"))

    print(f"Loaded datasets: Train={len(train_df)}, Val={len(val_df)}, Test={len(test_df)}")

    # 2. Fit Preprocessor
    preprocessor = LongitudinalPreprocessor()
    X_train = preprocessor.fit_transform(train_df)
    X_val = preprocessor.transform(val_df)
    X_test = preprocessor.transform(test_df)

    y_train = train_df[LONGITUDINAL_TARGET_COLUMN].values
    y_val = val_df[LONGITUDINAL_TARGET_COLUMN].values
    y_test = test_df[LONGITUDINAL_TARGET_COLUMN].values

    # 3. Train Candidate Architectures
    candidates = {
        "LogisticRegression (Baseline)": LogisticRegression(
            C=1.0, penalty="l2", solver="lbfgs", max_iter=1000, class_weight="balanced", random_state=42
        ),
        "HistGradientBoosting": HistGradientBoostingClassifier(
            max_iter=150, max_depth=6, learning_rate=0.08, min_samples_leaf=20, random_state=42
        ),
        "RandomForest": RandomForestClassifier(
            n_estimators=120, max_depth=8, class_weight="balanced", min_samples_leaf=10, random_state=42
        ),
        "GradientBoosting": GradientBoostingClassifier(
            n_estimators=100, max_depth=4, learning_rate=0.08, random_state=42
        )
    }

    results = {}
    best_candidate_name = None
    best_roc_auc = -1.0
    fitted_models = {}

    print("\n--- BENCHMARKING CANDIDATE ARCHITECTURES ---")
    for name, clf in candidates.items():
        clf.fit(X_train, y_train)
        fitted_models[name] = clf
        
        y_val_prob = clf.predict_proba(X_val)[:, 1]
        y_val_pred = (y_val_prob >= 0.50).astype(int)
        
        val_metrics = calculate_safety_metrics(y_val, y_val_pred, y_val_prob)
        results[name] = val_metrics
        
        print(f"[{name}]")
        print(f"  Val ROC-AUC: {val_metrics['roc_auc']:.4f} | PR-AUC: {val_metrics['pr_auc']:.4f} | Recall: {val_metrics['recall']:.4f} | FNR: {val_metrics['false_negative_rate']:.4f} | F1: {val_metrics['f1']:.4f}")

        if val_metrics["roc_auc"] > best_roc_auc:
            best_roc_auc = val_metrics["roc_auc"]
            best_candidate_name = name

    print(f"\nWinner Model Architecture: {best_candidate_name} (ROC-AUC: {best_roc_auc:.4f})")

    # 4. Calibrate Final Model via CalibratedClassifierCV
    print("\n--- PROBABILITY CALIBRATION (Sigmoid CalibratedClassifierCV) ---")
    base_winner = candidates[best_candidate_name]
    calibrated_model = CalibratedClassifierCV(estimator=base_winner, method="sigmoid", cv=5)
    calibrated_model.fit(X_train, y_train)

    y_test_prob = calibrated_model.predict_proba(X_test)[:, 1]
    y_test_pred = (y_test_prob >= 0.50).astype(int)

    test_metrics = calculate_safety_metrics(y_test, y_test_pred, y_test_prob)
    print("Test Set Performance (Final Calibrated Model):")
    for k, v in test_metrics.items():
        print(f"  {k}: {v}")

    # 5. Subgroup Performance
    print("\n--- SUBGROUP COHORT EVALUATION ---")
    subgroup_metrics = evaluate_subgroups(test_df, calibrated_model, preprocessor)
    for cohort, m in subgroup_metrics.items():
        print(f"[{cohort.upper()}] (N={m['sample_size']}, Pos={m['positive_count']}): ROC-AUC={m['roc_auc']:.4f}, Recall={m['recall']:.4f}, FNR={m['false_negative_rate']:.4f}, F1={m['f1']:.4f}")

    # 6. Save Versioned Artifacts
    model_version = "1.0"
    model_path = os.path.join(models_dir, f"deterioration_model_v{model_version}.joblib")
    preprocessor_path = os.path.join(models_dir, f"deterioration_preprocessor_v{model_version}.joblib")
    metadata_path = os.path.join(models_dir, f"deterioration_metadata_v{model_version}.json")
    eval_metrics_path = os.path.join(models_dir, f"evaluation_metrics_v{model_version}.json")

    joblib.dump(calibrated_model, model_path)
    preprocessor.save(preprocessor_path)

    metadata = {
        "model_name": "PatientTriage Longitudinal Patient Deterioration Classifier",
        "model_version": model_version,
        "base_estimator": best_candidate_name,
        "calibration_method": "CalibratedClassifierCV(cv=5, method='sigmoid')",
        "feature_count": len(LONGITUDINAL_FEATURE_COLUMNS),
        "feature_names": LONGITUDINAL_FEATURE_COLUMNS,
        "target_column": LONGITUDINAL_TARGET_COLUMN,
        "training_date": datetime.datetime.utcnow().isoformat(),
        "training_slices": len(train_df),
        "validation_slices": len(val_df),
        "test_slices": len(test_df)
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

    print(f"\n[SUCCESS] Model artifacts successfully serialized to {models_dir}")
    return test_metrics, subgroup_metrics

if __name__ == "__main__":
    train_and_evaluate()
