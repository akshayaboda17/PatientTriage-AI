import datetime
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from models import (
    EDEncounter, EncounterStatusEnum, Patient, ClinicalObservation,
    TriageAssessment, AIRiskAssessment, AIExplanation, ClinicalAlert,
    AlertStatusEnum, PhysicianAssessment, AIAgreementEnum, Staff,
    ActorTypeEnum, AuditResultEnum
)
from schemas.encounter_schemas import (
    EncounterCreateRequest, EncounterStatusUpdateRequest,
    DischargeRequest, PriorityOverrideRequest
)
from services.audit_service import AuditService
from services.rbac import get_db, require_permission

router = APIRouter(prefix="/api/encounters", tags=["Encounters & Queue"])

@router.get("")
def get_ed_encounters(
    status_filter: Optional[str] = None,
    staff: Staff = Depends(require_permission("patient:view")),
    db: Session = Depends(get_db)
):
    """
    Retrieves active ED queue encounters isolated to the authenticated hospital.
    Includes current vitals, latest triage, AI risk score, and active alert counts.
    """
    query = db.query(EDEncounter).filter(EDEncounter.hospital_id == staff.hospital_id)
    if status_filter == "ALL":
        pass  # Show all encounters
    elif status_filter == "DISCHARGED":
        query = query.filter(EDEncounter.status == EncounterStatusEnum.DISCHARGED)
    elif status_filter in ["COMPLETED", "HISTORICAL"]:
        query = query.filter(EDEncounter.status.in_([
            EncounterStatusEnum.DISCHARGED,
            EncounterStatusEnum.ADMITTED,
            EncounterStatusEnum.TRANSFERRED
        ]))
    elif status_filter == "WAITING":
        query = query.filter(EDEncounter.status == EncounterStatusEnum.WAITING)
    elif status_filter == "IN_CARE":
        query = query.filter(EDEncounter.status.in_([
            EncounterStatusEnum.IN_TRIAGE,
            EncounterStatusEnum.IN_TREATMENT
        ]))
    elif status_filter:
        query = query.filter(EDEncounter.status == status_filter)
    else:
        # Default to active waiting/in-treatment encounters
        query = query.filter(EDEncounter.status.in_([
            EncounterStatusEnum.WAITING,
            EncounterStatusEnum.IN_TRIAGE,
            EncounterStatusEnum.IN_TREATMENT
        ]))

    from services.hospital_config_service import HospitalConfigService
    from services.bed_service import BedService

    # Auto-assign available beds to active patients so patients only wait if all beds are occupied
    BedService.auto_assign_beds(db, staff.hospital_id)

    hosp_cfg = HospitalConfigService.get_config(staff.hospital_id)
    is_surge = hosp_cfg.get("surge_mode_active", False)
    total_bed_capacity = hosp_cfg.get("bed_capacity", 25)

    # Real-time occupied beds count for accurate waiting state calculation
    occupied_beds_count = db.query(EDEncounter).filter(
        EDEncounter.hospital_id == staff.hospital_id,
        EDEncounter.bed_number.isnot(None),
        EDEncounter.status.in_([EncounterStatusEnum.WAITING, EncounterStatusEnum.IN_TRIAGE, EncounterStatusEnum.IN_TREATMENT])
    ).count()
    available_beds_count = max(0, total_bed_capacity - occupied_beds_count)

    encounters = query.order_by(EDEncounter.arrival_time.asc()).all()
    queue_list = []
    now = datetime.datetime.utcnow()

    for enc in encounters:
        patient = enc.patient
        latest_obs = db.query(ClinicalObservation).filter(
            ClinicalObservation.encounter_id == enc.encounter_id
        ).order_by(ClinicalObservation.timestamp.desc()).first()

        latest_triage = db.query(TriageAssessment).filter(
            TriageAssessment.encounter_id == enc.encounter_id
        ).order_by(TriageAssessment.assessed_at.desc()).first()

        latest_ai_risk = db.query(AIRiskAssessment).filter(
            AIRiskAssessment.encounter_id == enc.encounter_id
        ).order_by(AIRiskAssessment.assessed_at.desc()).first()

        active_alerts = db.query(ClinicalAlert).filter(
            ClinicalAlert.encounter_id == enc.encounter_id,
            ClinicalAlert.status.in_([AlertStatusEnum.UNACKNOWLEDGED, AlertStatusEnum.ACKNOWLEDGED])
        ).all()

        is_waiting = (enc.status == EncounterStatusEnum.WAITING) and (enc.bed_number is None)
        wait_mins = int((now - enc.arrival_time).total_seconds() / 60) if (enc.arrival_time and is_waiting) else 0
        triage_level = latest_triage.triage_level if latest_triage else (
            latest_ai_risk.predicted_triage_level if latest_ai_risk else 3
        )

        # Round 2: Services
        from services.age_service import AgeService
        from services.uncertainty_service import UncertaintyService, ConfidenceLevelEnum
        from services.safety_service import SafetyService, SafetyStatusEnum
        from services.hospital_config_service import HospitalConfigService
        from models import AlertSeverityEnum, DetectionSourceEnum

        # 1. Age Group
        age_group = AgeService.determine_age_group(patient.age if patient else None)

        # 2. Wait-Time Safe Threshold Evaluation (ONLY for waiting patients who do not yet have a bed)
        if is_waiting:
            wait_eval = HospitalConfigService.evaluate_wait_time(staff.hospital_id, triage_level, wait_mins)
            # Automatic wait threshold breach alert generation (deduplicated)
            if wait_eval["exceeded"]:
                has_wait_alert = any(a.alert_type == "SAFE_WAIT_THRESHOLD_EXCEEDED" for a in active_alerts)
                if not has_wait_alert:
                    new_wait_alert = ClinicalAlert(
                        alert_id=f"ALERT-WAIT-{uuid.uuid4().hex[:6].upper()}",
                        hospital_id=staff.hospital_id,
                        patient_id=enc.patient_id,
                        encounter_id=enc.encounter_id,
                        alert_type="SAFE_WAIT_THRESHOLD_EXCEEDED",
                        severity=AlertSeverityEnum.CRITICAL if triage_level <= 2 else AlertSeverityEnum.HIGH,
                        status=AlertStatusEnum.UNACKNOWLEDGED,
                        detected_at=now,
                        detection_source=DetectionSourceEnum.RULE_BASED,
                        detection_rule_id="RULE-SAFE-WAIT-EXCEEDED-01",
                        summary=f"🚨 REASSESSMENT REQUIRED: Waiting time ({wait_mins} min) exceeds safe threshold ({wait_eval['threshold_mins']} min) for ESI {triage_level}.",
                        evidence=[{"parameter": "ED_WAIT_TIME", "threshold_mins": wait_eval["threshold_mins"], "wait_mins": wait_mins}]
                    )
                    db.add(new_wait_alert)
                    db.commit()
                    active_alerts.append(new_wait_alert)
        else:
            hosp_cfg_dict = HospitalConfigService.get_config(staff.hospital_id)
            threshold = (hosp_cfg_dict.get("safe_wait_thresholds_mins", {}) if isinstance(hosp_cfg_dict, dict) else getattr(hosp_cfg_dict, "safe_wait_thresholds_mins", {})).get(triage_level, 15)
            wait_eval = {"threshold_mins": threshold, "exceeded": False, "reassessment_required": False}
            # Automatically resolve any lingering wait alerts if patient is already in bed or in care
            wait_alerts_to_resolve = [a for a in active_alerts if a.alert_type == "SAFE_WAIT_THRESHOLD_EXCEEDED"]
            if wait_alerts_to_resolve:
                for wa in wait_alerts_to_resolve:
                    wa.status = AlertStatusEnum.RESOLVED
                    wa.resolved_at = now
                    wa.resolution_notes = f"Patient placed in care ({'Bed: ' + enc.bed_number if enc.bed_number else 'In Treatment'}). Waiting time concluded."
                    active_alerts.remove(wa)
                db.commit()

        # 3. History Status
        history_status = SafetyService.classify_history_status(
            getattr(patient, 'medical_history', None) if patient else None,
            getattr(patient, 'allergies', None) if patient else None
        )
        is_zero_history = (history_status.value == "ZERO_HISTORY_FIRST_TIME")

        # 4. Discordance Detection
        discordance_info = SafetyService.detect_clinical_discordance(
            chief_complaint=enc.chief_complaint or "",
            vitals=latest_obs.to_dict() if latest_obs else {},
            age_group=age_group
        )

        # 5. Risk & Confidence Resolution
        ai_risk_dict = latest_ai_risk.to_dict() if latest_ai_risk else None
        risk_category = latest_ai_risk.risk_category.value if latest_ai_risk else "MODERATE"
        risk_prob = latest_ai_risk.risk_probability if (latest_ai_risk and latest_ai_risk.risk_probability is not None) else 0.5
        
        uncertainty_info = UncertaintyService.calculate_uncertainty(
            probability=risk_prob,
            imputed_feature_count=0 if latest_obs else 10,
            total_feature_count=40,
            age_group=age_group,
            has_discordant_signals=discordance_info["is_discordant"],
            is_zero_history=is_zero_history
        )
        confidence_level = uncertainty_info["confidence"]

        if ai_risk_dict:
            ai_risk_dict["confidence"] = confidence_level
            ai_risk_dict["uncertainty_score"] = uncertainty_info["uncertainty_score"]
            ai_risk_dict["age_group"] = age_group.value
            ai_risk_dict["discordance_info"] = discordance_info

        # 6. Patient Safety Workflow Status
        safety_eval = SafetyService.determine_safety_status(
            ai_risk_category=risk_category,
            confidence_level=confidence_level,
            wait_threshold_exceeded=wait_eval["exceeded"],
            has_active_deterioration=len(active_alerts) > 0,
            has_discordance=discordance_info["is_discordant"],
            age_group=age_group,
            is_zero_history=is_zero_history
        )

        # 7. AI Explanation & Override Resolution
        ai_explanation_dict = latest_ai_risk.explanation.to_dict() if (latest_ai_risk and latest_ai_risk.explanation) else None
        original_ai_level = latest_ai_risk.predicted_triage_level if latest_ai_risk else None

        is_overridden = False
        override_info = None

        phys_rev = db.query(PhysicianAssessment).filter(
            PhysicianAssessment.encounter_id == enc.encounter_id,
            PhysicianAssessment.ai_agreement == AIAgreementEnum.OVERRIDDEN
        ).order_by(PhysicianAssessment.created_at.desc()).first()

        has_triage_override_note = bool(latest_triage and "Clinician Override" in (latest_triage.notes or ""))
        has_ai_level_discrepancy = bool(latest_ai_risk and latest_triage and latest_triage.triage_level != latest_ai_risk.predicted_triage_level)

        if has_ai_level_discrepancy or has_triage_override_note or phys_rev:
            is_overridden = True
            override_info = {
                "original_level": original_ai_level,
                "clinician_level": latest_triage.triage_level if latest_triage else triage_level,
                "reason": (phys_rev.override_reason if phys_rev else None) or (latest_triage.notes if "Reason:" in (latest_triage.notes or "") else "Clinician assessment indicates clinical priority adjustment"),
                "overridden_by": (phys_rev.physician_name if phys_rev else (latest_triage.assessed_by if latest_triage else "Attending Clinician")),
                "overridden_at": (phys_rev.created_at.isoformat() if phys_rev else (latest_triage.assessed_at.isoformat() if latest_triage else None))
            }

        # 8. Clinically Appropriate Care Service Destination (without inventing fake doctors)
        complaint_lower = (enc.chief_complaint or "").lower()
        is_pediatric = (patient.age is not None and patient.age < 18) or (age_group.value == "PEDIATRIC")
        if is_pediatric:
            recommended_service = "Pediatric Emergency"
        elif any(k in complaint_lower for k in ["chest", "cardiac", "angina", "stemi", "heart", "palpitation"]):
            recommended_service = "Cardiology"
        elif any(k in complaint_lower for k in ["breath", "dyspnea", "wheez", "asthma", "copd", "respiratory", "hypox"]):
            recommended_service = "Pulmonology / Respiratory"
        elif any(k in complaint_lower for k in ["stroke", "seizure", "syncope", "neuro", "numbness", "weakness"]):
            recommended_service = "Neurology"
        elif any(k in complaint_lower for k in ["trauma", "fracture", "fall", "mva", "laceration", "dislocation"]):
            recommended_service = "Trauma & Orthopedics"
        elif any(k in complaint_lower for k in ["abdom", "appendix", "guarding", "flank", "vomit", "gi"]):
            recommended_service = "General Surgery / GI"
        elif triage_level <= 2:
            recommended_service = "Emergency Medicine (Resuscitation)"
        else:
            recommended_service = "Emergency Medicine"

        # 9. Waiting State Distinction: Only wait if no bed and all beds occupied
        waiting_for_bed = False
        if enc.status == EncounterStatusEnum.WAITING and not enc.bed_number:
            waiting_for_bed = True
            waiting_status_text = "WAITING FOR AVAILABLE CARE SPACE"
        elif enc.status in [EncounterStatusEnum.IN_TREATMENT, EncounterStatusEnum.IN_TRIAGE]:
            waiting_status_text = "IN CARE"
        elif enc.status == EncounterStatusEnum.DISCHARGED:
            waiting_status_text = "DISCHARGED"
        else:
            waiting_status_text = enc.status.value

        queue_list.append({
            "encounter_id": enc.encounter_id,
            "patient_id": enc.patient_id,
            "patient_name": f"{patient.first_name} {patient.last_name}" if patient else "Unknown",
            "age": patient.age if patient else None,
            "patient_age": patient.age if patient else None,
            "age_group": age_group.value,
            "gender": patient.gender if patient else None,
            "patient_gender": patient.gender if patient else None,
            "history_status": history_status.value,
            "arrival_time": enc.arrival_time.isoformat() if enc.arrival_time else None,
            "wait_time_mins": wait_mins if is_waiting else None,
            "is_waiting": is_waiting,
            "wait_evaluation": wait_eval,
            "status": enc.status.value,
            "waiting_status_text": waiting_status_text,
            "waiting_for_bed": waiting_for_bed,
            "bed_number": enc.bed_number,
            "chief_complaint": enc.chief_complaint,
            "recommended_care_service": recommended_service,
            "triage_level": triage_level,
            "acuity_category": latest_triage.acuity_category if latest_triage else "Urgent",
            "latest_vitals": latest_obs.to_dict() if latest_obs else None,
            "ai_risk": ai_risk_dict,
            "ai_explanation": ai_explanation_dict,
            "original_ai_level": original_ai_level,
            "is_overridden": is_overridden,
            "override_info": override_info,
            "confidence": confidence_level,
            "safety_status": safety_eval["status"],
            "safety_reasons": safety_eval["reasons"],
            "discordance_info": discordance_info,
            "active_alert_count": len(active_alerts),
            "max_alert_severity": max([a.severity.value for a in active_alerts], default=None) if active_alerts else None,
            "alerts": [a.to_dict() for a in active_alerts]
        })

    # Sort queue:
    # Under surge mode: Prioritize by (1) Safety ESCALATE/REASSESS, (2) Triage Level, (3) Wait time
    if is_surge:
        def surge_sort_key(x):
            safety_rank = 0 if x["safety_status"] == "ESCALATE" else (1 if x["safety_status"] == "REASSESS" else (2 if x["safety_status"] == "MONITOR" else 3))
            return (safety_rank, x['triage_level'], -(x['wait_time_mins'] or 0))
        sorted_queue = sorted(queue_list, key=surge_sort_key)
    else:
        sorted_queue = sorted(queue_list, key=lambda x: (x['triage_level'], -(x['wait_time_mins'] or 0)))

    return {
        "queue": sorted_queue,
        "hospital_id": staff.hospital_id,
        "total": len(sorted_queue),
        "surge_mode": is_surge,
        "hospital_config": hosp_cfg,
        "available_beds": available_beds_count,
        "total_beds": total_bed_capacity,
        "occupied_beds": occupied_beds_count
    }

