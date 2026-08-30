import datetime
from typing import Dict, Any, List, Optional
from ml_pipeline.schema import (
    ALL_FEATURE_COLUMNS,
    NUMERICAL_FEATURE_COLUMNS,
    CATEGORICAL_BINARY_FEATURE_COLUMNS,
    PROHIBITED_LEAKAGE_COLUMNS,
    FEATURE_BOUNDS
)

def categorize_chief_complaint(text: Optional[str]) -> str:
    """
    Standardizes free-text chief complaints into clinical categories.
    """
    if not text:
        return "other"
    t = text.lower()
    if any(k in t for k in ["chest", "cardiac", "angina", "palpitation", "heart"]):
        return "chest_pain"
    if any(k in t for k in ["breath", "dyspnea", "asthma", "copd", "cough", "wheez", "respiratory", "hypox"]):
        return "respiratory"
    if any(k in t for k in ["abdom", "stomach", "belly", "nausea", "vomit", "diarrhea", "appendi"]):
        return "abdominal"
    if any(k in t for k in ["headache", "stroke", "seizure", "syncope", "neuro", "dizz", "altered", "confus"]):
        return "neurological"
    if any(k in t for k in ["trauma", "fall", "mva", "fracture", "accident", "wound", "lacerat", "hit", "injury"]):
        return "trauma"
    if any(k in t for k in ["fever", "chills", "sepsis", "infect", "urinary", "dysuria", "cellulitis"]):
        return "infection_fever"
    return "other"

def calculate_mews(hr: float, sbp: float, rr: float, temp: float, gcs: float) -> int:
    """
    Calculates Modified Early Warning Score (MEWS) from physiological parameters.
    """
    score = 0
    
    # Systolic BP points
    if sbp <= 70: score += 3
    elif sbp <= 80: score += 2
    elif sbp <= 100: score += 1
    elif sbp >= 200: score += 2

    # Heart Rate points
    if hr <= 40: score += 2
    elif hr <= 50: score += 1
    elif hr >= 130: score += 3
    elif hr >= 110: score += 2
    elif hr >= 100: score += 1

    # Respiratory Rate points
    if rr <= 8: score += 2
    elif rr >= 30: score += 3
    elif rr >= 21: score += 2
    elif rr >= 15: score += 1

    # Temperature points
    if temp < 35.0: score += 2
    elif temp >= 38.5: score += 2

    # Neurological / GCS points
    if gcs <= 8: score += 3
    elif gcs <= 13: score += 2
    elif gcs <= 14: score += 1

    return score

