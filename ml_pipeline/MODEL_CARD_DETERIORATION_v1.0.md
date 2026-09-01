# Model Card — Longitudinal Patient Deterioration Monitoring Model (v1.0)

## 1. Model Overview
- **Model Name**: PatientTriage.ai Longitudinal Patient Deterioration Monitoring Model
- **Version**: 1.0 (Release: 2026-09-01)
- **Model Architecture**: Multinomial Logistic Regression calibrated via `CalibratedClassifierCV(cv=5, method='sigmoid')` over 48 temporal trajectory features.
- **Primary Clinical Target**: `composite_critical_outcome_24h` (ICU admission, intubation, vasopressor administration, or in-hospital mortality within 24 hours of emergency department presentation).
- **Secondary Target**: `acute_deterioration_event` (Acute vital sign destabilization during ED wait time).

---

## 2. Intended Clinical Use
- **Primary Purpose**: Evaluates sequential vital sign trajectories ($T_0 \to T_1 \to \dots \to T_n$) for patients waiting in the Emergency Department to detect impending physiological decompensation early.
- **Decision Support**: Generates calibrated deterioration risk probabilities, risk categories (`CRITICAL`, `HIGH`, `MODERATE`, `LOW`), physiological factor contributions, and recommends priority escalation where appropriate.
- **Human Oversight & Governance**: The model is an **assistive clinical decision support tool**. It does **NOT** autonomously reassign final ESI levels. All queue prioritizations and clinical decisions remain under mandatory clinician review.

---

## 3. Strict Temporal Feature Architecture & Anti-Leakage
The model consumes exactly 48 temporal features computed exclusively from observations recorded $\le T_n$:
1. **Current Point-in-Time Vitals ($T_n$)**: `hr`, `sbp`, `dbp`, `rr`, `spo2`, `temp`, `gcs`, `pain_score`
2. **Current Acuity Biomarkers ($T_n$)**: `shock_index`, `modified_shock_index`, `pulse_pressure`, `mean_arterial_pressure`, `qsofa_score`, `mews_score`
3. **Sequential 1-Step Deltas ($T_n - T_{n-1}$)**: `delta_hr`, `delta_spo2`, `delta_rr`, `delta_sbp`, `delta_dbp`, `delta_temp`, `delta_gcs`, `delta_shock_index`
4. **Per-Minute Rates of Change**: `velocity_hr`, `velocity_spo2`, `velocity_rr`, `velocity_sbp`, `velocity_shock_index`
5. **Cumulative Baseline Deltas ($T_n - T_0$)**: `baseline_hr_delta`, `baseline_spo2_delta`, `baseline_rr_delta`, `baseline_sbp_delta`
6. **Trajectory Statistics ($T_0 \dots T_n$)**: `rolling_min_spo2`, `rolling_max_hr`, `rolling_max_rr`, `rolling_min_sbp`, `rolling_mean_hr`, `rolling_mean_spo2`, `trajectory_slope_spo2`, `trajectory_slope_hr`, `trajectory_slope_rr`
7. **Operational Context**: `observation_count`, `time_since_arrival_mins`, `minutes_since_prior_obs`, `initial_triage_level`, `is_pediatric`, `is_geriatric`, `age`, `gender_male`, chief complaint categories.

### Prohibited Leakage Columns (Anti-Leakage Interlocks):
- Future outcome labels (`composite_critical_outcome_24h`, `icu_admitted_24h`, `intubation_24h`, `vasopressor_24h`, `mortality_24h`).
- Post-prediction events (`discharge_time`, `final_diagnosis`, `length_of_stay_minutes`).
- Future observations ($T_{>n}$).

---

## 4. Training Data & Partitioning
- **Cohort Size**: 4,500 patient encounters sliced into 15,749 temporal trajectory observations.
- **Partitioning**: Strict `patient_id` group split with **0% patient overlap**:
  - **Train**: 10,999 slices across 3,150 unique patients (70%)
  - **Validation**: 2,362 slices across 675 unique patients (15%)
  - **Test**: 2,388 slices across 675 unique patients (15%)

---

## 5. Quantitative Safety Performance Metrics

| Metric | Test Set (Calibrated v1.0) | Clinical Safety Target |
| :--- | :---: | :---: |
| **ROC-AUC** | **0.8847** | $\ge 0.85$ |
| **PR-AUC (Avg Precision)** | **0.7985** | $\ge 0.70$ |
| **Recall / Sensitivity** | **81.49%** | $\ge 80.0\%$ |
| **False Negative Rate (FNR)** | **18.51%** | $\le 20.0\%$ |
| **Precision** | **81.65%** | $\ge 75.0\%$ |
| **F1 Score** | **0.8157** | $\ge 0.78$ |
| **Brier Score (Calibration)** | **0.1255** | $\le 0.15$ |
| **Overall Accuracy** | **84.09%** | $\ge 80.0\%$ |

---

## 6. Subgroup Demographic Breakdown

| Demographic Cohort | Sample Size ($N$) | Positives | ROC-AUC | Recall | False Negative Rate | F1 Score |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Pediatric ($< 18$ yrs)** | 61 | 26 | **0.8066** | **96.15%** | **3.85%** | **0.7937** |
| **Adult ($18-64$ yrs)** | 1,823 | 799 | **0.8808** | **79.85%** | **20.15%** | **0.8071** |
| **Geriatric ($\ge 65$ yrs)** | 504 | 207 | **0.9076** | **85.99%** | **14.01%** | **0.8517** |

---

## 7. Hybrid Safety Architecture
1. **Deterministic Safety Rules (Interlocks)**: Catastrophic vital signs trigger immediate critical escalation regardless of model probability ($\text{SpO}_2 < 85\%$, $\text{SBP} < 70\text{ mmHg}$, $\text{GCS} \le 8$, $\text{SI} \ge 1.3$).
2. **Predictive Trajectory ML**: Early warning signals before catastrophic collapse ($\text{velocity}_{\text{SpO}_2} < -0.3\%/\text{min}$, surging shock index, narrowing pulse pressure).
3. **Protocolized Reassessment**: Recommends priority escalation with exact physiological deltas ($T_0 \to T_n$).
4. **Mandatory Clinician Review**: Requires clinician acknowledgement, override reasoning, and audit trail logging.

---

## 8. Limitations & Synthetic Data Disclosure
> [!WARNING]
> **Synthetic Development Cohort Disclosure**: This model version was trained on synthetic emergency department physiological cohorts designed to reflect clinically plausible trajectory distributions. It has not undergone multi-center clinical trials. In production deployments, it must be retrained on validated, institutional clinical datasets with Institutional Review Board (IRB) and clinical governance oversight.