@router.post("")
def create_encounter(
    req: EncounterCreateRequest,
    staff: Staff = Depends(require_permission("patient:create")),
    db: Session = Depends(get_db)
):
    """
    Creates a new ED encounter and logs ENCOUNTER_CREATED.
    """
    patient = db.query(Patient).filter(
        Patient.patient_id == req.patient_id,
        Patient.hospital_id == staff.hospital_id
    ).first()

    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Patient '{req.patient_id}' not found.")

    enc_id = f"ENC-{staff.hospital_id[:4]}-{uuid.uuid4().hex[:6].upper()}"
    new_enc = EDEncounter(
        encounter_id=enc_id,
        hospital_id=staff.hospital_id,
        patient_id=req.patient_id,
        arrival_time=datetime.datetime.utcnow(),
        arrival_mode=req.arrival_mode or "Walk-in",
        chief_complaint=req.chief_complaint,
        status=EncounterStatusEnum.WAITING,
        bed_number=req.bed_number
    )
    db.add(new_enc)
    db.commit()
    db.refresh(new_enc)

    AuditService.log_event(
        db=db,
        hospital_id=staff.hospital_id,
        action="ENCOUNTER_CREATED",
        entity_type="ENCOUNTER",
        entity_id=new_enc.encounter_id,
        actor_id=staff.staff_id,
        actor_name=staff.name,
        actor_role=staff.role.value,
        actor_type=ActorTypeEnum.HUMAN,
        patient_id=new_enc.patient_id,
        encounter_id=new_enc.encounter_id,
        result=AuditResultEnum.SUCCESS,
        metadata={"chief_complaint": req.chief_complaint, "arrival_mode": req.arrival_mode},
        auto_commit=True
    )

    return {"message": "ED Encounter created successfully.", "encounter": new_enc.to_dict()}

