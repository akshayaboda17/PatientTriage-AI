"""
Patient Safety Status and Clinical Escalation Service for PatientTriage.ai.
Evaluates workflow safety states (STABLE, MONITOR, REASSESS, ESCALATE),
detects ambiguous/discordant presentations, and categorizes medical history availability.
"""
from enum import Enum
from typing import Dict, Any, Optional, List
from services.age_service import AgeService, AgeGroupEnum
from services.uncertainty_service import ConfidenceLevelEnum


class SafetyStatusEnum(str, Enum):
    STABLE = "STABLE"        # Normal vital progression, low/moderate risk, high confidence
    MONITOR = "MONITOR"      # Moderate risk or approaching threshold, routine reassessment
    REASSESS = "REASSESS"    # Wait threshold exceeded or minor vital drift detected
    ESCALATE = "ESCALATE"    # High risk, severe deterioration, low confidence, or severe discordance


class HistoryStatusEnum(str, Enum):
    HISTORY_AVAILABLE = "HISTORY_AVAILABLE"
    ZERO_HISTORY_FIRST_TIME = "ZERO_HISTORY_FIRST_TIME"
    PARTIAL_HISTORY = "PARTIAL_HISTORY"
    UNKNOWN_NOT_AVAILABLE = "UNKNOWN_NOT_AVAILABLE"


