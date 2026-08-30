import numpy as np
import pandas as pd
import datetime
import traceback
from sqlalchemy.orm import Session
from models import AIAssessment, AIExplanation, Encounter, AuditLog

def log_audit_local(db: Session, hospital_id: str, staff_id: str, role: str, action: str, entity_type: str, entity_id: str):
    audit = AuditLog(
        hospital_id=hospital_id,
        staff_id=staff_id,
        staff_role=role,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id
    )
    db.add(audit)
    db.commit()

class ExplainabilityService:
    @staticmethod
    def preprocess_inputs(features_list, input_dict):
        """
        Maps raw input data dictionary to the exact feature format and schema expected by the model.
        """
        model_input = {f: 0 for f in features_list}
        model_input['age'] = input_dict.get('age', 45)
        
        # Gender mapping
        gender_val = input_dict.get('gender')
        if gender_val in [1, 0, 1.0, 0.0]:
            model_input['gender'] = int(gender_val)
        else:
            model_input['gender'] = 1 if gender_val == 'Male' else 0
            
        model_input['hr'] = input_dict.get('hr', 80)
        model_input['sbp'] = input_dict.get('sbp', 120)
        model_input['rr'] = input_dict.get('rr', 16)
        model_input['spo2'] = input_dict.get('spo2', 98)
        model_input['gcs'] = input_dict.get('gcs', 15)
        model_input['facility_tier'] = input_dict.get('facility_tier', 2)
        model_input['transit_time_mins'] = input_dict.get('transit_time_mins', 30)
        
        history_val = input_dict.get('history_available', True)
        if isinstance(history_val, bool):
            model_input['history_available'] = 1 if history_val else 0
        else:
            model_input['history_available'] = int(history_val)
            
        model_input['shock_index'] = round(model_input['hr'] / max(model_input['sbp'], 1), 2)
        
        setting = input_dict.get('setting', 'Urban')
        if f'setting_{setting}' in model_input:
            model_input[f'setting_{setting}'] = 1

        return model_input

    @classmethod
    def compute_local_explanations(cls, model, features_list, input_dict):
        """
        Uses Tree Interpreter logic to compute the local contribution of each feature
        toward the High Risk probability (sum of probabilities of ESI Level 1 and ESI Level 2).
        """
        model_input = cls.preprocess_inputs(features_list, input_dict)
        df_input = pd.DataFrame([model_input], columns=features_list)
        
        n_features = len(features_list)
        contributions = np.zeros(n_features)
        
        # Target classes: index 0 (Level 1) and index 1 (Level 2)
        target_indices = [0, 1]
        
        total_trees = len(model.estimators_)
        
        for tree in model.estimators_:
            node_indicator = tree.decision_path(df_input)
            leaf_id = tree.apply(df_input)[0]
            feature = tree.tree_.feature
            value = tree.tree_.value # shape (n_nodes, 1, n_classes)
            
            # Normalize class counts at nodes to get class probabilities
            node_probs = value / np.sum(value, axis=-1, keepdims=True)
            if len(node_probs.shape) == 3:
                node_probs = node_probs[:, 0, :]
                
            # Sum target probabilities for Level 1 & Level 2
            node_probs_target = np.sum(node_probs[:, target_indices], axis=-1)
            
            # Get path node IDs
            path_nodes = node_indicator.indices[node_indicator.indptr[0]:node_indicator.indptr[1]]
            
            for i in range(len(path_nodes) - 1):
                node_id = path_nodes[i]
                child_id = path_nodes[i + 1]
                split_feature = feature[node_id]
                if split_feature != -2: # not a leaf node
                    diff = node_probs_target[child_id] - node_probs_target[node_id]
                    contributions[split_feature] += diff
                    
        contributions /= total_trees
        
        # Map feature names to user-friendly titles and units
        feature_meta = {
            "age": ("Age", "years"),
            "gender": ("Gender", ""),
            "facility_tier": ("Facility Tier", ""),
            "transit_time_mins": ("Transit Time", "minutes"),
            "hr": ("Heart Rate", "bpm"),
            "sbp": ("Systolic BP", "mmHg"),
            "rr": ("Respiratory Rate", "breaths/min"),
            "spo2": ("Oxygen Saturation (SpO2)", "%"),
            "gcs": ("GCS Score", "/15"),
            "shock_index": ("Shock Index", ""),
            "history_available": ("Medical History Available", ""),
            "setting_Semi-Urban": ("Setting (Semi-Urban)", ""),
            "setting_Urban": ("Setting (Urban)", "")
        }
        
        structured_explanations = []
        for idx, name in enumerate(features_list):
            contrib_val = float(contributions[idx])
            raw_val = model_input[name]
            
            friendly_name, unit = feature_meta.get(name, (name, ""))
            
            # Positive contribution: pulled risk probability up
            # Negative contribution: pulled risk probability down
            direction = "higher_risk" if contrib_val >= 0 else "lower_risk"
            
            structured_explanations.append({
                "feature_name": friendly_name,
                "raw_feature_key": name,
                "feature_value": float(raw_val),
                "feature_unit": unit,
                "contribution_value": float(round(contrib_val, 4)),
                "direction": direction
            })
            
        # Sort features by absolute contribution magnitude descending
        structured_explanations.sort(key=lambda x: abs(x["contribution_value"]), reverse=True)
        
        # Assign ranks
        for rank_idx, item in enumerate(structured_explanations):
            item["rank"] = rank_idx + 1
            
        return structured_explanations

    @classmethod
    def generate_explanation(cls, db: Session, assessment_id: int, model, features_list, current_user: dict) -> AIExplanation:
        """
        Retrieves the AI assessment, computes the local explanation using features snapshot,
        saves the explanation to the database, and logs the action to the audit logs.
        """
        assessment = db.query(AIAssessment).filter(
            AIAssessment.assessment_id == assessment_id,
            AIAssessment.hospital_id == current_user["hospital_id"]
        ).first()
        
        if not assessment:
            raise ValueError("AI Assessment not found or unauthorized.")
            
        # Check if explanation already exists to avoid redundant computation
        existing = db.query(AIExplanation).filter(
            AIExplanation.ai_assessment_id == assessment.assessment_id,
            AIExplanation.explanation_method == "TreeInterpreter",
            AIExplanation.explanation_version == "1.0"
        ).first()
        
        if existing and existing.status == "AVAILABLE":
            log_audit_local(db, current_user["hospital_id"], current_user["staff_id"], current_user["role"],
                            f"Retrieved cached AI explanation for assessment {assessment_id}",
                            "ai_explanation", str(existing.explanation_id))
            return existing

        # If not cached, compute explanations
        try:
            feature_contributions = cls.compute_local_explanations(
                model=model,
                features_list=features_list,
                input_dict=assessment.input_snapshot
            )
            status = "AVAILABLE"
        except Exception as e:
            print(f"Error computing local explanations: {e}")
            traceback.print_exc()
            feature_contributions = []
            status = "FAILED"

        explanation = AIExplanation(
            ai_assessment_id=assessment.assessment_id,
            encounter_id=assessment.encounter_id,
            hospital_id=assessment.hospital_id,
            explanation_method="TreeInterpreter",
            explanation_version="1.0",
            generated_at=datetime.datetime.utcnow(),
            status=status,
            feature_contributions=feature_contributions
        )
        
        db.add(explanation)
        db.commit()
        db.refresh(explanation)

        log_audit_local(db, current_user["hospital_id"], current_user["staff_id"], current_user["role"],
                        f"Generated AI explanation ({status}) for assessment {assessment_id}",
                        "ai_explanation", str(explanation.explanation_id))
                  
        return explanation