@router.get("/{encounter_id}")
def get_encounter_details(
    encounter_id: str,
    staff: Staff = Depends(require_permission("patient:view")),
    db: Session = Depends(get_db)
):
    """
    Retrieves full longitudinal history, vitals trend, AI risk assessment, explainability, alerts, and timeline.
    """
    enc = db.query(EDEncounter).filter(
        EDEncounter.encounter_id == encounter_id,
        EDEncounter.hospital_id == staff.hospital_id
    ).first()

    if not enc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Encounter '{encounter_id}' not found in hospital '{staff.hospital_id}'."
        )

    patient = enc.patient
    observations = db.query(ClinicalObservation).filter(
        ClinicalObservation.encounter_id == encounter_id
    ).order_by(ClinicalObservation.timestamp.asc()).all()

    triage = db.query(TriageAssessment).filter(
        TriageAssessment.encounter_id == encounter_id
    ).order_by(TriageAssessment.assessed_at.desc()).first()

    ai_risk = db.query(AIRiskAssessment).filter(
        AIRiskAssessment.encounter_id == encounter_id
    ).order_by(AIRiskAssessment.assessed_at.desc()).first()

    ai_explanation = None
    if ai_risk:
        ai_explanation = db.query(AIExplanation).filter(
            AIExplanation.risk_assessment_id == ai_risk.id
        ).first()

    alerts = db.query(ClinicalAlert).filter(
        ClinicalAlert.encounter_id == encounter_id
    ).order_by(ClinicalAlert.detected_at.desc()).all()

    physician_assessments = db.query(PhysicianAssessment).filter(
        PhysicianAssessment.encounter_id == encounter_id
    ).order_by(PhysicianAssessment.created_at.desc()).all()

    # Build Unified Clinical Timeline
    timeline = []
    if enc.arrival_time:
        timeline.append({
            "timestamp": enc.arrival_time.isoformat(),
            "type": "ARRIVAL",
            "title": "Patient Arrived in ED",
            "description": f"Arrival via {enc.arrival_mode} with chief complaint: {enc.chief_complaint}",
            "actor": "Intake Desk"
        })
    if triage:
        timeline.append({
            "timestamp": triage.assessed_at.isoformat(),
            "type": "TRIAGE",
            "title": f"Triage Assessed: ESI Level {triage.triage_level} ({triage.acuity_category})",
            "description": triage.notes or "Initial triage completed.",
            "actor": triage.assessed_by
        })
    for obs in observations:
        timeline.append({
            "timestamp": obs.timestamp.isoformat(),
            "type": "VITALS",
            "title": f"Vital Signs Recorded: HR {obs.hr}, SpO2 {obs.spo2}%, RR {obs.rr}",
            "description": f"BP: {obs.sbp}/{obs.dbp or '-'} mmHg, Temp: {obs.temp}°C, GCS: {obs.gcs}",
            "actor": obs.recorded_by
        })
    if ai_risk:
        timeline.append({
            "timestamp": ai_risk.assessed_at.isoformat(),
            "type": "AI_RISK",
            "title": f"AI Risk Assessment: {ai_risk.risk_category.value} ({ai_risk.risk_score}%)",
            "description": f"Predicted Triage Level {ai_risk.predicted_triage_level} (Confidence {ai_risk.confidence_score}%)",
            "actor": "AI Engine"
        })
    for alert in alerts:
        timeline.append({
            "timestamp": alert.detected_at.isoformat(),
            "type": "ALERT_DETECTED",
            "title": f"🚨 Clinical Alert: {alert.severity.value} - {alert.alert_type}",
            "description": alert.summary,
            "actor": alert.detection_source.value
        })
        if alert.acknowledged_at:
            timeline.append({
                "timestamp": alert.acknowledged_at.isoformat(),
                "type": "ALERT_ACKNOWLEDGED",
                "title": f"Alert Acknowledged by {alert.acknowledged_by_name} ({alert.acknowledged_by_role})",
                "description": f"Alert {alert.alert_id} moved to ACKNOWLEDGED",
                "actor": alert.acknowledged_by_id
            })
        if alert.resolved_at:
            timeline.append({
                "timestamp": alert.resolved_at.isoformat(),
                "type": "ALERT_RESOLVED",
                "title": f"Alert Resolved by {alert.resolved_by_name} ({alert.resolved_by_role})",
                "description": f"Resolution Note: {alert.resolution_reason}",
                "actor": alert.resolved_by_id
            })
    for pa in physician_assessments:
        if pa.ai_agreement == AIAgreementEnum.OVERRIDDEN:
            timeline.append({
                "timestamp": pa.created_at.isoformat(),
                "type": "PHYSICIAN_OVERRIDE",
                "title": f"👨‍⚕️ Physician Override: AI {pa.ai_risk_category_at_review or 'Risk'} ➔ Clinician {pa.clinician_assigned_risk or 'Assessment'}",
                "description": f"Decision: {pa.clinical_decision.value} | Reason: {pa.override_reason or 'Clinical context'}. Notes: {pa.clinical_notes or '-'}",
                "actor": f"{pa.physician_name} ({pa.physician_role})"
            })
        else:
            timeline.append({
                "timestamp": pa.created_at.isoformat(),
                "type": "PHYSICIAN_DECISION",
                "title": f"👨‍⚕️ Physician Decision: Agreed with AI Assessment ({pa.clinical_decision.value})",
                "description": f"Assessment: {pa.clinical_assessment or 'Reviewed and confirmed'}. Notes: {pa.clinical_notes or '-'}",
                "actor": f"{pa.physician_name} ({pa.physician_role})"
            })

    timeline_sorted = sorted(timeline, key=lambda x: x['timestamp'], reverse=True)

    return {
        "encounter": enc.to_dict(),
        "patient": patient.to_dict() if patient else None,
        "observations": [o.to_dict() for o in observations],
        "triage": triage.to_dict() if triage else None,
        "ai_risk": ai_risk.to_dict() if ai_risk else None,
        "ai_explanation": ai_explanation.to_dict() if ai_explanation else None,
        "alerts": [a.to_dict() for a in alerts],
        "physician_assessments": [p.to_dict() for p in physician_assessments],
        "current_physician_assessment": physician_assessments[0].to_dict() if physician_assessments else None,
        "timeline": timeline_sorted
    }