class SafetyService:
    """
    Evaluates patient safety workflow status.
    Ensures under-triage is prevented by biasing toward safety escalation when uncertainty exists.
    """

    # Red flag symptom keywords
    RED_FLAG_KEYWORDS = [
        "chest pain", "shortness of breath", "dyspnea", "syncope", "loss of consciousness",
        "altered mental", "confusion", "cyanosis", "anaphylaxis", "severe bleed", "stroke",
        "paralysis", "lethargy", "unresponsive", "seizure", "crushing"
    ]

    # Discordance keywords (atypical/vague)
    ATYPICAL_KEYWORDS = [
        "weakness", "malaise", "vague", "dizziness", "fatigue", "not feeling right",
        "mild discomfort", "general ache", "unsteady"
    ]

    @staticmethod
    def classify_history_status(medical_history: Optional[str], allergies: Optional[str]) -> HistoryStatusEnum:
        """
        Explicitly distinguishes zero prior history from documented absence of history.
        Never treats missing history as 'None/Healthy'.
        """
        hist_text = (medical_history or "").strip().lower()
        all_text = (allergies or "").strip().lower()

        if not hist_text and not all_text:
            return HistoryStatusEnum.UNKNOWN_NOT_AVAILABLE
        
        if hist_text in ["zero history", "first visit", "no records found", "unregistered", "zero prior history"]:
            return HistoryStatusEnum.ZERO_HISTORY_FIRST_TIME
        
        if hist_text in ["none", "no prior history", "none reported", "nkda", "no known allergies"] and (all_text in ["none", "nkda", "no known allergies"]):
            return HistoryStatusEnum.HISTORY_AVAILABLE

        if len(hist_text) < 10 and not all_text:
            return HistoryStatusEnum.PARTIAL_HISTORY

        return HistoryStatusEnum.HISTORY_AVAILABLE

    @staticmethod
    def detect_clinical_discordance(
        chief_complaint: str,
        vitals: Dict[str, Any],
        age_group: AgeGroupEnum = AgeGroupEnum.ADULT
    ) -> Dict[str, Any]:
        """
        Detects ambiguous and discordant presentations where reported symptoms and
        observed physiological findings do not align cleanly.
        """
        complaint = (chief_complaint or "").lower()
        has_red_flags = any(k in complaint for k in SafetyService.RED_FLAG_KEYWORDS)
        has_atypical = any(k in complaint for k in SafetyService.ATYPICAL_KEYWORDS)

        hr = vitals.get("hr")
        sbp = vitals.get("sbp")
        spo2 = vitals.get("spo2")
        rr = vitals.get("rr")
        pain = vitals.get("pain_score", 0)

        # Check physiological abnormality
        vitals_abnormal = False
        if hr and (hr < 50 or hr > 110):
            vitals_abnormal = True
        if sbp and (sbp < 90 or sbp > 170):
            vitals_abnormal = True
        if spo2 and spo2 < 94:
            vitals_abnormal = True
        if rr and (rr < 10 or rr > 26):
            vitals_abnormal = True

        is_discordant = False
        discordance_type = "CONCORDANT"
        explanation = "Symptoms and physiological vital signs are concordant."

        # Case 1: Severe reported red flags with completely normal vitals
        if has_red_flags and not vitals_abnormal and (pain is None or pain < 4):
            is_discordant = True
            discordance_type = "RED_FLAGS_NORMAL_VITALS"
            explanation = (
                "⚠️ Clinical information is discordant: Patient reports high-risk symptoms "
                "(e.g. chest pain / acute dyspnea) despite normal initial triage vital signs. "
                "Do NOT down-triage based solely on normal vitals."
            )
        # Case 2: Severe physiological abnormality with mild/vague reported symptoms
        elif vitals_abnormal and has_atypical and not has_red_flags:
            is_discordant = True
            discordance_type = "ATYPICAL_SYMPTOMS_ABNORMAL_VITALS"
            explanation = (
                "⚠️ Clinical information is discordant: Patient reports vague/atypical symptoms "
                "(e.g. general weakness) but exhibits significant physiological vital instability. "
                "Often seen in geriatric and immunocompromised presentations."
            )
        # Case 3: Extreme reported pain (>= 8) with entirely normal hemodynamics
        elif pain and pain >= 8 and not vitals_abnormal:
            is_discordant = True
            discordance_type = "SEVERE_PAIN_NORMAL_HEMODYNAMICS"
            explanation = (
                "ℹ️ Discordance note: Severe pain score (≥ 8/10) with normotensive/eucardic hemodynamics. "
                "Clinician bedside assessment recommended."
            )

        return {
            "is_discordant": is_discordant,
            "discordance_type": discordance_type,
            "explanation": explanation,
            "has_red_flags": has_red_flags,
            "has_atypical_symptoms": has_atypical
        }

    @staticmethod
    def determine_safety_status(
        ai_risk_category: str,
        confidence_level: str,
        wait_threshold_exceeded: bool,
        has_active_deterioration: bool,
        has_discordance: bool,
        age_group: AgeGroupEnum,
        is_zero_history: bool = False
    ) -> Dict[str, Any]:
        """
        Determines the patient's workflow safety state: STABLE, MONITOR, REASSESS, ESCALATE.
        """
        reasons: List[str] = []

        # 1. Immediate Escalation Criteria
        if has_active_deterioration:
            reasons.append("Active clinical deterioration trend detected.")
            return {"status": SafetyStatusEnum.ESCALATE.value, "reasons": reasons}

        if ai_risk_category == "HIGH" and confidence_level in ["HIGH", "MODERATE"]:
            reasons.append("High AI risk assessment.")
            return {"status": SafetyStatusEnum.ESCALATE.value, "reasons": reasons}

        if confidence_level == "LOW":
            reasons.append("Low AI prediction confidence — Safety-First Escalation triggered.")
            return {"status": SafetyStatusEnum.ESCALATE.value, "reasons": reasons}

        if age_group == AgeGroupEnum.UNKNOWN:
            reasons.append("Unknown age cohort — safe fallback escalation.")
            return {"status": SafetyStatusEnum.ESCALATE.value, "reasons": reasons}

        # 2. Reassessment Criteria
        if wait_threshold_exceeded:
            reasons.append("Safe ED waiting time threshold exceeded.")
            return {"status": SafetyStatusEnum.REASSESS.value, "reasons": reasons}

        if has_discordance and ai_risk_category == "MODERATE":
            reasons.append("Clinical symptom/vital discordance requires reassessment.")
            return {"status": SafetyStatusEnum.REASSESS.value, "reasons": reasons}

        # 3. Monitor Criteria
        if ai_risk_category == "MODERATE" or is_zero_history or age_group == AgeGroupEnum.GERIATRIC:
            if is_zero_history:
                reasons.append("First-time zero-history patient.")
            if age_group == AgeGroupEnum.GERIATRIC:
                reasons.append("Geriatric monitoring protocol active.")
            if ai_risk_category == "MODERATE":
                reasons.append("Moderate AI risk level.")
            return {"status": SafetyStatusEnum.MONITOR.value, "reasons": reasons}

        # 4. Stable
        reasons.append("Normal vitals trajectory and low predicted risk.")
        return {"status": SafetyStatusEnum.STABLE.value, "reasons": reasons}
