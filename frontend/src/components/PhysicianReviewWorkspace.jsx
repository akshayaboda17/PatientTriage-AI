import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  ArrowLeft, Stethoscope, Activity, Heart, ShieldAlert, Sparkles, 
  FileText, CheckCircle2, AlertTriangle, Clock, RefreshCw, AlertOctagon,
  ChevronRight, ShieldCheck, Check, Info
} from 'lucide-react';
import { PatientDemographicsCard } from './patient/PatientDemographicsCard';
import { VitalsProgressionTable } from './patient/VitalsProgressionTable';
import { AiRiskCard } from './patient/AiRiskCard';
import { ExplainabilityCard } from './patient/ExplainabilityCard';
import { LoadingSkeleton, EmptyState, ErrorState, AcuityBadge, SafetyStatusBadge } from './common/StateViews';

export const PhysicianReviewWorkspace = ({ encounterId, onBack, onDecisionSaved }) => {
  const { authHeaders, hasPermission, addToast, currentStaff } = useAuth();
  
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Decision Form State
  const [aiAgreement, setAiAgreement] = useState('AGREED'); // 'AGREED' | 'PARTIALLY_AGREED' | 'OVERRIDDEN'
  const [clinicianAssignedRisk, setClinicianAssignedRisk] = useState('MODERATE');
  const [overrideReason, setOverrideReason] = useState('Clinical context not represented in model input');
  const [clinicalAssessment, setClinicalAssessment] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [clinicalDecision, setClinicalDecision] = useState('CONTINUE_EVALUATION');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchReviewData();
  }, [encounterId, authHeaders['X-Hospital-Id']]);

  const fetchReviewData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/encounters/${encounterId}/clinical-review`, {
        headers: authHeaders
      });
      if (res.status === 403) {
        setError("Access Denied: Cross-hospital encounter access or insufficient review permissions.");
        return;
      }
      if (!res.ok) {
        throw new Error(`Failed to load encounter review workspace (HTTP ${res.status})`);
      }
      const json = await res.json();
      setData(json);
      if (json.ai_risk) {
        setClinicianAssignedRisk(json.ai_risk.risk_category || 'MODERATE');
      }
    } catch (err) {
      console.error('Review data load error:', err);
      setError(err.message || 'Network error loading clinical review workspace.');
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
        ai_agreement: aiAgreement,
        clinician_assigned_risk: clinicianAssignedRisk,
        override_reason: aiAgreement === 'OVERRIDDEN' ? overrideReason.trim() : undefined,
        clinical_assessment: clinicalAssessment.trim() || undefined,
        clinical_notes: clinicalNotes.trim() || undefined,
        clinical_decision: clinicalDecision
      };

      const res = await fetch(`/api/encounters/${encounterId}/physician-review`, {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const resData = await res.json();
        addToast(`Clinical review documented successfully. Outcome recorded.`, "success");
        fetchReviewData();
        if (onDecisionSaved) onDecisionSaved();
      } else {
        const err = await res.json().catch(() => ({}));
        addToast(err.detail || "Failed to save clinical decision.", "error");
      }
    } catch (err) {
      addToast("Network error submitting physician review.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <LoadingSkeleton type="cards" />;
  }

  if (error || !data || !data.encounter) {
    return (
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-8 space-y-4 text-center">
        <ErrorState
          title="Clinical Review Unavailable"
          message={error || "Encounter record not found or inaccessible."}
          onRetry={onBack}
          retryText="Return to Queue"
        />
      </div>
    );
  }

  const { encounter, patient, triage, vitals_history = [], ai_risk, ai_explanation, review_history = [] } = data;
  const isSafetyEscalate = ai_risk?.safety_status === 'ESCALATE' || encounter.safety_status === 'ESCALATE';

  return (
    <div className="space-y-6">
      
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
            title="Back to ED Queue"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-white tracking-tight">Physician Clinical Decision Console</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-slate-950 text-indigo-300 border border-slate-800">
                ENC: #{encounter.encounter_id}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Review AI deterioration probability, evaluate SHAP feature attribution, and document disposition
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchReviewData}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh Chart</span>
          </button>
        </div>
      </div>

      {/* Safety Escalation Warning Banner (if triggered) */}
      {isSafetyEscalate && (
        <div className="p-4 bg-rose-950/90 border border-rose-600 rounded-2xl text-rose-200 flex items-center justify-between text-xs shadow-lg shadow-rose-950/50 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-rose-600 text-white">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-sm text-rose-100">MANDATORY PHYSICIAN ESCALATION ACTIVE</div>
              <div className="text-[11px] text-rose-200/90 mt-0.5">
                AI prediction uncertainty or clinical discordance detected. Patient requires immediate bedside examination before discharge.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Patient Demographics Banner */}
      <PatientDemographicsCard patient={patient} encounter={encounter} triage={triage} />

      {/* Main 2-Column Clinical Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        
        {/* LEFT COLUMN (Span 3): Vitals, AI Risk, SHAP Explainability */}
        <div className="lg:col-span-3 space-y-6">
          
          {/* Longitudinal Vital Signs Progression */}
          <VitalsProgressionTable observations={vitals_history} />

          {/* AI Risk Assessment */}
          <AiRiskCard aiRisk={ai_risk} />

          {/* SHAP Explainability */}
          <ExplainabilityCard aiExplanation={ai_explanation} />

          {/* Review History / Prior Assessments */}
          {review_history && review_history.length > 0 && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                <Clock className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-white">Prior Physician Reviews ({review_history.length})</h3>
              </div>

              <div className="space-y-2.5">
                {review_history.map((rev, idx) => (
                  <div key={idx} className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 space-y-1 text-xs">
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="font-bold">{rev.physician_name || rev.physician_id}</span>
                      <span className="text-[10px] font-mono text-slate-500">
                        {rev.created_at ? new Date(rev.created_at).toLocaleString() : 'Past Review'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 font-mono">
                        AI: {rev.ai_agreement}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                        Decision: {rev.clinical_decision}
                      </span>
                    </div>
                    {rev.clinical_assessment && (
                      <p className="text-slate-400 text-[11px] mt-1">{rev.clinical_assessment}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN (Span 2): Physician Decision Console Form */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5 sticky top-20 border-t-4 border-t-indigo-500">
            
            <div className="flex items-center gap-2.5 border-b border-slate-800 pb-3">
              <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
                <Stethoscope className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight">Clinical Decision Console</h3>
                <p className="text-[11px] text-slate-400">Physician-signed evaluation &amp; disposition</p>
              </div>
            </div>

            <form onSubmit={handleSaveDecision} className="space-y-4 text-xs">
              
              {/* 1. AI Agreement Radio Group */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  1. Clinical Alignment with AI Assessment <span className="text-rose-400">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setAiAgreement('AGREED')}
                    className={`py-2 px-2 rounded-xl font-bold text-[11px] border transition-all cursor-pointer text-center ${
                      aiAgreement === 'AGREED'
                        ? 'bg-emerald-950/90 text-emerald-300 border-emerald-600 shadow-md shadow-emerald-950/40'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    ✓ Agree
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiAgreement('PARTIALLY_AGREED')}
                    className={`py-2 px-2 rounded-xl font-bold text-[11px] border transition-all cursor-pointer text-center ${
                      aiAgreement === 'PARTIALLY_AGREED'
                        ? 'bg-amber-950/90 text-amber-300 border-amber-600 shadow-md shadow-amber-950/40'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    ~ Partial
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiAgreement('OVERRIDDEN')}
                    className={`py-2 px-2 rounded-xl font-bold text-[11px] border transition-all cursor-pointer text-center ${
                      aiAgreement === 'OVERRIDDEN'
                        ? 'bg-rose-950/90 text-rose-300 border-rose-600 shadow-md shadow-rose-950/40'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    ✕ Override
                  </button>
                </div>
              </div>

              {/* Mandatory Structured Override Reason (if OVERRIDDEN) */}
              {aiAgreement === 'OVERRIDDEN' && (
                <div className="space-y-1.5 p-3.5 rounded-2xl bg-rose-950/40 border border-rose-800/80">
                  <label className="block text-[11px] font-bold text-rose-300 uppercase tracking-wider">
                    Mandatory Structured Override Rationale <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    className="w-full bg-slate-950 border border-rose-700/60 rounded-xl p-2.5 text-xs text-rose-100 font-medium focus:outline-none focus:border-rose-400 cursor-pointer"
                  >
                    <option value="Clinical context not represented in model input">Clinical context not represented in model input</option>
                    <option value="Atypical pediatric or geriatric vital presentation">Atypical pediatric or geriatric vital presentation</option>
                    <option value="Acute trajectory change not captured in intake triage">Acute trajectory change not captured in intake triage</option>
                    <option value="Subjective pain severity discordant with vitals">Subjective pain severity discordant with vitals</option>
                    <option value="Under-triage safety escalation by attending physician">Under-triage safety escalation by attending physician</option>
                  </select>
                </div>
              )}

              {/* 2. Clinician Assigned Risk Level */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  2. Attending Clinician Assigned Risk Tier
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {['LOW', 'MODERATE', 'HIGH', 'CRITICAL'].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setClinicianAssignedRisk(r)}
                      className={`py-1.5 rounded-xl text-[10px] font-black border transition-all cursor-pointer ${
                        clinicianAssignedRisk === r
                          ? r === 'CRITICAL' || r === 'HIGH'
                            ? 'bg-rose-600 text-white border-rose-500'
                            : r === 'MODERATE'
                            ? 'bg-amber-500 text-slate-950 border-amber-400'
                            : 'bg-emerald-600 text-white border-emerald-500'
                          : 'bg-slate-950 text-slate-400 border-slate-800'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. Clinical Assessment Narrative */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  3. Clinical Assessment &amp; Bedside Findings
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Patient presents with acute respiratory distress, tachypneic at 28/min..."
                  value={clinicalAssessment}
                  onChange={(e) => setClinicalAssessment(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* 4. Action / Disposition */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  4. Clinical Disposition &amp; Next Action <span className="text-rose-400">*</span>
                </label>
                <select
                  value={clinicalDecision}
                  onChange={(e) => setClinicalDecision(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 font-semibold focus:outline-none focus:border-cyan-500 cursor-pointer"
                >
                  <option value="CONTINUE_EVALUATION">Continue ED Monitoring &amp; Observation</option>
                  <option value="ESCALATE_CARE">Escalate to Resuscitation / Immediate Attending</option>
                  <option value="ADMIT_ICU">Immediate Admission to Intensive Care Unit (ICU)</option>
                  <option value="ADMIT_WARD">Admit to General Inpatient Ward</option>
                  <option value="CONSULT_SPECIALIST">Stat Specialist Consultation</option>
                  <option value="DISCHARGE_SAFE">Discharge Home with Safety Instructions</option>
                </select>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:opacity-90 text-white font-bold text-xs shadow-lg shadow-indigo-950/60 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                <Stethoscope className={`w-4 h-4 ${submitting ? 'animate-spin' : ''}`} />
                <span>{submitting ? 'Signing Decision...' : 'Sign & Document Clinical Decision'}</span>
              </button>

              <div className="text-[10px] text-slate-500 text-center font-mono">
                Attending Staff: {currentStaff.name} ({currentStaff.staff_id})
              </div>
            </form>
          </div>
        </div>

      </div>
    </div>
  );
};