@router.put("/{encounter_id}/status")
def update_encounter_status(
    encounter_id: str,
    req: EncounterStatusUpdateRequest,
    staff: Staff = Depends(require_permission("patient:update")),
    db: Session = Depends(get_db)
):
    """
    Updates encounter status and logs ENCOUNTER_STATUS_CHANGED.
    """
    enc = db.query(EDEncounter).filter(
        EDEncounter.encounter_id == encounter_id,
        EDEncounter.hospital_id == staff.hospital_id
    ).first()

    if not enc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Encounter '{encounter_id}' not found.")

    prev_status = enc.status.value
    enc.status = req.status
    if req.bed_number is not None:
        enc.bed_number = req.bed_number

    db.commit()
    db.refresh(enc)

    AuditService.log_event(
        db=db,
        hospital_id=staff.hospital_id,
        action="ENCOUNTER_STATUS_CHANGED",
        entity_type="ENCOUNTER",
        entity_id=enc.encounter_id,
        actor_id=staff.staff_id,
        actor_name=staff.name,
        actor_role=staff.role.value,
        actor_type=ActorTypeEnum.HUMAN,
        patient_id=enc.patient_id,
        encounter_id=enc.encounter_id,
        result=AuditResultEnum.SUCCESS,
        metadata={"previous_status": prev_status, "new_status": req.status.value},
        auto_commit=True
    )

    return {"message": "Encounter status updated.", "encounter": enc.to_dict()}

