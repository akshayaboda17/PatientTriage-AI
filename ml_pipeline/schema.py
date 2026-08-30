from typing import List, Dict, Any

# Column Groups
IDENTIFIER_COLUMNS: List[str] = [
    "encounter_id",
    "patient_id",
    "hospital_id",
    "observation_id",
    "observation_timestamp"
]

NUMERICAL_FEATURE_COLUMNS: List[str] = [
    "age",
    "elapsed_wait_minutes",
    "hr",
    "sbp",
    "dbp",
    "rr",
    "spo2",
    "temp",
    "gcs",
    "pain_score",
    "shock_index",
    "modified_shock_index",
    "pulse_pressure",
    "qsofa_score",
    "mews_score",
    "delta_hr",
    "delta_spo2",
    "delta_sbp",
    "delta_rr",
    "velocity_hr",
    "velocity_spo2",
    "observation_index"
]

CATEGORICAL_BINARY_FEATURE_COLUMNS: List[str] = [
    "gender_male",
    "gender_female",
    "arrival_mode_walkin",
    "arrival_mode_ambulance",
    "arrival_mode_wheelchair",
    "arrival_mode_other",
    "complaint_chest_pain",
    "complaint_respiratory",
    "complaint_abdominal",
    "complaint_neurological",
    "complaint_trauma",
    "complaint_infection_fever",
    "complaint_other",
    "is_initial_observation",
    "temp_was_missing",
    "gcs_was_missing",
    "dbp_was_missing",
    "pain_was_missing"
]

ALL_FEATURE_COLUMNS: List[str] = (
    NUMERICAL_FEATURE_COLUMNS + CATEGORICAL_BINARY_FEATURE_COLUMNS
)

TARGET_COLUMNS: List[str] = [
    "composite_critical_outcome_24h", # Primary Binary Prediction Target
    "icu_admitted_24h",
    "intubated_24h",
    "vasopressor_24h",
    "mortality_24h",
    "triage_acuity_level"             # Secondary multi-class target (ESI 1-5)
]

# Anti-Leakage Prohibited Columns (Must never enter feature space)
PROHIBITED_LEAKAGE_COLUMNS: List[str] = [
    "clinical_decision",
    "ai_agreement",
    "override_reason",
    "clinician_assigned_risk",
    "clinical_notes",
    "clinical_assessment",
    "resolution_reason",
    "dismissal_reason",
    "encounter_status",
    "discharge_time",
    "length_of_stay_hours",
    "billing_codes",
    "future_vitals"
]

# Clinical Validation Ranges
FEATURE_BOUNDS: Dict[str, Dict[str, float]] = {
    "age": {"min": 0.0, "max": 120.0},
    "elapsed_wait_minutes": {"min": 0.0, "max": 10080.0},
    "hr": {"min": 20.0, "max": 260.0},
    "sbp": {"min": 30.0, "max": 300.0},
    "dbp": {"min": 20.0, "max": 200.0},
    "rr": {"min": 4.0, "max": 70.0},
    "spo2": {"min": 40.0, "max": 100.0},
    "temp": {"min": 30.0, "max": 45.0},
    "gcs": {"min": 3.0, "max": 15.0},
    "pain_score": {"min": 0.0, "max": 10.0},
    "shock_index": {"min": 0.1, "max": 5.0},
    "modified_shock_index": {"min": 0.1, "max": 6.0},
    "pulse_pressure": {"min": 5.0, "max": 200.0},
    "qsofa_score": {"min": 0.0, "max": 3.0},
    "mews_score": {"min": 0.0, "max": 14.0}
}
