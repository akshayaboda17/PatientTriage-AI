import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  ArrowLeft, Activity, ShieldAlert, PlusCircle, CheckCircle2, Stethoscope
} from 'lucide-react';
import { ObservationCorrectionModal } from './ObservationCorrectionModal';
import { PatientDemographicsCard } from './patient/PatientDemographicsCard';
import { VitalsProgressionTable } from './patient/VitalsProgressionTable';
import { AiRiskCard } from './patient/AiRiskCard';
import { ExplainabilityCard } from './patient/ExplainabilityCard';
import { ClinicalTimeline } from './patient/ClinicalTimeline';

export const PatientDetailView = ({ encounterId, onBack, onOpenReview, onAlertStateChanged }) => {
  const { authHeaders, hasPermission, addToast, currentStaff } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // New Vitals Form state
  const [showVitalsForm, setShowVitalsForm] = useState(false);
  const [vitalsInput, setVitalsInput] = useState({
    hr: 125,
    sbp: 114,
    dbp: 70,
    rr: 31,
    spo2: 87,
    temp: 37.5,
    gcs: 15,
    pain_score: 4,
    notes: 'Patient visibly tachypneic and pale in waiting room.'
  });
  const [submittingVitals, setSubmittingVitals] = useState(false);

  // AI Assessment Trigger
  const [generatingAi, setGeneratingAi] = useState(false);

  // Observation Correction modal state
  const [selectedObsForCorrection, setSelectedObsForCorrection] = useState(null);

  // Alert Resolution modal state
  const [selectedAlertForAction, setSelectedAlertForAction] = useState(null);
  const [actionType, setActionType] = useState(null);
  const [actionReason, setActionReason] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);

  useEffect(() => {
    fetchDetails();
  }, [encounterId, authHeaders['X-Hospital-Id']]);

  const fetchDetails = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/encounters/${encounterId}`, { headers: authHeaders });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else if (res.status === 403) {
        addToast("Cross-hospital access forbidden.", "error");
        onBack();
      } else {
        addToast("Failed to load encounter details.", "error");
      }
    } catch (err) {
      addToast("Network error loading encounter.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleRecordVitals = async (e) => {
    e.preventDefault();
    if (!hasPermission('vitals:create')) {
      addToast("Access Denied: Your role does not have 'vitals:create' permission.", "error");
      return;
    }

    setSubmittingVitals(true);
    try {
      const res = await fetch(`/api/encounters/${encounterId}/vitals`, {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(vitalsInput)
      });

      if (res.ok) {
        const result = await res.json();
        if (result.deterioration_detected) {
          addToast(`⚠️ POTENTIAL DETERIORATION DETECTED: ${result.alert_status_message}`, 'warning', 10000);
        } else {
          addToast("Vital signs recorded successfully. No concerning change detected.", 'success');
        }
        setShowVitalsForm(false);
        fetchDetails();
        if (onAlertStateChanged) onAlertStateChanged();
      } else {
        const err = await res.json();
        addToast(err.detail || "Failed to record vitals.", "error");
      }
    } catch (err) {
      addToast("Network error submitting vitals.", "error");
    } finally {
      setSubmittingVitals(false);
    }
  };

  const handleGenerateAiAssessment = async () => {
    setGeneratingAi(true);
    try {
      const res = await fetch(`/api/encounters/${encounterId}/ai-assessment`, {
        method: 'POST',
        headers: authHeaders
      });

      if (res.ok) {
        addToast("AI Risk Assessment and SHAP explanation generated successfully.", "success");
        fetchDetails();
      } else {
        const err = await res.json();
        addToast(err.detail || "AI assessment unavailable.", "error");
      }
    } catch (err) {
      addToast("Network error during AI assessment.", "error");
    } finally {
      setGeneratingAi(false);
    }
  };

  const handleAcknowledge = async (alertId) => {
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
        addToast(`Alert ${alertId} acknowledged successfully.`, 'success');
        fetchDetails();
        if (onAlertStateChanged) onAlertStateChanged();
      } else {
        const err = await res.json();
        addToast(err.detail || "Failed to acknowledge.", "error");
      }
    } catch (err) {
      addToast("Network error acknowledging alert.", "error");
    }
  };

  const handleResolveOrDismissSubmit = async () => {
    if (!actionReason.trim()) {
      addToast("Clinical documentation note is required.", "warning");
      return;
    }

    setSubmittingAction(true);
    const endpoint = actionType === 'resolve' 
      ? `/api/alerts/${selectedAlertForAction.alert_id}/resolve`
      : `/api/alerts/${selectedAlertForAction.alert_id}/dismiss`;
    
    const bodyKey = actionType === 'resolve' ? 'resolution_reason' : 'dismissal_reason';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ [bodyKey]: actionReason })
      });

      if (res.ok) {
        addToast(`Alert ${selectedAlertForAction.alert_id} ${actionType === 'resolve' ? 'resolved' : 'dismissed'}.`, 'success');
        setSelectedAlertForAction(null);
        setActionReason('');
        setActionType(null);
        fetchDetails();
        if (onAlertStateChanged) onAlertStateChanged();
      } else {
        const err = await res.json();
        addToast(err.detail || "Action failed.", "error");
      }
    } catch (err) {
      addToast("Network error.", "error");
    } finally {
      setSubmittingAction(false);
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-slate-400 text-sm">Loading patient clinical chart...</div>;
  }

  if (!data || !data.encounter) {
    return (
      <div className="p-12 text-center text-slate-400 text-sm">
        <p>Encounter not found or inaccessible.</p>
        <button onClick={onBack} className="mt-4 px-4 py-2 bg-slate-800 text-slate-200 rounded-xl text-xs">
          Return to Queue
        </button>
      </div>
    );
  }

  const { encounter, patient, observations, triage, ai_risk, ai_explanation, alerts, timeline } = data;

  return (
    <div className="space-y-6">
      
      {/* Top Nav & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to ED Queue</span>
        </button>

        <div className="flex items-center gap-2">
          {onOpenReview && hasPermission('clinical_decision:create') && (
            <button
              onClick={onOpenReview}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-900/30 transition-colors"
            >
              <Stethoscope className="w-4 h-4" />
              <span>Physician Review Workspace</span>
            </button>
          )}

          <button
            onClick={() => setShowVitalsForm(!showVitalsForm)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-md shadow-cyan-900/30 transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
            <span>{showVitalsForm ? 'Close Form' : 'Record Vital Signs'}</span>
          </button>
        </div>
      </div>

      {/* Patient Demographic Banner */}
      <PatientDemographicsCard patient={patient} encounter={encounter} triage={triage} />

      {/* Record New Vitals Form (Expandable) */}
      {showVitalsForm && (
        <form
          onSubmit={handleRecordVitals}
          className="bg-slate-900/95 border-2 border-cyan-500/50 rounded-2xl p-5 shadow-2xl space-y-4 animate-in fade-in slide-in-from-top-4 duration-200"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2 text-cyan-400 font-bold text-sm">
              <Activity className="w-5 h-5" />
              <span>Record Longitudinal Vital Signs Observation</span>
            </div>
            <span className="text-xs text-slate-400">
              Assigned Clinician: <strong className="text-slate-200">{currentStaff.name} ({currentStaff.role})</strong>
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Heart Rate (bpm) *</label>
              <input
                type="number"
                required
                min={20}
                max={260}
                value={vitalsInput.hr}
                onChange={(e) => setVitalsInput({ ...vitalsInput, hr: parseInt(e.target.value) || 0 })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 font-mono text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">SpO₂ (%) *</label>
              <input
                type="number"
                required
                min={40}
                max={100}
                value={vitalsInput.spo2}
                onChange={(e) => setVitalsInput({ ...vitalsInput, spo2: parseInt(e.target.value) || 0 })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 font-mono text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Respiratory Rate (/min) *</label>
              <input
                type="number"
                required
                min={4}
                max={70}
                value={vitalsInput.rr}
                onChange={(e) => setVitalsInput({ ...vitalsInput, rr: parseInt(e.target.value) || 0 })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 font-mono text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Systolic BP (mmHg) *</label>
              <input
                type="number"
                required
                min={30}
                max={300}
                value={vitalsInput.sbp}
                onChange={(e) => setVitalsInput({ ...vitalsInput, sbp: parseInt(e.target.value) || 0 })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 font-mono text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Diastolic BP (mmHg)</label>
              <input
                type="number"
                value={vitalsInput.dbp || ''}
                onChange={(e) => setVitalsInput({ ...vitalsInput, dbp: parseInt(e.target.value) || null })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 font-mono text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Temperature (°C)</label>
              <input
                type="number"
                step="0.1"
                value={vitalsInput.temp}
                onChange={(e) => setVitalsInput({ ...vitalsInput, temp: parseFloat(e.target.value) || 37.0 })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 font-mono text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">GCS (3-15)</label>
              <input
                type="number"
                min={3}
                max={15}
                value={vitalsInput.gcs}
                onChange={(e) => setVitalsInput({ ...vitalsInput, gcs: parseInt(e.target.value) || 15 })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 font-mono text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Pain Score (0-10)</label>
              <input
                type="number"
                min={0}
                max={10}
                value={vitalsInput.pain_score}
                onChange={(e) => setVitalsInput({ ...vitalsInput, pain_score: parseInt(e.target.value) || 0 })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 font-mono text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Clinical Observation Notes</label>
            <input
              type="text"
              placeholder="e.g. Patient reporting increasing shortness of breath, diaphoresis observed."
              value={vitalsInput.notes}
              onChange={(e) => setVitalsInput({ ...vitalsInput, notes: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setShowVitalsForm(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submittingVitals}
              className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-md shadow-cyan-900/30 transition-all disabled:opacity-50"
            >
              {submittingVitals ? 'Evaluating Deterioration...' : 'Save Vitals & Evaluate Deterioration'}
            </button>
          </div>
        </form>
      )}

      {/* Active Clinical Alerts Section */}
      {alerts && alerts.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-400" />
            <h3 className="text-base font-bold text-white tracking-tight">Active & Historical Clinical Alerts</h3>
          </div>

          <div className="space-y-3">
            {alerts.map((alert) => (
              <div
                key={alert.alert_id}
                className={`p-4 rounded-2xl border ${
                  alert.status === 'UNACKNOWLEDGED'
                    ? 'bg-rose-950/40 border-rose-600/70 shadow-lg shadow-rose-950/20'
                    : alert.status === 'ACKNOWLEDGED'
                    ? 'bg-slate-900 border-amber-500/50'
                    : 'bg-slate-900/60 border-slate-800'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                        {alert.severity}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-950 text-slate-300 border border-slate-700">
                        {alert.status}
                      </span>
                      <span className="text-xs font-mono text-slate-400">{alert.alert_id}</span>
                      <span className="text-xs text-slate-400">•</span>
                      <span className="text-xs text-slate-400">
                        Detected {new Date(alert.detected_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <p className="text-sm font-semibold text-white">{alert.summary}</p>

                    {/* Signal Evidence Pills */}
                    {alert.evidence && alert.evidence.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {alert.evidence.map((sig, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px]"
                          >
                            <span className="font-semibold text-slate-300">{sig.feature_name || sig.feature}:</span>
                            <span className="font-mono text-slate-400">{sig.previous_value}</span>
                            <span className="text-slate-500">→</span>
                            <span className="font-mono font-bold text-rose-400">{sig.current_value} {sig.unit}</span>
                            <span className="text-[10px] text-slate-400 font-mono">({sig.change > 0 ? `+${sig.change}` : sig.change})</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 shrink-0">
                    {alert.status === 'UNACKNOWLEDGED' && (
                      <button
                        onClick={() => handleAcknowledge(alert.alert_id)}
                        className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow transition-colors"
                      >
                        Acknowledge
                      </button>
                    )}

                    {alert.status === 'ACKNOWLEDGED' && hasPermission('alert:resolve') && (
                      <button
                        onClick={() => {
                          setSelectedAlertForAction(alert);
                          setActionType('resolve');
                          setActionReason('');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow transition-colors"
                      >
                        Resolve Alert
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2-Column Clinical Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Longitudinal Vitals & Timeline (Span 2) */}
        <div className="lg:col-span-2 space-y-6">
          <VitalsProgressionTable 
            observations={observations} 
            onSelectObsForCorrection={setSelectedObsForCorrection} 
          />
          <ClinicalTimeline timeline={timeline} />
        </div>

        {/* Right Column: AI Risk & Explainability (Task 7 & 8) */}
        <div className="space-y-6">
          <AiRiskCard 
            aiRisk={ai_risk} 
            onGenerateAi={handleGenerateAiAssessment} 
            generatingAi={generatingAi} 
            onOpenReview={onOpenReview} 
          />
          <ExplainabilityCard aiExplanation={ai_explanation} />
        </div>

      </div>

      {/* Observation Correction Modal */}
      <ObservationCorrectionModal
        isOpen={!!selectedObsForCorrection}
        onClose={() => setSelectedObsForCorrection(null)}
        observation={selectedObsForCorrection}
        encounterId={encounterId}
        onCorrectionSaved={() => {
          setSelectedObsForCorrection(null);
          fetchDetails();
        }}
      />

      {/* Resolution & Dismissal Clinical Dialog Modal */}
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
              <div className="font-semibold text-slate-200">Alert: {selectedAlertForAction.alert_id}</div>
              <div className="text-slate-400">{selectedAlertForAction.summary}</div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Clinical Reassessment & Resolution Note *
              </label>
              <textarea
                rows={3}
                placeholder="e.g., Reassessed after oxygen administration and nebulizer. SpO2 normalized to 96%, respiratory rate 18, patient stable."
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Attributed to <strong>{currentStaff.name} ({currentStaff.role})</strong> and recorded in audit log.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setSelectedAlertForAction(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                disabled={submittingAction || !actionReason.trim()}
                onClick={handleResolveOrDismissSubmit}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 shadow-md"
              >
                {submittingAction ? 'Resolving...' : 'Confirm Resolution'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
