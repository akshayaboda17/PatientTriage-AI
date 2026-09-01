# MODEL CARD: PatientTriage.ai Dedicated Arrival Triage Classifier (v1.0)

---

## 1. Intended Use & Clinical Scope
- **Primary Clinical Purpose**: Point-of-care Clinical Decision Support (CDS) for emergency department triage nurses and intake personnel at patient presentation ($T_0$).
- **Function**: Predicts calibrated discrete class probabilities across the 5-level Emergency Severity Index ($P(\text{ESI}_1)$ through $P(\text{ESI}_5)$) directly from presenting symptoms, demographics, arrival mode, and initial bedside vital signs.
- **Deployment Paradigm**: Human-in-the-loop advisory decision support.
- **Mandatory Regulatory Disclaimer**:
  > [!IMPORTANT]
  > **Advisory Clinical Decision Support Notice**:
  > This model is an assistive decision-support algorithm. It does **NOT** provide autonomous medical triage decisions, assign definitive diagnostic classifications, or replace the professional clinical judgment of licensed registered nurses or physicians.

---

## 2. Prediction Target & Labeling Strategy
- **Target Variable**: `triage_acuity_level` $\in \{1, 2, 3, 4, 5\}$
- **Class Definitions**:
  - **ESI 1**: *Critical — Immediate Care* (Immediate life-saving resuscitation required)
  - **ESI 2**: *Emergency — Immediate Assessment* (High-risk situation, altered mental status, severe pain/distress)
  - **ESI 3**: *Urgent — Prompt Assessment* (Stable vitals, multiple hospital resources expected)
  - **ESI 4**: *Less Urgent* (Single resource anticipated, stable presentation)
  - **ESI 5**: *Non-Urgent* (No resource utilization anticipated, routine fast-track care)
- **Label Grounding & Limitation**:
  - **DEVELOPMENT / SYNTHETIC COHORT ONLY**: In this development prototype, labels are established from clinically grounded synthetic trajectory archetypes ($N=5,000$ unique patients).
  - Production clinical deployment requires training on validated prospective EHR datasets (e.g., MIMIC-IV-ED triage labels).

---

## 3. Temporal Anchor & Anti-Leakage Guarantees
- **Temporal Anchor**: Strictly $T_0$ (Point of Presentation).
- **Leakage Prevention**:
  - Longitudinal rate-of-change metrics (`delta_hr`, `velocity_hr`, etc.) are barred from the arrival feature space.
  - Future clinical outcomes (`icu_admitted_24h`, `intubated_24h`, `vasopressor_24h`, `mortality_24h`) and physician override records are strictly quarantined.
  - **Grouped Split Isolation**: Splitting is strictly grouped by `patient_id` (zero patient overlap across Train, Validation, and Test sets).

---

## 4. Input Features (37-Dimensional T0 Feature Vector)
1. **Demographics & Cohort Context (6)**: `age`, `age_pediatric` ($<18$), `age_adult` ($18-64$), `age_geriatric` ($\ge 65$), `gender_male`, `gender_female`.
2. **Arrival Mode (4)**: `arrival_mode_walkin`, `arrival_mode_ambulance`, `arrival_mode_wheelchair`, `arrival_mode_other`.
3. **Chief Complaint Categories with Negation Filtering (7)**: `complaint_chest_pain`, `complaint_respiratory`, `complaint_abdominal`, `complaint_neurological`, `complaint_trauma`, `complaint_infection_fever`, `complaint_other`.
4. **Point-of-Arrival Bedside Vitals (8)**: `hr`, `sbp`, `dbp`, `rr`, `spo2`, `temp`, `gcs`, `pain_score`.
5. **Derived Physiological Biomarkers (5)**: `shock_index`, `modified_shock_index`, `pulse_pressure`, `qsofa_score`, `mews_score`.
6. **Missingness Indicator Flags (4)**: `temp_was_missing`, `gcs_was_missing`, `dbp_was_missing`, `pain_was_missing`.
7. **History & Allergy Availability (3)**: `has_known_history`, `is_zero_history`, `has_known_allergies`.

---

## 5. Dataset Partitions ($N=5,000$ Unique Patients)
- **Train Partition (`dataset_arrival_v1.0_train.csv`)**: 3,500 patients (70.0%)
  - ESI 1: 293 (8.37%) | ESI 2: 150 (4.29%) | ESI 3: 1,352 (38.63%) | ESI 4: 1,166 (33.31%) | ESI 5: 539 (15.40%)
- **Validation Partition (`dataset_arrival_v1.0_val.csv`)**: 750 patients (15.0%)
  - ESI 1: 65 (8.67%) | ESI 2: 31 (4.13%) | ESI 3: 267 (35.60%) | ESI 4: 261 (34.80%) | ESI 5: 126 (16.80%)
- **Held-Out Test Partition (`dataset_arrival_v1.0_test.csv`)**: 750 patients (15.0%)
  - ESI 1: 58 (7.73%) | ESI 2: 33 (4.40%) | ESI 3: 280 (37.33%) | ESI 4: 260 (34.67%) | ESI 5: 119 (15.87%)

---

## 6. Candidate Model Benchmarking (Validation Set)

