import datetime
import random
import numpy as np
import pandas as pd
from typing import List, Dict, Any, Tuple
from ml_pipeline.feature_extractor import ClinicalFeatureExtractor

class PhysiologicallyGroundedCohortGenerator:
    """
    Generates realistic, physiologically coherent clinical development cohorts
    for training, validation, and benchmarking the PatientTriage.ai ML pipeline.
    
    Explicitly separated from real clinical databases to support reproducible
    offline experimentation, cross-validation, and feature schema verification.
    """

    def __init__(self, seed: int = 42):
        self.seed = seed
        random.seed(seed)
        np.random.seed(seed)

    def generate_patient_trajectory(self, patient_idx: int) -> Tuple[Dict[str, Any], Dict[str, Any], List[Dict[str, Any]], Dict[str, Any]]:
        """
        Generates a single patient with demographics, encounter metadata, 
        longitudinal vital sign timepoints, and downstream 24h ground-truth clinical outcome.
        """
        patient_id = f"SYN-PT-{patient_idx:06d}"
        encounter_id = f"SYN-ENC-{patient_idx:06d}"
        hospital_id = random.choice(["DEMO001", "METRO002", "ACADEMIC003"])

        age = float(np.clip(np.random.normal(52, 20), 18, 98))
        gender = random.choice(["Male", "Female"])
        
        # Clinical Phenotype Selection
        # ~12% Critical/Decompensating, ~38% Moderate/Urgent, ~50% Mild/Stable
        phenotype_roll = random.random()
        
        if phenotype_roll < 0.04:
            phenotype = "SEPSIS_SHOCK"
            chief_complaint = random.choice(["High fever, altered mental status, severe weakness", "Urosepsis, severe rigors, confusion", "Septic shock secondary to pneumonia"])
            arrival_mode = "Ambulance"
            outcome_critical = 1
            icu_admitted = 1
            intubated = 1 if random.random() < 0.4 else 0
            vasopressor = 1 if random.random() < 0.8 else 0
            mortality = 1 if random.random() < 0.15 else 0
            triage_acuity = 1 if (intubated or vasopressor) else 2
            n_obs = random.randint(2, 4)

        elif phenotype_roll < 0.08:
            phenotype = "ACUTE_RESPIRATORY_FAILURE"
            chief_complaint = random.choice(["Severe shortness of breath, unable to speak in sentences", "Severe COPD exacerbation, blue lips", "Refractory asthma attack, accessory muscle use"])
            arrival_mode = "Ambulance"
            outcome_critical = 1
            icu_admitted = 1
            intubated = 1 if random.random() < 0.6 else 0
            vasopressor = 0
            mortality = 1 if random.random() < 0.1 else 0
            triage_acuity = 1 if intubated else 2
            n_obs = random.randint(2, 4)

        elif phenotype_roll < 0.12:
            phenotype = "CARDIOGENIC_SHOCK_OR_STEMI"
            chief_complaint = random.choice(["Crushing retrosternal chest pain radiating to jaw", "Acute diaphoresis, chest pressure, near syncope", "Severe dyspnea with acute pulmonary edema"])
            arrival_mode = "Ambulance"
            outcome_critical = 1
            icu_admitted = 1
            intubated = 0
            vasopressor = 1 if random.random() < 0.5 else 0
            mortality = 1 if random.random() < 0.12 else 0
            triage_acuity = 1 if vasopressor else 2
            n_obs = random.randint(2, 3)

        elif phenotype_roll < 0.50:
            phenotype = "MODERATE_URGENT"
            chief_complaint = random.choice([
                "Right lower quadrant abdominal pain with vomiting",
                "Moderate asthma flare responsive to bronchodilators",
                "Closed ankle fracture following mechanical fall",
                "Acute migraine with photophobia",
                "Laceration requiring sutures with controlled bleeding",
                "Uncomplicated urinary tract infection and flank pain"
            ])
            arrival_mode = random.choice(["Walk-in", "Walk-in", "Wheelchair"])
            outcome_critical = 0
            icu_admitted = 0
            intubated = 0
            vasopressor = 0
            mortality = 0
            triage_acuity = 3
            n_obs = random.randint(1, 3)

        else:
            phenotype = "LOW_ACUITY_STABLE"
            chief_complaint = random.choice([
                "Mild wrist sprain after slipping on ice",
                "Superficial finger cut, minimal bleeding",
                "Sore throat and mild rhinorrhea for 2 days",
                "Medication refill request",
                "Mild chronic low back pain, no red flags",
                "Minor rash on forearm, no systemic symptoms"
            ])
            arrival_mode = "Walk-in"
            outcome_critical = 0
            icu_admitted = 0
            intubated = 0
            vasopressor = 0
            mortality = 0
            triage_acuity = random.choice([4, 4, 5])
            n_obs = 1

        patient_data = {
            "patient_id": patient_id,
            "age": age,
            "gender": gender,
            "hospital_id": hospital_id
        }

        arrival_dt = datetime.datetime(2026, 1, 1, 8, 0, 0) + datetime.timedelta(minutes=patient_idx * 7)
        encounter_data = {
            "encounter_id": encounter_id,
            "patient_id": patient_id,
            "hospital_id": hospital_id,
            "arrival_time": arrival_dt.isoformat(),
            "arrival_mode": arrival_mode,
            "chief_complaint": chief_complaint
        }

        outcome_data = {
            "encounter_id": encounter_id,
            "patient_id": patient_id,
            "composite_critical_outcome_24h": outcome_critical,
            "icu_admitted_24h": icu_admitted,
            "intubated_24h": intubated,
            "vasopressor_24h": vasopressor,
            "mortality_24h": mortality,
            "triage_acuity_level": triage_acuity
        }

        # Generate Longitudinal Observations
        observations = []
        base_t = arrival_dt + datetime.timedelta(minutes=random.randint(5, 15))

        for k in range(n_obs):
            obs_t = base_t + datetime.timedelta(minutes=k * random.randint(20, 45))
            
            if phenotype == "SEPSIS_SHOCK":
                hr = int(np.clip(np.random.normal(115 + k * 8, 8), 90, 175))
                sbp = int(np.clip(np.random.normal(92 - k * 6, 8), 60, 115))
                dbp = int(np.clip(sbp * 0.58 + np.random.normal(0, 4), 35, 75))
                rr = int(np.clip(np.random.normal(25 + k * 2, 3), 18, 42))
                spo2 = int(np.clip(np.random.normal(94 - k * 2, 2), 84, 98))
                temp = round(float(np.clip(np.random.normal(38.8 + k * 0.2, 0.4), 37.8, 40.5)), 1)
                gcs = int(np.clip(15 - k * 2, 9, 15))
                pain = random.randint(3, 7)

            elif phenotype == "ACUTE_RESPIRATORY_FAILURE":
                hr = int(np.clip(np.random.normal(120 + k * 6, 10), 95, 170))
                sbp = int(np.clip(np.random.normal(135 + k * 4, 12), 100, 185))
                dbp = int(np.clip(sbp * 0.65, 60, 105))
                rr = int(np.clip(np.random.normal(30 + k * 4, 3), 22, 50))
                spo2 = int(np.clip(np.random.normal(88 - k * 3, 3), 74, 94))
                temp = round(float(np.random.normal(37.2, 0.3)), 1)
                gcs = int(np.clip(15 - k * 2, 10, 15))
                pain = random.randint(2, 6)

            elif phenotype == "CARDIOGENIC_SHOCK_OR_STEMI":
                hr = int(np.clip(np.random.normal(108 + k * 5, 12), 75, 160))
                sbp = int(np.clip(np.random.normal(98 - k * 7, 10), 65, 130))
                dbp = int(np.clip(sbp * 0.60, 40, 80))
                rr = int(np.clip(np.random.normal(24 + k * 2, 3), 16, 36))
                spo2 = int(np.clip(np.random.normal(93 - k * 1.5, 2), 86, 97))
                temp = round(float(np.random.normal(36.8, 0.3)), 1)
                gcs = 15
                pain = random.randint(7, 10)

            elif phenotype == "MODERATE_URGENT":
                hr = int(np.clip(np.random.normal(84 + np.random.normal(0, 5), 6), 65, 105))
                sbp = int(np.clip(np.random.normal(126, 10), 105, 150))
                dbp = int(np.clip(sbp * 0.66, 65, 92))
                rr = int(np.clip(np.random.normal(17, 2), 14, 21))
                spo2 = int(np.clip(np.random.normal(98, 1), 95, 100))
                temp = round(float(np.clip(np.random.normal(37.1, 0.4), 36.5, 38.2)), 1)
                gcs = 15
                pain = random.randint(3, 8)

            else: # LOW_ACUITY_STABLE
                hr = int(np.clip(np.random.normal(74, 7), 58, 92))
                sbp = int(np.clip(np.random.normal(120, 8), 100, 138))
                dbp = int(np.clip(sbp * 0.65, 60, 85))
                rr = int(np.clip(np.random.normal(15, 1.5), 12, 18))
                spo2 = int(np.clip(np.random.normal(99, 1), 97, 100))
                temp = 36.8
                gcs = 15
                pain = random.randint(0, 4)

            obs = {
                "observation_id": k + 1,
                "timestamp": obs_t.isoformat(),
                "hr": hr,
                "sbp": sbp,
                "dbp": dbp if random.random() > 0.05 else None, # 5% missing DBP
                "rr": rr,
                "spo2": spo2,
                "temp": temp if random.random() > 0.08 else None, # 8% missing temp
                "gcs": gcs if random.random() > 0.03 else None,
                "pain_score": pain
            }
            observations.append(obs)

        return patient_data, encounter_data, observations, outcome_data

    def generate_cohort_dataset(self, n_patients: int = 5000) -> pd.DataFrame:
        """
        Generates a complete tabular dataset of observation timepoints from n_patients,
        with extracted features and 24-hour outcome targets.
        """
        rows = []
        for i in range(1, n_patients + 1):
            p_data, e_data, obs_list, outcome = self.generate_patient_trajectory(i)
            
            prior_obs = None
            for idx, obs in enumerate(obs_list, start=1):
                # Extract features for this observation
                features = ClinicalFeatureExtractor.extract_point_in_time_features(
                    patient_data=p_data,
                    encounter_data=e_data,
                    current_obs=obs,
                    prior_obs=prior_obs,
                    obs_index=idx
                )

                # Combine metadata + features + targets
                row = {
                    "encounter_id": e_data["encounter_id"],
                    "patient_id": p_data["patient_id"],
                    "hospital_id": p_data["hospital_id"],
                    "observation_id": obs["observation_id"],
                    "observation_timestamp": obs["timestamp"],
                    **features,
                    "composite_critical_outcome_24h": outcome["composite_critical_outcome_24h"],
                    "icu_admitted_24h": outcome["icu_admitted_24h"],
                    "intubated_24h": outcome["intubated_24h"],
                    "vasopressor_24h": outcome["vasopressor_24h"],
                    "mortality_24h": outcome["mortality_24h"],
                    "triage_acuity_level": outcome["triage_acuity_level"]
                }
                rows.append(row)
                prior_obs = obs

        df = pd.DataFrame(rows)
        return df
