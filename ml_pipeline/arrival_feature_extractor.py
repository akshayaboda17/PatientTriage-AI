"""
Point-of-Arrival (T0) Clinical Feature Extractor for PatientTriage.ai (Task 4 v1.1).
Extracts strictly point-in-time features available at the exact moment of ED presentation.
Integrates DataQualityEngine, AgeAwareReferenceProvider, clinical negation parsing,
ambiguous presentation flags, and strict physiological input bounds validation.
"""
from typing import Dict, Any, Optional

from ml_pipeline.arrival_schema import (
    ARRIVAL_ALL_FEATURE_COLUMNS,
    PROHIBITED_ARRIVAL_LEAKAGE_COLUMNS,
    ARRIVAL_FEATURE_BOUNDS
)
from ml_pipeline.age_reference_provider import AgeAwareReferenceProvider
from ml_pipeline.data_quality_engine import DataQualityEngine

def validate_clinical_inputs(
    patient_data: Dict[str, Any],
    arrival_obs: Dict[str, Any]
):
    """
    Validates input parameters against plausible clinical physiological bounds.
    Raises ValueError with a clear clinical message if physically/clinically impossible values are provided.
    """
    # 1. Age Validation
    if "age" in patient_data and patient_data["age"] is not None:
        try:
            age = float(patient_data["age"])
            if age < ARRIVAL_FEATURE_BOUNDS["age"]["min"] or age > ARRIVAL_FEATURE_BOUNDS["age"]["max"]:
                raise ValueError(f"Invalid clinical input: Age ({age}) is out of plausible physiological range [0, 125].")
        except (TypeError, ValueError) as e:
            if "out of plausible" in str(e):
                raise
            raise ValueError(f"Invalid clinical input: Age must be a valid number, got {patient_data['age']}")

    # 2. Vital Signs Validation
    vital_checks = [
        ("hr", "Heart Rate", 20.0, 280.0),
        ("sbp", "Systolic Blood Pressure", 30.0, 320.0),
        ("dbp", "Diastolic Blood Pressure", 20.0, 220.0),
        ("rr", "Respiratory Rate", 4.0, 80.0),
        ("spo2", "Oxygen Saturation (SpO2)", 40.0, 100.0),
        ("temp", "Body Temperature", 28.0, 45.0),
        ("gcs", "Glasgow Coma Scale", 3.0, 15.0),
        ("pain_score", "Pain Score", 0.0, 10.0)
    ]

    for key, name, min_val, max_val in vital_checks:
        val = arrival_obs.get(key)
        if val is not None and val != "":
            try:
                f_val = float(val)
                if f_val < min_val or f_val > max_val:
                    raise ValueError(
                        f"Invalid clinical input: {name} ({f_val}) is outside valid physiological bounds [{min_val}, {max_val}]."
                    )
            except (TypeError, ValueError) as e:
                if "outside valid physiological" in str(e):
                    raise
                raise ValueError(f"Invalid clinical input: {name} must be a valid number, got {val}")

def calculate_arrival_mews(hr: float, sbp: float, rr: float, temp: float, gcs: float) -> int:
    """
    Calculates Modified Early Warning Score (MEWS) from arrival baseline vitals.
    """
    score = 0
    if sbp <= 70: score += 3
    elif sbp <= 80: score += 2
    elif sbp <= 100: score += 1
    elif sbp >= 200: score += 2

    if hr <= 40: score += 2
    elif hr <= 50: score += 1
    elif hr >= 130: score += 3
    elif hr >= 110: score += 2
    elif hr >= 100: score += 1

    if rr <= 8: score += 2
    elif rr >= 30: score += 3
    elif rr >= 21: score += 2
    elif rr >= 15: score += 1

    if temp < 35.0: score += 2
    elif temp >= 38.5: score += 2

    if gcs <= 8: score += 3
    elif gcs <= 13: score += 2
    elif gcs <= 14: score += 1

    return score

