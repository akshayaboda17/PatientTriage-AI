import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  ArrowLeft, Stethoscope, Activity, Heart, ShieldAlert, Sparkles, 
  FileText, CheckCircle2, AlertTriangle, Clock, RefreshCw, AlertOctagon,
  ChevronRight, ShieldCheck, Check, Info, User
} from 'lucide-react';
import { PatientDemographicsCard } from './patient/PatientDemographicsCard';
import { VitalsProgressionTable } from './patient/VitalsProgressionTable';
import { AiRiskCard } from './patient/AiRiskCard';
import { ExplainabilityCard } from './patient/ExplainabilityCard';
import { LoadingSkeleton, EmptyState, ErrorState, AcuityBadge, SafetyStatusBadge } from './common/StateViews';
import { PRIORITY_LEVELS, getRiskCategoryMeta } from '../utils/terminology';

export const PhysicianReviewWorkspace = ({ encounterId, onBack, onDecisionSaved }) => {
  const { authHeaders, hasPermission, addToast, currentStaff } = useAuth();
  
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Decision Form State
  const [aiAgreement, setAiAgreement] = useState('AGREED'); // 'AGREED' | 'PARTIALLY_AGREED' | 'OVERRIDDEN'
  const [clinicianAssignedRisk, setClinicianAssignedRisk] = useState('MODERATE');
  const [overrideReason, setOverrideReason] = useState('Clinical context / history not captured in AI input');
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
        setError("Access Restricted: You need clinical review permissions to access this workspace.");
        return;
      }
      if (!res.ok) {
        throw new Error(`Failed to load patient review workspace (HTTP ${res.status})`);
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
      addToast("Access Restricted: You need 'clinical_decision:create' permission.", "error");
      return;
    }

    if (aiAgreement === 'OVERRIDDEN') {
      if (!hasPermission('ai:override')) {
        addToast("Access Restricted: Your role does not have permission to override AI assessments.", "error");
        return;
      }
      if (!overrideReason.trim()) {
        addToast("A clinical reason is required when overriding an AI assessment.", "warning");
        return;
      }
    }

    if (!clinicalDecision) {
      addToast("Recommended care plan / disposition is required.", "warning");
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
        addToast(`Clinical decision signed and saved successfully.`, "success");
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
    return (
      <div className="space-y-6">
        <div className="h-14 bg-slate-900 rounded-2xl animate-pulse" />
        <LoadingSkeleton type="cards" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Dashboard</span>
        </button>
        <ErrorState message={error} onRetry={fetchReviewData} />
      </div>
    );
  }

  const { encounter, patient, observations = [], ai_risk, ai_explanation, active_alerts = [], past_decisions = [] } = data || {};

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Return to Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-white tracking-tight">Physician Review &amp; Clinical Decision Workspace</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-800">
                Clinician-in-the-Loop
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Review AI risk assessments, evaluate vital signs progression, and sign the official care decision
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchReviewData}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Patient Header Summary */}
      {patient && (
        <PatientDemographicsCard
          patient={patient}
          encounter={encounter}
          onOpenCorrection={() => {}}
        />
      )}

      {/* Active Clinical Alerts Strip */}
      {active_alerts.length > 0 && (
        <div className="p-4 bg-rose-950/40 border border-rose-800/80 rounded-2xl space-y-2">
          <div className="flex items-center gap-2 text-rose-300 font-bold text-xs uppercase tracking-wider">
            <ShieldAlert className="w-4 h-4 text-rose-400 animate-pulse" />
            <span>Active Alerts Requiring Clinician Attention ({active_alerts.length})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {active_alerts.map((al) => (
              <div key={al.alert_id} className="p-2.5 bg-slate-950/80 rounded-xl border border-rose-900/60 text-slate-200">
                <span className="font-semibold text-rose-300">{al.message}</span>
                <div className="text-[10px] text-slate-500 font-mono mt-0.5">Alert #{al.alert_id}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dual Column Layout: Clinical Evidence (Left) vs Physician Decision Console (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT 7 COLS: Clinical Observations & AI Explanation */}
        <div className="lg:col-span-7 space-y-5">
          {/* AI Risk Assessment Card */}
          <AiRiskCard
            aiRisk={ai_risk}
            onGenerateAi={() => {}}
            generatingAi={false}
          />

          {/* AI Explanation / SHAP Card */}
          <ExplainabilityCard
            aiExplanation={ai_explanation}
          />

          {/* Longitudinal Vital Signs Progression */}
          <VitalsProgressionTable
            observations={observations}
            onOpenCorrection={() => {}}
          />
        </div>

        {/* RIGHT 5 COLS: Physician Decision Console */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5 sticky top-20">
            
            <div className="flex items-center gap-2.5 border-b border-slate-800 pb-3">
              <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
                <Stethoscope className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Sign Clinical Decision</h3>
                <p className="text-[11px] text-slate-400">Document physician assessment and care plan</p>
              </div>
            </div>

            <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-bold text-slate-400 uppercase tracking-wider">Clinical Autonomy Principle</span>
                <span className="font-mono text-cyan-400 bg-cyan-950/70 px-2 py-0.5 rounded border border-cyan-800/60 font-semibold text-[9px]">
                  AI recommendation ≠ final clinical decision
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-snug">
                The attending physician retains complete authority. All overrides and rationales are preserved immutably in the clinical audit trail.
              </p>
            </div>

            <form onSubmit={handleSaveDecision} className="space-y-4 text-xs">
              
              {/* AI Agreement Radio Group */}
              <div className="space-y-1.5">
                <label className="block font-bold text-slate-300 uppercase tracking-wider">
                  Clinician Agreement with AI Assessment *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'AGREED', label: 'Agree', sub: 'Concur with AI' },
                    { id: 'PARTIALLY_AGREED', label: 'Adjust', sub: 'Minor change' },
                    { id: 'OVERRIDDEN', label: 'Override', sub: 'Physician override' }
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setAiAgreement(opt.id)}
                      className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                        aiAgreement === opt.id
                          ? opt.id === 'OVERRIDDEN'
                            ? 'bg-rose-950/80 border-rose-600 text-rose-200'
                            : 'bg-indigo-950/80 border-indigo-500 text-indigo-200'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <div className="font-bold text-xs">{opt.label}</div>
                      <div className="text-[9px] opacity-75">{opt.sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Clinician-Assigned Risk Level */}
              <div className="space-y-1.5">
                <label className="block font-bold text-slate-300 uppercase tracking-wider">
                  Physician-Assigned Risk Level *
                </label>
                <select
                  value={clinicianAssignedRisk}
                  onChange={(e) => setClinicianAssignedRisk(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500 font-semibold cursor-pointer"
                >
                  <option value="CRITICAL">Critical Risk (Immediate Resuscitation)</option>
                  <option value="HIGH">High Risk (Emergent Assessment)</option>
                  <option value="MODERATE">Moderate Risk (Urgent Care)</option>
                  <option value="LOW">Low Risk (Non-Urgent Fast Track)</option>
                </select>
              </div>

              {/* Override Reason Dropdown (Only when OVERRIDDEN) */}
              {aiAgreement === 'OVERRIDDEN' && (
                <div className="space-y-1.5 p-3 rounded-2xl bg-rose-950/30 border border-rose-800/60 animate-in fade-in">
                  <label className="block font-bold text-rose-300 uppercase tracking-wider">
                    Clinical Reason for Overriding AI Assessment *
                  </label>
                  <select
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    className="w-full bg-slate-950 border border-rose-800 rounded-xl px-3 py-2 text-rose-200 focus:outline-none focus:border-rose-500 text-xs cursor-pointer"
                  >
                    <option value="Clinical context / history not captured in AI input">Clinical context / history not captured in AI input</option>
                    <option value="Atypical presentation or rapid symptom onset">Atypical presentation or rapid symptom onset</option>
                    <option value="Physician clinical judgment indicates higher risk">Physician clinical judgment indicates higher risk</option>
                    <option value="Patient responded well to initial bedside intervention">Patient responded well to initial bedside intervention</option>
                    <option value="Diagnostic lab / imaging findings supersede model">Diagnostic lab / imaging findings supersede model</option>
                  </select>
                </div>
              )}

              {/* Clinical Assessment & Findings */}
              <div className="space-y-1.5">
                <label className="block font-bold text-slate-300 uppercase tracking-wider">
                  Clinical Assessment &amp; Findings
                </label>
                <textarea
                  rows={3}
                  placeholder="Document clinical impression, differential diagnosis, and key observations..."
                  value={clinicalAssessment}
                  onChange={(e) => setClinicalAssessment(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* Recommended Care Plan / Disposition */}
              <div className="space-y-1.5">
                <label className="block font-bold text-slate-300 uppercase tracking-wider">
                  Recommended Care Plan &amp; Disposition *
                </label>
                <select
                  value={clinicalDecision}
                  onChange={(e) => setClinicalDecision(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer font-medium"
                >
                  <option value="CONTINUE_EVALUATION">Continue Emergency Evaluation &amp; Monitoring</option>
                  <option value="ADMIT_ICU">Admit to Intensive Care Unit (ICU)</option>
                  <option value="ADMIT_STEPDOWN">Admit to Step-Down / Telemetry Bed</option>
                  <option value="ADMIT_FLOOR">Admit to Inpatient Medical/Surgical Floor</option>
                  <option value="ORDER_ADVANCED_DIAGNOSTICS">Order STAT Advanced Diagnostics (CT/MRI/Echo)</option>
                  <option value="TRANSFER_TERTIARY">Transfer to Specialized Tertiary Trauma Center</option>
                  <option value="DISCHARGE_HOME">Safe for Discharge with Outpatient Follow-up</option>
                </select>
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-lg shadow-indigo-950/60 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{submitting ? 'Signing Decision...' : 'Sign & Save Clinical Decision'}</span>
                </button>
              </div>

            </form>
          </div>
        </div>

      </div>

    </div>
  );
};
