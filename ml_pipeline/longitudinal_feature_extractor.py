"""
Longitudinal Clinical Trajectory Feature Extractor for PatientTriage.ai (Task 3).
Extracts point-in-time and sequential trajectory features over chronological observation sequences [T0 -> T1 -> ... -> Tn]
with strict no-future-leakage guarantees.
"""
import datetime
import numpy as np
from typing import Dict, Any, List, Optional, Union

from ml_pipeline.longitudinal_schema import (
    LONGITUDINAL_FEATURE_COLUMNS,
    PROHIBITED_LONGITUDINAL_LEAKAGE_COLUMNS,
    LONGITUDINAL_FEATURE_BOUNDS
)

def parse_iso_time(val: Any) -> Optional[datetime.datetime]:
    if not val:
        return None
    if isinstance(val, datetime.datetime):
        return val
    if isinstance(val, str):
        try:
            return datetime.datetime.fromisoformat(val.replace("Z", "+00:00"))
        except Exception:
            return None
    return None

def calculate_slope(times_mins: List[float], values: List[float]) -> float:
    """
    Calculates ordinary least squares linear regression slope (units / min) over trajectory.
    """
    if len(times_mins) < 2 or len(values) < 2:
        return 0.0
    
    t_arr = np.array(times_mins, dtype=float)
    y_arr = np.array(values, dtype=float)
    
    # If all times are identical, return simple delta / 1.0
    dt_total = t_arr[-1] - t_arr[0]
    if dt_total <= 0.0:
        return float((y_arr[-1] - y_arr[0]) / max(1.0, float(len(y_arr))))
    
    t_mean = np.mean(t_arr)
    y_mean = np.mean(y_arr)
    
    denominator = np.sum((t_arr - t_mean) ** 2)
    if denominator == 0.0:
        return 0.0
    
    slope = np.sum((t_arr - t_mean) * (y_arr - y_mean)) / denominator
    return float(np.clip(slope, -50.0, 50.0))

def compute_mews(hr: float, sbp: float, rr: float, temp: float, gcs: float) -> int:
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