class ClinicalFeatureExtractor:
    """
    Extracts point-in-time feature vectors from clinical records with strict
    leakage guards and physiologically grounded imputation.
    """

    @classmethod
    def extract_point_in_time_features(
        cls,
        patient_data: Dict[str, Any],
        encounter_data: Dict[str, Any],
        current_obs: Dict[str, Any],
        prior_obs: Optional[Dict[str, Any]] = None,
        obs_index: int = 1
    ) -> Dict[str, float]:
        """
        Builds the exact mathematical feature vector for encounter at timestamp t.
        """
        # 1. Anti-Leakage Guard
        for prohibited in PROHIBITED_LEAKAGE_COLUMNS:
            if prohibited in patient_data or prohibited in encounter_data or prohibited in current_obs:
                raise ValueError(f"CRITICAL DATA LEAKAGE: Prohibited field '{prohibited}' present in feature extraction input.")

        # 2. Demographics
        age = float(patient_data.get("age", 45.0))
        gender = str(patient_data.get("gender", "Other")).lower()
        gender_male = 1.0 if "male" in gender and "female" not in gender else 0.0
        gender_female = 1.0 if "female" in gender else 0.0

        # 3. Arrival Context & Elapsed Wait
        arrival_mode = str(encounter_data.get("arrival_mode", "Walk-in")).lower()
        arrival_mode_walkin = 1.0 if "walk" in arrival_mode else 0.0
        arrival_mode_ambulance = 1.0 if "amb" in arrival_mode else 0.0
        arrival_mode_wheelchair = 1.0 if "wheel" in arrival_mode else 0.0
        arrival_mode_other = 1.0 if (not arrival_mode_walkin and not arrival_mode_ambulance and not arrival_mode_wheelchair) else 0.0

        # Compute elapsed wait time
        arrival_time = encounter_data.get("arrival_time")
        obs_time = current_obs.get("timestamp")
        elapsed_wait_minutes = 0.0
        if arrival_time and obs_time:
            if isinstance(arrival_time, str):
                arrival_time = datetime.datetime.fromisoformat(arrival_time.replace("Z", "+00:00"))
            if isinstance(obs_time, str):
                obs_time = datetime.datetime.fromisoformat(obs_time.replace("Z", "+00:00"))
            delta = (obs_time - arrival_time).total_seconds() / 60.0
            elapsed_wait_minutes = max(0.0, float(delta))

        # 4. Chief Complaint
        cc_text = encounter_data.get("chief_complaint", "")
        cc_cat = categorize_chief_complaint(cc_text)
        complaint_chest_pain = 1.0 if cc_cat == "chest_pain" else 0.0
        complaint_respiratory = 1.0 if cc_cat == "respiratory" else 0.0
        complaint_abdominal = 1.0 if cc_cat == "abdominal" else 0.0
        complaint_neurological = 1.0 if cc_cat == "neurological" else 0.0
        complaint_trauma = 1.0 if cc_cat == "trauma" else 0.0
        complaint_infection_fever = 1.0 if cc_cat == "infection_fever" else 0.0
        complaint_other = 1.0 if cc_cat == "other" else 0.0

        # 5. Core Physiological Vitals with Missingness Imputation
        hr = float(current_obs.get("hr", 80.0))
        sbp = float(current_obs.get("sbp", 120.0))
        rr = float(current_obs.get("rr", 16.0))
        spo2 = float(current_obs.get("spo2", 98.0))

        # DBP imputation
        raw_dbp = current_obs.get("dbp")
        dbp_was_missing = 1.0 if raw_dbp is None else 0.0
        dbp = float(raw_dbp) if raw_dbp is not None else round(sbp * 0.65, 1)

        # Temp imputation
        raw_temp = current_obs.get("temp")
        temp_was_missing = 1.0 if raw_temp is None else 0.0
        temp = float(raw_temp) if raw_temp is not None else 37.0

        # GCS imputation
        raw_gcs = current_obs.get("gcs")
        gcs_was_missing = 1.0 if raw_gcs is None else 0.0
        gcs = float(raw_gcs) if raw_gcs is not None else 15.0

        # Pain Score imputation
        raw_pain = current_obs.get("pain_score")
        pain_was_missing = 1.0 if raw_pain is None else 0.0
        pain_score = float(raw_pain) if raw_pain is not None else 0.0

        # 6. Derived Physiological Biomarkers
        shock_index = round(hr / max(sbp, 1.0), 3)
        map_val = dbp + (sbp - dbp) / 3.0
        modified_shock_index = round(hr / max(map_val, 1.0), 3)
        pulse_pressure = round(max(0.0, sbp - dbp), 1)

        # qSOFA (Quick Sepsis-related Organ Failure Assessment)
        qsofa = 0
        if rr >= 22.0: qsofa += 1
        if gcs < 15.0: qsofa += 1
        if sbp <= 100.0: qsofa += 1
        qsofa_score = float(qsofa)

        mews_score = float(calculate_mews(hr=hr, sbp=sbp, rr=rr, temp=temp, gcs=gcs))

        # 7. Longitudinal Rates of Change
        is_initial = 1.0 if (prior_obs is None or obs_index <= 1) else 0.0
        if prior_obs and not is_initial:
            delta_hr = float(hr - float(prior_obs.get("hr", hr)))
            delta_spo2 = float(spo2 - float(prior_obs.get("spo2", spo2)))
            delta_sbp = float(sbp - float(prior_obs.get("sbp", sbp)))
            delta_rr = float(rr - float(prior_obs.get("rr", rr)))

            # Time delta in minutes for velocity
            prior_t = prior_obs.get("timestamp")
            if isinstance(prior_t, str):
                prior_t = datetime.datetime.fromisoformat(prior_t.replace("Z", "+00:00"))
            curr_t = obs_time if obs_time else datetime.datetime.utcnow()
            dt_mins = max(1.0, (curr_t - prior_t).total_seconds() / 60.0) if prior_t else 1.0

            velocity_hr = round(delta_hr / dt_mins, 3)
            velocity_spo2 = round(delta_spo2 / dt_mins, 3)
        else:
            delta_hr = 0.0
            delta_spo2 = 0.0
            delta_sbp = 0.0
            delta_rr = 0.0
            velocity_hr = 0.0
            velocity_spo2 = 0.0

        features: Dict[str, float] = {
            "age": age,
            "elapsed_wait_minutes": elapsed_wait_minutes,
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
            "delta_hr": delta_hr,
            "delta_spo2": delta_spo2,
            "delta_sbp": delta_sbp,
            "delta_rr": delta_rr,
            "velocity_hr": velocity_hr,
            "velocity_spo2": velocity_spo2,
            "observation_index": float(obs_index),
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
            "is_initial_observation": is_initial,
            "temp_was_missing": temp_was_missing,
            "gcs_was_missing": gcs_was_missing,
            "dbp_was_missing": dbp_was_missing,
            "pain_was_missing": pain_was_missing
        }

        # Verify all schema features are present
        for col in ALL_FEATURE_COLUMNS:
            if col not in features:
                features[col] = 0.0

        return features
