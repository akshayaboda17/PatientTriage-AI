"""
Principled Uncertainty and Confidence Estimation Service for PatientTriage.ai.
Calculates multidimensional prediction uncertainty, confidence tiers (HIGH, MODERATE, LOW),
and safety escalation triggers based on decision boundary proximity, data missingness,
age-cohort extrapolation, and clinical discordance.
"""
from enum import Enum
from typing import Dict, Any, Optional, List
from services.age_service import AgeService, AgeGroupEnum


class ConfidenceLevelEnum(str, Enum):
    HIGH = "HIGH"
    MODERATE = "MODERATE"
    LOW = "LOW"


class UncertaintyService:
    """
    Evaluates ML prediction uncertainty. Does NOT equate confidence directly to probability.
    Distinguishes statistical probability P(Y=1) from model epistemic/aleatoric confidence.
    """

    @staticmethod
    def calculate_uncertainty(
        probability: float,
        imputed_feature_count: int = 0,
        total_feature_count: int = 40,
        age_group: AgeGroupEnum = AgeGroupEnum.ADULT,
        has_discordant_signals: bool = False,
        is_zero_history: bool = False
    ) -> Dict[str, Any]:
        """
        Computes composite uncertainty score [0.0, 1.0] and assigns confidence tier.
        """
        # 1. Boundary Proximity Uncertainty: Max at p=0.5, Min at p=0.0 or 1.0
        boundary_dist = abs(probability - 0.5)
        # Normalized boundary uncertainty: 0.0 (at p=0 or 1) to 1.0 (at p=0.5)
        boundary_uncertainty = max(0.0, 1.0 - (2.0 * boundary_dist))

        # 2. Data Missingness Penalty: Imputed features proportion
        missing_ratio = min(1.0, imputed_feature_count / max(1, total_feature_count))
        missingness_penalty = missing_ratio * 0.50

        # 3. Age Cohort / Domain Shift Penalty
        age_disclosure = AgeService.get_ml_applicability_disclosure(age_group)
        age_penalty = age_disclosure.get("confidence_penalty", 0.0)

        # 4. Discordant Presentation Penalty
        discordance_penalty = 0.25 if has_discordant_signals else 0.0

        # 5. Zero-History Extrapolation Penalty
        history_penalty = 0.20 if is_zero_history else 0.0

        # Composite Uncertainty Score (Weighted sum clamped to 0.0 .. 1.0)
        raw_uncertainty = (
            (boundary_uncertainty * 0.40) +
            missingness_penalty +
            age_penalty +
            discordance_penalty +
            history_penalty
        )
        uncertainty_score = round(min(1.0, max(0.0, raw_uncertainty)), 4)

        # Determine Confidence Level
        if uncertainty_score < 0.30 and missing_ratio < 0.25:
            confidence = ConfidenceLevelEnum.HIGH
        elif uncertainty_score < 0.60 and missing_ratio < 0.50:
            confidence = ConfidenceLevelEnum.MODERATE
        else:
            confidence = ConfidenceLevelEnum.LOW

        # Safety Escalation Determination
        safety_escalation_required = (
            confidence == ConfidenceLevelEnum.LOW or
            age_group == AgeGroupEnum.UNKNOWN or
            (boundary_uncertainty > 0.60 and has_discordant_signals) or
            age_disclosure.get("requires_safety_escalation", False)
        )

        escalation_reasons: List[str] = []
        if confidence == ConfidenceLevelEnum.LOW:
            escalation_reasons.append("Model confidence is LOW due to high composite uncertainty.")
        if boundary_uncertainty > 0.60:
            escalation_reasons.append(f"Prediction probability ({probability:.3f}) is near the clinical decision boundary.")
        if missing_ratio > 0.30:
            escalation_reasons.append(f"{imputed_feature_count}/{total_feature_count} features were missing and imputed.")
        if age_group == AgeGroupEnum.PEDIATRIC:
            escalation_reasons.append("Pediatric cohort: model trained primarily on adult baseline.")
        if age_group == AgeGroupEnum.UNKNOWN:
            escalation_reasons.append("Patient age is unknown.")
        if has_discordant_signals:
            escalation_reasons.append("Symptoms and observed vital signs are clinically discordant.")
        if is_zero_history:
            escalation_reasons.append("Zero prior medical history available.")

        return {
            "probability": round(probability, 4),
            "confidence": confidence.value,
            "uncertainty_score": uncertainty_score,
            "boundary_uncertainty": round(boundary_uncertainty, 4),
            "missing_feature_ratio": round(missing_ratio, 4),
            "age_group": age_group.value,
            "safety_escalation_required": safety_escalation_required,
            "escalation_reasons": escalation_reasons,
            "safety_notice": (
                "⚠️ UNCERTAIN AI ASSESSMENT — Safety-First Escalation: Clinician review required."
                if safety_escalation_required else None
            )
        }
