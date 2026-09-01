"""
Arrival Triage ML Schema for PatientTriage.ai (Task 4 v1.1).
Defines strict Point-of-Arrival (T0) feature space, age-aware interactions,
data-quality completeness metrics, 5-level triage target, clinical plausibility bounds,
and prohibited temporal leakage columns.
"""
from typing import List, Dict, Any

ARRIVAL_IDENTIFIER_COLUMNS: List[str] = [
    "encounter_id",
    "patient_id",
    "hospital_id",
    "observation_id",
    "observation_timestamp"
]

ARRIVAL_NUMERICAL_FEATURE_COLUMNS: List[str] = [
    "age",
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
    "data_completeness_score",
    "vital_missing_count"
]

ARRIVAL_CATEGORICAL_BINARY_FEATURE_COLUMNS: List[str] = [
    "age_pediatric",
    "age_adult",
    "age_geriatric",
    "pediatric_high_hr",
    "pediatric_high_rr",
    "pediatric_hypotension",
    "geriatric_blunted_tachycardia",
    "geriatric_tachypnea",
    "geriatric_hypotension",
    "geriatric_hypothermia_risk",
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
    "complaint_is_ambiguous",
    "complaint_is_negated",
    "spo2_was_missing",
    "temp_was_missing",
    "gcs_was_missing",
    "dbp_was_missing",
    "pain_was_missing",
    "has_known_history",
    "is_zero_history",
    "history_is_unknown",
    "has_known_allergies"
]

ARRIVAL_ALL_FEATURE_COLUMNS: List[str] = (
    ARRIVAL_NUMERICAL_FEATURE_COLUMNS + ARRIVAL_CATEGORICAL_BINARY_FEATURE_COLUMNS
)

# Target Column: ESI Level 1 (Resuscitation) to Level 5 (Non-Urgent)
ARRIVAL_TARGET_COLUMN: str = "triage_acuity_level"
ARRIVAL_TARGET_CLASSES: List[int] = [1, 2, 3, 4, 5]

ARRIVAL_TARGET_CLASS_NAMES: Dict[int, str] = {
    1: "Critical — Immediate Care (ESI 1)",
    2: "Emergency — Immediate Assessment (ESI 2)",
    3: "Urgent — Prompt Assessment (ESI 3)",
    4: "Less Urgent (ESI 4)",
    5: "Non-Urgent (ESI 5)"
}

# Strict Anti-Leakage Prohibited Columns (Must NEVER enter arrival T0 feature space)
PROHIBITED_ARRIVAL_LEAKAGE_COLUMNS: List[str] = [
    "delta_hr",
    "delta_spo2",
    "delta_sbp",
    "delta_rr",
    "velocity_hr",
    "velocity_spo2",
    "observation_index",
    "elapsed_wait_minutes",
    "is_initial_observation",
    "icu_admitted_24h",
    "intubated_24h",
    "vasopressor_24h",
    "mortality_24h",
    "composite_critical_outcome_24h",
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

# Clinical Plausibility Ranges for Input Validation
ARRIVAL_FEATURE_BOUNDS: Dict[str, Dict[str, float]] = {
    "age": {"min": 0.0, "max": 125.0},
    "hr": {"min": 20.0, "max": 280.0},
    "sbp": {"min": 30.0, "max": 320.0},
    "dbp": {"min": 20.0, "max": 220.0},
    "rr": {"min": 4.0, "max": 80.0},
    "spo2": {"min": 40.0, "max": 100.0},
    "temp": {"min": 28.0, "max": 45.0},
    "gcs": {"min": 3.0, "max": 15.0},
    "pain_score": {"min": 0.0, "max": 10.0}
}
