import React from 'react';
import { Stethoscope, Send, AlertTriangle, Check, Shield } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const ClinicalDecisionForm = ({
  aiRisk,
  aiAgreement,
  setAiAgreement,
  clinicianAssignedRisk,
  setClinicianAssignedRisk,
  overrideReason,
  setOverrideReason,
  clinicalAssessment,
  setClinicalAssessment,
  clinicalNotes,
  setClinicalNotes,
  clinicalDecision,
  setClinicalDecision,
  submitting,
  onSubmit
}) => {
  const { currentStaff, hasPermission } = useAuth();

  const decisionOptions = [
    { id: 'CONTINUE_EVALUATION', label: 'Continue ED Evaluation', desc: 'Maintain current monitoring and order ongoing diagnostic workup.' },
    { id: 'ESCALATE_CARE', label: 'Escalate Care / Resuscitation', desc: 'Transfer immediately to critical care bay / resuscitation team.' },
    { id: 'ADMIT_INPATIENT', label: 'Admit to Inpatient Unit', desc: 'Admit to hospital general medical/surgical or telemetry floor.' },
    { id: 'OBSERVATION_UNIT', label: 'Place in Observation Unit', desc: 'Protocol-driven 12-24 hour observational care.' },
    { id: 'DISCHARGE_HOME', label: 'Discharge Home with Instructions', desc: 'Low risk, stable vitals, safe for outpatient follow-up.' },
    { id: 'TRANSFER_FACILITY', label: 'Transfer to Higher-Level Facility', desc: 'Specialized trauma, burn, pediatric, or cardiac intervention required.' }
  ];

  return (
    <form onSubmit={onSubmit} className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
      
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
            <Stethoscope className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">Physician Clinical Decision & AI Governance</h3>
            <p className="text-xs text-slate-400">Mandatory human-in-the-loop review and structured accountability documentation</p>
          </div>
        </div>

        <span className="text-xs text-slate-400">
          Reviewing Physician: <strong className="text-white">{currentStaff.name}</strong>
        </span>
      </div>

      {/* Step 1: AI Agreement vs Override Toggle */}
      <div className="space-y-3">
        <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider">
          1. AI Risk Alignment & Override Selection
        </label>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setAiAgreement('AGREED')}
            className={`p-4 rounded-xl border text-left transition-all ${
              aiAgreement === 'AGREED'
                ? 'bg-emerald-950/50 border-emerald-500 text-white shadow-lg shadow-emerald-950/20'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-emerald-300">Agree with AI Assessment</span>
              {aiAgreement === 'AGREED' && <Check className="w-4 h-4 text-emerald-400" />}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Confirm estimated {aiRisk?.risk_category || 'Estimated'} risk and recommended level.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setAiAgreement('OVERRIDDEN')}
            className={`p-4 rounded-xl border text-left transition-all ${
              aiAgreement === 'OVERRIDDEN'
                ? 'bg-purple-950/50 border-purple-500 text-white shadow-lg shadow-purple-950/20'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-purple-300">Override AI Risk Level</span>
              {aiAgreement === 'OVERRIDDEN' && <AlertTriangle className="w-4 h-4 text-purple-400" />}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Assign clinician-determined risk level with mandatory justification.
            </p>
          </button>
        </div>
      </div>

      {/* Override Fields (if Overridden) */}
      {aiAgreement === 'OVERRIDDEN' && (
        <div className="p-4 rounded-xl bg-purple-950/30 border border-purple-800/50 space-y-4 animate-in fade-in">
          <div>
            <label className="block text-xs font-bold text-purple-200 mb-1">
              Clinician-Assigned Risk Category *
            </label>
            <select
              value={clinicianAssignedRisk}
              onChange={(e) => setClinicianAssignedRisk(e.target.value)}
              className="w-full bg-slate-950 border border-purple-700/60 rounded-lg p-2 text-xs font-bold text-white focus:outline-none focus:border-purple-400"
            >
              <option value="CRITICAL">CRITICAL (Resuscitation)</option>
              <option value="HIGH">HIGH (Emergent)</option>
              <option value="MODERATE">MODERATE (Urgent)</option>
              <option value="LOW">LOW (Non-Urgent)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-purple-200 mb-1">
              Mandatory Override Rationale *
            </label>
            <textarea
              required
              rows={2}
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="e.g. Clinical context not represented in model input: Patient is taking beta-blockers blunting tachycardia response."
              className="w-full bg-slate-950 border border-purple-700/60 rounded-lg p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-400"
            />
          </div>
        </div>
      )}

      {/* Step 2: Clinical Assessment & Findings */}
      <div className="space-y-1.5">
        <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider">
          2. Physician Clinical Assessment & Exam Findings
        </label>
        <textarea
          rows={2}
          placeholder="e.g. Alert, oriented x3. Lung exam reveals bilateral wheezing. Responds well to supplemental oxygen."
          value={clinicalAssessment}
          onChange={(e) => setClinicalAssessment(e.target.value)}
          className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
        />
      </div>

      {/* Step 3: Clinical Decision / Next Step Selector */}
      <div className="space-y-3">
        <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider">
          3. Clinical Disposition & Next Step *
        </label>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {decisionOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setClinicalDecision(opt.id)}
              className={`p-3 rounded-xl border text-left transition-all ${
                clinicalDecision === opt.id
                  ? 'bg-indigo-950/60 border-indigo-500 text-white shadow-md shadow-indigo-950/30'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800/40'
              }`}
            >
              <div className="font-bold text-xs text-slate-200">{opt.label}</div>
              <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Action Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-800">
        <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-cyan-400" />
          <span>All clinical decisions are permanently recorded in the immutable audit trail.</span>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-900/30 transition-all disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
          <span>{submitting ? 'Recording Decision...' : 'Save & Record Clinical Decision'}</span>
        </button>
      </div>

    </form>
  );
};
