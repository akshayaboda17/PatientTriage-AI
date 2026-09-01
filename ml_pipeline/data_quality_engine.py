"""
Data Quality Assessment, Clinical Negation, and Ambiguity Engine for PatientTriage.ai (Task 4).
Evaluates information availability, differentiates recorded vs missing vs unknown vs denied,
and parses clinical text with robust negation and ambiguity detection.
"""
from typing import Dict, Any, List, Tuple, Optional

class DataQualityEngine:
    """
    Assesses data quality, intake completeness, clinical negation, and ambiguity for point-of-arrival triage.
    """

    @classmethod
    def parse_clinical_complaint(cls, text: Optional[str]) -> Dict[str, Any]:
        """
        Parses chief complaint text with robust clinical negation and ambiguous presentation detection.
        """
        if not text:
            return {
                "primary_category": "other",
                "is_ambiguous": 0.0,
                "is_negated": 0.0,
                "detected_symptoms": [],
                "negated_symptoms": [],
                "raw_text": ""
            }

        t = text.lower().strip()

        # Negation detector for specific symptom keywords
        def check_negation(keyword: str) -> bool:
            neg_patterns = [
                f"no {keyword}", f"denies {keyword}", f"denied {keyword}",
                f"without {keyword}", f"negative for {keyword}", f"free of {keyword}",
                f"not experiencing {keyword}", f"rules out {keyword}", f"denies any {keyword}"
            ]
            return any(p in t for p in neg_patterns)

        # Keyword dictionaries
        symptom_map = {
            "chest_pain": ["chest pain", "chest pressure", "cardiac", "angina", "heart pain", "crushing chest"],
            "respiratory": ["shortness of breath", "breath", "dyspnea", "asthma", "copd", "wheez", "hypox", "stridor"],
            "abdominal": ["abdom", "stomach", "belly", "nausea", "vomit", "diarrhea", "appendi", "flank pain", "epigastric"],
            "neurological": ["headache", "stroke", "seizure", "syncope", "neuro", "dizz", "altered", "confus", "facial droop", "numbness", "ataxia", "weakness"],
            "trauma": ["trauma", "fall", "mva", "fracture", "accident", "wound", "lacerat", "injury", "contusion", "sprain"],
            "infection_fever": ["fever", "chills", "sepsis", "infect", "pyrexia", "urinary", "dysuria", "cellulitis", "rigors"]
        }

        detected = []
        negated = []

        for category, terms in symptom_map.items():
            matched_term = next((term for term in terms if term in t), None)
            if matched_term:
                if check_negation(matched_term) or check_negation(category.replace("_", " ")):
                    negated.append(category)
                else:
                    detected.append(category)

        # Detect ambiguous / non-specific presentation
        ambiguous_terms = [
            "dizziness and nausea", "dizzy and nausea", "nausea and dizziness",
            "fatigue and weakness", "weakness and fatigue", "malaise",
            "vague chest discomfort", "unspecified discomfort", "feeling unwell",
            "generalized weakness", "diffuse aches", "non-specific", "multiple symptoms"
        ]
        is_ambiguous_text = any(amb in t for amb in ambiguous_terms)
        is_multi_symptom = len(detected) >= 2
        is_ambiguous = 1.0 if (is_ambiguous_text or is_multi_symptom) else 0.0

        # Primary Category Assignment
        if detected:
            primary_cat = detected[0]
        else:
            primary_cat = "other"

        return {
            "primary_category": primary_cat,
            "is_ambiguous": is_ambiguous,
            "is_negated": 1.0 if len(negated) > 0 else 0.0,
            "detected_symptoms": detected,
            "negated_symptoms": negated,
            "raw_text": text
        }

    @classmethod
    def evaluate_data_quality(
        cls,
        patient_data: Dict[str, Any],
        encounter_data: Dict[str, Any],
        arrival_obs: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Calculates intake data completeness score, identifies missing vs zero-history vs unknown data,
        and builds clinical limitation statements.
        """
        core_vitals = ["hr", "sbp", "rr", "spo2", "temp", "gcs", "pain_score", "dbp"]
        missing_vitals = []
        recorded_vitals = []

        for v in core_vitals:
            val = arrival_obs.get(v)
            if val is None or val == "":
                missing_vitals.append(v)
            else:
                recorded_vitals.append(v)

        vital_missing_count = float(len(missing_vitals))

        # Medical History Parsing
        med_hist = str(patient_data.get("medical_history", "")).strip().lower()
        allergies = str(patient_data.get("allergies", "")).strip().lower()

        # Differentiate: Zero-History vs Known History vs Unknown History
        zero_hist_terms = ["zero history", "first visit", "no records found", "unregistered", "zero prior history", "new patient"]
        unknown_hist_terms = ["unknown", "unobtainable", "unable to obtain", "not provided", "not available", "unresponsive history"]

        if any(term in med_hist for term in zero_hist_terms):
            is_zero_history = 1.0
            history_is_unknown = 0.0
            has_known_history = 0.0
        elif any(term in med_hist for term in unknown_hist_terms) or not med_hist:
            is_zero_history = 0.0
            history_is_unknown = 1.0
            has_known_history = 0.0
        elif med_hist in ["none", "no prior history", "none reported", "nkda", "healthy"]:
            is_zero_history = 0.0
            history_is_unknown = 0.0
            has_known_history = 0.0  # Documented absence of chronic conditions
        else:
            is_zero_history = 0.0
            history_is_unknown = 0.0
            has_known_history = 1.0

        has_known_allergies = 1.0 if (allergies and allergies not in ["none", "nkda", "no known allergies", "unknown"]) else 0.0

        # Calculate Data Completeness Score (0.0 to 1.0)
        # Weights: Core Vitals (70%), Patient History (20%), Arrival Context (10%)
        vital_completeness = (len(core_vitals) - len(missing_vitals)) / float(len(core_vitals))
        history_completeness = 0.5 if (is_zero_history or history_is_unknown) else 1.0
        context_completeness = 1.0 if encounter_data.get("chief_complaint") else 0.5

        data_completeness_score = round(
            (0.70 * vital_completeness) + (0.20 * history_completeness) + (0.10 * context_completeness),
            3
        )

        if data_completeness_score >= 0.85:
            data_quality_tier = "HIGH"
        elif data_completeness_score >= 0.65:
            data_quality_tier = "MODERATE"
        else:
            data_quality_tier = "LIMITED"

        # Generate Explainable Data Limitation Disclaimers
        limitations = []
        if is_zero_history:
            limitations.append("Limited historical information available (first-time / zero-history patient).")
        elif history_is_unknown:
            limitations.append("Medical history was unobtained or marked unknown at presentation.")

        if "spo2" in missing_vitals:
            limitations.append("Oxygen saturation (SpO2) was not recorded at intake.")
        if "sbp" in missing_vitals:
            limitations.append("Blood pressure was not recorded at intake.")
        if "temp" in missing_vitals:
            limitations.append("Body temperature was omitted at bedside.")
        if "gcs" in missing_vitals:
            limitations.append("GCS neurological score was omitted.")

        complaint_parse = cls.parse_clinical_complaint(encounter_data.get("chief_complaint"))
        if complaint_parse["is_ambiguous"]:
            limitations.append("Presenting symptoms are non-specific or span multiple physiological systems.")

        return {
            "data_completeness_score": data_completeness_score,
            "data_quality_tier": data_quality_tier,
            "vital_missing_count": vital_missing_count,
            "missing_vitals": missing_vitals,
            "is_zero_history": is_zero_history,
            "history_is_unknown": history_is_unknown,
            "has_known_history": has_known_history,
            "has_known_allergies": has_known_allergies,
            "complaint_analysis": complaint_parse,
            "data_limitations": limitations
        }