class ArrivalFeatureExtractor:
    """
    Extracts strictly Point-of-Arrival (T0) feature vectors from clinical intake data.
    """

    @classmethod
    def extract_arrival_features(
        cls,
        patient_data: Dict[str, Any],
        encounter_data: Dict[str, Any],
        arrival_obs: Dict[str, Any]
    ) -> Dict[str, float]:
        """
        Extracts the exact T0 feature vector with strict anti-leakage and clinical plausibility validation.
        """
        # 1. Anti-Leakage Guard
        all_inputs = {**patient_data, **encounter_data, **arrival_obs}
        for prohibited in PROHIBITED_ARRIVAL_LEAKAGE_COLUMNS:
            if prohibited in all_inputs:
                raise ValueError(
                    f"CRITICAL DATA LEAKAGE: Prohibited field '{prohibited}' present in arrival feature extraction input."
                )

        # 2. Strict Input Validation (Bounds Checking)
        validate_clinical_inputs(patient_data, arrival_obs)

        # 3. Data Quality & Negation Assessment
        dq_res = DataQualityEngine.evaluate_data_quality(patient_data, encounter_data, arrival_obs)
        complaint_analysis = dq_res["complaint_analysis"]

        # 4. Demographics & Age Cohort
        age = float(patient_data.get("age", 45.0))
        age_pediatric, age_adult, age_geriatric = AgeAwareReferenceProvider.get_age_group_flags(age)

        gender = str(patient_data.get("gender", "Other")).lower()
        gender_male = 1.0 if ("male" in gender and "female" not in gender) else 0.0
        gender_female = 1.0 if "female" in gender else 0.0

        # 5. Arrival Context
        arrival_mode = str(encounter_data.get("arrival_mode", "Walk-in")).lower()
        arrival_mode_walkin = 1.0 if "walk" in arrival_mode else 0.0
        arrival_mode_ambulance = 1.0 if "amb" in arrival_mode else 0.0
        arrival_mode_wheelchair = 1.0 if "wheel" in arrival_mode else 0.0
        arrival_mode_other = 1.0 if (not arrival_mode_walkin and not arrival_mode_ambulance and not arrival_mode_wheelchair) else 0.0

        # 6. Chief Complaint Features (with Negation & Ambiguity Awareness)
        primary_cat = complaint_analysis["primary_category"]
        complaint_chest_pain = 1.0 if primary_cat == "chest_pain" else 0.0
        complaint_respiratory = 1.0 if primary_cat == "respiratory" else 0.0
        complaint_abdominal = 1.0 if primary_cat == "abdominal" else 0.0
        complaint_neurological = 1.0 if primary_cat == "neurological" else 0.0
        complaint_trauma = 1.0 if primary_cat == "trauma" else 0.0
        complaint_infection_fever = 1.0 if primary_cat == "infection_fever" else 0.0
        complaint_other = 1.0 if primary_cat == "other" else 0.0

        complaint_is_ambiguous = complaint_analysis["is_ambiguous"]
        complaint_is_negated = complaint_analysis["is_negated"]

        # 7. Core Arrival Vitals with Missingness Flagging
        raw_spo2 = arrival_obs.get("spo2")
        spo2_was_missing = 1.0 if (raw_spo2 is None or raw_spo2 == "") else 0.0
        spo2 = float(raw_spo2) if not spo2_was_missing else 98.0

        raw_hr = arrival_obs.get("hr")
        hr = float(raw_hr) if (raw_hr is not None and raw_hr != "") else (110.0 if age_pediatric else 80.0)

        raw_sbp = arrival_obs.get("sbp")
        sbp = float(raw_sbp) if (raw_sbp is not None and raw_sbp != "") else (95.0 if age_pediatric else 120.0)

        raw_rr = arrival_obs.get("rr")
        rr = float(raw_rr) if (raw_rr is not None and raw_rr != "") else (24.0 if age_pediatric else 16.0)

        raw_dbp = arrival_obs.get("dbp")
        dbp_was_missing = 1.0 if (raw_dbp is None or raw_dbp == "") else 0.0
        dbp = float(raw_dbp) if not dbp_was_missing else round(sbp * 0.65, 1)

        raw_temp = arrival_obs.get("temp")
        temp_was_missing = 1.0 if (raw_temp is None or raw_temp == "") else 0.0
        temp = float(raw_temp) if not temp_was_missing else 37.0

        raw_gcs = arrival_obs.get("gcs")
        gcs_was_missing = 1.0 if (raw_gcs is None or raw_gcs == "") else 0.0
        gcs = float(raw_gcs) if not gcs_was_missing else 15.0

        raw_pain = arrival_obs.get("pain_score")
        pain_was_missing = 1.0 if (raw_pain is None or raw_pain == "") else 0.0
        pain_score = float(raw_pain) if not pain_was_missing else 0.0

        # 8. Derived Physiological Biomarkers at Presentation
        shock_index = round(hr / max(sbp, 1.0), 3)
        map_val = dbp + (sbp - dbp) / 3.0
        modified_shock_index = round(hr / max(map_val, 1.0), 3)
        pulse_pressure = round(max(0.0, sbp - dbp), 1)

        qsofa = 0
        if rr >= 22.0: qsofa += 1
        if gcs < 15.0: qsofa += 1
        if sbp <= 100.0: qsofa += 1
        qsofa_score = float(qsofa)

        mews_score = float(calculate_arrival_mews(hr=hr, sbp=sbp, rr=rr, temp=temp, gcs=gcs))

        # 9. Age-Vital Interaction Features
        age_interactions = AgeAwareReferenceProvider.compute_age_vital_interaction_features(
            age=age, hr=hr, rr=rr, sbp=sbp, spo2=spo2, temp=temp
        )

        # 10. Assemble Feature Vector
        features: Dict[str, float] = {
            "age": age,
            "hr": hr,
            "sbp": sbp,
            "dbp": dbp,
            "rr": rr,
            "spo2": spo2,
            "temp": temp,
            "gcs": gcs,
            "pain_score": pain_score,
            "shock_index": shock_index,
            "modified_shock_index": modified_shock_index,
            "pulse_pressure": pulse_pressure,
            "qsofa_score": qsofa_score,
            "mews_score": mews_score,
            "data_completeness_score": dq_res["data_completeness_score"],
            "vital_missing_count": dq_res["vital_missing_count"],
            "age_pediatric": age_pediatric,
            "age_adult": age_adult,
            "age_geriatric": age_geriatric,
            "pediatric_high_hr": age_interactions["pediatric_high_hr"],
            "pediatric_high_rr": age_interactions["pediatric_high_rr"],
            "pediatric_hypotension": age_interactions["pediatric_hypotension"],
            "geriatric_blunted_tachycardia": age_interactions["geriatric_blunted_tachycardia"],
            "geriatric_tachypnea": age_interactions["geriatric_tachypnea"],
            "geriatric_hypotension": age_interactions["geriatric_hypotension"],
            "geriatric_hypothermia_risk": age_interactions["geriatric_hypothermia_risk"],
            "gender_male": gender_male,
            "gender_female": gender_female,
            "arrival_mode_walkin": arrival_mode_walkin,
            "arrival_mode_ambulance": arrival_mode_ambulance,
            "arrival_mode_wheelchair": arrival_mode_wheelchair,
            "arrival_mode_other": arrival_mode_other,
            "complaint_chest_pain": complaint_chest_pain,
            "complaint_respiratory": complaint_respiratory,
            "complaint_abdominal": complaint_abdominal,
            "complaint_neurological": complaint_neurological,
            "complaint_trauma": complaint_trauma,
            "complaint_infection_fever": complaint_infection_fever,
            "complaint_other": complaint_other,
            "complaint_is_ambiguous": complaint_is_ambiguous,
            "complaint_is_negated": complaint_is_negated,
            "spo2_was_missing": spo2_was_missing,
            "temp_was_missing": temp_was_missing,
            "gcs_was_missing": gcs_was_missing,
            "dbp_was_missing": dbp_was_missing,
            "pain_was_missing": pain_was_missing,
            "has_known_history": dq_res["has_known_history"],
            "is_zero_history": dq_res["is_zero_history"],
            "history_is_unknown": dq_res["history_is_unknown"],
            "has_known_allergies": dq_res["has_known_allergies"]
        }

        # Verify all schema columns exist
        for col in ARRIVAL_ALL_FEATURE_COLUMNS:
            if col not in features:
                features[col] = 0.0

        return features
