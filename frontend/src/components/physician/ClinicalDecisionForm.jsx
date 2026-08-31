import React from 'react';
import { Stethoscope, Send, AlertTriangle, Check, Shield, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ROLE_LABELS } from '../../utils/terminology';

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
    { id: 'CONTINUE_EVALUATION', label: 'Continue ED Evaluation', desc: 'Maintain current monitoring and continue diagnostic workup.' },
    { id: 'ESCALATE_CARE', label: 'Escalate Care / Resuscitation', desc: 'Transfer immediately to critical care bay / resuscitation team.' },
    { id: 'ADMIT_INPATIENT', label: 'Admit to Inpatient Unit', desc: 'Admit to general medical/surgical or telemetry floor.' },
    { id: 'OBSERVATION_UNIT', label: 'Place in Observation Unit', desc: 'Protocol-driven 12-24 hour observational care.' },
    { id: 'DISCHARGE_HOME', label: 'Discharge Home with Instructions', desc: 'Low risk, stable vitals, safe for outpatient follow-up.' },
    { id: 'TRANSFER_FACILITY', label: 'Transfer to Higher-Level Facility', desc: 'Specialized trauma, burn, pediatric, or cardiac center.' }
  ];

  return (
    <form onSubmit={onSubmit} className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
      
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
            <Stethoscope className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">Physician Clinical Decision</h3>
            <p className="text-xs text-slate-400">Physician assessment and care documentation</p>
          </div>
        </div>

        <span className="text-xs text-slate-400">
          Reviewing Physician: <strong className="text-white">{currentStaff.name}</strong> ({ROLE_LABELS[currentStaff.role] || 'Physician'})
        </span>
      </div>

      {/* Step 1: AI Agreement vs Override Toggle */}
      <div className="space-y-3">
        <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider">
          1. Clinician Agreement with AI Assessment
        </label>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setAiAgreement('AGREED')}
            className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
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
              Confirm estimated {aiRisk?.risk_category || 'Estimated'} risk and recommended priority.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setAiAgreement('OVERRIDDEN')}
            className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
              aiAgreement === 'OVERRIDDEN'
                ? 'bg-purple-950/50 border-purple-500 text-white shadow-lg shadow-purple-950/20'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-purple-300">Override AI Assessment</span>
              {aiAgreement === 'OVERRIDDEN' && <AlertTriangle className="w-4 h-4 text-purple-400" />}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Assign physician-determined risk level with documented clinical rationale.
            </p>
          </button>
        </div>
      </div>

      {/* Override Fields (if Overridden) */}
      {aiAgreement === 'OVERRIDDEN' && (
        <div className="p-4 rounded-xl bg-purple-950/30 border border-purple-800/50 space-y-4 animate-in fade-in">
          <div>
            <label className="block text-xs font-bold text-purple-200 uppercase tracking-wider mb-1.5">
              Physician-Assigned Risk Level *
            </label>
            <select
              value={clinicianAssignedRisk}
              onChange={(e) => setClinicianAssignedRisk(e.target.value)}
              className="w-full bg-slate-950 border border-purple-700/60 rounded-xl px-3 py-2 text-xs text-slate-100 font-semibold focus:outline-none focus:border-purple-400"
            >
              <option value="CRITICAL">Critical Risk (Immediate Care)</option>
              <option value="HIGH">High Risk (Emergency Assessment)</option>
              <option value="MODERATE">Moderate Risk (Urgent Care)</option>
              <option value="LOW">Low Risk (Less Urgent / Non-Urgent)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-purple-200 uppercase tracking-wider mb-1.5">
              Clinical Reason for Overriding AI Assessment *
            </label>
            <select
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              className="w-full bg-slate-950 border border-purple-700/60 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-purple-400"
            >
              <option value="Clinical context / history not captured in AI input">Clinical context / history not captured in AI input</option>
              <option value="Atypical presentation or rapid symptom onset">Atypical presentation or rapid symptom onset</option>
              <option value="Physician clinical judgment indicates higher risk">Physician clinical judgment indicates higher risk</option>
              <option value="Patient responded well to initial bedside intervention">Patient responded well to initial bedside intervention</option>
              <option value="Diagnostic lab / imaging findings supersede model">Diagnostic lab / imaging findings supersede model</option>
            </select>
          </div>
        </div>
      )}

      {/* Step 2: Clinical Assessment & Findings */}
      <div className="space-y-1.5">
        <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider">
          2. Clinical Assessment &amp; Findings
        </label>
        <textarea
          rows={2}
          placeholder="Document clinical impression, differential diagnosis, and key observations..."
          value={clinicalAssessment}
          onChange={(e) => setClinicalAssessment(e.target.value)}
          className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
        />
      </div>

      {/* Step 3: Recommended Care Plan & Disposition */}
      <div className="space-y-2">
        <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider">
          3. Recommended Care Plan &amp; Disposition *
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {decisionOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setClinicalDecision(opt.id)}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                clinicalDecision === opt.id
                  ? 'bg-cyan-950/60 border-cyan-500 text-white shadow-md'
                  : 'bg-slate-950 border-slate-800/80 text-slate-400 hover:bg-slate-800/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-200">{opt.label}</span>
                {clinicalDecision === opt.id && <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />}
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Step 4: Clinical Notes */}
      <div className="space-y-1.5">
        <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider">
          4. Additional Clinical Notes
        </label>
        <textarea
          rows={2}
          placeholder="Enter additional clinical notes, instructions, or follow-up milestones..."
          value={clinicalNotes}
          onChange={(e) => setClinicalNotes(e.target.value)}
          className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
        />
      </div>

      {/* Action Footer */}
      <div className="pt-2 flex items-center justify-between border-t border-slate-800">
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <Shield className="w-3.5 h-3.5 text-cyan-400" />
          <span>Decision permanently recorded with timestamp</span>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="px-6 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg shadow-cyan-900/30 transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>{submitting ? 'Signing...' : 'Sign & Save Clinical Decision'}</span>
        </button>
      </div>

    </form>
  );
};