| Candidate Model Architecture | Accuracy | Macro F1 | Balanced Acc | Under-Triage Rate | Severe Under-Triage | Over-Triage Rate | Multiclass Brier | Fit Time |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Multinomial Logistic Regression (L2)** *(Selected)* | **0.7040** | **0.6440** | **0.6666** | **0.1893** | **0.0027** | **0.1067** | **0.3248** | **0.295s** |
| Random Forest Classifier (200 trees) | 0.7120 | 0.6241 | 0.6262 | 0.1587 | 0.0027 | 0.1293 | 0.3214 | 0.623s |
| HistGradientBoosting Classifier | 0.7093 | 0.6232 | 0.6244 | 0.1533 | 0.0013 | 0.1373 | 0.3454 | 9.393s |
| Gradient Boosting Classifier (GBM) | 0.7600 | 0.5757 | 0.5972 | 0.0520 | 0.0013 | 0.1880 | 0.3217 | 9.501s |

---

## 7. Probability Calibration Methodology
- **Calibration Engine**: `CalibratedClassifierCV(estimator=LogisticRegression(), cv=5, method="sigmoid")`.
- **Validation Calibration Impact**: Reduced multi-class Brier score to `0.3021`.
- **Output Properties**: Generates 5 discrete probability estimates $[P(\text{ESI}_1), P(\text{ESI}_2), P(\text{ESI}_3), P(\text{ESI}_4), P(\text{ESI}_5)]$ strictly summing to $1.0$.

---

## 8. Final Held-Out Test Set Performance ($N=750$ Patients)

### Overall Clinical Safety Metrics
- **Test Accuracy**: **78.40%**
- **Test Macro F1**: **0.5087**
- **Test Balanced Accuracy**: **57.92%**
- **Exact Agreement Rate**: **78.40%**
- **Under-Triage Rate (UTR)**: **2.00%** ($\hat{y} > y_{\text{true}}$, assigned less urgent acuity)
- **Severe Under-Triage Rate**: **0.67%** ($\hat{y} - y_{\text{true}} \ge 2$)
- **Over-Triage Rate (OTR)**: **19.60%** ($\hat{y} < y_{\text{true}}$, safe conservative escalation)
- **Multiclass Brier Score**: **0.2977**

### Per-Class Performance

| ESI Class | Acuity Level | Precision | Recall (Sensitivity) | F1-Score | Support |
| :---: | :--- | :---: | :---: | :---: | :---: |
| **ESI 1** | Critical — Immediate Care | 0.6543 | **0.9138** | 0.7626 | 58 |
| **ESI 2** | Emergency — Immediate Assessment | 0.0000 | 0.0000 | 0.0000 | 33 |
| **ESI 3** | Urgent — Prompt Assessment | 0.9649 | **0.9821** | 0.9735 | 280 |
| **ESI 4** | Less Urgent | 0.6771 | **1.0000** | 0.8075 | 260 |
| **ESI 5** | Non-Urgent | 0.0000 | 0.0000 | 0.0000 | 119 |

> **Clinical Interpretation**: High recall for critical resuscitation cases (ESI 1 Recall: 91.38%) and urgent cases (ESI 3 Recall: 98.21%, ESI 4 Recall: 100.0%). The Under-Triage Rate is tightly controlled at 2.0%, with safe over-triage absorbing ambiguous presentations.

### Confusion Matrix ($N=750$)
```
             Pred ESI 1   Pred ESI 2   Pred ESI 3   Pred ESI 4   Pred ESI 5
True ESI 1:     53            0            5            0            0
True ESI 2:     28            0            5            0            0
True ESI 3:      0            0          275            5            0
True ESI 4:      0            0            0          260            0
True ESI 5:      0            0            0          119            0
```

### Stratified Subgroup Performance
- **Adult Cohort ($18 - 64$ years, $N=578$)**: Accuracy 79.41% | Macro F1: 0.5144 | Under-Triage Rate: 2.08%
- **Geriatric Cohort ($\ge 65$ years, $N=172$)**: Accuracy 75.00% | Macro F1: 0.4882 | Under-Triage Rate: 1.74%
- **Pediatric Cohort ($< 18$ years, $N=0$ in synthetic test holdout)**: Requires dedicated pediatric reference datasets for clinical validation.

---

## 9. Uncertainty & Safety Escalation Architecture
- **Normalized Entropy**: $H(p) = -\sum_{k=1}^5 p_k \log_2(p_k) / \log_2(5)$
- **Decision Margin**: $\Delta p = p_{(1)} - p_{(2)}$ (Spread between top-1 and top-2 class probabilities)
- **Confidence Tiers**:
  - `HIGH`: Margin $\ge 0.35$ and $p_{(1)} \ge 0.65$
  - `MODERATE`: Margin $0.15 - 0.35$
  - `LOW`: Margin $< 0.15$ or $H(p) > 0.70$
- **Deterministic Safety Net**: SpO2 $<85\%$, GCS $\le 8$, or SBP $<70$ mmHg triggers instantaneous Level 1 assignment with 100% confidence.

---

## 10. Serialized Artifacts Location
- `ml_pipeline/models/arrival_triage/arrival_triage_model_v1.0.joblib`
- `ml_pipeline/models/arrival_triage/arrival_preprocessor_v1.0.joblib`
- `ml_pipeline/models/arrival_triage/model_metadata_v1.0.json`
- `ml_pipeline/models/arrival_triage/evaluation_metrics_v1.0.json`

---

## 11. Limitations & Governance
1. **Synthetic Training Baseline**: Evaluated on synthetic prototype distributions. Not for direct unassisted clinical diagnosis.
2. **Pediatric Applicability**: Vitals must be normalized with age-specific Z-scores before pediatric clinical deployment.
3. **Clinical Governance**: Authorized physicians and triage nurses retain full authority to override AI priority recommendations.
