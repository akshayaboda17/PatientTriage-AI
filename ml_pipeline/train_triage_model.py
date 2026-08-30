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
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.metrics import (
    roc_auc_score, average_precision_score, confusion_matrix,
    brier_score_loss, precision_score, recall_score
)

# Add project root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from ml_pipeline.schema import (
    ALL_FEATURE_COLUMNS,
    NUMERICAL_FEATURE_COLUMNS,
    CATEGORICAL_BINARY_FEATURE_COLUMNS,
    TARGET_COLUMNS
)
from ml_pipeline.preprocessor import ClinicalPreprocessor

def compute_clinical_metrics(y_true: np.ndarray, y_prob: np.ndarray, threshold: float = 0.5) -> Dict[str, Any]:
    """
    Computes rigorous clinical evaluation metrics for binary risk prediction.
    """
    y_pred = (y_prob >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred).ravel()

    auroc = float(roc_auc_score(y_true, y_prob))
    auprc = float(average_precision_score(y_true, y_prob))
    brier = float(brier_score_loss(y_true, y_prob))
    
    sensitivity = float(tp / (tp + fn)) if (tp + fn) > 0 else 0.0 # Recall
    specificity = float(tn / (tn + fp)) if (tn + fp) > 0 else 0.0
    ppv = float(tp / (tp + fp)) if (tp + fp) > 0 else 0.0         # Precision
    npv = float(tn / (tn + fn)) if (tn + fn) > 0 else 0.0

    return {
        "auroc": round(auroc, 4),
        "auprc": round(auprc, 4),
        "brier_score": round(brier, 4),
        "sensitivity": round(sensitivity, 4),
        "specificity": round(specificity, 4),
        "ppv": round(ppv, 4),
        "npv": round(npv, 4),
        "threshold": threshold,
        "confusion_matrix": {
            "tp": int(tp),
            "fp": int(fp),
            "tn": int(tn),
            "fn": int(fn)
        }
    }

