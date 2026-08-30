# MODEL CARD: PatientTriage.ai Clinical Risk Classifier (v1.0)

---

## 1. Intended Use
- **Primary Clinical Purpose**: Point-of-care Clinical Decision Support (CDS) for emergency department triage nurses and emergency physicians.
- **Function**: Estimates the calibrated probability of acute physiological decompensation within 24 hours of ED presentation to assist in early risk stratification, bed placement, and clinical monitoring intensity.
- **Deployment Paradigm**: Human-in-the-loop advisory decision support. The model does **NOT** autonomously make admission, discharge, or medication decisions.

---

## 2. Prediction Target
- **Primary Label ($Y$)**: `composite_critical_outcome_24h` $\in \{0, 1\}$.
- **Positive Outcome ($Y=1$)**: Verified occurrence of unplanned ICU transfer, invasive endotracheal intubation, continuous vasoactive infusion, or 24-hour in-hospital mortality.
- **Negative Outcome ($Y=0$)**: Patient remained hemodynamically stable without critical intervention.

---

## 3. Prediction Horizon
- **Time Window**: 24 hours from observation timestamp ($[t_{\text{obs}}, t_{\text{obs}} + 24\text{h}]$).
- **Early Warning Window**: 2 to 6 hours before acute cardiopulmonary collapse.

---

## 4. Input Features (40-Feature Vector)
- **Demographics (3)**: `age`, `gender_male`, `gender_female`.
- **Arrival Context (5)**: `elapsed_wait_minutes`, `arrival_mode_walkin`, `arrival_mode_ambulance`, `arrival_mode_wheelchair`, `arrival_mode_other`.
- **Chief Complaint Categories (7)**: `complaint_chest_pain`, `complaint_respiratory`, `complaint_abdominal`, `complaint_neurological`, `complaint_trauma`, `complaint_infection_fever`, `complaint_other`.
- **Point-in-Time Vitals (8)**: `hr`, `sbp`, `dbp`, `rr`, `spo2`, `temp`, `gcs`, `pain_score`.
- **Derived Biomarkers (5)**: `shock_index`, `modified_shock_index`, `pulse_pressure`, `qsofa_score`, `mews_score`.
- **Longitudinal Rates of Change (7)**: `delta_hr`, `delta_spo2`, `delta_sbp`, `delta_rr`, `velocity_hr`, `velocity_spo2`, `observation_index`.
- **Missingness Flags (5)**: `is_initial_observation`, `temp_was_missing`, `gcs_was_missing`, `dbp_was_missing`, `pain_was_missing`.

---

## 5. Training Dataset
- **Dataset Partition**: `dataset_v1.0_train.csv` (8,097 total observation timepoints across 5,000 unique patients).
- **Training Cohort**: 5,676 samples across 3,500 patients (70% split).
- **Class Balance**: 1,258 positive critical events (22.16%) vs 4,418 negative events (77.84%).

---

## 6. Data Preprocessing
- Handled via `ClinicalPreprocessor`:
  - Standardizes column order matching `ALL_FEATURE_COLUMNS`.
  - Imputes missing physiological parameters with clinical median/normal defaults and marks indicator flags.
  - Fits preprocessor parameters exclusively on the training set to prevent test-set distribution leakage.

---

## 7. Model Architecture
- **Selected Architecture**: `GradientBoostingClassifier` (Tree Ensemble with 150 estimators, learning rate 0.05, max depth 4).
- **Benchmark Baselines Compared**:
  1. Logistic Regression (L2 Regularized)
  2. Decision Tree Classifier (`max_depth=6`)
  3. Random Forest Classifier (`n_estimators=150`, `max_depth=10`)
  4. Gradient Boosting Classifier (`n_estimators=150`, `max_depth=4`)

---

## 8. Training Methodology
- Trained on `X_train` with cross-entropy log-loss minimization.
- Random Seed: `42` for exact mathematical reproducibility.

---

## 9. Validation Methodology
- Evaluated on isolated validation partition `dataset_v1.0_val.csv` (1,207 samples, 750 patients, 23.61% positive rate).
- Model selection determined by highest Area Under Precision-Recall Curve (AUPRC) and Area Under ROC Curve (AUROC).

---

## 10. Test Methodology
- Evaluated **exactly once** on the held-out test partition `dataset_v1.0_test.csv` (1,214 samples, 750 patients, 21.99% positive rate).
- Zero patient overlap between training and testing sets.

---

## 11. Performance Metrics (Held-Out Test Set)
- **AUROC**: **0.9995**
- **AUPRC**: **0.9983**
- **Sensitivity (Recall)**: **98.50%**
- **Specificity**: **99.68%**
- **Positive Predictive Value (Precision)**: **98.87%**
- **Negative Predictive Value**: **99.58%**
- **Brier Score Calibration**: **0.0076** (near-optimal probabilistic calibration)
- **Confusion Matrix**: $\text{TP}=263, \text{FP}=3, \text{TN}=944, \text{FN}=4$ ($N=1,214$)

---

## 12. Known Limitations
1. **Development Cohort Grounding**: Performance is evaluated on a physiologically coherent synthetic development cohort ($N=5,000$). Real clinical deployment requires validation against prospective EHR datasets (e.g. MIMIC-IV-ED).
2. **Missing Biomarkers**: Model does not currently ingest real-time laboratory blood gases (lactate, troponin, blood pH) or continuous waveform ECG.
3. **Pediatric Extrapolation**: Model training bounds are calibrated for adult patients ($\text{age} \ge 18$). Pediatric triage requires age-adjusted vital sign ranges.

---

## 13. Intended Users
- Emergency Medicine Attending Physicians and Residents.
- ED Triage and Staff Registered Nurses.
- Clinical Operations and Hospital Quality Directors.

---

## 14. Out-of-Scope Uses
- **Autonomous triage**: Never replace human nursing intake or physician clinical judgment.
- **Outpatient / Primary Care Clinics**: Calibrated strictly for acute emergency department settings.
- **Pediatric intensive care**: Do not apply to neonatal or pediatric patients without dedicated models.

---

## 15. Data Leakage Protections
- **Zero Temporal Leakage**: Strictly utilizes point-in-time features ($t \le t_{\text{obs}}$).
- **Prohibited Blacklist**: Physician disposition decisions (`ADMIT_INPATIENT`, `ESCALATE_CARE`), AI agreement/override flags, and discharge diagnoses are strictly barred from entering feature matrices.
- **Grouped Split Isolation**: All timepoints from a given patient remain exclusively within one split fold.

---

## 16. Ethical & Privacy Considerations
- **Data Minimization**: Direct identifiers (Patient Name, MRN, Phone Number) are stripped prior to inference.
- **Safety Interlock**: Catastrophic vitals ($\text{SpO}_2 < 85\%$, $\text{GCS} \le 8$, $\text{SBP} < 70$) trigger a deterministic safety net regardless of model probability.
- **Auditability**: Every prediction, input snapshot, confidence score, and physician review decision is recorded in the immutable clinical audit log.
