"""
Clinical Schema and Feature Definitions for Longitudinal Patient Deterioration Monitoring (Task 3).
Defines chronological trajectory feature vectors, bounds, targets, and strict anti-leakage rules.
"""
from typing import List, Dict, Tuple

# ----------------------------------------------------
# 1. Target Variable Definition
# ----------------------------------------------------
# Primary Target: 24-hour composite critical outcome (ICU admission, intubation, vasopressor, or mortality)
LONGITUDINAL_TARGET_COLUMN = "composite_critical_outcome_24h"

# Secondary/Clinical Trajectory Flag (decompensation detected during ED stay)
LONGITUDINAL_EVENT_COLUMN = "acute_deterioration_event"

# ----------------------------------------------------
# 2. Strict Anti-Leakage Prohibited Columns
# ----------------------------------------------------
# Any field from future timestamps (> Tn), post-triage interventions, or target components
# MUST NEVER enter feature extraction.
PROHIBITED_LONGITUDINAL_LEAKAGE_COLUMNS = [
    # Future Outcomes / Labels
    "composite_critical_outcome_24h",
    "icu_admitted_24h",
    "intubation_24h",
    "vasopressor_24h",
    "mortality_24h",
    "mortality_in_hospital",
    "cardiac_arrest_24h",
    
    # Future Dispositions & Post-Prediction Interventions
    "disposition",
    "discharge_disposition",
    "discharge_time",
    "length_of_stay_minutes",
    "length_of_stay_hours",
    "total_ed_los_mins",
    "admitted_to_icu",
    "final_diagnosis",
    "icd10_primary",
    
    # Future Observation Timestamps
    "future_observation_time",
    "subsequent_hr",
    "subsequent_spo2",
    "subsequent_rr",
    "subsequent_sbp"
]

# ----------------------------------------------------
# 3. Complete Longitudinal Feature Columns (48 Features)
# ----------------------------------------------------
LONGITUDINAL_FEATURE_COLUMNS: List[str] = [
    # --- A. Current Point-in-Time Vitals (Tn) ---
    "hr",
    "sbp",
    "dbp",
    "rr",
    "spo2",
    "temp",
    "gcs",
    "pain_score",

    # --- B. Current Physiological Acuity Scores (Tn) ---
    "shock_index",              # HR / SBP
    "modified_shock_index",     # HR / MAP
    "pulse_pressure",           # SBP - DBP
    "mean_arterial_pressure",   # DBP + (SBP - DBP)/3
    "qsofa_score",              # Quick SOFA (0-3)
    "mews_score",               # Modified Early Warning Score (0-14)

    # --- C. Sequential 1-Step Deltas (Tn - Tn-1) ---
    "delta_hr",
    "delta_spo2",
    "delta_rr",
    "delta_sbp",
    "delta_dbp",
    "delta_temp",
    "delta_gcs",
    "delta_shock_index",

    # --- D. Rates of Change / Velocities (Units per minute) ---
    "velocity_hr",              # d(HR)/dt (bpm/min)
    "velocity_spo2",            # d(SpO2)/dt (%/min)
    "velocity_rr",              # d(RR)/dt (breaths/min^2)
    "velocity_sbp",             # d(SBP)/dt (mmHg/min)
    "velocity_shock_index",     # d(SI)/dt (ratio/min)

    # --- E. Cumulative Trajectory across Full Encounter History (T0 -> Tn) ---
    "baseline_hr_delta",        # HR(Tn) - HR(T0)
    "baseline_spo2_delta",      # SpO2(Tn) - SpO2(T0)
    "baseline_rr_delta",        # RR(Tn) - RR(T0)
    "baseline_sbp_delta",       # SBP(Tn) - SBP(T0)
    "rolling_min_spo2",         # Min SpO2 across all observations up to Tn
    "rolling_max_hr",           # Max HR across all observations up to Tn
    "rolling_max_rr",           # Max RR across all observations up to Tn
    "rolling_min_sbp",          # Min SBP across all observations up to Tn
    "rolling_mean_hr",          # Mean HR across all observations up to Tn
    "rolling_mean_spo2",        # Mean SpO2 across all observations up to Tn
    "trajectory_slope_spo2",    # Linear regression slope of SpO2 over time
    "trajectory_slope_hr",      # Linear regression slope of HR over time
    "trajectory_slope_rr",      # Linear regression slope of RR over time

    # --- F. Operational & Clinical Temporal Context ---
    "observation_count",        # Total number of readings up to Tn (1, 2, 3...)
    "time_since_arrival_mins",  # Total elapsed wait time since ED arrival
    "minutes_since_prior_obs",  # Elapsed time between Tn and Tn-1
    "initial_triage_level",     # Arrival ESI priority (1-5)
    "is_pediatric",             # Age < 18
    "is_geriatric",             # Age >= 65
    "age",                      # Age in years
    "gender_male",              # Binary 1/0

    # --- G. Chief Complaint Context ---
    "complaint_chest_pain",
    "complaint_respiratory",
    "complaint_fever_sepsis",
    "complaint_abdominal",
    "complaint_trauma"
]

# ----------------------------------------------------
# 4. Numerical vs Categorical Groups
# ----------------------------------------------------
LONGITUDINAL_NUMERICAL_COLUMNS: List[str] = [
    "hr", "sbp", "dbp", "rr", "spo2", "temp", "gcs", "pain_score",
    "shock_index", "modified_shock_index", "pulse_pressure", "mean_arterial_pressure",
    "qsofa_score", "mews_score",
    "delta_hr", "delta_spo2", "delta_rr", "delta_sbp", "delta_dbp", "delta_temp", "delta_gcs", "delta_shock_index",
    "velocity_hr", "velocity_spo2", "velocity_rr", "velocity_sbp", "velocity_shock_index",
    "baseline_hr_delta", "baseline_spo2_delta", "baseline_rr_delta", "baseline_sbp_delta",
    "rolling_min_spo2", "rolling_max_hr", "rolling_max_rr", "rolling_min_sbp",
    "rolling_mean_hr", "rolling_mean_spo2",
    "trajectory_slope_spo2", "trajectory_slope_hr", "trajectory_slope_rr",
    "observation_count", "time_since_arrival_mins", "minutes_since_prior_obs",
    "initial_triage_level", "age"
]

LONGITUDINAL_CATEGORICAL_BINARY_COLUMNS: List[str] = [
    "is_pediatric", "is_geriatric", "gender_male",
    "complaint_chest_pain", "complaint_respiratory",
    "complaint_fever_sepsis", "complaint_abdominal", "complaint_trauma"
]

# ----------------------------------------------------
# 5. Plausible Physiological Bounds
# ----------------------------------------------------
LONGITUDINAL_FEATURE_BOUNDS: Dict[str, Tuple[float, float]] = {
    "hr": (20.0, 260.0),
    "sbp": (30.0, 300.0),
    "dbp": (20.0, 200.0),
    "rr": (4.0, 70.0),
    "spo2": (40.0, 100.0),
    "temp": (30.0, 44.0),
    "gcs": (3.0, 15.0),
    "pain_score": (0.0, 10.0),
    "shock_index": (0.1, 4.0),
    "qsofa_score": (0.0, 3.0),
    "mews_score": (0.0, 14.0),
    "age": (0.0, 120.0),
    "initial_triage_level": (1.0, 5.0)
}
