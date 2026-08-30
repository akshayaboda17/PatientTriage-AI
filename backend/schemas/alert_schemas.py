from pydantic import BaseModel, Field

class AlertResolutionInput(BaseModel):
    resolution_reason: str = Field(..., min_length=3, max_length=1000, description="Clinical reason for resolving the alert")

class AlertDismissalInput(BaseModel):
    dismissal_reason: str = Field(..., min_length=3, max_length=1000, description="Clinical rationale for dismissing the alert")
