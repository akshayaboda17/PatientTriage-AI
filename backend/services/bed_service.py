"""
Bed Management and Clinical Space Allocation Service for PatientTriage.ai.
Ensures patients are allocated available beds up to the hospital's capacity.
Patients only show as waiting when all beds are occupied.
"""
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from models import EDEncounter, EncounterStatusEnum, TriageAssessment
from services.hospital_config_service import HospitalConfigService


class BedService:
    @staticmethod
    def get_hospital_bed_definitions(total_capacity: int = 25) -> List[Dict[str, Any]]:
        """
        Generates standard structured bed definitions for the hospital.
        """
        bed_list = []
        # Resuscitation / Trauma Bays (2)
        for i in range(1, 3):
            bed_list.append({
                "bed_id": f"RESUS-0{i}",
                "bed_type": "Resuscitation Bay (ESI 1-2)",
                "zone": "Resuscitation / Trauma",
                "preferred_acuity": [1, 2]
            })

        # Critical Care / ICU Bays (2)
        for i in range(1, 3):
            bed_list.append({
                "bed_id": f"ICU-0{i}",
                "bed_type": "Critical Care / ICU Bay",
                "zone": "Critical Care",
                "preferred_acuity": [1, 2]
            })

        # Acute Emergency Care Beds
        acute_count = max(4, total_capacity - 8)
        for i in range(1, acute_count + 1):
            bed_list.append({
                "bed_id": f"BED-{i:02d}",
                "bed_type": "Acute Emergency Care Bed",
                "zone": "Acute Care Zone",
                "preferred_acuity": [2, 3, 4]
            })

        # Fast Track Observation (4)
        for i in range(1, 5):
            bed_list.append({
                "bed_id": f"FT-0{i}",
                "bed_type": "Fast Track Observation Chair/Bed",
                "zone": "Fast Track",
                "preferred_acuity": [4, 5]
            })

        return bed_list

    @staticmethod
    def auto_assign_beds(db: Session, hospital_id: str) -> Dict[str, Any]:
        """
        Automatically assigns available beds to active patients in the hospital.
        Only if all beds are occupied do patients remain in the WAITING status.
        """
        config = HospitalConfigService.get_config(hospital_id)
        total_capacity = config.get("bed_capacity", 25)
        bed_defs = BedService.get_hospital_bed_definitions(total_capacity)
        all_bed_ids = [b["bed_id"] for b in bed_defs]

        # 1. Find currently occupied beds
        active_encounters = db.query(EDEncounter).filter(
            EDEncounter.hospital_id == hospital_id,
            EDEncounter.status.in_([
                EncounterStatusEnum.WAITING,
                EncounterStatusEnum.IN_TRIAGE,
                EncounterStatusEnum.IN_TREATMENT
            ])
        ).all()

        occupied_beds = {e.bed_number for e in active_encounters if e.bed_number}
        available_bed_ids = [b for b in all_bed_ids if b not in occupied_beds]

        # 2. Find active patients without an assigned bed
        unassigned_encounters = [
            e for e in active_encounters 
            if not e.bed_number and e.status != EncounterStatusEnum.DISCHARGED
        ]

        if not unassigned_encounters:
            return {
                "total_capacity": total_capacity,
                "occupied": len(occupied_beds),
                "available": len(available_bed_ids),
                "waiting_count": 0
            }

        # 3. Sort unassigned patients by triage priority (ESI 1 -> 2 -> 3 -> 4 -> 5), then arrival time
        def get_sort_acuity(enc):
            latest_tr = db.query(TriageAssessment).filter(
                TriageAssessment.encounter_id == enc.encounter_id
            ).order_by(TriageAssessment.assessed_at.desc()).first()
            lvl = latest_tr.triage_level if latest_tr else 3
            arrival = enc.arrival_time or enc.created_at
            return (lvl, arrival)

        unassigned_encounters.sort(key=get_sort_acuity)

        # 4. Allocate available beds
        assigned_now = 0
        for enc in unassigned_encounters:
            if not available_bed_ids:
                # All beds are occupied! Patient must wait for available care space.
                enc.status = EncounterStatusEnum.WAITING
                enc.bed_number = None
                continue

            # Determine best matching bed for this patient's acuity
            latest_tr = db.query(TriageAssessment).filter(
                TriageAssessment.encounter_id == enc.encounter_id
            ).order_by(TriageAssessment.assessed_at.desc()).first()
            acuity = latest_tr.triage_level if latest_tr else 3

            chosen_bed = None
            if acuity == 1:
                # Prefer RESUS, then ICU, then Acute
                for pref in ["RESUS", "ICU", "BED", "FT"]:
                    candidate = next((b for b in available_bed_ids if b.startswith(pref)), None)
                    if candidate:
                        chosen_bed = candidate
                        break
            elif acuity == 2:
                # Prefer ICU, then RESUS, then Acute
                for pref in ["ICU", "RESUS", "BED", "FT"]:
                    candidate = next((b for b in available_bed_ids if b.startswith(pref)), None)
                    if candidate:
                        chosen_bed = candidate
                        break
            elif acuity in [4, 5]:
                # Prefer FT, then Acute
                for pref in ["FT", "BED", "ICU", "RESUS"]:
                    candidate = next((b for b in available_bed_ids if b.startswith(pref)), None)
                    if candidate:
                        chosen_bed = candidate
                        break
            else:
                # Prefer Acute, then FT, then others
                for pref in ["BED", "FT", "ICU", "RESUS"]:
                    candidate = next((b for b in available_bed_ids if b.startswith(pref)), None)
                    if candidate:
                        chosen_bed = candidate
                        break

            if not chosen_bed and available_bed_ids:
                chosen_bed = available_bed_ids[0]

            if chosen_bed:
                enc.bed_number = chosen_bed
                enc.status = EncounterStatusEnum.IN_TREATMENT
                available_bed_ids.remove(chosen_bed)
                occupied_beds.add(chosen_bed)
                assigned_now += 1

        db.commit()

        # Count how many are still waiting because all beds are occupied
        waiting_count = sum(1 for e in active_encounters if not e.bed_number and e.status == EncounterStatusEnum.WAITING)

        return {
            "total_capacity": total_capacity,
            "occupied": len(occupied_beds),
            "available": len(available_bed_ids),
            "assigned_now": assigned_now,
            "waiting_count": waiting_count
        }

    @staticmethod
    def release_bed_and_admit_next(db: Session, hospital_id: str, discharged_encounter: EDEncounter):
        """
        Frees the discharged encounter's bed and immediately admits the next highest-priority
        waiting patient into that bed, moving them from WAITING to IN_TREATMENT.
        """
        freed_bed = discharged_encounter.bed_number
        discharged_encounter.bed_number = None
        discharged_encounter.status = EncounterStatusEnum.DISCHARGED
        db.commit()

        if not freed_bed:
            return

        # Find waiting patients for this hospital
        waiting_encounters = db.query(EDEncounter).filter(
            EDEncounter.hospital_id == hospital_id,
            EDEncounter.status == EncounterStatusEnum.WAITING,
            EDEncounter.bed_number.is_(None)
        ).all()

        if not waiting_encounters:
            return

        def get_waiting_priority(enc):
            latest_tr = db.query(TriageAssessment).filter(
                TriageAssessment.encounter_id == enc.encounter_id
            ).order_by(TriageAssessment.assessed_at.desc()).first()
            lvl = latest_tr.triage_level if latest_tr else 3
            arrival = enc.arrival_time or enc.created_at
            return (lvl, arrival)

        waiting_encounters.sort(key=get_waiting_priority)
        next_patient = waiting_encounters[0]
        next_patient.bed_number = freed_bed
        next_patient.status = EncounterStatusEnum.IN_TREATMENT
        db.commit()
