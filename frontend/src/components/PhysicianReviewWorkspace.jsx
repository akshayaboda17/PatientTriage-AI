import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  ArrowLeft, Activity, Heart, ShieldAlert, Sparkles, FileText, 
  CheckCircle2, AlertOctagon, UserCheck, Stethoscope, Clock, 
  Check, Shield, ChevronRight, RefreshCw, Send, AlertTriangle,
  History, Info, Scale
} from 'lucide-react';

export const PhysicianReviewWorkspace = ({ encounterId, onBack, onDecisionSaved }) => {
  const { authHeaders, hasPermission, addToast, currentStaff } = useAuth();
  
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Form State
  const [aiAgreement, setAiAgreement] = useState('AGREED'); // 'AGREED' or 'OVERRIDDEN'
  const [clinicianAssignedRisk, setClinicianAssignedRisk] = useState('MODERATE');
  const [overrideReason, setOverrideReason] = useState('Clinical context not represented in model input');
  const [clinicalAssessment, setClinicalAssessment] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [clinicalDecision, setClinicalDecision] = useState('CONTINUE_EVALUATION');
  const [submitting, setSubmitting] = useState(false);

  // Alert Action Modal State
  const [selectedAlertForAction, setSelectedAlertForAction] = useState(null);
  const [resolutionReason, setResolutionReason] = useState('');
  const [submittingAlertAction, setSubmittingAlertAction] = useState(false);

  useEffect(() => {
    fetchReviewData();
  }, [encounterId, authHeaders['X-Hospital-Id']]);

  const fetchReviewData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/encounters/${encounterId}/clinical-review`, {
        headers: authHeaders
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
        if (json.ai_risk) {
          setClinicianAssignedRisk(json.ai_risk.risk_category);
        }
      } else if (res.status === 403) {
        addToast("Cross-hospital access forbidden.", "error");
        onBack();
      } else {
        addToast("Failed to load clinical review workspace.", "error");
      }
    } catch (err) {
      addToast("Network error loading clinical review.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDecision = async (e) => {
    e.preventDefault();

    if (!hasPermission('clinical_decision:create')) {
      addToast("Access Denied: Your role does not have 'clinical_decision:create' permission.", "error");
      return;
    }

    if (aiAgreement === 'OVERRIDDEN') {
      if (!hasPermission('ai:override')) {
        addToast("Access Denied: Your role cannot override AI assessments.", "error");
        return;
      }
      if (!overrideReason.trim()) {
        addToast("Structured override reason is mandatory when overriding AI assessment.", "warning");
        return;
      }
    }

    if (!clinicalDecision) {
      addToast("Clinical decision / next step is required.", "warning");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        clinical_assessment: clinicalAssessment.trim() || undefined,
        ai_agreement: aiAgreement,
        clinician_assigned_risk: aiAgreement === 'OVERRIDDEN' ? clinicianAssignedRisk : (data?.ai_risk?.risk_category || 'HIGH'),
        override_reason: aiAgreement === 'OVERRIDDEN' ? overrideReason : undefined,
        clinical_notes: clinicalNotes.trim() || undefined,
        clinical_decision: clinicalDecision
      };

      const res = await fetch(`/api/encounters/${encounterId}/clinical-decision`, {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const result = await res.json();
        addToast(
          aiAgreement === 'OVERRIDDEN'
            ? "AI Override & Clinical Decision saved successfully."
            : "Physician Clinical Decision recorded successfully.",
          "success",
          10000
        );
        fetchReviewData();
        if (onDecisionSaved) onDecisionSaved();
      } else {
        const err = await res.json();
        addToast(err.detail || "Failed to save clinical decision.", "error");
      }
    } catch (err) {
      addToast("Network error saving decision.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAcknowledgeAlert = async (alertId) => {
    if (!hasPermission('alert:acknowledge')) {
      addToast("Access Denied: You need 'alert:acknowledge' permission.", "error");
      return;
    }
    try {
      const res = await fetch(`/api/alerts/${alertId}/acknowledge`, {
        method: 'POST',
        headers: authHeaders
      });
      if (res.ok) {
        addToast(`Alert ${alertId} acknowledged.`, 'success', 10000);
        fetchReviewData();
      } else {
        const err = await res.json();
        addToast(err.detail || "Failed to acknowledge.", "error");
      }
    } catch (err) {
      addToast("Network error acknowledging alert.", "error");
    }
  };

  const handleResolveAlert = async () => {
    if (!resolutionReason.trim()) {
      addToast("Resolution note is required.", "warning");
      return;
    }
    setSubmittingAlertAction(true);
    try {
      const res = await fetch(`/api/alerts/${selectedAlertForAction.alert_id}/resolve`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution_reason: resolutionReason })
      });
      if (res.ok) {
        addToast(`Alert ${selectedAlertForAction.alert_id} resolved.`, 'success', 10000);
        setSelectedAlertForAction(null);
        setResolutionReason('');
        fetchReviewData();
      } else {
        const err = await res.json();
        addToast(err.detail || "Failed to resolve.", "error");
      }
    } catch (err) {
      addToast("Network error resolving alert.", "error");
    } finally {
      setSubmittingAlertAction(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-400 space-y-3">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="text-sm font-medium">Consolidating patient chart & AI decision-support data...</p>
      </div>
    );
  }

  if (!data || !data.encounter) {
    return (
      <div className="p-12 text-center text-slate-400 text-sm">
        <p>Encounter not found or inaccessible.</p>
        <button onClick={onBack} className="mt-4 px-4 py-2 bg-slate-800 text-slate-200 rounded-xl text-xs">
          Return to ED Queue
        </button>
      </div>
    );
  }

  const { encounter, patient, observations, triage, ai_risk, ai_explanation, alerts, physician_assessments, timeline } = data;

  const decisionOptions = [
    { id: 'CONTINUE_EVALUATION', label: 'Continue ED Evaluation', desc: 'Maintain current monitoring and order ongoing diagnostic workup.' },
    { id: 'ESCALATE_CARE', label: 'Escalate Care / Resuscitation', desc: 'Transfer immediately to critical care bay / resuscitation team.' },
    { id: 'ADMIT_INPATIENT', label: 'Admit to Inpatient Unit', desc: 'Admit to hospital general medical/surgical or telemetry floor.' },
    { id: 'OBSERVATION_UNIT', label: 'Observation Unit', desc: 'Place in short-stay clinical decision unit (CDU/ED-OU).' },
    { id: 'DISCHARGE_HOME', label: 'Discharge Home', desc: 'Safe for discharge with outpatient primary care follow-up.' },
    { id: 'TRANSFER_FACILITY', label: 'Transfer Facility', desc: 'Arrange inter-facility transfer for tertiary level specialty care.' },
    { id: 'OTHER', label: 'Other Clinical Pathway', desc: 'Specialized clinical protocol or palliative pathway.' }
  ];

  return (
    <div className="space-y-6">
      
      {/* Top Header & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Queue</span>
          </button>
          
          <div className="h-4 w-px bg-slate-800 hidden sm:block" />

          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-950/80 border border-indigo-700/60 text-indigo-300 text-xs font-semibold">
              <Stethoscope className="w-3.5 h-3.5" />
              <span>Physician Review Console</span>
            </span>
          </div>
        </div>

        {/* Authenticated Physician Badge */}
        <div className="flex items-center gap-2.5 bg-slate-900/90 border border-slate-800 px-3.5 py-1.5 rounded-xl text-xs">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-slate-400">Reviewing Clinician:</span>
          <strong className="text-slate-100 font-bold">{currentStaff.name} ({currentStaff.role})</strong>
        </div>
      </div>

      {/* Patient Demographic & Encounter Banner */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-cyan-400 font-black text-lg shrink-0">
              {patient.first_name[0]}{patient.last_name[0]}
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl font-black text-white">{patient.full_name}</h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">
                  {encounter.status}
                </span>
                {triage && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-950 text-amber-300 border border-amber-800">
                    ESI Level {triage.triage_level} ({triage.acuity_category})
                  </span>
                )}
              </div>
              
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 mt-1.5 font-mono">
                <span>Patient ID: <strong className="text-slate-200">{patient.patient_id}</strong></span>
                <span>Encounter ID: <strong className="text-slate-200">{encounter.encounter_id}</strong></span>
                <span>Age: <strong className="text-slate-200">{patient.age}y</strong></span>
                <span>Gender: <strong className="text-slate-200">{patient.gender}</strong></span>
                <span>Bed: <strong className="text-slate-200">{encounter.bed_number || 'Waiting Room'}</strong></span>
                <span>Arrival: <strong className="text-slate-200">{encounter.arrival_mode}</strong></span>
              </div>
            </div>
          </div>

          <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 max-w-md w-full">
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Chief Complaint</div>
            <div className="text-xs font-semibold text-slate-100 mt-0.5">{encounter.chief_complaint}</div>
          </div>
        </div>
      </div>

      {/* Task 9 Active Alerts Notice (if any) */}
      {alerts && alerts.length > 0 && (
        <div className="bg-slate-900/90 border border-rose-900/40 rounded-2xl p-5 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-rose-400 animate-pulse" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Task 9: Active Deterioration Alerts</h3>
            </div>
            <span className="text-xs text-slate-400 font-mono">{alerts.length} alerts logged</span>
          </div>

          <div className="space-y-2.5">
            {alerts.map((alert) => (
              <div
                key={alert.alert_id}
                className={`p-3.5 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                  alert.status === 'UNACKNOWLEDGED'
                    ? 'bg-rose-950/30 border-rose-600/60'
                    : alert.status === 'ACKNOWLEDGED'
                    ? 'bg-slate-950 border-amber-500/40'
                    : 'bg-slate-950/50 border-slate-800'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                      {alert.severity}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-900 text-slate-300 border border-slate-700">
                      {alert.status}
                    </span>
                    <span className="text-xs font-mono text-slate-400">{alert.alert_id}</span>
                  </div>
                  <p className="text-xs font-semibold text-slate-100">{alert.summary}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {alert.status === 'UNACKNOWLEDGED' && hasPermission('alert:acknowledge') && (
                    <button
                      onClick={() => handleAcknowledgeAlert(alert.alert_id)}
                      className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow"
                    >
                      Acknowledge
                    </button>
                  )}
                  {alert.status === 'ACKNOWLEDGED' && hasPermission('alert:resolve') && (
                    <button
                      onClick={() => {
                        setSelectedAlertForAction(alert);
                        setResolutionReason('');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow"
                    >
                      Resolve Alert
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3-Column Consolidated Clinical Review Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Triage Intake & Longitudinal Vitals (Task 5 & 6) */}
        <div className="space-y-6">
          
          {/* Triage Intake Card */}
          {triage && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Triage Intake (Task 5)</h3>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">
                  {new Date(triage.assessed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-400">Assigned Acuity</div>
                  <div className="text-base font-black text-amber-400 mt-0.5">
                    ESI Level {triage.triage_level} — {triage.acuity_category}
                  </div>
                </div>
                <span className="text-xs text-slate-400 font-mono">Nurse: {triage.assessed_by}</span>
              </div>

              <div className="text-xs text-slate-300 space-y-1.5">
                <div><span className="text-slate-400">Presenting Complaint:</span> <strong>{triage.chief_complaint}</strong></div>
                {triage.notes && <div><span className="text-slate-400">Triage Notes:</span> <em>{triage.notes}</em></div>}
              </div>
            </div>
          )}

          {/* Longitudinal Vital Signs Progression (Task 6) */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Heart className="w-4 h-4 text-rose-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Vital Signs History (Task 6)</h3>
              </div>
              <span className="text-xs text-slate-400 font-mono">{observations.length} readings</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300 font-mono">
                <thead className="bg-slate-950/80 text-slate-400 uppercase text-[9px] font-bold border-b border-slate-800">
                  <tr>
                    <th className="py-2 px-1.5">Time</th>
                    <th className="py-2 px-1.5">SpO₂</th>
                    <th className="py-2 px-1.5">HR</th>
                    <th className="py-2 px-1.5">RR</th>
                    <th className="py-2 px-1.5">BP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {observations.map((obs, idx) => {
                    const prev = idx > 0 ? observations[idx - 1] : null;
                    const spo2Delta = prev ? obs.spo2 - prev.spo2 : 0;
                    return (
                      <tr key={idx} className="hover:bg-slate-800/30">
                        <td className="py-2 px-1.5 text-slate-400 text-[10px]">
                          {new Date(obs.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-2 px-1.5">
                          <strong className={obs.spo2 < 90 ? 'text-rose-400' : 'text-slate-200'}>{obs.spo2}%</strong>
                          {spo2Delta !== 0 && (
                            <span className={`ml-1 text-[9px] ${spo2Delta < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                              ({spo2Delta > 0 ? `+${spo2Delta}` : spo2Delta})
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-1.5 text-slate-200">{obs.hr}</td>
                        <td className="py-2 px-1.5 text-slate-200">{obs.rr}</td>
                        <td className="py-2 px-1.5 text-slate-400 text-[10px]">{obs.sbp}/{obs.dbp || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* Middle Column: AI Risk & Explainability (Task 7 & 8) */}
        <div className="space-y-6">
          
          {/* AI Risk Assessment Card (Task 7) */}
          {ai_risk && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">AI Risk Assessment (Task 7)</h3>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-mono">
                  {ai_risk.model_name || 'AI Model'} v{ai_risk.model_version}
                </span>
              </div>

              <div className="bg-slate-950/90 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">AI Estimated Risk</div>
                  <div className="text-2xl font-black text-cyan-300 mt-0.5">{ai_risk.risk_score}%</div>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-black border ${
                  ai_risk.risk_category === 'HIGH' ? 'bg-rose-950 text-rose-300 border-rose-700' :
                  ai_risk.risk_category === 'MODERATE' ? 'bg-amber-950 text-amber-300 border-amber-700' :
                  'bg-emerald-950 text-emerald-300 border-emerald-700'
                }`}>
                  {ai_risk.risk_category} RISK
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                  <div className="text-slate-400 text-[10px]">Shock Index</div>
                  <div className="font-bold text-slate-200 text-sm">{ai_risk.shock_index || '0.75'}</div>
                </div>
                <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                  <div className="text-slate-400 text-[10px]">qSOFA Score</div>
                  <div className="font-bold text-slate-200 text-sm">{ai_risk.qsofa} / 3</div>
                </div>
              </div>
            </div>
          )}

          {/* AI Explainability Drivers (Task 8) */}
          {ai_explanation && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Explainable AI Drivers (Task 8)</h3>
              </div>

              <p className="text-xs text-slate-300 bg-slate-950/80 p-3 rounded-xl border border-slate-800 leading-relaxed">
                {ai_explanation.summary}
              </p>

              {ai_explanation.top_features && (
                <div className="space-y-2">
                  <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Top SHAP Feature Contributors</div>
                  {ai_explanation.top_features.map((feat, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs bg-slate-950/60 p-2 rounded-lg border border-slate-800">
                      <span className="font-medium text-slate-300">{feat.feature} ({feat.value})</span>
                      <span className="font-mono font-bold text-rose-400">{feat.impact}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Right Column: HUMAN-IN-THE-LOOP CLINICAL DECISION WORKSPACE (Task 10) */}
        <div className="space-y-6">
          
          <form
            onSubmit={handleSaveDecision}
            className="bg-slate-900/95 border-2 border-indigo-500/40 rounded-2xl p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Scale className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-black text-white uppercase tracking-wider">
                  Human-In-The-Loop Decision (Task 10)
                </h3>
              </div>
            </div>

            {/* Clinical Safety Banner */}
            <div className="flex items-start gap-2 bg-indigo-950/30 border border-indigo-800/40 rounded-xl p-2.5 text-[11px] text-indigo-200">
              <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
              <span>AI recommendations provide decision support. The licensed clinician remains the final authority.</span>
            </div>

            {/* Step 1: AI Agreement Selection */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-200">
                1. AI Risk Agreement & Review
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAiAgreement('AGREED')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    aiAgreement === 'AGREED'
                      ? 'bg-emerald-950/50 border-emerald-500 text-white shadow-md shadow-emerald-950/40'
                      : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs">
                    <CheckCircle2 className={`w-3.5 h-3.5 ${aiAgreement === 'AGREED' ? 'text-emerald-400' : 'text-slate-500'}`} />
                    <span>Agree with AI</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">Concur with AI risk score ({data?.ai_risk?.risk_category || 'HIGH'})</div>
                </button>

                <button
                  type="button"
                  onClick={() => setAiAgreement('OVERRIDDEN')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    aiAgreement === 'OVERRIDDEN'
                      ? 'bg-amber-950/50 border-amber-500 text-white shadow-md shadow-amber-950/40'
                      : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs">
                    <AlertTriangle className={`w-3.5 h-3.5 ${aiAgreement === 'OVERRIDDEN' ? 'text-amber-400' : 'text-slate-500'}`} />
                    <span>Override AI</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">Disagree & record clinician assessment</div>
                </button>
              </div>
            </div>

            {/* Step 2: Override Specific Controls (Only if OVERRIDDEN) */}
            {aiAgreement === 'OVERRIDDEN' && (
              <div className="bg-slate-950/90 border border-amber-500/40 rounded-xl p-3.5 space-y-3 animate-in fade-in duration-150">
                <div>
                  <label className="block text-[11px] font-bold text-amber-300 mb-1">
                    Clinician Determined Risk Level *
                  </label>
                  <select
                    value={clinicianAssignedRisk}
                    onChange={(e) => setClinicianAssignedRisk(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-semibold text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="LOW">LOW Risk</option>
                    <option value="MODERATE">MODERATE Risk</option>
                    <option value="HIGH">HIGH Risk</option>
                    <option value="CRITICAL">CRITICAL Risk</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-amber-300 mb-1">
                    Structured Override Reason *
                  </label>
                  <select
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="Clinical context not represented in model input">Clinical context not represented in model input</option>
                    <option value="Physical examination findings">Physical examination findings</option>
                    <option value="Recent clinical treatment / intervention response">Recent clinical treatment / intervention response</option>
                    <option value="Point-of-care diagnostics / lab discrepancy">Point-of-care diagnostics / lab discrepancy</option>
                    <option value="Clinical intuition & Gestalt assessment">Clinical intuition & Gestalt assessment</option>
                    <option value="Other (Mandatory Detailed Clinical Note)">Other (Mandatory Detailed Clinical Note)</option>
                  </select>
                </div>
              </div>
            )}

            {/* Step 3: Structured Clinical Assessment Text */}
            <div>
              <label className="block text-xs font-bold text-slate-200 mb-1">
                2. Physician Clinical Assessment & Exam Findings
              </label>
              <textarea
                rows={2}
                placeholder="e.g. Patient alert, lungs clear after bronchodilator treatment. Heart sounds normal."
                value={clinicalAssessment}
                onChange={(e) => setClinicalAssessment(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Step 4: Clinical Decision / Disposition */}
            <div>
              <label className="block text-xs font-bold text-slate-200 mb-1">
                3. Clinical Decision / Next Disposition *
              </label>
              <select
                value={clinicalDecision}
                onChange={(e) => setClinicalDecision(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs font-bold text-cyan-300 focus:outline-none focus:border-indigo-500"
              >
                {decisionOptions.map((opt) => (
                  <option key={opt.id} value={opt.id} className="bg-slate-900 text-white font-normal">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Additional Clinical Notes */}
            <div>
              <label className="block text-xs font-bold text-slate-200 mb-1">
                4. Additional Physician Documentation / Notes
              </label>
              <input
                type="text"
                placeholder="e.g. Plan for serial troponins and chest X-ray reassessment in 1 hour."
                value={clinicalNotes}
                onChange={(e) => setClinicalNotes(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-900/40 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              <span>{submitting ? 'Recording Decision...' : 'Save Clinical Decision'}</span>
            </button>
          </form>

        </div>

      </div>

      {/* Historical Physician Assessments Section (Preserving Version History) */}
      {physician_assessments && physician_assessments.length > 0 && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-400" />
            <h3 className="text-base font-bold text-white">Physician Assessment & Override History</h3>
          </div>

          <div className="space-y-3">
            {physician_assessments.map((pa, idx) => (
              <div
                key={pa.assessment_id || idx}
                className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-2"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${
                      pa.ai_agreement === 'OVERRIDDEN'
                        ? 'bg-amber-950 text-amber-300 border-amber-700'
                        : 'bg-emerald-950 text-emerald-300 border-emerald-700'
                    }`}>
                      {pa.ai_agreement === 'OVERRIDDEN' ? 'AI OVERRIDDEN' : 'AGREED WITH AI'}
                    </span>
                    <strong className="text-white">{pa.clinical_decision}</strong>
                    <span className="text-slate-400 font-mono">({pa.assessment_id})</span>
                  </div>
                  <span className="text-slate-400 font-mono text-[11px]">
                    {new Date(pa.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </div>

                {pa.ai_agreement === 'OVERRIDDEN' && (
                  <div className="text-xs bg-amber-950/20 border border-amber-900/30 rounded-lg p-2 text-amber-200">
                    <div><strong>Clinician Assigned Risk:</strong> {pa.clinician_assigned_risk} (Original AI: {pa.ai_risk_category_at_review || 'HIGH'})</div>
                    <div><strong>Override Reason:</strong> {pa.override_reason}</div>
                  </div>
                )}

                {pa.clinical_assessment && (
                  <div className="text-xs text-slate-300">
                    <span className="text-slate-400">Clinical Assessment:</span> {pa.clinical_assessment}
                  </div>
                )}

                {pa.clinical_notes && (
                  <div className="text-xs text-slate-400">
                    <span className="text-slate-500">Notes:</span> {pa.clinical_notes}
                  </div>
                )}

                <div className="text-[10px] text-slate-400 font-mono pt-1">
                  Documented by: <strong className="text-slate-300">{pa.physician_name} ({pa.physician_role})</strong>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unified Patient Clinical Timeline */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-cyan-400" />
          <h3 className="text-base font-bold text-white">Unified Patient Clinical Timeline</h3>
        </div>

        <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
          {timeline.map((item, idx) => (
            <div key={idx} className="relative group">
              <div className={`absolute -left-6 top-1 w-3.5 h-3.5 rounded-full border-2 border-slate-900 ${
                item.type === 'PHYSICIAN_OVERRIDE' ? 'bg-amber-500' :
                item.type === 'PHYSICIAN_DECISION' ? 'bg-indigo-500' :
                item.type.includes('ALERT') ? 'bg-rose-500' :
                item.type === 'AI_RISK' ? 'bg-cyan-500' : 'bg-slate-600'
              }`} />
              
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-200">{item.title}</span>
                  <span className="text-slate-400 font-mono text-[11px]">
                    {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-xs text-slate-400">{item.description}</p>
                <div className="text-[10px] text-slate-400 font-mono">Attributed to: {item.actor}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Alert Resolution Dialog Modal */}
      {selectedAlertForAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">Resolve Clinical Alert</h3>
              </div>
              <button onClick={() => setSelectedAlertForAction(null)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 text-xs text-slate-300 space-y-1">
              <div className="font-semibold text-slate-200">Alert ID: {selectedAlertForAction.alert_id}</div>
              <div className="text-slate-400">{selectedAlertForAction.summary}</div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Clinical Reassessment & Resolution Note *
              </label>
              <textarea
                rows={3}
                placeholder="e.g. Reassessed after oxygen administration and nebulizer. SpO2 normalized to 96%, respiratory rate 18, patient stable."
                value={resolutionReason}
                onChange={(e) => setResolutionReason(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setSelectedAlertForAction(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                disabled={submittingAlertAction || !resolutionReason.trim()}
                onClick={handleResolveAlert}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 shadow-md"
              >
                {submittingAlertAction ? 'Resolving...' : 'Confirm Resolution'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
