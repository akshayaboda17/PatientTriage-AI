from typing import Optional
from pydantic import BaseModel, Field
from models import AIAgreementEnum, ClinicalDecisionEnum

class ClinicalDecisionRequest(BaseModel):
    clinical_assessment: Optional[str] = Field(None, max_length=5000, description="Physician's clinical assessment / findings")
    ai_agreement: AIAgreementEnum = Field(default=AIAgreementEnum.AGREED, description="Whether physician agrees with AI risk assessment")
    clinician_assigned_risk: Optional[str] = Field(None, max_length=50, description="Clinician's determined risk category")
    override_reason: Optional[str] = Field(None, max_length=1000, description="Structured rationale required if overriding AI assessment")
    clinical_notes: Optional[str] = Field(None, max_length=5000, description="Additional physician notes and clinical context")
    clinical_decision: ClinicalDecisionEnum = Field(default=ClinicalDecisionEnum.CONTINUE_EVALUATION, description="Next step / clinical disposition")
