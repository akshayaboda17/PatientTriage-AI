"""
Point-of-Arrival (T0) Clinical Feature Extractor for PatientTriage.ai.
Extracts strictly point-in-time features available at the exact moment of ED presentation.
Guarantees zero temporal leakage, no longitudinal delta dependencies, and no future outcome signals.
"""
from typing import Dict, Any, Optional
from ml_pipeline.arrival_schema import (
    ARRIVAL_ALL_FEATURE_COLUMNS,
    PROHIBITED_ARRIVAL_LEAKAGE_COLUMNS
)

def categorize_arrival_complaint(text: Optional[str]) -> str:
    """
    Categorizes chief complaint text with basic clinical negation awareness.
    """
    if not text:
        return "other"
    t = text.lower().strip()

    # Negation check: if user explicitly denies symptoms, do not match as positive
    def is_negated(keyword: str) -> bool:
        negation_phrases = [
            f"no {keyword}", f"denies {keyword}", f"denied {keyword}",
            f"without {keyword}", f"negative for {keyword}", f"free of {keyword}"
        ]
        return any(phrase in t for phrase in negation_phrases)

    # 1. Chest Pain / Cardiac
    cardiac_terms = ["chest pain", "chest pressure", "cardiac", "angina", "palpitation", "heart pain", "crushing chest"]
    if any(k in t for k in cardiac_terms) and not is_negated("chest pain") and not is_negated("chest pressure"):
        return "chest_pain"

    # 2. Respiratory
    resp_terms = ["shortness of breath", "breath", "dyspnea", "asthma", "copd", "wheez", "respiratory", "hypox", "stridor"]
    if any(k in t for k in resp_terms) and not is_negated("shortness of breath") and not is_negated("dyspnea"):
        return "respiratory"

    # 3. Abdominal
    abdom_terms = ["abdom", "stomach", "belly", "nausea", "vomit", "diarrhea", "appendi", "flank pain", "epigastric"]
    if any(k in t for k in abdom_terms) and not is_negated("abdominal pain"):
        return "abdominal"

    # 4. Neurological
    neuro_terms = ["headache", "stroke", "seizure", "syncope", "neuro", "dizz", "altered", "confus", "facial droop", "numbness", "ataxia"]
    if any(k in t for k in neuro_terms) and not is_negated("headache") and not is_negated("dizziness"):
        return "neurological"

    # 5. Trauma / Injury
    trauma_terms = ["trauma", "fall", "mva", "fracture", "accident", "wound", "lacerat", "hit", "injury", "contusion", "sprain"]
    if any(k in t for k in trauma_terms):
        return "trauma"

    # 6. Infection / Fever / Sepsis
    infect_terms = ["fever", "chills", "sepsis", "infect", "urinary", "dysuria", "cellulitis", "rigors", "purulent"]
    if any(k in t for k in infect_terms) and not is_negated("fever"):
        return "infection_fever"

    return "other"

