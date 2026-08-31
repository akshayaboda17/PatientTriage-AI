import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { 
  AlertTriangle, Shield, CheckCircle2, X, Sparkles, Stethoscope, ArrowRight 
} from 'lucide-react';
import { PRIORITY_LEVELS, getPriorityMeta, ROLE_LABELS } from '../../utils/terminology';

export const PriorityOverrideModal = ({ 
  isOpen, 
  onClose, 
  patient, 
  encounter, 
  onPriorityChanged 
}) => {
  const { authHeaders, addToast, currentStaff } = useAuth();
  
  const originalAiLevel = encounter?.ai_risk?.predicted_triage_level || encounter?.triage_level || 3;
  const originalMeta = getPriorityMeta(originalAiLevel);

  const [selectedLevel, setSelectedLevel] = useState(originalAiLevel);
  const [overrideReason, setOverrideReason] = useState('Clinician assessment indicates higher urgency');
  const [customReason, setCustomReason] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen || !encounter) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const finalReason = overrideReason === 'Other (Documented below)' ? customReason.trim() : overrideReason;
    if (!finalReason) {
      addToast("A documented clinical reason is required to change care priority.", "warning");
      return;
    }

    setSubmitting(true);
    try {
      const selectedMeta = getPriorityMeta(selectedLevel);

      // Record Triage Override Update
      const res = await fetch(`/api/encounters/${encounter.encounter_id}/triage`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          triage_level: selectedLevel,
          acuity_category: selectedMeta.primary,
          chief_complaint: encounter.chief_complaint,
          pain_score: encounter.vitals?.pain_score || 0,
          notes: `Clinician Priority Override (AI Level ${originalAiLevel} ➔ Clinician Level ${selectedLevel}). Reason: ${finalReason}. Notes: ${clinicalNotes}`
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to update care priority.");
      }

      addToast(`Care priority updated to "${selectedMeta.primary}". Clinician override recorded with audit trail.`, "success");
      onClose();
      if (onPriorityChanged) onPriorityChanged();
    } catch (err) {
      console.error('Priority override error:', err);
      addToast(err.message || "Failed to change care priority.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Clinician Care Priority Adjustment</h3>
              <p className="text-[11px] text-slate-400">Review AI-supported recommendation and apply documented clinical override</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Patient Identity Banner */}
        <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 flex items-center justify-between text-xs">
          <div>
            <div className="font-bold text-white">{patient?.first_name} {patient?.last_name || encounter.patient_name}</div>
            <div className="text-[10px] text-slate-400 font-mono">
              PID: {encounter.patient_id} · Visit #{encounter.encounter_id}
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-slate-500 uppercase font-bold block">Reviewing Clinician</span>
            <span className="font-bold text-cyan-400">{currentStaff.name}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          
          {/* Original AI Recommendation (Preserved) */}
          <div className="p-3 bg-indigo-950/30 rounded-2xl border border-indigo-900/50 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider">
                Original AI Recommendation (Preserved)
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                Model v1.0
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-200">{originalMeta.primary}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${originalMeta.badgeCls}`}>
                {originalMeta.secondary}
              </span>
            </div>
          </div>

          {/* New Priority Selection */}
          <div className="space-y-2">
            <label className="block text-slate-300 font-bold uppercase tracking-wider text-[11px]">
              Select New Clinician-Assigned Priority *
            </label>
            
            <div className="space-y-1.5">
              {[1, 2, 3, 4, 5].map((lvl) => {
                const meta = PRIORITY_LEVELS[lvl];
                const isSelected = selectedLevel === lvl;
                return (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setSelectedLevel(lvl)}
                    className={`w-full p-2.5 rounded-xl border text-left transition-all flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-cyan-950/70 border-cyan-500 text-white shadow-md'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800/40'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-slate-200">{meta.primary}</div>
                      <div className="text-[10px] text-slate-400">{meta.desc}</div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${meta.badgeCls}`}>
                      {meta.secondary}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Clinician Override Reason */}
          <div className="space-y-1.5">
            <label className="block text-slate-300 font-bold uppercase tracking-wider text-[11px]">
              Clinical Justification Reason *
            </label>
            <select
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer"
            >
              <option value="Clinician assessment indicates higher urgency">Clinician assessment indicates higher urgency</option>
              <option value="Clinical condition changed / rapid symptom onset">Clinical condition changed / rapid symptom onset</option>
              <option value="Additional medical history / lab findings available">Additional medical history / lab findings available</option>
              <option value="AI assessment does not reflect current presentation">AI assessment does not reflect current presentation</option>
              <option value="Patient responded well to bedside treatment">Patient responded well to bedside treatment</option>
              <option value="Other (Documented below)">Other (Documented below)</option>
            </select>
          </div>

          {overrideReason === 'Other (Documented below)' && (
            <div className="space-y-1">
              <label className="block text-slate-400 font-bold">Specific Clinical Rationale *</label>
              <input
                type="text"
                required
                placeholder="Document clinical reason..."
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
          )}

          {/* Additional Notes */}
          <div className="space-y-1">
            <label className="block text-slate-400 font-bold">Additional Clinical Notes (Optional)</label>
            <textarea
              rows={2}
              placeholder="Enter optional clinical observations or instructions..."
              value={clinicalNotes}
              onChange={(e) => setClinicalNotes(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-slate-200 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-mono">
              <Shield className="w-3.5 h-3.5 text-cyan-400" />
              <span>Override logged in audit history</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold shadow-lg shadow-cyan-900/30 transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{submitting ? 'Applying Override...' : 'Confirm & Apply Priority Change'}</span>
              </button>
            </div>
          </div>

        </form>

      </div>
    </div>
  );
};
