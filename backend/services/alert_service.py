import datetime
import uuid
from typing import List, Dict, Any, Optional, Tuple
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc

from services.audit_service import AuditService
from models import (
    ClinicalAlert, AlertStatusEnum, AlertSeverityEnum, 
    DetectionSourceEnum, AuditLog, Staff, EDEncounter, Patient,
    ActorTypeEnum, AuditResultEnum
)
from services.rbac import verify_hospital_access

Tuple_Result = Tuple[Optional[ClinicalAlert], bool, str]

def generate_alert_id() -> str:
    return f"ALERT-{uuid.uuid4().hex[:6].upper()}"

class AlertService:
    @staticmethod
    def create_or_update_alert(
        db: Session,
        hospital_id: str,
        patient_id: str,
        encounter_id: str,
        detection_result: Dict[str, Any]
    ) -> Tuple_Result:
        """
        Creates or deduplicates a clinical alert based on detection engine output.
        Prevents duplicate alert generation when condition is unchanged.
        """
        if not detection_result.get("detected"):
            return None, False, "No deterioration detected"

        severity = detection_result.get("severity") or AlertSeverityEnum.HIGH
        rule_id = detection_result.get("rule_id", "RULE-DET-COMPOSITE-01")
        rule_version = detection_result.get("rule_version", "1.0")
        summary = detection_result.get("summary", "Potential deterioration detected")
        evidence = detection_result.get("signals", [])
        
        # Enrich evidence with ML trajectory comparison if available
        ml_eval = detection_result.get("ml_evaluation")
        if ml_eval and isinstance(ml_eval, dict):
            ml_expl = ml_eval.get("explanation", {})
            if "vitals_comparison" in ml_expl:
                evidence = evidence + [{"type": "vitals_trajectory", "data": ml_expl["vitals_comparison"]}]

        detection_source = DetectionSourceEnum.ML_BASED if "ML" in rule_id else (
            DetectionSourceEnum.COMBINED if ml_eval else DetectionSourceEnum.RULE_BASED
        )

        # Check for active (UNACKNOWLEDGED or ACKNOWLEDGED) alert for this encounter
        active_alert = db.query(ClinicalAlert).filter(
            ClinicalAlert.encounter_id == encounter_id,
            ClinicalAlert.hospital_id == hospital_id,
            ClinicalAlert.status.in_([AlertStatusEnum.UNACKNOWLEDGED, AlertStatusEnum.ACKNOWLEDGED])
        ).first()

        if active_alert:
            # Deduplication Logic:
            # If same rule and severity hasn't escalated, maintain current alert and avoid alert fatigue
            if active_alert.detection_rule_id == rule_id and active_alert.severity == severity:
                active_alert.evidence = evidence
                active_alert.summary = summary
                active_alert.updated_at = datetime.datetime.utcnow()
                db.commit()
                db.refresh(active_alert)
                return active_alert, False, "Existing active alert updated with latest vitals evidence (deduplicated)"

            # If severity has escalated (e.g. HIGH -> CRITICAL), escalate existing alert
            if severity == AlertSeverityEnum.CRITICAL and active_alert.severity != AlertSeverityEnum.CRITICAL:
                active_alert.severity = AlertSeverityEnum.CRITICAL
                active_alert.summary = f"[ESCALATED TO CRITICAL] {summary}"
                active_alert.evidence = evidence
                active_alert.detection_rule_id = rule_id
                active_alert.updated_at = datetime.datetime.utcnow()
                
                # Log audit event for escalation
                AuditService.log_event(
                    db=db,
                    hospital_id=hospital_id,
                    action="ALERT_ESCALATED",
                    entity_type="ClinicalAlert",
                    entity_id=active_alert.alert_id,
                    actor_id="SYSTEM_DETECTOR",
                    actor_name="Deterioration Engine",
                    actor_role="SYSTEM",
                    actor_type=ActorTypeEnum.SYSTEM,
                    patient_id=patient_id,
                    encounter_id=encounter_id,
                    result=AuditResultEnum.SUCCESS,
                    metadata={"previous_severity": active_alert.severity.value, "new_severity": "CRITICAL", "rule_id": rule_id}
                )
                db.commit()
                db.refresh(active_alert)
                return active_alert, False, "Existing alert escalated to CRITICAL"

        # Create new ClinicalAlert
        new_alert = ClinicalAlert(
            alert_id=generate_alert_id(),
            hospital_id=hospital_id,
            patient_id=patient_id,
            encounter_id=encounter_id,
            alert_type="POTENTIAL_DETERIORATION",
            severity=severity,
            status=AlertStatusEnum.UNACKNOWLEDGED,
            detected_at=datetime.datetime.utcnow(),
            detection_source=detection_source,
            detection_rule_id=rule_id,
            detection_version=rule_version,
            summary=summary,
            evidence=evidence
        )
        db.add(new_alert)
        db.flush()

        # Audit Alert Creation
        AuditService.log_event(
            db=db,
            hospital_id=hospital_id,
            action="ALERT_CREATED",
            entity_type="ClinicalAlert",
            entity_id=new_alert.alert_id,
            actor_id="SYSTEM_DETECTOR",
            actor_name="Deterioration Engine",
            actor_role="SYSTEM",
            actor_type=ActorTypeEnum.SYSTEM,
            patient_id=patient_id,
            encounter_id=encounter_id,
            result=AuditResultEnum.SUCCESS,
            metadata={
                "encounter_id": encounter_id,
                "severity": severity.value if hasattr(severity, 'value') else str(severity),
                "rule_id": rule_id,
                "version": rule_version
            }
        )
        db.commit()
        db.refresh(new_alert)
        return new_alert, True, "New clinical alert generated"

    @staticmethod
    def acknowledge_alert(db: Session, alert_id: str, staff: Staff) -> ClinicalAlert:
        alert = db.query(ClinicalAlert).filter(ClinicalAlert.alert_id == alert_id).first()
        if not alert:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Alert '{alert_id}' not found.")
        
        # Verify Hospital Isolation
        verify_hospital_access(alert.hospital_id, staff)

        if alert.status != AlertStatusEnum.UNACKNOWLEDGED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot acknowledge alert '{alert_id}' with current status '{alert.status.value}'."
            )

        alert.status = AlertStatusEnum.ACKNOWLEDGED
        alert.acknowledged_at = datetime.datetime.utcnow()
        alert.acknowledged_by_id = staff.staff_id
        alert.acknowledged_by_name = staff.name
        alert.acknowledged_by_role = staff.role.value
        alert.updated_at = datetime.datetime.utcnow()

        # Audit Acknowledgment
        AuditService.log_event(
            db=db,
            hospital_id=staff.hospital_id,
            action="ALERT_ACKNOWLEDGED",
            entity_type="ClinicalAlert",
            entity_id=alert.alert_id,
            actor_id=staff.staff_id,
            actor_name=staff.name,
            actor_role=staff.role.value,
            actor_type=ActorTypeEnum.HUMAN,
            patient_id=alert.patient_id,
            encounter_id=alert.encounter_id,
            result=AuditResultEnum.SUCCESS,
            metadata={"encounter_id": alert.encounter_id, "previous_status": "UNACKNOWLEDGED"}
        )
        db.commit()
        db.refresh(alert)
        return alert

    @staticmethod
    def resolve_alert(db: Session, alert_id: str, staff: Staff, resolution_reason: str) -> ClinicalAlert:
        alert = db.query(ClinicalAlert).filter(ClinicalAlert.alert_id == alert_id).first()
        if not alert:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Alert '{alert_id}' not found.")
        
        # Verify Hospital Isolation
        verify_hospital_access(alert.hospital_id, staff)

        if alert.status in [AlertStatusEnum.RESOLVED, AlertStatusEnum.DISMISSED]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Alert '{alert_id}' is already {alert.status.value} and cannot be resolved again."
            )

        if not resolution_reason or not resolution_reason.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="A clinical resolution note/reason is required to resolve a clinical alert."
            )

        previous_status = alert.status.value
        alert.status = AlertStatusEnum.RESOLVED
        alert.resolved_at = datetime.datetime.utcnow()
        alert.resolved_by_id = staff.staff_id
        alert.resolved_by_name = staff.name
        alert.resolved_by_role = staff.role.value
        alert.resolution_reason = resolution_reason.strip()
        alert.updated_at = datetime.datetime.utcnow()

        # Audit Resolution
        AuditService.log_event(
            db=db,
            hospital_id=staff.hospital_id,
            action="ALERT_RESOLVED",
            entity_type="ClinicalAlert",
            entity_id=alert.alert_id,
            actor_id=staff.staff_id,
            actor_name=staff.name,
            actor_role=staff.role.value,
            actor_type=ActorTypeEnum.HUMAN,
            patient_id=alert.patient_id,
            encounter_id=alert.encounter_id,
            result=AuditResultEnum.SUCCESS,
            metadata={
                "encounter_id": alert.encounter_id, 
                "previous_status": previous_status,
                "reason": resolution_reason.strip()
            }
        )
        db.commit()
        db.refresh(alert)
        return alert

    @staticmethod
    def dismiss_alert(db: Session, alert_id: str, staff: Staff, dismissal_reason: str) -> ClinicalAlert:
        alert = db.query(ClinicalAlert).filter(ClinicalAlert.alert_id == alert_id).first()
        if not alert:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Alert '{alert_id}' not found.")
        
        # Verify Hospital Isolation
        verify_hospital_access(alert.hospital_id, staff)

        if alert.status in [AlertStatusEnum.RESOLVED, AlertStatusEnum.DISMISSED]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Alert '{alert_id}' is already {alert.status.value} and cannot be dismissed."
            )

        if not dismissal_reason or not dismissal_reason.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="A clinical justification is required to dismiss a clinical alert."
            )

        previous_status = alert.status.value
        alert.status = AlertStatusEnum.DISMISSED
        alert.dismissed_at = datetime.datetime.utcnow()
        alert.dismissed_by_id = staff.staff_id
        alert.dismissed_by_name = staff.name
        alert.dismissed_by_role = staff.role.value
        alert.dismissal_reason = dismissal_reason.strip()
        alert.updated_at = datetime.datetime.utcnow()

        # Audit Dismissal
        AuditService.log_event(
            db=db,
            hospital_id=staff.hospital_id,
            action="ALERT_DISMISSED",
            entity_type="ClinicalAlert",
            entity_id=alert.alert_id,
            actor_id=staff.staff_id,
            actor_name=staff.name,
            actor_role=staff.role.value,
            actor_type=ActorTypeEnum.HUMAN,
            patient_id=alert.patient_id,
            encounter_id=alert.encounter_id,
            result=AuditResultEnum.SUCCESS,
            metadata={
                "encounter_id": alert.encounter_id, 
                "previous_status": previous_status,
                "reason": dismissal_reason.strip()
            }
        )
        db.commit()
        db.refresh(alert)
        return alert
