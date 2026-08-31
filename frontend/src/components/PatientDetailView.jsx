import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  ArrowLeft, Activity, ShieldAlert, PlusCircle, CheckCircle2, Stethoscope, RefreshCw, X
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
        addToast("Cross-hospital facility access restricted.", "error");
        onBack();
      } else {
        addToast("Unable to load patient visit details.", "error");
      }
    } catch (err) {
      addToast("Network error loading patient workspace.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleRecordVitals = async (e) => {
    e.preventDefault();
    if (!hasPermission('vitals:create')) {
      addToast("Access Restricted: You need 'vitals:create' permission.", "error");
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
          addToast(`⚠️ POSSIBLE CLINICAL DETERIORATION: ${result.alert_status_message}`, 'warning', 10000);
        } else {
          addToast("Updated vital signs recorded. Baseline parameters stable.", 'success');
        }
        setShowVitalsForm(false);
        fetchDetails();
        if (onAlertStateChanged) onAlertStateChanged();
      } else {
        const err = await res.json();
        addToast(err.detail || "Failed to record vital signs.", "error");
      }
    } catch (err) {
      addToast("Network error recording vital signs.", "error");
    } finally {
      setSubmittingVitals(false);
    }
  };

  const handleGenerateAiAssessment = async () => {
    if (!hasPermission('triage:ai_infer')) {
      addToast("Access Restricted: Your role cannot trigger AI assessments.", "error");
      return;
    }

    setGeneratingAi(true);
    try {
      const res = await fetch(`/api/encounters/${encounterId}/ai-risk`, {
        method: 'POST',
        headers: authHeaders
      });

      if (res.ok) {
        const aiData = await res.json();
        addToast("AI Risk Assessment updated successfully.", "success");
        fetchDetails();
      } else {
        const err = await res.json().catch(() => ({}));
        addToast(err.detail || "Failed to update AI risk assessment.", "error");
      }
    } catch (err) {
      addToast("Network error calculating AI risk.", "error");
    } finally {
      setGeneratingAi(false);
    }
  };

  const handleResolveAlert = async (e) => {
    e.preventDefault();
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
        body: JSON.stringify({ [bodyKey]: actionReason.trim() })
      });

      if (res.ok) {
        addToast(`Alert ${actionType === 'resolve' ? 'resolved' : 'dismissed'} with documentation.`, "success");
        setSelectedAlertForAction(null);
        setActionReason('');
        setActionType(null);
        fetchDetails();
        if (onAlertStateChanged) onAlertStateChanged();
      } else {
        const err = await res.json().catch(() => ({}));
        addToast(err.detail || "Failed to update alert.", "error");
      }
    } catch (err) {
      addToast("Network error updating alert.", "error");
    } finally {
      setSubmittingAction(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-14 bg-slate-900 rounded-2xl animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-32 bg-slate-900 rounded-2xl animate-pulse" />
          <div className="h-32 bg-slate-900 rounded-2xl animate-pulse" />
          <div className="h-32 bg-slate-900 rounded-2xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { encounter, patient, observations = [], ai_risk, ai_explanation, alerts = [], timeline = [] } = data;

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
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white tracking-tight">Patient Care Workspace</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">
                Visit #{encounter.encounter_id}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Longitudinal vital signs, AI risk calculations, explainability factors, and clinical care timeline
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasPermission('vitals:create') && (
            <button
              onClick={() => setShowVitalsForm(!showVitalsForm)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-md shadow-cyan-900/30 transition-all cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Record Vital Signs</span>
            </button>
          )}

          {hasPermission('physician:review') && onOpenReview && (
            <button
              onClick={onOpenReview}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-900/30 transition-all cursor-pointer"
            >
              <Stethoscope className="w-4 h-4" />
              <span>Physician Review</span>
            </button>
          )}

          <button
            onClick={fetchDetails}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Refresh patient details"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Patient Demographics & Bed Location */}
      <PatientDemographicsCard
        patient={patient}
        encounter={encounter}
        onOpenCorrection={() => {}}
      />

      {/* Record New Vitals Form (Expandable) */}
      {showVitalsForm && (
        <div className="bg-slate-900 border border-cyan-500/40 rounded-3xl p-6 shadow-2xl space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-cyan-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Record Updated Bedside Vital Signs
              </h3>
            </div>
            <button
              onClick={() => setShowVitalsForm(false)}
              className="text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleRecordVitals} className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="space-y-1">
                <label className="block text-slate-400 font-bold">Heart Rate (bpm) *</label>
                <input
                  type="number"
                  required
                  value={vitalsInput.hr}
                  onChange={(e) => setVitalsInput({ ...vitalsInput, hr: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-400 font-bold">Systolic BP (mmHg) *</label>
                <input
                  type="number"
                  required
                  value={vitalsInput.sbp}
                  onChange={(e) => setVitalsInput({ ...vitalsInput, sbp: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-400 font-bold">Diastolic BP (mmHg)</label>
                <input
                  type="number"
                  value={vitalsInput.dbp}
                  onChange={(e) => setVitalsInput({ ...vitalsInput, dbp: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-400 font-bold">Oxygen SpO₂ (%) *</label>
                <input
                  type="number"
                  required
                  value={vitalsInput.spo2}
                  onChange={(e) => setVitalsInput({ ...vitalsInput, spo2: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-400 font-bold">Resp Rate (/min) *</label>
                <input
                  type="number"
                  required
                  value={vitalsInput.rr}
                  onChange={(e) => setVitalsInput({ ...vitalsInput, rr: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-400 font-bold">Temp (°C) *</label>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={vitalsInput.temp}
                  onChange={(e) => setVitalsInput({ ...vitalsInput, temp: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-400 font-bold">GCS Consciousness (3-15)</label>
                <input
                  type="number"
                  value={vitalsInput.gcs}
                  onChange={(e) => setVitalsInput({ ...vitalsInput, gcs: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-400 font-bold">Pain Level (0-10)</label>
                <input
                  type="number"
                  value={vitalsInput.pain_score}
                  onChange={(e) => setVitalsInput({ ...vitalsInput, pain_score: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>
            </div>

            <div className="space-y-1 text-xs">
              <label className="block text-slate-400 font-bold">Clinical Notes &amp; Observations</label>
              <textarea
                rows={2}
                value={vitalsInput.notes}
                onChange={(e) => setVitalsInput({ ...vitalsInput, notes: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-xs"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowVitalsForm(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingVitals}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-md shadow-cyan-900/30 transition-all disabled:opacity-50 cursor-pointer"
              >
                {submittingVitals ? 'Saving...' : 'Save Observations'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Main Grid: AI & Clinical Evidence (Left) vs Timeline & Alerts (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT 7 COLS: AI Risk, Explainability, and Vitals Table */}
        <div className="lg:col-span-7 space-y-5">
          <AiRiskCard
            aiRisk={ai_risk}
            onGenerateAi={handleGenerateAiAssessment}
            generatingAi={generatingAi}
            onOpenReview={onOpenReview}
          />

          <ExplainabilityCard
            aiExplanation={ai_explanation}
          />

          <VitalsProgressionTable
            observations={observations}
            onOpenCorrection={(obs) => setSelectedObsForCorrection(obs)}
          />
        </div>

        {/* RIGHT 5 COLS: Active Alerts & Clinical Timeline */}
        <div className="lg:col-span-5 space-y-5">
          
          {/* Active Alerts Feed */}
          {alerts.length > 0 && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-bold text-white">Active Clinical Alerts ({alerts.length})</h3>
                </div>
              </div>

              <div className="space-y-2.5">
                {alerts.map((al) => (
                  <div
                    key={al.alert_id}
                    className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-bold text-xs text-rose-300">{al.message}</span>
                      <span className="text-[10px] font-mono text-slate-500">
                        {al.created_at ? new Date(al.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>

                    <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-slate-800/60">
                      {hasPermission('alert:resolve') && (
                        <button
                          onClick={() => {
                            setSelectedAlertForAction(al);
                            setActionType('resolve');
                            setActionReason('');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-emerald-950/80 text-emerald-300 border border-emerald-800 text-[11px] font-bold cursor-pointer"
                        >
                          Resolve Alert
                        </button>
                      )}
                      {hasPermission('alert:dismiss') && (
                        <button
                          onClick={() => {
                            setSelectedAlertForAction(al);
                            setActionType('dismiss');
                            setActionReason('');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 text-[11px] cursor-pointer"
                        >
                          Dismiss
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Chronological Clinical Timeline */}
          <ClinicalTimeline timeline={timeline} />

        </div>

      </div>

      {/* Observation Correction Modal */}
      {selectedObsForCorrection && (
        <ObservationCorrectionModal
          observation={selectedObsForCorrection}
          onClose={() => setSelectedObsForCorrection(null)}
          onCorrected={() => {
            setSelectedObsForCorrection(null);
            fetchDetails();
          }}
        />
      )}

      {/* Alert Resolution Modal */}
      {selectedAlertForAction && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">
                {actionType === 'resolve' ? 'Resolve Clinical Alert' : 'Dismiss Alert'}
              </h3>
              <button
                onClick={() => setSelectedAlertForAction(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleResolveAlert} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="block text-slate-400 font-bold">Clinical Documentation Note *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Describe bedside evaluation and clinical intervention..."
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectedAlertForAction(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAction}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md transition-all cursor-pointer"
                >
                  {submittingAction ? 'Saving...' : 'Confirm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
