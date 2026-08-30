import logging
from typing import List, Dict, Any
from sqlalchemy.orm import Session

from models import EDEncounter, EncounterStatusEnum, ClinicalObservation
from services.deterioration_detector import DeteriorationDetector
from services.alert_service import AlertService

logger = logging.getLogger("patient_triage.background_monitor")

class BackgroundMonitorService:
    """
    Asynchronous / Periodic monitoring service for active Emergency Department encounters.
    Evaluates waiting and in-treatment patients without blocking normal UI requests.
    """
    def __init__(self):
        self.detector = DeteriorationDetector()

    def evaluate_active_encounters(self, db: Session, hospital_id: str) -> Dict[str, Any]:
        """
        Scans all active (WAITING, IN_TRIAGE, IN_TREATMENT) encounters for the hospital.
        Runs deterioration detection and creates/updates alerts.
        """
        active_statuses = [
            EncounterStatusEnum.WAITING, 
            EncounterStatusEnum.IN_TRIAGE, 
            EncounterStatusEnum.IN_TREATMENT
        ]
        
        encounters = db.query(EDEncounter).filter(
            EDEncounter.hospital_id == hospital_id,
            EDEncounter.status.in_(active_statuses)
        ).all()

        results = {
            "hospital_id": hospital_id,
            "encounters_scanned": len(encounters),
            "alerts_created": 0,
            "alerts_updated": 0,
            "no_change": 0,
            "unavailable": 0
        }

        for enc in encounters:
            observations = db.query(ClinicalObservation).filter(
                ClinicalObservation.encounter_id == enc.encounter_id
            ).order_by(ClinicalObservation.timestamp.asc()).all()

            detection_result = self.detector.evaluate_longitudinal_trend(
                observations=observations,
                patient_age=enc.patient.age if enc.patient else None
            )

            if detection_result.get("status") == "ASSESSMENT_UNAVAILABLE":
                results["unavailable"] += 1
            elif detection_result.get("detected"):
                alert, is_new, msg = AlertService.create_or_update_alert(
                    db=db,
                    hospital_id=hospital_id,
                    patient_id=enc.patient_id,
                    encounter_id=enc.encounter_id,
                    detection_result=detection_result
                )
                if is_new:
                    results["alerts_created"] += 1
                else:
                    results["alerts_updated"] += 1
            else:
                results["no_change"] += 1

        return results

    def evaluate_single_encounter(self, db: Session, encounter_id: str, hospital_id: str) -> Dict[str, Any]:
        """
        Evaluates a single encounter immediately upon new vital sign entry.
        """
        enc = db.query(EDEncounter).filter(
            EDEncounter.encounter_id == encounter_id,
            EDEncounter.hospital_id == hospital_id
        ).first()
        if not enc:
            return {"error": f"Encounter '{encounter_id}' not found"}

        observations = db.query(ClinicalObservation).filter(
            ClinicalObservation.encounter_id == encounter_id
        ).order_by(ClinicalObservation.timestamp.asc()).all()

        detection_result = self.detector.evaluate_longitudinal_trend(
            observations=observations,
            patient_age=enc.patient.age if enc.patient else None
        )

        alert_info = None
        if detection_result.get("detected"):
            alert, is_new, msg = AlertService.create_or_update_alert(
                db=db,
                hospital_id=hospital_id,
                patient_id=enc.patient_id,
                encounter_id=encounter_id,
                detection_result=detection_result
            )
            alert_info = {
                "alert_id": alert.alert_id if alert else None,
                "is_new": is_new,
                "message": msg,
                "severity": alert.severity.value if alert else None,
                "status": alert.status.value if alert else None
            }

        return {
            "encounter_id": encounter_id,
            "detection_result": detection_result,
            "alert": alert_info
        }
