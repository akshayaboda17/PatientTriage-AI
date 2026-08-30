import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Edit2, X, Check, AlertTriangle, Activity } from 'lucide-react';

export const ObservationCorrectionModal = ({ isOpen, onClose, observation, encounterId, onCorrectionSaved }) => {
  const { authHeaders, addToast, currentStaff } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [correctionReason, setCorrectionReason] = useState('');
  const [vitals, setVitals] = useState({
    hr: observation?.hr || 80,
    sbp: observation?.sbp || 120,
    dbp: observation?.dbp || 80,
    rr: observation?.rr || 16,
    spo2: observation?.spo2 || 98,
    temp: observation?.temp || 37.0,
    pain_score: observation?.pain_score || 0,
    notes: observation?.notes || ''
  });

  if (!isOpen || !observation) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!correctionReason.trim()) {
      addToast("Mandatory clinical correction reason is required for audit traceability.", "warning");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/encounters/${encounterId}/observations/${observation.id}`, {
        method: 'PUT',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          hr: parseInt(vitals.hr),
          sbp: parseInt(vitals.sbp),
          dbp: parseInt(vitals.dbp) || undefined,
          rr: parseInt(vitals.rr),
          spo2: parseInt(vitals.spo2),
          temp: parseFloat(vitals.temp) || undefined,
          pain_score: parseInt(vitals.pain_score) || 0,
          notes: vitals.notes.trim() || undefined,
          correction_reason: correctionReason.trim()
        })
      });

      if (res.ok) {
        addToast("Observation corrected and logged in audit trail.", "success");
        onClose();
        if (onCorrectionSaved) onCorrectionSaved();
      } else {
        const err = await res.json();
        addToast(err.detail || "Failed to correct observation.", "error");
      }
    } catch (err) {
      addToast("Network error submitting correction.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
        
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-purple-400 font-bold text-sm">
            <Edit2 className="w-5 h-5" />
            <span>Correct Vital Signs Observation</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400">
          <p>
            Original values are preserved in the tamper-resistant audit store. Correcting observations generates an immutable <strong className="text-purple-300">OBSERVATION_CORRECTED</strong> audit event.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          
          <div className="grid grid-cols-3 gap-2 font-mono">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">HR (bpm)</label>
              <input
                type="number"
                value={vitals.hr}
                onChange={(e) => setVitals({ ...vitals, hr: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-white text-center"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">SpO₂ (%)</label>
              <input
                type="number"
                value={vitals.spo2}
                onChange={(e) => setVitals({ ...vitals, spo2: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-white text-center"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">RR (/min)</label>
              <input
                type="number"
                value={vitals.rr}
                onChange={(e) => setVitals({ ...vitals, rr: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-white text-center"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 font-mono">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">SBP (mmHg)</label>
              <input
                type="number"
                value={vitals.sbp}
                onChange={(e) => setVitals({ ...vitals, sbp: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-white text-center"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">DBP (mmHg)</label>
              <input
                type="number"
                value={vitals.dbp}
                onChange={(e) => setVitals({ ...vitals, dbp: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-white text-center"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Temp (°C)</label>
              <input
                type="number"
                step="0.1"
                value={vitals.temp}
                onChange={(e) => setVitals({ ...vitals, temp: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-white text-center"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              Mandatory Correction Reason / Clinical Rationale *
            </label>
            <textarea
              required
              rows={2}
              placeholder="e.g. Typographical transcription error: SpO2 corrected from 98% to 88% based on pulse oximeter waveform verification."
              value={correctionReason}
              onChange={(e) => setCorrectionReason(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-purple-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow disabled:opacity-50"
            >
              {submitting ? 'Saving Correction...' : 'Save & Record Audit'}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
