import uuid
import datetime
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import desc, asc, and_, or_

from models import AuditLog, ActorTypeEnum, AuditResultEnum

# Sensitive keys that must NEVER be persisted in audit metadata
SENSITIVE_KEYS = {"password", "password_hash", "token", "auth_token", "jwt", "secret", "api_key", "credentials"}

class AuditService:
    """
    Centralized, append-oriented Clinical Audit Logging Service for PatientTriage.ai.
    Ensures data minimization, non-repudiation, tamper-resistance, and multi-tenant hospital isolation.
    """

    @staticmethod
    def generate_event_id(hospital_id: str = "DEMO") -> str:
        hosp_prefix = hospital_id[:4].upper() if hospital_id else "HOSP"
        date_str = datetime.datetime.utcnow().strftime("%Y%m%d")
        rand_suffix = uuid.uuid4().hex[:6].upper()
        return f"AUD-{hosp_prefix}-{date_str}-{rand_suffix}"

    @classmethod
    def sanitize_metadata(cls, metadata: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if not metadata or not isinstance(metadata, dict):
            return metadata
        
        sanitized = {}
        for k, v in metadata.items():
            if any(s in k.lower() for s in SENSITIVE_KEYS):
                sanitized[k] = "[REDACTED]"
            elif isinstance(v, dict):
                sanitized[k] = cls.sanitize_metadata(v)
            else:
                sanitized[k] = v
        return sanitized

    @classmethod
    def log_event(
        cls,
        db: Session,
        hospital_id: str,
        action: str,
        entity_type: str,
        entity_id: str,
        actor_id: str,
        actor_name: Optional[str] = None,
        actor_role: Optional[str] = None,
        actor_type: ActorTypeEnum = ActorTypeEnum.HUMAN,
        patient_id: Optional[str] = None,
        encounter_id: Optional[str] = None,
        result: AuditResultEnum = AuditResultEnum.SUCCESS,
        metadata: Optional[Dict[str, Any]] = None,
        auto_commit: bool = False
    ) -> AuditLog:
        """
        Creates and stores an immutable audit event in the database.
        """
        if not hospital_id:
            hospital_id = "SYSTEM"

        event_id = cls.generate_event_id(hospital_id)
        clean_metadata = cls.sanitize_metadata(metadata)

        # Default name/role for system or AI events
        if actor_type == ActorTypeEnum.AI_SYSTEM:
            if not actor_role:
                actor_role = "AI_SYSTEM"
            if not actor_name:
                actor_name = "PatientTriage AI Engine"
        elif actor_type == ActorTypeEnum.SYSTEM:
            if not actor_role:
                actor_role = "SYSTEM"
            if not actor_name:
                actor_name = "Clinical Rule Engine"
        elif not actor_role:
            actor_role = "STAFF"

        audit_entry = AuditLog(
            event_id=event_id,
            hospital_id=hospital_id,
            staff_id=actor_id,
            staff_name=actor_name or actor_id,
            role=actor_role,
            actor_type=actor_type,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            patient_id=patient_id,
            encounter_id=encounter_id,
            result=result,
            timestamp=datetime.datetime.utcnow(),
            metadata_json=clean_metadata
        )

        db.add(audit_entry)
        if auto_commit:
            db.commit()
            db.refresh(audit_entry)

        return audit_entry

    @classmethod
    def query_logs(
        cls,
        db: Session,
        hospital_id: str,
        page: int = 1,
        page_size: int = 50,
        q: Optional[str] = None,
        actor_id: Optional[str] = None,
        actor_role: Optional[str] = None,
        actor_type: Optional[str] = None,
        action: Optional[str] = None,
        entity_type: Optional[str] = None,
        encounter_id: Optional[str] = None,
        patient_id: Optional[str] = None,
        result: Optional[str] = None,
        sort_order: str = "desc",
        start_date: Optional[datetime.datetime] = None,
        end_date: Optional[datetime.datetime] = None
    ) -> Dict[str, Any]:
        """
        Executes server-side filtered, hospital-isolated, paginated audit query.
        """
        query = db.query(AuditLog).filter(AuditLog.hospital_id == hospital_id)

        if actor_id:
            query = query.filter(AuditLog.staff_id == actor_id)
        if actor_role:
            query = query.filter(AuditLog.role == actor_role)
        if actor_type:
            query = query.filter(AuditLog.actor_type == actor_type)
        if action:
            query = query.filter(AuditLog.action == action)
        if entity_type:
            query = query.filter(AuditLog.entity_type == entity_type)
        if encounter_id:
            query = query.filter(AuditLog.encounter_id == encounter_id)
        if patient_id:
            query = query.filter(AuditLog.patient_id == patient_id)
        if result:
            query = query.filter(AuditLog.result == result)
        if start_date:
            query = query.filter(AuditLog.timestamp >= start_date)
        if end_date:
            query = query.filter(AuditLog.timestamp <= end_date)

        # Free-text search query across key identifiers
        if q and q.strip():
            search_str = f"%{q.strip()}%"
            query = query.filter(
                or_(
                    AuditLog.event_id.ilike(search_str),
                    AuditLog.staff_id.ilike(search_str),
                    AuditLog.staff_name.ilike(search_str),
                    AuditLog.action.ilike(search_str),
                    AuditLog.entity_id.ilike(search_str),
                    AuditLog.encounter_id.ilike(search_str),
                    AuditLog.patient_id.ilike(search_str)
                )
            )

        total_count = query.count()

        # Sorting
        if sort_order.lower() == "asc":
            query = query.order_by(asc(AuditLog.timestamp))
        else:
            query = query.order_by(desc(AuditLog.timestamp))

        # Pagination
        page = max(1, page)
        page_size = min(max(1, page_size), 200) # capped between 1 and 200
        offset = (page - 1) * page_size
        total_pages = max(1, (total_count + page_size - 1) // page_size)

        logs = query.offset(offset).limit(page_size).all()

        return {
            "total": total_count,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
            "logs": [l.to_dict() for l in logs]
        }

    @classmethod
    def get_event_by_id(cls, db: Session, hospital_id: str, event_id: str) -> Optional[AuditLog]:
        return db.query(AuditLog).filter(
            and_(
                AuditLog.hospital_id == hospital_id,
                or_(AuditLog.event_id == event_id, AuditLog.id == int(event_id) if event_id.isdigit() else False)
            )
        ).first()

    @classmethod
    def get_encounter_audit_timeline(cls, db: Session, hospital_id: str, encounter_id: str, patient_id: Optional[str] = None) -> List[Dict[str, Any]]:
        conditions = [AuditLog.hospital_id == hospital_id]
        if patient_id:
            conditions.append(
                or_(
                    AuditLog.encounter_id == encounter_id,
                    and_(AuditLog.patient_id == patient_id, AuditLog.action.in_(["PATIENT_CREATED", "PATIENT_UPDATED"]))
                )
            )
        else:
            conditions.append(AuditLog.encounter_id == encounter_id)

        logs = db.query(AuditLog).filter(and_(*conditions)).order_by(asc(AuditLog.timestamp)).all()
        return [l.to_dict() for l in logs]
