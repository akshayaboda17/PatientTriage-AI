"""
Centralized Hospital Scale, Safe Wait Thresholds, and ED Surge Configuration Service.
Provides configuration-driven parameters for Small, Medium, and Large ED facilities,
customizable safe wait-time thresholds, and 3x surge simulation mode.
"""
from enum import Enum
from typing import Dict, Any, Optional


class HospitalScaleEnum(str, Enum):
    SMALL_ED = "SMALL_ED"        # Community / Rural ED (20–40 daily volume, 8 beds)
    MEDIUM_ED = "MEDIUM_ED"      # Suburban General ED (150–200 daily volume, 25 beds)
    LARGE_ED = "LARGE_ED"        # Academic / Level-1 Trauma Center (400–600 daily volume, 75 beds)


# In-Memory Configuration Registry per hospital_id (or defaults)
HOSPITAL_CONFIGS: Dict[str, Dict[str, Any]] = {}

# Default Hospital Scale Profiles
SCALE_PROFILES: Dict[HospitalScaleEnum, Dict[str, Any]] = {
    HospitalScaleEnum.SMALL_ED: {
        "scale_name": "Small Community ED",
        "normal_daily_volume": 40,
        "surge_daily_volume": 120,
        "bed_capacity": 8,
        "reassessment_interval_mins": 30,
        "wait_thresholds_mins": {
            1: 0,    # ESI 1: Immediate (0 mins)
            2: 10,   # ESI 2: 10 mins
            3: 30,   # ESI 3: 30 mins
            4: 60,   # ESI 4: 60 mins
            5: 90    # ESI 5: 90 mins
        }
    },
    HospitalScaleEnum.MEDIUM_ED: {
        "scale_name": "Medium Suburban ED",
        "normal_daily_volume": 200,
        "surge_daily_volume": 600,
        "bed_capacity": 25,
        "reassessment_interval_mins": 45,
        "wait_thresholds_mins": {
            1: 0,    # ESI 1: Immediate
            2: 15,   # ESI 2: 15 mins
            3: 45,   # ESI 3: 45 mins
            4: 90,   # ESI 4: 90 mins
            5: 120   # ESI 5: 120 mins
        }
    },
    HospitalScaleEnum.LARGE_ED: {
        "scale_name": "Large Academic Trauma Center",
        "normal_daily_volume": 500,
        "surge_daily_volume": 1500,
        "bed_capacity": 75,
        "reassessment_interval_mins": 60,
        "wait_thresholds_mins": {
            1: 0,    # ESI 1: Immediate
            2: 15,   # ESI 2: 15 mins
            3: 60,   # ESI 3: 60 mins
            4: 120,  # ESI 4: 120 mins
            5: 180   # ESI 5: 180 mins
        }
    }
}


class HospitalConfigService:
    """
    Manages tenant-specific hospital scale, safe wait-time thresholds, and ED surge mode.
    """

    @staticmethod
    def get_config(hospital_id: str) -> Dict[str, Any]:
        """
        Retrieves active configuration for a hospital tenant, falling back to MEDIUM_ED defaults.
        """
        if hospital_id not in HOSPITAL_CONFIGS:
            default_scale = HospitalScaleEnum.MEDIUM_ED
            profile = SCALE_PROFILES[default_scale]
            HOSPITAL_CONFIGS[hospital_id] = {
                "hospital_id": hospital_id,
                "scale": default_scale.value,
                "scale_name": profile["scale_name"],
                "normal_daily_volume": profile["normal_daily_volume"],
                "surge_daily_volume": profile["surge_daily_volume"],
                "bed_capacity": profile["bed_capacity"],
                "reassessment_interval_mins": profile["reassessment_interval_mins"],
                "wait_thresholds_mins": dict(profile["wait_thresholds_mins"]),
                "surge_mode_active": False,
                "surge_multiplier": 3.0,
                "surge_activated_at": None,
                "surge_activated_by": None
            }
        return HOSPITAL_CONFIGS[hospital_id]

    @staticmethod
    def set_scale(hospital_id: str, scale: HospitalScaleEnum) -> Dict[str, Any]:
        """
        Updates hospital operational scale profile.
        """
        profile = SCALE_PROFILES.get(scale, SCALE_PROFILES[HospitalScaleEnum.MEDIUM_ED])
        config = HospitalConfigService.get_config(hospital_id)
        config["scale"] = scale.value
        config["scale_name"] = profile["scale_name"]
        config["normal_daily_volume"] = profile["normal_daily_volume"]
        config["surge_daily_volume"] = profile["surge_daily_volume"]
        config["bed_capacity"] = profile["bed_capacity"]
        config["reassessment_interval_mins"] = profile["reassessment_interval_mins"]
        config["wait_thresholds_mins"] = dict(profile["wait_thresholds_mins"])
        return config

    @staticmethod
    def set_surge_mode(hospital_id: str, active: bool, staff_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Toggles 3x ED Surge Mode for the hospital tenant.
        """
        import datetime
        config = HospitalConfigService.get_config(hospital_id)
        config["surge_mode_active"] = active
        config["surge_activated_at"] = datetime.datetime.utcnow().isoformat() if active else None
        config["surge_activated_by"] = staff_id if active else None
        return config

    @staticmethod
    def get_wait_threshold_mins(hospital_id: str, triage_level: int) -> int:
        """
        Returns safe wait threshold in minutes for given triage level (ESI 1–5).
        """
        config = HospitalConfigService.get_config(hospital_id)
        thresholds = config.get("wait_thresholds_mins", {})
        val = thresholds.get(triage_level)
        if val is not None:
            return int(val)
        val = thresholds.get(str(triage_level))
        if val is not None:
            return int(val)
        return 60

    @staticmethod
    def evaluate_wait_time(hospital_id: str, triage_level: int, wait_mins: float) -> Dict[str, Any]:
        """
        Evaluates whether a waiting patient has exceeded their safe wait-time threshold.
        """
        threshold_mins = HospitalConfigService.get_wait_threshold_mins(hospital_id, triage_level)
        exceeded = wait_mins > threshold_mins
        approaching = (not exceeded) and (wait_mins >= threshold_mins * 0.75)

        status = "OK"
        if exceeded:
            status = "EXCEEDED"
        elif approaching:
            status = "APPROACHING"

        return {
            "triage_level": triage_level,
            "wait_mins": round(wait_mins, 1),
            "threshold_mins": threshold_mins,
            "status": status,
            "exceeded": exceeded,
            "approaching": approaching,
            "reassessment_required": exceeded
        }