def train_and_evaluate_all():
    print("=" * 85)
    print("PATIENTTRIAGE.AI — SUPERVISED ML MODEL TRAINING & BENCHMARKING (v1.0)")
    print("=" * 85)

    base_dir = os.path.dirname(__file__)
    data_dir = os.path.join(base_dir, "data")
    models_dir = os.path.join(base_dir, "models")
    os.makedirs(models_dir, exist_ok=True)

    # 1. Load Data Partitions
    print("\n[1/6] Ingesting Verified Grouped Partitions...")
    df_train = pd.read_csv(os.path.join(data_dir, "dataset_v1.0_train.csv"))
    df_val = pd.read_csv(os.path.join(data_dir, "dataset_v1.0_val.csv"))
    df_test = pd.read_csv(os.path.join(data_dir, "dataset_v1.0_test.csv"))

    target_col = "composite_critical_outcome_24h"
    y_train = df_train[target_col].values.astype(int)
    y_val = df_val[target_col].values.astype(int)
    y_test = df_test[target_col].values.astype(int)

    print(f"  --> Train Set: {len(df_train)} rows | {y_train.sum()} Positives ({y_train.mean():.2%})")
    print(f"  --> Val Set:   {len(df_val)} rows | {y_val.sum()} Positives ({y_val.mean():.2%})")
    print(f"  --> Test Set:  {len(df_test)} rows | {y_test.sum()} Positives ({y_test.mean():.2%}) [HELD-OUT]")

    # 2. Fit Preprocessor exclusively on Training set
    print("\n[2/6] Fitting Clinical Preprocessor on Training Partition (Zero Leakage)...")
    preprocessor = ClinicalPreprocessor(scale_numerical=False)
    X_train = preprocessor.fit_transform(df_train)
    X_val = preprocessor.transform(df_val)
    X_test = preprocessor.transform(df_test)
    print(f"  --> Feature Matrix Dimensions: {X_train.shape[1]} features (all validated float32)")

    # 3. Define Candidate Baseline Models
    candidate_models = {
        "Logistic Regression (L2)": LogisticRegression(
            max_iter=1000,
            class_weight="balanced",
            random_state=42
        ),
        "Decision Tree": DecisionTreeClassifier(
            max_depth=6,
            min_samples_split=10,
            class_weight="balanced",
            random_state=42
        ),
        "Random Forest": RandomForestClassifier(
            n_estimators=150,
            max_depth=10,
            min_samples_split=5,
            class_weight="balanced",
            random_state=42,
            n_jobs=-1
        ),
        "Gradient Boosting (GBM)": GradientBoostingClassifier(
            n_estimators=150,
            learning_rate=0.05,
            max_depth=4,
            random_state=42
        )
    }

    # 4. Train and Compare Models on Validation Set
    print("\n[3/6] Fitting Candidate Models & Evaluating on Validation Set...")
    val_results = {}
    fitted_models = {}

    for name, model in candidate_models.items():
        t0 = time.time()
        model.fit(X_train, y_train)
        train_time = time.time() - t0

        y_val_prob = model.predict_proba(X_val)[:, 1]
        metrics = compute_clinical_metrics(y_val, y_val_prob, threshold=0.5)
        metrics["train_time_sec"] = round(train_time, 3)

        val_results[name] = metrics
        fitted_models[name] = model

    # Print Validation Comparison Table
    print("\n" + "=" * 95)
    print(f"{'Model Architecture':<28} | {'AUROC':<7} | {'AUPRC':<7} | {'Sens':<6} | {'Spec':<6} | {'PPV':<6} | {'NPV':<6} | {'Brier':<6} | {'Time (s)'}")
    print("-" * 95)
    for name, m in val_results.items():
        print(f"{name:<28} | {m['auroc']:<7.4f} | {m['auprc']:<7.4f} | {m['sensitivity']:<6.4f} | {m['specificity']:<6.4f} | {m['ppv']:<6.4f} | {m['npv']:<6.4f} | {m['brier_score']:<6.4f} | {m['train_time_sec']}s")
    print("=" * 95)

    # 5. Model Selection (Predefined Criteria: Highest Validation AUPRC & AUROC)
    best_model_name = max(val_results, key=lambda k: (val_results[k]["auprc"], val_results[k]["auroc"]))
    best_model = fitted_models[best_model_name]
    print(f"\n[4/6] Model Selection Winner: '{best_model_name}' (Highest Validation AUPRC: {val_results[best_model_name]['auprc']:.4f})")

    # 6. Final Test Set Evaluation (Freezing Model & Evaluating Exactly Once)
    print("\n[5/6] Freezing Model & Evaluating EXACTLY ONCE on Unseen Test Partition...")
    y_test_prob = best_model.predict_proba(X_test)[:, 1]
    test_metrics = compute_clinical_metrics(y_test, y_test_prob, threshold=0.5)

    print("\n" + "=" * 65)
    print(f"FINAL UNBIASED TEST EVALUATION — {best_model_name.upper()}")
    print("=" * 65)
    print(f"  • Test AUROC:        {test_metrics['auroc']:.4f}")
    print(f"  • Test AUPRC:        {test_metrics['auprc']:.4f}")
    print(f"  • Test Sensitivity:  {test_metrics['sensitivity']:.4f} (Recall)")
    print(f"  • Test Specificity:  {test_metrics['specificity']:.4f}")
    print(f"  • Test PPV:          {test_metrics['ppv']:.4f} (Precision)")
    print(f"  • Test NPV:          {test_metrics['npv']:.4f}")
    print(f"  • Test Brier Score:  {test_metrics['brier_score']:.4f} (Calibration)")
    print(f"  • Confusion Matrix:  TP={test_metrics['confusion_matrix']['tp']} | FP={test_metrics['confusion_matrix']['fp']} | TN={test_metrics['confusion_matrix']['tn']} | FN={test_metrics['confusion_matrix']['fn']}")
    print("=" * 65)

    # 7. Serialize Model Artifact, Preprocessor, and Cryptographic Metadata
    print("\n[6/6] Serializing Production Candidate Model Bundle (v1.0)...")
    model_version = "1.0"
    model_artifact_path = os.path.join(models_dir, f"triage_risk_model_v{model_version}.joblib")
    preprocessor_path = os.path.join(models_dir, f"preprocessor_v{model_version}.joblib")
    metadata_path = os.path.join(models_dir, f"model_metadata_v{model_version}.json")

    joblib.dump(best_model, model_artifact_path)
    preprocessor.save(preprocessor_path)

    metadata = {
        "model_name": "PatientTriage Decompensation Risk Classifier",
        "model_version": model_version,
        "model_type": type(best_model).__name__,
        "selected_architecture": best_model_name,
        "trained_at": pd.Timestamp.utcnow().isoformat(),
        "random_seed": 42,
        "feature_schema_version": "1.0",
        "feature_count": len(ALL_FEATURE_COLUMNS),
        "feature_columns": ALL_FEATURE_COLUMNS,
        "target_column": target_col,
        "prediction_horizon": "24_hours",
        "hyperparameters": {k: str(v) for k, v in best_model.get_params().items()},
        "dataset_metadata": {
            "train_samples": len(df_train),
            "val_samples": len(df_val),
            "test_samples": len(df_test),
            "train_pos_rate": float(y_train.mean()),
            "val_pos_rate": float(y_val.mean()),
            "test_pos_rate": float(y_test.mean())
        },
        "validation_comparison": val_results,
        "final_test_metrics": test_metrics,
        "environment": {
            "python_version": platform.python_version(),
            "scikit_learn_version": sklearn.__version__,
            "platform": platform.platform()
        }
    }

    with open(metadata_path, "w") as f:
        json.dump(metadata, f, indent=2)

    print(f"  --> Saved Model Artifact:       {os.path.basename(model_artifact_path)}")
    print(f"  --> Saved Preprocessor Artifact: {os.path.basename(preprocessor_path)}")
    print(f"  --> Saved Model Metadata:       {os.path.basename(metadata_path)}")
    print("\n[SUCCESS] Model training and evaluation completed successfully!")

    return metadata

if __name__ == "__main__":
    train_and_evaluate_all()
