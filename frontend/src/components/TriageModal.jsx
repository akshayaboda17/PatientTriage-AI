import { useState } from 'react';
import { AlertTriangle, CheckCircle, ShieldAlert, X } from 'lucide-react';

const OVERRIDE_REASONS = [
  "Clinical Intuition / Gestalt",
  "Uncontrolled / Active Hemorrhage",
  "High-Risk Mechanism of Injury",
  "Obvious Acute Visual Distress",
  "EHR / History Discrepancy",
  "Other (Mandatory Detailed Note)"
];

const ESI_COLOR_MAP = {
  1: { bg: 'bg-red-600', text: 'text-red-100', name: 'ESI 1: Resuscitation (Immediate)' },
  2: { bg: 'bg-orange-500', text: 'text-orange-100', name: 'ESI 2: Emergent' },
  3: { bg: 'bg-yellow-500', text: 'text-yellow-900', name: 'ESI 3: Urgent' },
  4: { bg: 'bg-green-600', text: 'text-green-100', name: 'ESI 4: Less Urgent' },
  5: { bg: 'bg-blue-600', text: 'text-blue-100', name: 'ESI 5: Non-Urgent' },
};

export default function TriageDecisionModal({ recommendation, staffId, onClose, onSuccess }) {
  const [isOverrideMode, setIsOverrideMode] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState(recommendation.ai_suggested_level);
  const [overrideReason, setOverrideReason] = useState(OVERRIDE_REASONS[0]);
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAccept = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/triage/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: recommendation.patient_id,
          staff_id: staffId,
          ai_suggested_level: recommendation.ai_suggested_level,
          ai_confidence_score: recommendation.confidence_score,
          top_3_drivers: recommendation.top_3_drivers
        })
      });
      if (res.ok) onSuccess();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOverrideSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/v1/triage/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: recommendation.patient_id,
          staff_id: staffId,
          ai_suggested_level: recommendation.ai_suggested_level,
          ai_confidence_score: recommendation.confidence_score,
          clinician_assigned_level: Number(selectedLevel),
          override_reason: overrideReason,
          clinical_notes: clinicalNotes,
          top_3_drivers: recommendation.top_3_drivers
        })
      });
      if (res.ok) onSuccess();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-2xl w-full text-slate-100 shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-2">
            <ShieldAlert className="text-cyan-400 w-6 h-6" />
            <h2 className="text-xl font-bold tracking-tight text-white">Clinical Triage Validation</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-6">
          {/* Patient Card Header */}
          <div className="flex justify-between items-center bg-slate-800/50 p-4 rounded-lg border border-slate-700">
            <div>
              <p className="text-xs text-slate-400 font-mono">PATIENT ID</p>
              <p className="text-lg font-bold text-white">{recommendation.patient_id}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 font-mono">CONFIDENCE SCORE</p>
              <p className={`text-lg font-bold ${recommendation.confidence_score >= 0.75 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {(recommendation.confidence_score * 100).toFixed(0)}%
              </p>
            </div>
          </div>

          {/* AI Recommendation Banner */}
          <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-3">
            <p className="text-xs text-slate-400 uppercase font-semibold">AI Triage Recommendation</p>
            <div className={`px-4 py-3 rounded-md font-bold text-lg flex justify-between items-center ${ESI_COLOR_MAP[recommendation.ai_suggested_level].bg} ${ESI_COLOR_MAP[recommendation.ai_suggested_level].text}`}>
              <span>{ESI_COLOR_MAP[recommendation.ai_suggested_level].name}</span>
            </div>

            {/* XAI Drivers */}
            <div className="pt-2">
              <p className="text-xs text-slate-400 mb-2 font-mono">TOP 3 CLINICAL DRIVERS (XAI):</p>
              <div className="space-y-1">
                {recommendation.top_3_drivers.map((driver, idx) => (
                  <div key={idx} className="flex justify-between text-xs bg-slate-900 px-3 py-1.5 rounded border border-slate-800">
                    <span className="text-slate-300">{driver.feature}</span>
                    <span className="font-mono text-cyan-400">+{driver.weight}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Action Choice */}
          {!isOverrideMode ? (
            <div className="flex gap-4">
              <button
                onClick={handleAccept}
                disabled={loading}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition"
              >
                <CheckCircle className="w-5 h-5" /> Accept Recommendation
              </button>
              <button
                onClick={() => setIsOverrideMode(true)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/30 font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition"
              >
                <AlertTriangle className="w-5 h-5" /> Override Tier
              </button>
            </div>
          ) : (
            <form onSubmit={handleOverrideSubmit} className="space-y-4 bg-slate-950 p-4 rounded-lg border border-amber-500/40">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-semibold text-amber-400 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> Clinician Override Protocol
                </h3>
                <button type="button" onClick={() => setIsOverrideMode(false)} className="text-xs text-slate-400 underline">Cancel</button>
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">NEW ASSIGNED ESI TIER</label>
                <select
                  value={selectedLevel}
                  onChange={(e) => setSelectedLevel(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded p-2 text-sm focus:border-cyan-500 outline-none"
                >
                  {[1, 2, 3, 4, 5].map((lvl) => (
                    <option key={lvl} value={lvl}>{ESI_COLOR_MAP[lvl].name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">MANDATORY OVERRIDE RATIONALE</label>
                <select
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded p-2 text-sm focus:border-cyan-500 outline-none"
                >
                  {OVERRIDE_REASONS.map((r, i) => (
                    <option key={i} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">CLINICAL NOTES (REQUIRED IF 'OTHER')</label>
                <textarea
                  value={clinicalNotes}
                  onChange={(e) => setClinicalNotes(e.target.value)}
                  placeholder="Enter detailed clinical observation..."
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded p-2 text-sm focus:border-cyan-500 outline-none h-20"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-amber-600 hover:bg-amber-500 text-white font-semibold py-2.5 px-4 rounded transition"
              >
                Submit Immutable Override Log
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
