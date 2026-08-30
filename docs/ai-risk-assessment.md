# AI Risk Assessment (Task 7)

## Development-model notice

This is a development adapter and is **not clinically validated**. It must not be used to diagnose, treat, discharge, admit, transfer, or otherwise replace clinician judgement.

## Prediction contract

- **Model:** Existing Triage Classifier Development Adapter
- **Version:** `AI_RISK_MODEL_VERSION` or `1.0.0-dev`
- **Target:** Probability the configured triage classifier assigns ESI 1 or ESI 2 at the current assessment.
- **Horizon:** Current ED presentation; it does not predict future deterioration.
- **Inputs (schema 1.0):** Patient age/gender plus latest encounter-only heart rate, systolic blood pressure, respiratory rate, SpO2, and GCS. Triage-record presence is retained as provenance.
- **Missing data:** No prediction is made. An immutable `UNAVAILABLE` record is stored with `INSUFFICIENT_CLINICAL_DATA`.
- **Model or prediction failure:** An immutable `FAILED` record and audit entry are retained, while the create endpoint returns a generic `503` response without internal error details.
- **Preprocessing:** Matches the existing classifier input mapping: gender encoding, configured facility defaults, and shock-index derivation.
- **Output:** Numeric probability `[0, 1]` plus a development-only display category (`LOW < .30`, `MODERATE < .70`, otherwise `HIGH`). These display bands are not clinical thresholds.

## API

All endpoints require an active authenticated staff account, `ai:view`, and encounter ownership by the user’s hospital.

- `POST /api/v1/encounters/{encounter_id}/ai/risk-assessments` — create an immutable assessment from stored clinical data.
- `GET /api/v1/encounters/{encounter_id}/ai/risk-assessments` — assessment history, newest first.
- `GET /api/v1/encounters/{encounter_id}/ai/risk-assessments/latest` — latest assessment or `null`.

No patient name, contact information, address, or identifiers beyond the internal encounter context are sent to the model. The stored input snapshot retains only model features and vital/triage record references for reproducibility.
