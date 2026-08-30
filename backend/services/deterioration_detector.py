import datetime
from typing import List, Dict, Any, Optional, Tuple
from models import ClinicalObservation, AlertSeverityEnum, DetectionSourceEnum

class DeteriorationDetectionRule:
    def __init__(self, rule_id: str, name: str, description: str, clinical_source: str, version: str = "1.0"):
        self.rule_id = rule_id
        self.name = name
        self.description = description
        self.clinical_source = clinical_source
        self.version = version

class DeteriorationDetector:
    """
    Modular Deterioration Detection Engine for PatientTriage.ai.
    Evaluates longitudinal clinical observations over time to detect physiological decompensation.
    """
    VERSION = "1.0"
    DETECTION_SOURCE = DetectionSourceEnum.RULE_BASED

    # Configured prototype rules with documented clinical basis
    RULES = {
        "RULE-DET-COMPOSITE-01": DeteriorationDetectionRule(
            rule_id="RULE-DET-COMPOSITE-01",
            name="Composite Cardio-Respiratory Decompensation",
            description="Concurrent drop in SpO2 with compensatory rise in Respiratory Rate and Heart Rate.",
            clinical_source="Emergency Medicine Early Warning Protocol (Prototype Rule v1.0)",
            version="1.0"
        ),
        "RULE-DET-HYPOXIA-01": DeteriorationDetectionRule(
            rule_id="RULE-DET-HYPOXIA-01",
            name="Acute Oxygen Desaturation Trend",
            description="Significant acute decline in SpO2 or crossing below critical 90% threshold.",
            clinical_source="Respiratory Safety Baseline (Prototype Rule v1.0)",
            version="1.0"
        ),
        "RULE-DET-SHOCK-01": DeteriorationDetectionRule(
            rule_id="RULE-DET-SHOCK-01",
            name="Hemodynamic Instability / Shock Progression",
            description="Shock Index (HR/SBP) progression into abnormal territory (>= 1.0).",
            clinical_source="Trauma & Sepsis Shock Index Guidelines (Prototype Rule v1.0)",
            version="1.0"
        ),
        "RULE-DET-VITALS-01": DeteriorationDetectionRule(
            rule_id="RULE-DET-VITALS-01",
            name="Severe Tachypnea / Tachycardia Surge",
            description="Rapid acceleration of respiratory rate (>=28) or severe tachycardia (>=125 bpm).",
            clinical_source="Physiological Stress Thresholds (Prototype Rule v1.0)",
            version="1.0"
        )
    }

    @staticmethod
    def sort_and_validate_observations(observations: List[ClinicalObservation]) -> List[ClinicalObservation]:
        """
        Orders observations chronologically by timestamp and discards records with invalid/null vital signs.
        """
        if not observations:
            return []
        
        valid_obs = []
        for obs in observations:
            if obs.timestamp is None or obs.hr is None or obs.spo2 is None or obs.rr is None or obs.sbp is None:
                continue
            # Validate basic physiologic plausibility
            if not (20 <= obs.hr <= 260 and 40 <= obs.spo2 <= 100 and 4 <= obs.rr <= 70 and 30 <= obs.sbp <= 300):
                continue
            valid_obs.append(obs)
        
        # Sort strictly by timestamp ascending
        return sorted(valid_obs, key=lambda o: o.timestamp)

    @staticmethod
    def calculate_rate_of_change(val_curr: float, val_prev: float, dt_minutes: float) -> Optional[float]:
        """
        Calculates delta per minute if elapsed time is valid and > 0.
        """
        if dt_minutes <= 0 or dt_minutes > 1440: # Ignore negative or > 24hr intervals
            return None
        return round((val_curr - val_prev) / dt_minutes, 3)

    def evaluate_longitudinal_trend(
        self, 
        observations: List[ClinicalObservation],
        patient_age: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Main evaluation entry point.
        Analyzes chronological observations and determines if a concerning deterioration pattern is present.
        """
        sorted_obs = self.sort_and_validate_observations(observations)
        
        # Handle Missing / Insufficient Data Safely
        if len(sorted_obs) < 2:
            return {
                "detected": False,
                "status": "ASSESSMENT_UNAVAILABLE",
                "severity": None,
                "rule_id": None,
                "rule_version": self.VERSION,
                "summary": "Insufficient longitudinal observation history. At least 2 valid chronological vital readings are required to detect deterioration trends.",
                "signals": [],
                "observation_count": len(sorted_obs),
                "evaluated_at": datetime.datetime.utcnow().isoformat()
            }

        prev_obs = sorted_obs[-2]
        curr_obs = sorted_obs[-1]

        # Calculate time delta in minutes
        dt_seconds = (curr_obs.timestamp - prev_obs.timestamp).total_seconds()
        dt_minutes = max(1.0, round(dt_seconds / 60.0, 1))

        # Physiological deltas
        spo2_change = curr_obs.spo2 - prev_obs.spo2
        hr_change = curr_obs.hr - prev_obs.hr
        rr_change = curr_obs.rr - prev_obs.rr
        sbp_change = curr_obs.sbp - prev_obs.sbp
        gcs_change = (curr_obs.gcs or 15) - (prev_obs.gcs or 15)

        # Shock index (HR / SBP)
        prev_si = round(prev_obs.hr / prev_obs.sbp, 2) if prev_obs.sbp > 0 else 0.7
        curr_si = round(curr_obs.hr / curr_obs.sbp, 2) if curr_obs.sbp > 0 else 0.7
        si_change = round(curr_si - prev_si, 2)

        signals = []
        rule_triggered = None
        severity = AlertSeverityEnum.MODERATE

        # ----------------------------------------------------
        # Rule 1: Composite Cardio-Respiratory Decompensation
        # (SpO2 drops >= 4% + RR increases >= 4 + HR increases >= 10)
        # ----------------------------------------------------
        if spo2_change <= -4 and rr_change >= 4 and hr_change >= 10:
            rule_triggered = "RULE-DET-COMPOSITE-01"
            severity = AlertSeverityEnum.CRITICAL if (curr_obs.spo2 < 90 or curr_obs.rr >= 30) else AlertSeverityEnum.HIGH
            
            signals.append({
                "feature": "spo2",
                "feature_name": "Oxygen Saturation (SpO₂)",
                "previous_value": prev_obs.spo2,
                "current_value": curr_obs.spo2,
                "change": spo2_change,
                "rate_of_change_per_min": self.calculate_rate_of_change(curr_obs.spo2, prev_obs.spo2, dt_minutes),
                "unit": "%",
                "elapsed_minutes": dt_minutes,
                "clinical_meaning": "Progressive oxygen desaturation indicating compromised gas exchange."
            })
            signals.append({
                "feature": "rr",
                "feature_name": "Respiratory Rate (RR)",
                "previous_value": prev_obs.rr,
                "current_value": curr_obs.rr,
                "change": rr_change,
                "rate_of_change_per_min": self.calculate_rate_of_change(curr_obs.rr, prev_obs.rr, dt_minutes),
                "unit": "breaths/min",
                "elapsed_minutes": dt_minutes,
                "clinical_meaning": "Compensatory tachypnea reflecting increasing respiratory work."
            })
            signals.append({
                "feature": "hr",
                "feature_name": "Heart Rate (HR)",
                "previous_value": prev_obs.hr,
                "current_value": curr_obs.hr,
                "change": hr_change,
                "rate_of_change_per_min": self.calculate_rate_of_change(curr_obs.hr, prev_obs.hr, dt_minutes),
                "unit": "bpm",
                "elapsed_minutes": dt_minutes,
                "clinical_meaning": "Sympathetic cardiovascular drive / tachycardia compensation."
            })

        # ----------------------------------------------------
        # Rule 2: Acute Oxygen Desaturation Trend
        # (SpO2 drops >= 6% OR drops into < 90%)
        # ----------------------------------------------------
        elif (spo2_change <= -6 or (curr_obs.spo2 < 90 and spo2_change <= -3)):
            rule_triggered = "RULE-DET-HYPOXIA-01"
            severity = AlertSeverityEnum.CRITICAL if curr_obs.spo2 < 86 else AlertSeverityEnum.HIGH
            
            signals.append({
                "feature": "spo2",
                "feature_name": "Oxygen Saturation (SpO₂)",
                "previous_value": prev_obs.spo2,
                "current_value": curr_obs.spo2,
                "change": spo2_change,
                "rate_of_change_per_min": self.calculate_rate_of_change(curr_obs.spo2, prev_obs.spo2, dt_minutes),
                "unit": "%",
                "elapsed_minutes": dt_minutes,
                "clinical_meaning": f"Acute desaturation to {curr_obs.spo2}% ({spo2_change}% over {dt_minutes} mins)."
            })
            if rr_change >= 4:
                signals.append({
                    "feature": "rr",
                    "feature_name": "Respiratory Rate (RR)",
                    "previous_value": prev_obs.rr,
                    "current_value": curr_obs.rr,
                    "change": rr_change,
                    "rate_of_change_per_min": self.calculate_rate_of_change(curr_obs.rr, prev_obs.rr, dt_minutes),
                    "unit": "breaths/min",
                    "elapsed_minutes": dt_minutes,
                    "clinical_meaning": "Elevated respiratory rate secondary to desaturation."
                })

        # ----------------------------------------------------
        # Rule 3: Hemodynamic Instability / Shock Progression
        # (Shock Index worsens from < 0.9 to >= 1.0 OR SBP drops >= 25 with HR rise)
        # ----------------------------------------------------
        elif (prev_si < 0.9 and curr_si >= 1.0) or (sbp_change <= -25 and hr_change >= 10):
            rule_triggered = "RULE-DET-SHOCK-01"
            severity = AlertSeverityEnum.CRITICAL if curr_si >= 1.2 or curr_obs.sbp < 85 else AlertSeverityEnum.HIGH
            
            signals.append({
                "feature": "shock_index",
                "feature_name": "Shock Index (HR / SBP)",
                "previous_value": prev_si,
                "current_value": curr_si,
                "change": si_change,
                "rate_of_change_per_min": self.calculate_rate_of_change(curr_si, prev_si, dt_minutes),
                "unit": "ratio",
                "elapsed_minutes": dt_minutes,
                "clinical_meaning": f"Shock index worsened from {prev_si} to {curr_si} (threshold >= 1.0)."
            })
            signals.append({
                "feature": "sbp",
                "feature_name": "Systolic Blood Pressure (SBP)",
                "previous_value": prev_obs.sbp,
                "current_value": curr_obs.sbp,
                "change": sbp_change,
                "rate_of_change_per_min": self.calculate_rate_of_change(curr_obs.sbp, prev_obs.sbp, dt_minutes),
                "unit": "mmHg",
                "elapsed_minutes": dt_minutes,
                "clinical_meaning": "Declining systemic perfusion pressure."
            })

        # ----------------------------------------------------
        # Rule 4: Severe Tachypnea or Tachycardia Surge
        # (RR >= 28 with delta >= 6 OR HR >= 125 with delta >= 20)
        # ----------------------------------------------------
        elif (curr_obs.rr >= 28 and rr_change >= 6) or (curr_obs.hr >= 125 and hr_change >= 20):
            rule_triggered = "RULE-DET-VITALS-01"
            severity = AlertSeverityEnum.HIGH
            
            if curr_obs.rr >= 28 and rr_change >= 6:
                signals.append({
                    "feature": "rr",
                    "feature_name": "Respiratory Rate (RR)",
                    "previous_value": prev_obs.rr,
                    "current_value": curr_obs.rr,
                    "change": rr_change,
                    "rate_of_change_per_min": self.calculate_rate_of_change(curr_obs.rr, prev_obs.rr, dt_minutes),
                    "unit": "breaths/min",
                    "elapsed_minutes": dt_minutes,
                    "clinical_meaning": f"Severe tachypnea surge ({prev_obs.rr} -> {curr_obs.rr}/min)."
                })
            if curr_obs.hr >= 125 and hr_change >= 20:
                signals.append({
                    "feature": "hr",
                    "feature_name": "Heart Rate (HR)",
                    "previous_value": prev_obs.hr,
                    "current_value": curr_obs.hr,
                    "change": hr_change,
                    "rate_of_change_per_min": self.calculate_rate_of_change(curr_obs.hr, prev_obs.hr, dt_minutes),
                    "unit": "bpm",
                    "elapsed_minutes": dt_minutes,
                    "clinical_meaning": f"Marked tachycardic escalation ({prev_obs.hr} -> {curr_obs.hr} bpm)."
                })

        # Check if deterioration was detected
        if rule_triggered and signals:
            rule_obj = self.RULES.get(rule_triggered)
            signal_bullets = ", ".join([f"{s['feature_name']} ({'+' if s['change']>0 else ''}{s['change']} {s['unit']})" for s in signals])
            summary = f"Potential deterioration detected based on: {signal_bullets} over {dt_minutes} min interval."

            return {
                "detected": True,
                "status": "POTENTIAL_DETERIORATION",
                "severity": severity,
                "rule_id": rule_triggered,
                "rule_version": rule_obj.version if rule_obj else self.VERSION,
                "rule_name": rule_obj.name if rule_obj else "Physiological Deterioration Rule",
                "summary": summary,
                "signals": signals,
                "observation_count": len(sorted_obs),
                "evaluated_at": datetime.datetime.utcnow().isoformat()
            }
        else:
            return {
                "detected": False,
                "status": "NO_CONCERNING_CHANGE",
                "severity": None,
                "rule_id": None,
                "rule_version": self.VERSION,
                "summary": "No concerning physiological deterioration detected across historical observation intervals.",
                "signals": [],
                "observation_count": len(sorted_obs),
                "evaluated_at": datetime.datetime.utcnow().isoformat()
            }