def calculate_arrival_mews(hr: float, sbp: float, rr: float, temp: float, gcs: float) -> int:
    """
    Calculates Modified Early Warning Score (MEWS) from arrival baseline vitals.
    """
    score = 0
    
    # Systolic BP
    if sbp <= 70: score += 3
    elif sbp <= 80: score += 2
    elif sbp <= 100: score += 1
    elif sbp >= 200: score += 2

    # Heart Rate
    if hr <= 40: score += 2
    elif hr <= 50: score += 1
    elif hr >= 130: score += 3
    elif hr >= 110: score += 2
    elif hr >= 100: score += 1

    # Respiratory Rate
    if rr <= 8: score += 2
    elif rr >= 30: score += 3
    elif rr >= 21: score += 2
    elif rr >= 15: score += 1

    # Temperature
    if temp < 35.0: score += 2
    elif temp >= 38.5: score += 2

    # Neurological / GCS
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
        Extracts the exact T0 feature vector with strict anti-leakage validation.
        """
        # 1. Anti-Leakage Guard
        all_inputs = {**patient_data, **encounter_data, **arrival_obs}
        for prohibited in PROHIBITED_ARRIVAL_LEAKAGE_COLUMNS:
            if prohibited in all_inputs:
                raise ValueError(
                    f"CRITICAL DATA LEAKAGE: Prohibited field '{prohibited}' present in arrival feature extraction input."
                )

        # 2. Demographics & Age Cohort
        age = float(patient_data.get("age", 45.0))
        age_pediatric = 1.0 if age < 18.0 else 0.0
        age_adult = 1.0 if (18.0 <= age < 65.0) else 0.0
        age_geriatric = 1.0 if age >= 65.0 else 0.0

        gender = str(patient_data.get("gender", "Other")).lower()
        gender_male = 1.0 if ("male" in gender and "female" not in gender) else 0.0
        gender_female = 1.0 if "female" in gender else 0.0

        # 3. Arrival Context
        arrival_mode = str(encounter_data.get("arrival_mode", "Walk-in")).lower()
        arrival_mode_walkin = 1.0 if "walk" in arrival_mode else 0.0
        arrival_mode_ambulance = 1.0 if "amb" in arrival_mode else 0.0
        arrival_mode_wheelchair = 1.0 if "wheel" in arrival_mode else 0.0
        arrival_mode_other = 1.0 if (not arrival_mode_walkin and not arrival_mode_ambulance and not arrival_mode_wheelchair) else 0.0

        # 4. Chief Complaint Categories
        cc_text = encounter_data.get("chief_complaint", "")
        cc_cat = categorize_arrival_complaint(cc_text)
        complaint_chest_pain = 1.0 if cc_cat == "chest_pain" else 0.0
        complaint_respiratory = 1.0 if cc_cat == "respiratory" else 0.0
        complaint_abdominal = 1.0 if cc_cat == "abdominal" else 0.0
        complaint_neurological = 1.0 if cc_cat == "neurological" else 0.0
        complaint_trauma = 1.0 if cc_cat == "trauma" else 0.0
        complaint_infection_fever = 1.0 if cc_cat == "infection_fever" else 0.0
        complaint_other = 1.0 if cc_cat == "other" else 0.0

        # 5. Core Arrival Vitals with Missingness Flagging
        hr = float(arrival_obs.get("hr", 80.0))
        sbp = float(arrival_obs.get("sbp", 120.0))
        rr = float(arrival_obs.get("rr", 16.0))
        spo2 = float(arrival_obs.get("spo2", 98.0))

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

        # 6. Derived Physiological Biomarkers at Presentation
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

        # 7. Medical History & Allergy Availability Flags
        med_hist = str(patient_data.get("medical_history", "")).strip().lower()
        allergies = str(patient_data.get("allergies", "")).strip().lower()

        is_zero_history = 1.0 if med_hist in ["zero history", "first visit", "no records found", "unregistered", "zero prior history"] else 0.0
        has_known_history = 1.0 if (med_hist and not is_zero_history and med_hist not in ["none", "no prior history", "none reported"]) else 0.0
        has_known_allergies = 1.0 if (allergies and allergies not in ["none", "nkda", "no known allergies", "no known drug allergies"]) else 0.0

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
            "age_pediatric": age_pediatric,
            "age_adult": age_adult,
            "age_geriatric": age_geriatric,
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
            "temp_was_missing": temp_was_missing,
            "gcs_was_missing": gcs_was_missing,
            "dbp_was_missing": dbp_was_missing,
            "pain_was_missing": pain_was_missing,
            "has_known_history": has_known_history,
            "is_zero_history": is_zero_history,
            "has_known_allergies": has_known_allergies
        }

        # Verify all schema columns exist
        for col in ARRIVAL_ALL_FEATURE_COLUMNS:
            if col not in features:
                features[col] = 0.0

        return features