@router.get("/{encounter_id}/clinical-review")
def get_clinical_review(
    encounter_id: str,
    staff: Staff = Depends(require_permission("clinical_decision:view")),
    db: Session = Depends(get_db)
):
    """
    Dedicated endpoint for the Physician Clinical Review Workspace, consolidating all clinical inputs.
    """
    return get_encounter_details(encounter_id, staff, db)

@router.post("/{encounter_id}/discharge")
def discharge_encounter(
    encounter_id: str,
    payload: DischargeRequest = DischargeRequest(),
    staff: Staff = Depends(require_permission("patient:update")),
    db: Session = Depends(get_db)
):
    """
    Discharges patient from Emergency Department, frees assigned care bed, and logs audit trail.
    """
    enc = db.query(EDEncounter).filter(
        EDEncounter.encounter_id == encounter_id,
        EDEncounter.hospital_id == staff.hospital_id
    ).first()

    if not enc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Encounter '{encounter_id}' not found.")

    if enc.status == EncounterStatusEnum.DISCHARGED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Patient has already been discharged.")

    prev_status = enc.status.value
    prev_bed = enc.bed_number

    from services.bed_service import BedService
    BedService.release_bed_and_admit_next(db, staff.hospital_id, enc)

    # Also resolve active alerts for this encounter
    active_alerts = db.query(ClinicalAlert).filter(
        ClinicalAlert.encounter_id == encounter_id,
        ClinicalAlert.status.in_([AlertStatusEnum.UNACKNOWLEDGED, AlertStatusEnum.ACKNOWLEDGED])
    ).all()
    for alt in active_alerts:
        alt.status = AlertStatusEnum.RESOLVED
        alt.resolved_at = datetime.datetime.utcnow()
        alt.resolved_by_id = staff.staff_id
        alt.resolved_by_name = staff.name
        alt.resolved_by_role = staff.role.value
        alt.resolution_reason = f"Discharged from ED to {payload.destination or 'Home'}. {payload.disposition_notes or ''}"

    db.commit()
    db.refresh(enc)

    pat_name = f"{enc.patient.first_name} {enc.patient.last_name}" if enc.patient else "Patient"

    AuditService.log_event(
        db=db,
        hospital_id=staff.hospital_id,
        action="PATIENT_DISCHARGED",
        entity_type="ENCOUNTER",
        entity_id=enc.encounter_id,
        actor_id=staff.staff_id,
        actor_name=staff.name,
        actor_role=staff.role.value,
        actor_type=ActorTypeEnum.HUMAN,
        patient_id=enc.patient_id,
        encounter_id=enc.encounter_id,
        result=AuditResultEnum.SUCCESS,
        metadata={
            "patient_name": pat_name,
            "previous_status": prev_status,
            "released_bed": prev_bed,
            "destination": payload.destination or "Home",
            "disposition_notes": payload.disposition_notes
        },
        auto_commit=True
    )

    return {
        "message": f"Patient '{pat_name}' successfully discharged from the Emergency Department.",
        "encounter": enc.to_dict(),
        "discharged_at": datetime.datetime.utcnow().isoformat()
    }

