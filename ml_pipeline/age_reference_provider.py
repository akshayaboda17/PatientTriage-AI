"""
Centralized Age Group Configuration and Reference Range Provider for PatientTriage.ai (Task 4).
Defines single source of truth for age cohorts: PEDIATRIC (<18), ADULT (18-64), and GERIATRIC (>=65).
Provides prototype age-contextualized reference ranges and age-vital interaction features.

DISCLOSURE:
Reference ranges provided herein are configurable prototype development assumptions designed
for physiological modeling and feature derivation. They do NOT represent clinically validated
pediatric/geriatric clinical guidelines and must be calibrated to institutional clinical protocols.
"""
from typing import Dict, Any, Tuple, Optional

# Centralized Age Boundaries (Single Source of Truth)
PEDIATRIC_MAX_AGE_YEARS: float = 18.0
GERIATRIC_MIN_AGE_YEARS: float = 65.0

AGE_GROUP_PEDIATRIC: str = "PEDIATRIC"
AGE_GROUP_ADULT: str = "ADULT"
AGE_GROUP_GERIATRIC: str = "GERIATRIC"

# Prototype Demographic Baseline Assumptions
PROTOTYPE_AGE_REFERENCE_RANGES: Dict[str, Dict[str, Dict[str, float]]] = {
    AGE_GROUP_PEDIATRIC: {
        "hr": {"low_concern": 70.0, "normal_low": 80.0, "normal_high": 130.0, "high_concern": 150.0},
        "rr": {"low_concern": 14.0, "normal_low": 18.0, "normal_high": 28.0, "high_concern": 36.0},
        "sbp": {"low_concern": 75.0, "normal_low": 85.0, "normal_high": 115.0, "high_concern": 135.0},
        "spo2": {"low_concern": 92.0, "normal_low": 95.0, "normal_high": 100.0, "high_concern": 100.0},
        "temp": {"low_concern": 35.5, "normal_low": 36.5, "normal_high": 37.8, "high_concern": 39.0}
    },
    AGE_GROUP_ADULT: {
        "hr": {"low_concern": 50.0, "normal_low": 60.0, "normal_high": 100.0, "high_concern": 120.0},
        "rr": {"low_concern": 10.0, "normal_low": 12.0, "normal_high": 20.0, "high_concern": 26.0},
        "sbp": {"low_concern": 90.0, "normal_low": 100.0, "normal_high": 140.0, "high_concern": 180.0},
        "spo2": {"low_concern": 92.0, "normal_low": 95.0, "normal_high": 100.0, "high_concern": 100.0},
        "temp": {"low_concern": 35.5, "normal_low": 36.2, "normal_high": 37.5, "high_concern": 38.5}
    },
    AGE_GROUP_GERIATRIC: {
        "hr": {"low_concern": 50.0, "normal_low": 58.0, "normal_high": 90.0, "high_concern": 105.0},
        "rr": {"low_concern": 12.0, "normal_low": 14.0, "normal_high": 22.0, "high_concern": 26.0},
        "sbp": {"low_concern": 100.0, "normal_low": 110.0, "normal_high": 150.0, "high_concern": 190.0},
        "spo2": {"low_concern": 91.0, "normal_low": 94.0, "normal_high": 100.0, "high_concern": 100.0},
        "temp": {"low_concern": 35.0, "normal_low": 36.0, "normal_high": 37.3, "high_concern": 38.0}
    }
}

class AgeAwareReferenceProvider:
    """
    Configurable provider for age-group segmentation and age-aware physiological feature derivation.
    """

    @classmethod
    def get_age_group(cls, age: float) -> str:
        """
        Maps numerical patient age to standard clinical cohort.
        """
        if age < PEDIATRIC_MAX_AGE_YEARS:
            return AGE_GROUP_PEDIATRIC
        elif age >= GERIATRIC_MIN_AGE_YEARS:
            return AGE_GROUP_GERIATRIC
        else:
            return AGE_GROUP_ADULT

    @classmethod
    def get_age_group_flags(cls, age: float) -> Tuple[float, float, float]:
        """
        Returns one-hot indicator tuple (is_pediatric, is_adult, is_geriatric).
        """
        grp = cls.get_age_group(age)
        return (
            1.0 if grp == AGE_GROUP_PEDIATRIC else 0.0,
            1.0 if grp == AGE_GROUP_ADULT else 0.0,
            1.0 if grp == AGE_GROUP_GERIATRIC else 0.0
        )

    @classmethod
    def compute_age_vital_interaction_features(
        cls,
        age: float,
        hr: float,
        rr: float,
        sbp: float,
        spo2: float,
        temp: float
    ) -> Dict[str, float]:
        """
        Derives clinically interpretable interaction features between age group and vital signs.
        """
        is_ped, is_adult, is_ger = cls.get_age_group_flags(age)

        # 1. Pediatric specific vital patterns
        pediatric_high_hr = 1.0 if (is_ped and hr > 140.0) else 0.0
        pediatric_high_rr = 1.0 if (is_ped and rr > 32.0) else 0.0
        pediatric_hypotension = 1.0 if (is_ped and sbp < 80.0) else 0.0

        # 2. Geriatric specific vital patterns (blunted autonomic response, early tachypnea)
        geriatric_blunted_tachycardia = 1.0 if (is_ger and hr >= 95.0 and sbp <= 110.0) else 0.0
        geriatric_tachypnea = 1.0 if (is_ger and rr >= 22.0) else 0.0
        geriatric_hypotension = 1.0 if (is_ger and sbp < 100.0) else 0.0
        geriatric_hypothermia_risk = 1.0 if (is_ger and temp < 36.0) else 0.0

        return {
            "pediatric_high_hr": pediatric_high_hr,
            "pediatric_high_rr": pediatric_high_rr,
            "pediatric_hypotension": pediatric_hypotension,
            "geriatric_blunted_tachycardia": geriatric_blunted_tachycardia,
            "geriatric_tachypnea": geriatric_tachypnea,
            "geriatric_hypotension": geriatric_hypotension,
            "geriatric_hypothermia_risk": geriatric_hypothermia_risk
        }
