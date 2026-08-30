from routers.auth import router as auth_router
from routers.patients import router as patients_router
from routers.encounters import router as encounters_router
from routers.triage import router as triage_router
from routers.vitals import router as vitals_router
from routers.ai import router as ai_router
from routers.alerts import router as alerts_router
from routers.physician import router as physician_router
from routers.audit import router as audit_router
from routers.staff import router as staff_router
from routers.demo import router as demo_router

__all__ = [
    "auth_router",
    "patients_router",
    "encounters_router",
    "triage_router",
    "vitals_router",
    "ai_router",
    "alerts_router",
    "physician_router",
    "audit_router",
    "staff_router",
    "demo_router"
]
