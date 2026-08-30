import datetime
import math
from collections import Counter, defaultdict
from typing import Optional

from sqlalchemy.orm import Session

from models import (
    AIRiskAssessment,
    AIRiskCategoryEnum,
    AlertStatusEnum,
    ClinicalAlert,
    EDEncounter,
    EncounterStatusEnum,
    Hospital,
    Patient,
    Staff,
    StaffRoleEnum,
    TriageAssessment,
    TriageAuditLog,
    ActionTypeEnum,
)


ACTIVE_ENCOUNTER_STATUSES = {
    EncounterStatusEnum.WAITING,
    EncounterStatusEnum.IN_TRIAGE,
    EncounterStatusEnum.IN_TREATMENT,
}

ACTIVE_ALERT_STATUSES = {
    AlertStatusEnum.UNACKNOWLEDGED,
    AlertStatusEnum.ACKNOWLEDGED,
}

HIGH_RISK_CATEGORIES = {
    AIRiskCategoryEnum.HIGH,
    AIRiskCategoryEnum.CRITICAL,
}


def utc_now() -> datetime.datetime:
    return datetime.datetime.utcnow()


def parse_time_range(
    range_key: str = "today",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> tuple[datetime.datetime, datetime.datetime, str]:
    now = utc_now()
    key = (range_key or "today").lower()

    if key == "custom":
        if not start_date or not end_date:
            raise ValueError("Custom analytics range requires start_date and end_date.")
        start = datetime.datetime.fromisoformat(start_date)
        end = datetime.datetime.fromisoformat(end_date)
        if len(end_date) == 10:
            end = end + datetime.timedelta(days=1)
        return start, end, "custom"

    today_start = datetime.datetime(now.year, now.month, now.day)
    if key == "last_7_days":
        return today_start - datetime.timedelta(days=6), now, key
    if key == "last_30_days":
        return today_start - datetime.timedelta(days=29), now, key
    return today_start, now, "today"


def minutes_between(start: Optional[datetime.datetime], end: Optional[datetime.datetime]) -> Optional[float]:
    if not start or not end or end < start:
        return None
    return round((end - start).total_seconds() / 60, 1)


def average(values: list[float]) -> Optional[float]:
    valid = [v for v in values if v is not None]
    if not valid:
        return None
    return round(sum(valid) / len(valid), 1)


def median(values: list[float]) -> Optional[float]:
    valid = sorted(v for v in values if v is not None)
    if not valid:
        return None
    mid = len(valid) // 2
    if len(valid) % 2:
        return round(valid[mid], 1)
    return round((valid[mid - 1] + valid[mid]) / 2, 1)


def percentile(values: list[float], pct: float) -> Optional[float]:
    valid = sorted(v for v in values if v is not None)
    if not valid:
        return None
    if len(valid) == 1:
        return round(valid[0], 1)
    rank = (len(valid) - 1) * pct
    low = math.floor(rank)
    high = math.ceil(rank)
    if low == high:
        return round(valid[int(rank)], 1)
    return round(valid[low] + (valid[high] - valid[low]) * (rank - low), 1)


def latest_by_encounter(rows, encounter_attr: str, date_attr: str):
    latest = {}
    for row in rows:
        encounter_id = getattr(row, encounter_attr)
        existing = latest.get(encounter_id)
        if not existing or getattr(row, date_attr) > getattr(existing, date_attr):
            latest[encounter_id] = row
    return latest


def is_high_risk(latest_ai: Optional[AIRiskAssessment], latest_triage: Optional[TriageAssessment]) -> bool:
    if latest_ai and latest_ai.risk_category in HIGH_RISK_CATEGORIES:
        return True
    return bool(latest_triage and latest_triage.triage_level in (1, 2))


def active_alert_counts(db: Session, hospital_id: str) -> dict[str, int]:
    alerts = db.query(ClinicalAlert).filter(
        ClinicalAlert.hospital_id == hospital_id,
        ClinicalAlert.status.in_(list(ACTIVE_ALERT_STATUSES)),
    ).all()
    by_encounter = Counter(alert.encounter_id for alert in alerts)
    return dict(by_encounter)


def get_dashboard_summary(db: Session, staff: Staff) -> dict:
    hospital = db.query(Hospital).filter(Hospital.hospital_code == staff.hospital_id).first()
    now = utc_now()

    active_encounters = db.query(EDEncounter).filter(
        EDEncounter.hospital_id == staff.hospital_id,
        EDEncounter.status.in_(list(ACTIVE_ENCOUNTER_STATUSES)),
    ).all()
    active_ids = [enc.encounter_id for enc in active_encounters]

    triages = []
    ai_risks = []
    if active_ids:
        triages = db.query(TriageAssessment).filter(
            TriageAssessment.hospital_id == staff.hospital_id,
            TriageAssessment.encounter_id.in_(active_ids),
        ).all()
        ai_risks = db.query(AIRiskAssessment).filter(
            AIRiskAssessment.hospital_id == staff.hospital_id,
            AIRiskAssessment.encounter_id.in_(active_ids),
        ).all()

    latest_triage = latest_by_encounter(triages, "encounter_id", "assessed_at")
    latest_ai = latest_by_encounter(ai_risks, "encounter_id", "assessed_at")
    alert_counts = active_alert_counts(db, staff.hospital_id)

    waiting_for_triage = [
        enc for enc in active_encounters
        if enc.status == EncounterStatusEnum.WAITING and enc.encounter_id not in latest_triage
    ]
    waiting_for_physician = [
        enc for enc in active_encounters
        if enc.status == EncounterStatusEnum.WAITING and enc.encounter_id in latest_triage
    ]
    in_triage = [enc for enc in active_encounters if enc.status == EncounterStatusEnum.IN_TRIAGE]
    under_evaluation = [enc for enc in active_encounters if enc.status == EncounterStatusEnum.IN_TREATMENT]
    high_risk = [
        enc for enc in active_encounters
        if is_high_risk(latest_ai.get(enc.encounter_id), latest_triage.get(enc.encounter_id))
    ]

    completed_waits = [
        minutes_between(enc.arrival_time, latest_triage[enc.encounter_id].assessed_at)
        for enc in active_encounters
        if enc.encounter_id in latest_triage
    ]
    current_waits = [minutes_between(enc.arrival_time, now) for enc in waiting_for_triage]

    todays_start, todays_end, _ = parse_time_range("today")
    today_ai = db.query(AIRiskAssessment).filter(
        AIRiskAssessment.hospital_id == staff.hospital_id,
        AIRiskAssessment.assessed_at >= todays_start,
        AIRiskAssessment.assessed_at <= todays_end,
    ).all()
    today_overrides = get_override_count(db, staff.hospital_id, todays_start, todays_end)

    return {
        "hospital": {
            "hospital_id": staff.hospital_id,
            "name": hospital.name if hospital else staff.hospital_id,
        },
        "last_updated": now.isoformat(),
        "refresh_interval_seconds": 15,
        "metrics": {
            "active_encounters": len(active_encounters),
            "waiting_for_triage": len(waiting_for_triage),
            "triage_in_progress": len(in_triage),
            "waiting_for_physician": len(waiting_for_physician),
            "under_evaluation": len(under_evaluation),
            "high_risk_encounters": len(high_risk),
            "active_alerts": sum(alert_counts.values()),
            "average_arrival_to_triage_minutes": average(completed_waits),
            "median_arrival_to_triage_minutes": median(completed_waits),
            "current_average_waiting_for_triage_minutes": average(current_waits),
            "average_triage_time_minutes": None,
        },
        "queue": [
            {"key": "waiting_for_triage", "label": "Waiting for Triage", "count": len(waiting_for_triage)},
            {"key": "triage_in_progress", "label": "Triage in Progress", "count": len(in_triage)},
            {"key": "waiting_for_physician", "label": "Waiting for Physician", "count": len(waiting_for_physician)},
            {"key": "under_evaluation", "label": "Under Evaluation", "count": len(under_evaluation)},
        ],
        "ai_overview": {
            "assessments_today": len(today_ai),
            "clinician_overrides_today": today_overrides,
            "override_rate_today": calculate_rate(today_overrides, len(today_ai)),
            "pending_clinician_review": None,
        },
        "definitions": {
            "active_encounters": "ED encounters in WAITING, IN_TRIAGE, or IN_TREATMENT status.",
            "waiting_for_triage": "WAITING encounters without a recorded triage assessment.",
            "waiting_for_physician": "WAITING encounters that already have a triage assessment.",
            "under_evaluation": "Encounters in IN_TREATMENT status.",
            "high_risk_encounters": "Active encounters whose latest AI risk is HIGH/CRITICAL, or whose latest ESI triage level is 1 or 2 when no higher-fidelity AI state is available.",
            "average_arrival_to_triage_minutes": "Completed interval from encounter arrival_time to latest triage assessed_at.",
            "average_triage_time_minutes": "Unavailable because this schema stores assessed_at, but not triage start and completion timestamps.",
        },
    }


def calculate_rate(numerator: int, denominator: int) -> Optional[float]:
    if denominator <= 0:
        return None
    return round((numerator / denominator) * 100, 1)


def get_override_count(
    db: Session,
    hospital_id: str,
    start: datetime.datetime,
    end: datetime.datetime,
) -> int:
    patient_ids = [
        row.patient_id for row in db.query(Patient.patient_id).filter(Patient.hospital_id == hospital_id).all()
    ]
    if not patient_ids:
        return 0
    return db.query(TriageAuditLog).filter(
        TriageAuditLog.patient_id.in_(patient_ids),
        TriageAuditLog.action_type == ActionTypeEnum.OVERRIDDEN,
        TriageAuditLog.timestamp >= start,
        TriageAuditLog.timestamp <= end,
    ).count()


def bucket_key(dt: datetime.datetime, range_key: str) -> str:
    if range_key == "today":
        return dt.strftime("%H:00")
    return dt.strftime("%Y-%m-%d")


def make_series(counter: Counter, start: datetime.datetime, end: datetime.datetime, range_key: str) -> list[dict]:
    series = []
    if range_key == "today":
        cursor = datetime.datetime(start.year, start.month, start.day)
        final = datetime.datetime(end.year, end.month, end.day, end.hour)
        while cursor <= final:
            label = cursor.strftime("%H:00")
            series.append({"label": label, "count": counter.get(label, 0)})
            cursor += datetime.timedelta(hours=1)
        return series

    cursor = datetime.datetime(start.year, start.month, start.day)
    final = datetime.datetime(end.year, end.month, end.day)
    while cursor <= final:
        label = cursor.strftime("%Y-%m-%d")
        series.append({"label": label, "count": counter.get(label, 0)})
        cursor += datetime.timedelta(days=1)
    return series


def get_dashboard_analytics(
    db: Session,
    staff: Staff,
    range_key: str = "today",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> dict:
    start, end, resolved_range = parse_time_range(range_key, start_date, end_date)

    encounters = db.query(EDEncounter).filter(
        EDEncounter.hospital_id == staff.hospital_id,
        EDEncounter.arrival_time >= start,
        EDEncounter.arrival_time <= end,
    ).all()
    encounter_ids = [enc.encounter_id for enc in encounters]

    triages = []
    ai_risks = []
    alerts = []
    if encounter_ids:
        triages = db.query(TriageAssessment).filter(
            TriageAssessment.hospital_id == staff.hospital_id,
            TriageAssessment.encounter_id.in_(encounter_ids),
        ).all()
        ai_risks = db.query(AIRiskAssessment).filter(
            AIRiskAssessment.hospital_id == staff.hospital_id,
            AIRiskAssessment.encounter_id.in_(encounter_ids),
        ).all()
        alerts = db.query(ClinicalAlert).filter(
            ClinicalAlert.hospital_id == staff.hospital_id,
            ClinicalAlert.encounter_id.in_(encounter_ids),
        ).all()

    latest_triage = latest_by_encounter(triages, "encounter_id", "assessed_at")
    latest_ai = latest_by_encounter(ai_risks, "encounter_id", "assessed_at")

    volume_counter = Counter(bucket_key(enc.arrival_time, resolved_range) for enc in encounters)
    wait_values = [
        minutes_between(enc.arrival_time, latest_triage[enc.encounter_id].assessed_at)
        for enc in encounters
        if enc.encounter_id in latest_triage
    ]
    wait_bucket_values = defaultdict(list)
    for enc in encounters:
        triage = latest_triage.get(enc.encounter_id)
        if triage:
            wait = minutes_between(enc.arrival_time, triage.assessed_at)
            if wait is not None:
                wait_bucket_values[bucket_key(enc.arrival_time, resolved_range)].append(wait)

    wait_time_trend = []
    for item in make_series(Counter(), start, end, resolved_range):
        waits = wait_bucket_values.get(item["label"], [])
        wait_time_trend.append({
            "label": item["label"],
            "average_minutes": average(waits),
            "median_minutes": median(waits),
            "sample_size": len(waits),
        })

    risk_counter = Counter()
    for enc in encounters:
        ai = latest_ai.get(enc.encounter_id)
        triage = latest_triage.get(enc.encounter_id)
        if ai:
            risk_counter[ai.risk_category.value] += 1
        elif triage and triage.triage_level in (1, 2):
            risk_counter["HIGH"] += 1
        elif triage:
            risk_counter["TRIAGED_LOWER_ACUITY"] += 1
        else:
            risk_counter["NOT_ASSESSED"] += 1

    alert_status_counter = Counter(alert.status.value for alert in alerts)
    alert_severity_counter = Counter(alert.severity.value for alert in alerts)
    ack_times = [
        minutes_between(alert.detected_at, alert.acknowledged_at)
        for alert in alerts
        if alert.acknowledged_at
    ]

    ai_assessments = db.query(AIRiskAssessment).filter(
        AIRiskAssessment.hospital_id == staff.hospital_id,
        AIRiskAssessment.assessed_at >= start,
        AIRiskAssessment.assessed_at <= end,
    ).all()
    override_count = get_override_count(db, staff.hospital_id, start, end)

    return {
        "hospital_id": staff.hospital_id,
        "range": {
            "key": resolved_range,
            "start": start.isoformat(),
            "end": end.isoformat(),
        },
        "volume": {
            "total_encounters": len(encounters),
            "active_encounters": sum(1 for enc in encounters if enc.status in ACTIVE_ENCOUNTER_STATUSES),
            "completed_encounters": sum(1 for enc in encounters if enc.status in {EncounterStatusEnum.DISCHARGED, EncounterStatusEnum.TRANSFERRED, EncounterStatusEnum.ADMITTED}),
            "series": make_series(volume_counter, start, end, resolved_range),
        },
        "wait_times": {
            "average_arrival_to_triage_minutes": average(wait_values),
            "median_arrival_to_triage_minutes": median(wait_values),
            "p95_arrival_to_triage_minutes": percentile(wait_values, 0.95),
            "sample_size": len([v for v in wait_values if v is not None]),
            "series": wait_time_trend,
        },
        "risk_distribution": [
            {"category": category, "count": count}
            for category, count in sorted(risk_counter.items())
        ],
        "alerts": {
            "total": len(alerts),
            "by_status": dict(alert_status_counter),
            "by_severity": dict(alert_severity_counter),
            "average_acknowledgement_minutes": average(ack_times),
            "median_acknowledgement_minutes": median(ack_times),
        },
        "ai_usage": {
            "assessments": len(ai_assessments),
            "clinician_overrides": override_count,
            "override_rate": calculate_rate(override_count, len(ai_assessments)),
            "note": "Override rate is an AI usage/workflow metric, not model accuracy.",
        },
    }


def get_dashboard_drilldown(db: Session, staff: Staff, metric: str) -> dict:
    summary = get_dashboard_summary(db, staff)
    active_encounters = db.query(EDEncounter).filter(
        EDEncounter.hospital_id == staff.hospital_id,
        EDEncounter.status.in_(list(ACTIVE_ENCOUNTER_STATUSES)),
    ).all()
    active_ids = [enc.encounter_id for enc in active_encounters]

    triages = db.query(TriageAssessment).filter(
        TriageAssessment.hospital_id == staff.hospital_id,
        TriageAssessment.encounter_id.in_(active_ids),
    ).all() if active_ids else []
    ai_risks = db.query(AIRiskAssessment).filter(
        AIRiskAssessment.hospital_id == staff.hospital_id,
        AIRiskAssessment.encounter_id.in_(active_ids),
    ).all() if active_ids else []
    alerts = db.query(ClinicalAlert).filter(
        ClinicalAlert.hospital_id == staff.hospital_id,
        ClinicalAlert.encounter_id.in_(active_ids),
        ClinicalAlert.status.in_(list(ACTIVE_ALERT_STATUSES)),
    ).all() if active_ids else []

    latest_triage = latest_by_encounter(triages, "encounter_id", "assessed_at")
    latest_ai = latest_by_encounter(ai_risks, "encounter_id", "assessed_at")
    alert_counts = Counter(alert.encounter_id for alert in alerts)

    def include(enc: EDEncounter) -> bool:
        if metric == "active_encounters":
            return True
        if metric == "waiting_for_triage":
            return enc.status == EncounterStatusEnum.WAITING and enc.encounter_id not in latest_triage
        if metric == "triage_in_progress":
            return enc.status == EncounterStatusEnum.IN_TRIAGE
        if metric == "waiting_for_physician":
            return enc.status == EncounterStatusEnum.WAITING and enc.encounter_id in latest_triage
        if metric == "under_evaluation":
            return enc.status == EncounterStatusEnum.IN_TREATMENT
        if metric == "high_risk_encounters":
            return is_high_risk(latest_ai.get(enc.encounter_id), latest_triage.get(enc.encounter_id))
        if metric == "active_alerts":
            return alert_counts.get(enc.encounter_id, 0) > 0
        return False

    allow_patient_identifier = staff.role != StaffRoleEnum.HOSPITAL_ADMIN
    now = utc_now()
    rows = []
    for enc in active_encounters:
        if not include(enc):
            continue
        ai = latest_ai.get(enc.encounter_id)
        triage = latest_triage.get(enc.encounter_id)
        row = {
            "encounter_id": enc.encounter_id,
            "status": enc.status.value,
            "arrival_time": enc.arrival_time.isoformat() if enc.arrival_time else None,
            "wait_time_minutes": minutes_between(enc.arrival_time, now),
            "triage_level": triage.triage_level if triage else None,
            "risk_category": ai.risk_category.value if ai else None,
            "risk_score": ai.risk_score if ai else None,
            "active_alert_count": alert_counts.get(enc.encounter_id, 0),
        }
        if allow_patient_identifier:
            row["patient_id"] = enc.patient_id
        rows.append(row)

    return {
        "metric": metric,
        "hospital_id": staff.hospital_id,
        "count": len(rows),
        "items": sorted(rows, key=lambda item: (-item["active_alert_count"], item["wait_time_minutes"] or 0), reverse=True),
        "privacy": "Patient identifiers are withheld for hospital administrators on aggregate drill-downs.",
        "summary_definitions": summary["definitions"],
    }
