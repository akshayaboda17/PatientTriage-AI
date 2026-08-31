"""
Centralized Age-Aware Clinical Triage Service for PatientTriage.ai.
Standardizes age-group classification, physiological vital thresholds,
and ML applicability disclosures across the application stack.
"""
from enum import Enum
from typing import Dict, Any, Optional, Tuple


class AgeGroupEnum(str, Enum):
    PEDIATRIC = "PEDIATRIC"      # age < 18
    ADULT = "ADULT"              # 18 <= age < 65
    GERIATRIC = "GERIATRIC"      # age >= 65
    UNKNOWN = "UNKNOWN"          # Missing / invalid age


class AgeService:
    """
    Centralized authority for age-group determination, physiological thresholds,
    and clinical validation applicability disclosures.
    """

    @staticmethod
    def determine_age_group(age: Optional[float]) -> AgeGroupEnum:
        """
        Determines the clinical age category from raw age in years.
        Never guesses; classifies missing/invalid values as UNKNOWN.
        """
        if age is None:
            return AgeGroupEnum.UNKNOWN
        try:
            val = float(age)
            if val < 0 or val > 130:
                return AgeGroupEnum.UNKNOWN
            if val < 18.0:
                return AgeGroupEnum.PEDIATRIC
            elif val < 65.0:
                return AgeGroupEnum.ADULT
            else:
                return AgeGroupEnum.GERIATRIC
        except (ValueError, TypeError):
            return AgeGroupEnum.UNKNOWN

    @staticmethod
    def get_age_group_label(age_group: AgeGroupEnum) -> str:
        labels = {
            AgeGroupEnum.PEDIATRIC: "Pediatric (< 18y)",
            AgeGroupEnum.ADULT: "Adult (18–64y)",
            AgeGroupEnum.GERIATRIC: "Geriatric (≥ 65y)",
            AgeGroupEnum.UNKNOWN: "Age Unknown (Safe Fallback)"
        }
        return labels.get(age_group, "Unknown")

    @staticmethod
    def get_clinical_vital_thresholds(age_group: AgeGroupEnum) -> Dict[str, Tuple[float, float]]:
        """
        Returns typical baseline physiological expected ranges (min, max) for triage screening.
        Note: These are simulation/prototype reference parameters and not diagnostic bounds.
        """
        if age_group == AgeGroupEnum.PEDIATRIC:
            return {
                "hr": (70.0, 130.0),       # Higher normal resting HR in pediatric cohorts
                "sbp": (80.0, 115.0),      # Lower normal systolic BP
                "dbp": (50.0, 75.0),
                "rr": (18.0, 30.0),        # Higher resting RR
                "spo2": (95.0, 100.0),
                "temp": (36.5, 37.5)
            }
        elif age_group == AgeGroupEnum.GERIATRIC:
            return {
                "hr": (55.0, 95.0),        # Blunted tachycardic response common in elderly
                "sbp": (100.0, 150.0),     # Higher baseline systolic stiffness
                "dbp": (60.0, 90.0),
                "rr": (12.0, 20.0),
                "spo2": (94.0, 100.0),
                "temp": (36.0, 37.3)       # Lower baseline thermal setpoint in geriatric cohorts
            }
        elif age_group == AgeGroupEnum.ADULT:
            return {
                "hr": (60.0, 100.0),
                "sbp": (90.0, 130.0),
                "dbp": (60.0, 85.0),
                "rr": (12.0, 20.0),
                "spo2": (95.0, 100.0),
                "temp": (36.5, 37.5)
            }
        else: # UNKNOWN fallback
            return {
                "hr": (60.0, 100.0),
                "sbp": (90.0, 130.0),
                "dbp": (60.0, 85.0),
                "rr": (12.0, 20.0),
                "spo2": (95.0, 100.0),
                "temp": (36.5, 37.5)
            }

    @staticmethod
    def get_ml_applicability_disclosure(age_group: AgeGroupEnum) -> Dict[str, Any]:
        """
        Provides explicit disclosure regarding ML model applicability limitations
        for non-adult or unknown cohorts to prevent clinical automation bias.
        """
        if age_group == AgeGroupEnum.PEDIATRIC:
            return {
                "is_primary_cohort": False,
                "confidence_penalty": 0.25,
                "warning_message": (
                    "⚠️ ML model applicability is limited for Pediatric cohorts (< 18y). "
                    "Pediatric vitals and clinical deterioration patterns differ significantly from adult baselines. "
                    "Mandatory clinician review required."
                ),
                "requires_safety_escalation": True
            }
        elif age_group == AgeGroupEnum.GERIATRIC:
            return {
                "is_primary_cohort": True,
                "confidence_penalty": 0.10,
                "warning_message": (
                    "ℹ️ Geriatric cohort (≥ 65y): Atypical presentations (e.g. blunted febrile response, "
                    "confusion vs focal pain) are prevalent. Clinician review recommended."
                ),
                "requires_safety_escalation": False
            }
        elif age_group == AgeGroupEnum.UNKNOWN:
            return {
                "is_primary_cohort": False,
                "confidence_penalty": 0.35,
                "warning_message": (
                    "🚨 Patient age is UNKNOWN. Standard adult assumptions have NOT been applied. "
                    "Safety-first escalation activated. Immediate clinician intake required."
                ),
                "requires_safety_escalation": True
            }
        else: # ADULT
            return {
                "is_primary_cohort": True,
                "confidence_penalty": 0.0,
                "warning_message": None,
                "requires_safety_escalation": False
            }
