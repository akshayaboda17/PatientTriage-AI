import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { 
  Activity, Sparkles, X, CheckCircle2, AlertTriangle, Shield, 
  ArrowRight, Heart, Stethoscope, Bed, FileText, TrendingUp, TrendingDown
} from 'lucide-react';
import { PRIORITY_LEVELS, getPriorityMeta } from '../../utils/terminology';

export const UpdatePatientConditionModal = ({ 
  isOpen, 
  onClose, 
  encounter, 
  patient, 
  latestObservation,
  currentTriageLevel, 
  onConditionUpdated 
}) => {
  const { authHeaders, addToast, hasPermission } = useAuth();

  const [formData, setFormData] = useState({
    hr: '',
    sbp: '',
    dbp: '',
    rr: '',
    spo2: '',
    temp: '',
    pain_score: '',
    gcs: '',
    updated_complaint: '',
    bed_number: '',
    notes: ''
  });

  const [submitting, setSubmitting] = useState(false);
  const [assessmentResult, setAssessmentResult] = useState(null);

  // Pre-fill with the patient's existing/current data whenever modal opens
  useEffect(() => {
    if (isOpen && encounter) {
      setFormData({
        hr: latestObservation?.hr != null ? String(latestObservation.hr) : '',
        sbp: latestObservation?.sbp != null ? String(latestObservation.sbp) : '',
        dbp: latestObservation?.dbp != null ? String(latestObservation.dbp) : '',
        rr: latestObservation?.rr != null ? String(latestObservation.rr) : '',
        spo2: latestObservation?.spo2 != null ? String(latestObservation.spo2) : '',
        temp: latestObservation?.temp != null ? String(latestObservation.temp) : '',
        pain_score: latestObservation?.pain_score != null ? String(latestObservation.pain_score) : '',
        gcs: latestObservation?.gcs != null ? String(latestObservation.gcs) : '',
        updated_complaint: encounter.chief_complaint || '',
        bed_number: encounter.bed_number || '',
        notes: ''
      });
      setAssessmentResult(null);
    }
  }, [isOpen, latestObservation, encounter]);

  if (!isOpen || !encounter) return null;

  const previousLevel = currentTriageLevel || encounter.triage_level || 3;
  const previousMeta = getPriorityMeta(previousLevel);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const encounterId = encounter.encounter_id;

      // 1. Record New Longitudinal Vital Signs
      const hasVitals = formData.hr || formData.sbp || formData.dbp || formData.rr || formData.spo2 || formData.temp || formData.pain_score || formData.gcs;

      if (hasVitals) {
        const vitalsPayload = {
          hr: formData.hr ? parseInt(formData.hr, 10) : undefined,
          sbp: formData.sbp ? parseInt(formData.sbp, 10) : undefined,
          dbp: formData.dbp ? parseInt(formData.dbp, 10) : undefined,
          rr: formData.rr ? parseInt(formData.rr, 10) : undefined,
          spo2: formData.spo2 ? parseInt(formData.spo2, 10) : undefined,
          temp: formData.temp ? parseFloat(formData.temp) : undefined,
          gcs: formData.gcs ? parseInt(formData.gcs, 10) : undefined,
          pain_score: formData.pain_score ? parseInt(formData.pain_score, 10) : undefined,
          notes: formData.notes.trim() || 'Updated bedside vital signs.'
        };

        const vitalsRes = await fetch(`/api/encounters/${encounterId}/vitals`, {
          method: 'POST',
          headers: { ...authHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify(vitalsPayload)
        });

        if (!vitalsRes.ok) {
          let errMsg = "Failed to record updated vital signs.";
          try {
            const err = await vitalsRes.json();
            errMsg = err.detail || errMsg;
          } catch (e) {
            const text = await vitalsRes.text().catch(() => "");
            errMsg = text || errMsg;
          }
          throw new Error(errMsg);
        }
      }

      // 2. Trigger ML Reassessment Pipeline
      const aiRes = await fetch(`/api/encounters/${encounterId}/ai-assessment`, {
        method: 'POST',
        headers: authHeaders
      });

      let aiAssessment = null;
      let newLevel = previousLevel;

      if (aiRes.ok) {
        try {
          const aiData = await aiRes.json();
          aiAssessment = aiData.assessment;
          newLevel = aiAssessment.predicted_triage_level || previousLevel;
        } catch (e) {
          console.warn('AI assessment parse warning:', e);
        }
      }

      const newMeta = getPriorityMeta(newLevel);

      // 3. Update Encounter Triage with newly assessed priority
      await fetch(`/api/encounters/${encounterId}/triage`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          triage_level: newLevel,
          acuity_category: newMeta.primary,
          chief_complaint: formData.updated_complaint.trim() || encounter.chief_complaint,
          pain_score: formData.pain_score ? parseInt(formData.pain_score, 10) : 0,
          notes: `Reassessment after vitals update. ML evaluated priority: Level ${previousLevel} ➔ Level ${newLevel}. Notes: ${formData.notes}`
        })
      });

      // 4. Update Bed if modified
      if (formData.bed_number && formData.bed_number !== encounter.bed_number) {
        await fetch(`/api/encounters/${encounterId}/status`, {
          method: 'PUT',
          headers: { ...authHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: encounter.status || 'WAITING',
            bed_number: formData.bed_number.trim()
          })
        });
      }

      const levelChanged = newLevel !== previousLevel;
      if (levelChanged) {
        addToast(`Patient condition updated. Care priority changed: Level ${previousLevel} ➔ Level ${newLevel} (${newMeta.primary})`, 'warning', 8000);
      } else {
        addToast(`Patient condition updated. Care priority remained stable at Level ${newLevel} (${newMeta.primary})`, 'success');
      }

      setAssessmentResult({
        previousLevel,
        previousMeta,
        newLevel,
        newMeta,
        levelChanged,
        aiAssessment
      });

      if (onConditionUpdated) {
        onConditionUpdated();
      }
    } catch (err) {
      console.error('Condition update error:', err);
      addToast(err.message || "Failed to update patient condition.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                {assessmentResult ? 'Reassessment Decision Complete' : 'Update Patient Condition & Vital Signs'}
              </h3>
              <p className="text-[11px] text-slate-400">
                {assessmentResult 
                  ? 'ML model reassessed risk trajectory and updated care priority'
                  : 'Review current values, adjust parameters, and re-evaluate patient care priority level'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!assessmentResult ? (
          <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-4 text-xs">
            
            {/* Patient Header Banner */}
            <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-sm font-bold text-white block">
                  {patient?.first_name} {patient?.last_name || encounter.patient_name} ({patient?.age || encounter.patient_age}y)
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  Visit #{encounter.encounter_id} · Current Care Priority: <strong className="text-cyan-400">{previousMeta.primary}</strong> ({previousMeta.secondary})
                </span>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${previousMeta.badgeCls}`}>
                {previousMeta.secondary}
              </span>
            </div>

            {/* Section 1: Updated Bedside Vitals (Pre-populated with current values) */}
            <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">
                  1. Bedside Vital Signs
                </span>
                <span className="text-[10px] text-slate-500">
                  Pre-filled with latest reading. Modify as needed.
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 font-mono">
                
                {/* Heart Rate */}
                <div className="space-y-1">
                  <label className="block text-slate-400 text-[11px] font-sans font-bold">Heart Rate (bpm)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="e.g. 108"
                    value={formData.hr}
                    onChange={(e) => setFormData({ ...formData, hr: e.target.value.replace(/\D/g, '') })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                {/* Systolic BP */}
                <div className="space-y-1">
                  <label className="block text-slate-400 text-[11px] font-sans font-bold">Systolic BP (mmHg)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="e.g. 130"
                    value={formData.sbp}
                    onChange={(e) => setFormData({ ...formData, sbp: e.target.value.replace(/\D/g, '') })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                {/* Diastolic BP */}
                <div className="space-y-1">
                  <label className="block text-slate-400 text-[11px] font-sans font-bold">Diastolic BP (mmHg)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="e.g. 85"
                    value={formData.dbp}
                    onChange={(e) => setFormData({ ...formData, dbp: e.target.value.replace(/\D/g, '') })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                {/* SpO2 */}
                <div className="space-y-1">
                  <label className="block text-slate-400 text-[11px] font-sans font-bold">SpO₂ (%)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="e.g. 96"
                    value={formData.spo2}
                    onChange={(e) => setFormData({ ...formData, spo2: e.target.value.replace(/\D/g, '') })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                {/* Resp Rate */}
                <div className="space-y-1">
                  <label className="block text-slate-400 text-[11px] font-sans font-bold">Resp Rate (/min)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="e.g. 20"
                    value={formData.rr}
                    onChange={(e) => setFormData({ ...formData, rr: e.target.value.replace(/\D/g, '') })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                {/* Pain Level */}
                <div className="space-y-1">
                  <label className="block text-slate-400 text-[11px] font-sans font-bold">Pain Level (0–10)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="e.g. 3"
                    value={formData.pain_score}
                    onChange={(e) => setFormData({ ...formData, pain_score: e.target.value.replace(/\D/g, '') })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>

              </div>
            </div>

            {/* Section 2: Clinical Condition & Location Update */}
            <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 space-y-3">
              <span className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider block">
                2. Clinical Presentation &amp; Location Updates
              </span>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="block text-slate-400 font-bold">Clinical Symptoms / Presentation</label>
                  <textarea
                    rows={2}
                    placeholder="Describe symptoms or changes in clinical status..."
                    value={formData.updated_complaint}
                    onChange={(e) => setFormData({ ...formData, updated_complaint: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-slate-400 font-bold">Assigned Care Bay / Bed</label>
                    <input
                      type="text"
                      placeholder="e.g. BED-02 or Waiting Area"
                      value={formData.bed_number}
                      onChange={(e) => setFormData({ ...formData, bed_number: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-slate-400 font-bold">Clinical Progress Note (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Patient resting comfortably"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-slate-200 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
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
                className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold shadow-lg shadow-cyan-900/30 transition flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>{submitting ? 'Reassessing Patient Risk...' : 'Update & Reassess Care Priority'}</span>
              </button>
            </div>

          </form>
        ) : (
          /* Reassessment Decision View */
          <div className="p-6 space-y-4 overflow-y-auto">
            
            <div className={`p-4 rounded-2xl border flex items-center gap-3 ${
              assessmentResult.levelChanged 
                ? 'bg-amber-950/40 border-amber-800/80 text-amber-300' 
                : 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
            }`}>
              <div className={`p-2 rounded-xl border ${
                assessmentResult.levelChanged ? 'bg-amber-950 border-amber-700 text-amber-400' : 'bg-emerald-950 border-emerald-700 text-emerald-400'
              }`}>
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">
                  {assessmentResult.levelChanged ? 'Care Priority Level Changed' : 'Care Priority Level Confirmed'}
                </h4>
                <p className="text-xs">
                  {assessmentResult.levelChanged
                    ? `ML reassessment shifted patient from ${assessmentResult.previousMeta.primary} (${assessmentResult.previousMeta.secondary}) ➔ ${assessmentResult.newMeta.primary} (${assessmentResult.newMeta.secondary}).`
                    : `Patient condition updated. Care priority remains stable at ${assessmentResult.newMeta.primary} (${assessmentResult.newMeta.secondary}).`}
                </p>
              </div>
            </div>

            {/* Level Comparison Display */}
            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 flex items-center justify-around text-center">
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Previous Priority</span>
                <span className="text-base font-bold text-slate-300">{assessmentResult.previousMeta.primary}</span>
                <div className="text-xs text-slate-500 font-mono mt-0.5">{assessmentResult.previousMeta.secondary}</div>
              </div>

              <div className="p-2 rounded-full bg-slate-900 border border-slate-800 text-cyan-400">
                <ArrowRight className="w-5 h-5" />
              </div>

              <div>
                <span className="text-[10px] text-cyan-400 uppercase font-bold block mb-1">Reassessed Priority</span>
                <span className="text-base font-bold text-white">{assessmentResult.newMeta.primary}</span>
                <div className={`text-xs font-bold font-mono mt-0.5 ${assessmentResult.newMeta.badgeCls}`}>
                  {assessmentResult.newMeta.secondary}
                </div>
              </div>
            </div>

            {assessmentResult.aiAssessment && (
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">New Estimated Risk</span>
                  <span className="text-base font-black text-cyan-400 font-mono">
                    {(assessmentResult.aiAssessment.risk_probability * 100).toFixed(1)}%
                  </span>
                  <span className="text-[10px] text-slate-400 block font-sans">
                    Category: <strong>{assessmentResult.aiAssessment.risk_category}</strong>
                  </span>
                </div>

                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Model Confidence</span>
                  <span className="text-base font-black text-emerald-400 font-mono">
                    {assessmentResult.aiAssessment.confidence_score >= 80 ? 'HIGH' : 'MODERATE'}
                  </span>
                  <span className="text-[10px] text-slate-400 block font-sans">
                    Score: <strong>{assessmentResult.aiAssessment.confidence_score}%</strong>
                  </span>
                </div>
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-lg transition cursor-pointer"
              >
                Close &amp; View Updated Workspace
              </button>
            </div>

          </div>
        )}

      </div>
    </div>
  );
};