class LongitudinalFeatureExtractor:
    """
    Extracts time-series physiological trajectory feature vectors.
    Evaluates historical progression [T0 -> T1 -> ... -> Tn] without future data leakage.
    """

    @classmethod
    def extract_trajectory_features(
        cls,
        patient_data: Dict[str, Any],
        encounter_data: Dict[str, Any],
        observations: List[Dict[str, Any]],
        prediction_timestamp: Optional[Union[str, datetime.datetime]] = None
    ) -> Dict[str, float]:
        """
        Builds the 48-dimensional longitudinal feature vector from chronological observations.
        """
        # 1. Anti-Leakage Verification
        for prohibited in PROHIBITED_LONGITUDINAL_LEAKAGE_COLUMNS:
            if prohibited in patient_data or prohibited in encounter_data:
                raise ValueError(f"CRITICAL DATA LEAKAGE: Prohibited field '{prohibited}' in encounter data.")
            for obs in observations:
                if prohibited in obs:
                    raise ValueError(f"CRITICAL DATA LEAKAGE: Prohibited field '{prohibited}' in observation record.")

        # 2. Parse Timestamps & Filter Strictly to Time <= prediction_timestamp
        pred_dt = parse_iso_time(prediction_timestamp) if prediction_timestamp else None
        
        valid_obs = []
        for o in observations:
            o_time = parse_iso_time(o.get("timestamp"))
            if pred_dt and o_time and o_time > pred_dt:
                # Discard future observation (prevent forward temporal leakage)
                continue
            valid_obs.append(o)

        if not valid_obs:
            raise ValueError("Cannot extract trajectory features: No valid observations at or before prediction timestamp.")

        # Sort chronologically
        sorted_obs = sorted(
            valid_obs,
            key=lambda x: parse_iso_time(x.get("timestamp")) or datetime.datetime.min
        )

        curr_obs = sorted_obs[-1]
        prior_obs = sorted_obs[-2] if len(sorted_obs) >= 2 else None
        t0_obs = sorted_obs[0]

        # 3. Patient & Demographics
        age = float(patient_data.get("age", 45.0))
        gender = str(patient_data.get("gender", "Other")).lower()
        gender_male = 1.0 if "male" in gender and "female" not in gender else 0.0
        is_pediatric = 1.0 if age < 18.0 else 0.0
        is_geriatric = 1.0 if age >= 65.0 else 0.0

        # 4. Arrival Context & Elapsed Waiting
        arrival_time = parse_iso_time(encounter_data.get("arrival_time"))
        curr_time = parse_iso_time(curr_obs.get("timestamp")) or datetime.datetime.utcnow()
        
        if arrival_time and curr_time >= arrival_time:
            time_since_arrival_mins = max(0.0, (curr_time - arrival_time).total_seconds() / 60.0)
        else:
            time_since_arrival_mins = 0.0

        # Prior elapsed time
        if prior_obs:
            prior_time = parse_iso_time(prior_obs.get("timestamp"))
            if prior_time and curr_time >= prior_time:
                minutes_since_prior_obs = max(1.0, (curr_time - prior_time).total_seconds() / 60.0)
            else:
                minutes_since_prior_obs = 15.0
        else:
            minutes_since_prior_obs = 0.0

        # Initial Triage Level (ESI 1-5)
        initial_triage_level = float(encounter_data.get("initial_triage_level") or encounter_data.get("triage_level") or 3.0)

        # Chief Complaint Indicators
        cc_text = str(encounter_data.get("chief_complaint", "")).lower()
        complaint_chest_pain = 1.0 if any(k in cc_text for k in ["chest", "angina", "cardiac", "heart"]) else 0.0
        complaint_respiratory = 1.0 if any(k in cc_text for k in ["breath", "dyspnea", "asthma", "copd", "hypox", "cough"]) else 0.0
        complaint_fever_sepsis = 1.0 if any(k in cc_text for k in ["fever", "chills", "sepsis", "infect", "pyrexia"]) else 0.0
        complaint_abdominal = 1.0 if any(k in cc_text for k in ["abdom", "stomach", "belly", "nausea", "vomit", "appendi"]) else 0.0
        complaint_trauma = 1.0 if any(k in cc_text for k in ["trauma", "fall", "mva", "fracture", "accident", "wound", "hit"]) else 0.0

        # 5. Current Point-in-Time Vitals (Tn) with Safe Imputation
        hr = float(curr_obs.get("hr", 80.0))
        sbp = float(curr_obs.get("sbp", 120.0))
        dbp = float(curr_obs.get("dbp")) if curr_obs.get("dbp") is not None else round(sbp * 0.65, 1)
        rr = float(curr_obs.get("rr", 16.0))
        spo2 = float(curr_obs.get("spo2", 98.0))
        temp = float(curr_obs.get("temp")) if curr_obs.get("temp") is not None else 37.0
        gcs = float(curr_obs.get("gcs")) if curr_obs.get("gcs") is not None else 15.0
        pain_score = float(curr_obs.get("pain_score")) if curr_obs.get("pain_score") is not None else 0.0

        # Acuity Biomarkers at Tn
        shock_index = round(hr / max(sbp, 1.0), 3)
        map_val = round(dbp + (sbp - dbp) / 3.0, 1)
        modified_shock_index = round(hr / max(map_val, 1.0), 3)
        pulse_pressure = round(max(0.0, sbp - dbp), 1)

        qsofa = 0
        if rr >= 22.0: qsofa += 1
        if gcs < 15.0: qsofa += 1
        if sbp <= 100.0: qsofa += 1
        qsofa_score = float(qsofa)

        mews_score = float(compute_mews(hr=hr, sbp=sbp, rr=rr, temp=temp, gcs=gcs))

        # 6. Sequential 1-Step Deltas & Velocities (Tn - Tn-1)
        if prior_obs:
            prior_hr = float(prior_obs.get("hr", hr))
            prior_sbp = float(prior_obs.get("sbp", sbp))
            prior_dbp = float(prior_obs.get("dbp", dbp))
            prior_rr = float(prior_obs.get("rr", rr))
            prior_spo2 = float(prior_obs.get("spo2", spo2))
            prior_temp = float(prior_obs.get("temp", temp))
            prior_gcs = float(prior_obs.get("gcs", gcs))
            prior_si = round(prior_hr / max(prior_sbp, 1.0), 3)

            delta_hr = round(hr - prior_hr, 1)
            delta_spo2 = round(spo2 - prior_spo2, 1)
            delta_rr = round(rr - prior_rr, 1)
            delta_sbp = round(sbp - prior_sbp, 1)
            delta_dbp = round(dbp - prior_dbp, 1)
            delta_temp = round(temp - prior_temp, 2)
            delta_gcs = round(gcs - prior_gcs, 1)
            delta_shock_index = round(shock_index - prior_si, 3)

            dt_m = max(1.0, minutes_since_prior_obs)
            velocity_hr = round(delta_hr / dt_m, 3)
            velocity_spo2 = round(delta_spo2 / dt_m, 3)
            velocity_rr = round(delta_rr / dt_m, 3)
            velocity_sbp = round(delta_sbp / dt_m, 3)
            velocity_shock_index = round(delta_shock_index / dt_m, 4)
        else:
            delta_hr = 0.0
            delta_spo2 = 0.0
            delta_rr = 0.0
            delta_sbp = 0.0
            delta_dbp = 0.0
            delta_temp = 0.0
            delta_gcs = 0.0
            delta_shock_index = 0.0
            velocity_hr = 0.0
            velocity_spo2 = 0.0
            velocity_rr = 0.0
            velocity_sbp = 0.0
            velocity_shock_index = 0.0

        # 7. Baseline Deltas (Tn - T0)
        t0_hr = float(t0_obs.get("hr", hr))
        t0_spo2 = float(t0_obs.get("spo2", spo2))
        t0_rr = float(t0_obs.get("rr", rr))
        t0_sbp = float(t0_obs.get("sbp", sbp))

        baseline_hr_delta = round(hr - t0_hr, 1)
        baseline_spo2_delta = round(spo2 - t0_spo2, 1)
        baseline_rr_delta = round(rr - t0_rr, 1)
        baseline_sbp_delta = round(sbp - t0_sbp, 1)

        # 8. Cumulative Trajectory Statistics across All Observations [T0 -> Tn]
        all_hrs = [float(o.get("hr", 80.0)) for o in sorted_obs]
        all_spo2s = [float(o.get("spo2", 98.0)) for o in sorted_obs]
        all_rrs = [float(o.get("rr", 16.0)) for o in sorted_obs]
        all_sbps = [float(o.get("sbp", 120.0)) for o in sorted_obs]

        rolling_min_spo2 = float(np.min(all_spo2s))
        rolling_max_hr = float(np.max(all_hrs))
        rolling_max_rr = float(np.max(all_rrs))
        rolling_min_sbp = float(np.min(all_sbps))
        rolling_mean_hr = round(float(np.mean(all_hrs)), 1)
        rolling_mean_spo2 = round(float(np.mean(all_spo2s)), 1)

        # Multi-point Trajectory Slopes (units/min)
        t0_time = parse_iso_time(t0_obs.get("timestamp")) or curr_time
        obs_times_mins = []
        for o in sorted_obs:
            ot = parse_iso_time(o.get("timestamp")) or t0_time
            obs_times_mins.append(max(0.0, (ot - t0_time).total_seconds() / 60.0))

        trajectory_slope_spo2 = round(calculate_slope(obs_times_mins, all_spo2s), 4)
        trajectory_slope_hr = round(calculate_slope(obs_times_mins, all_hrs), 4)
        trajectory_slope_rr = round(calculate_slope(obs_times_mins, all_rrs), 4)

        feature_dict: Dict[str, float] = {
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
            "mean_arterial_pressure": map_val,
            "qsofa_score": qsofa_score,
            "mews_score": mews_score,
            "delta_hr": delta_hr,
            "delta_spo2": delta_spo2,
            "delta_rr": delta_rr,
            "delta_sbp": delta_sbp,
            "delta_dbp": delta_dbp,
            "delta_temp": delta_temp,
            "delta_gcs": delta_gcs,
            "delta_shock_index": delta_shock_index,
            "velocity_hr": velocity_hr,
            "velocity_spo2": velocity_spo2,
            "velocity_rr": velocity_rr,
            "velocity_sbp": velocity_sbp,
            "velocity_shock_index": velocity_shock_index,
            "baseline_hr_delta": baseline_hr_delta,
            "baseline_spo2_delta": baseline_spo2_delta,
            "baseline_rr_delta": baseline_rr_delta,
            "baseline_sbp_delta": baseline_sbp_delta,
            "rolling_min_spo2": rolling_min_spo2,
            "rolling_max_hr": rolling_max_hr,
            "rolling_max_rr": rolling_max_rr,
            "rolling_min_sbp": rolling_min_sbp,
            "rolling_mean_hr": rolling_mean_hr,
            "rolling_mean_spo2": rolling_mean_spo2,
            "trajectory_slope_spo2": trajectory_slope_spo2,
            "trajectory_slope_hr": trajectory_slope_hr,
            "trajectory_slope_rr": trajectory_slope_rr,
            "observation_count": float(len(sorted_obs)),
            "time_since_arrival_mins": round(time_since_arrival_mins, 1),
            "minutes_since_prior_obs": round(minutes_since_prior_obs, 1),
            "initial_triage_level": initial_triage_level,
            "is_pediatric": is_pediatric,
            "is_geriatric": is_geriatric,
            "age": age,
            "gender_male": gender_male,
            "complaint_chest_pain": complaint_chest_pain,
            "complaint_respiratory": complaint_respiratory,
            "complaint_fever_sepsis": complaint_fever_sepsis,
            "complaint_abdominal": complaint_abdominal,
            "complaint_trauma": complaint_trauma
        }

        # Ensure all columns in schema are populated
        for col in LONGITUDINAL_FEATURE_COLUMNS:
            if col not in feature_dict:
                feature_dict[col] = 0.0

        return feature_dict