@router.post("/{encounter_id}/override-priority")
def override_encounter_priority(
    encounter_id: str,
    payload: PriorityOverrideRequest,
    staff: Staff = Depends(require_permission("triage:update")),
    db: Session = Depends(get_db)
):
    """
    Clinician overrides care priority with preserved AI recommendation, mandatory justification reason, and audit trail.
    """
    enc = db.query(EDEncounter).filter(
        EDEncounter.encounter_id == encounter_id,
        EDEncounter.hospital_id == staff.hospital_id
    ).first()

    if not enc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Encounter '{encounter_id}' not found.")

    if not payload.override_reason or not payload.override_reason.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Override reason is mandatory for clinical priority adjustment.")

    acuity_map = {
        1: "Immediate",
        2: "Emergent",
        3: "Urgent",
        4: "Less Urgent",
        5: "Non-Urgent"
    }
    acuity_category = acuity_map.get(payload.new_priority, "Urgent")

    # Get latest triage to find previous priority
    latest_triage = db.query(TriageAssessment).filter(
        TriageAssessment.encounter_id == enc.encounter_id
    ).order_by(TriageAssessment.assessed_at.desc()).first()
    prev_level = latest_triage.triage_level if latest_triage else 3

    # Latest AI risk
    latest_ai_risk = db.query(AIRiskAssessment).filter(
        AIRiskAssessment.encounter_id == enc.encounter_id
    ).order_by(AIRiskAssessment.assessed_at.desc()).first()
    original_ai_level = latest_ai_risk.predicted_triage_level if latest_ai_risk else prev_level

    # Create new TriageAssessment record preserving history
    new_triage = TriageAssessment(
        hospital_id=staff.hospital_id,
        patient_id=enc.patient_id,
        encounter_id=enc.encounter_id,
        triage_level=payload.new_priority,
        acuity_category=acuity_category,
        chief_complaint=enc.chief_complaint,
        assessed_by=staff.name or staff.staff_id,
        assessed_at=datetime.datetime.utcnow(),
        notes=f"Clinician Override: Priority changed from Level {prev_level} (AI: Level {original_ai_level}) to Level {payload.new_priority}. Reason: {payload.override_reason.strip()}. {payload.clinical_notes or ''}"
    )
    db.add(new_triage)

    # If clinician is a Physician, also record PhysicianAssessment
    role_str = staff.role.value if hasattr(staff.role, "value") else str(staff.role)
    if "PHYSICIAN" in role_str or "DIRECTOR" in role_str:
        phys_assessment = PhysicianAssessment(
            assessment_id=f"PA-OVR-{enc.encounter_id}-{uuid.uuid4().hex[:4].upper()}",
            hospital_id=staff.hospital_id,
            encounter_id=enc.encounter_id,
            patient_id=enc.patient_id,
            physician_id=staff.staff_id,
            physician_name=staff.name,
            physician_role=role_str,
            ai_assessment_id=latest_ai_risk.assessment_id if latest_ai_risk else None,
            ai_risk_category_at_review=latest_ai_risk.risk_category.value if latest_ai_risk else "MODERATE",
            ai_risk_score_at_review=latest_ai_risk.risk_score if latest_ai_risk else 50.0,
            clinical_assessment=payload.clinical_notes or f"Priority adjusted to Level {payload.new_priority}",
            ai_agreement=AIAgreementEnum.OVERRIDDEN,
            clinician_assigned_risk="CRITICAL" if payload.new_priority <= 2 else ("MODERATE" if payload.new_priority == 3 else "LOW"),
            override_reason=payload.override_reason.strip(),
            clinical_notes=payload.clinical_notes,
            created_at=datetime.datetime.utcnow()
        )
        db.add(phys_assessment)

    db.commit()
    db.refresh(new_triage)

    # Log audit event
    AuditService.log_event(
        db=db,
        hospital_id=staff.hospital_id,
        action="PRIORITY_OVERRIDDEN",
        entity_type="TRIAGE_ASSESSMENT",
        entity_id=str(new_triage.id),
        actor_id=staff.staff_id,
        actor_name=staff.name,
        actor_role=staff.role.value,
        actor_type=ActorTypeEnum.HUMAN,
        patient_id=enc.patient_id,
        encounter_id=enc.encounter_id,
        result=AuditResultEnum.SUCCESS,
        metadata={
            "previous_triage_level": prev_level,
            "new_triage_level": payload.new_priority,
            "original_ai_level": original_ai_level,
            "override_reason": payload.override_reason,
            "clinical_notes": payload.clinical_notes
        },
        auto_commit=True
    )

    return {
        "message": f"Care priority successfully adjusted to ESI Level {payload.new_priority}.",
        "triage": new_triage.to_dict(),
        "original_ai_level": original_ai_level,
        "clinician_priority": payload.new_priority
    }
