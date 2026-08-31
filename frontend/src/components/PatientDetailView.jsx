import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  ArrowLeft, Activity, ShieldAlert, PlusCircle, CheckCircle2, Stethoscope, RefreshCw, X, Edit3, Sparkles
} from 'lucide-react';
import { ObservationCorrectionModal } from './ObservationCorrectionModal';
import { UpdatePatientConditionModal } from './patient/UpdatePatientConditionModal';
import { PatientDemographicsCard } from './patient/PatientDemographicsCard';
import { VitalsProgressionTable } from './patient/VitalsProgressionTable';
import { AiRiskCard } from './patient/AiRiskCard';
import { ExplainabilityCard } from './patient/ExplainabilityCard';
import { ClinicalTimeline } from './patient/ClinicalTimeline';

export const PatientDetailView = ({ encounterId, onBack, onOpenReview, onAlertStateChanged }) => {
  const { authHeaders, hasPermission, addToast, currentStaff } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Update Condition & Vitals Modal state
  const [showUpdateConditionModal, setShowUpdateConditionModal] = useState(false);

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

  const { encounter, patient, observations = [], ai_risk, ai_explanation, alerts = [], timeline = [], triage } = data;

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
              onClick={() => setShowUpdateConditionModal(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-lg shadow-cyan-900/40 transition-all cursor-pointer"
            >
              <Activity className="w-4 h-4" />
              <span>Update Condition &amp; Vitals</span>
            </button>
          )}

          {hasPermission('physician:review') && onOpenReview && (
            <button
              onClick={onOpenReview}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-900/30 transition-all cursor-pointer"
            >
              <Stethoscope className="w-4 h-4" />
              <span>Physician Review</span>
            </button>
          )}

          <button
            onClick={fetchDetails}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
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
        triage={triage}
        onOpenCorrection={() => {}}
      />

      {/* Main Grid: Clinical Observations & AI Risk Assessment */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        {/* Left 2 Columns: Longitudinal Vitals & Clinical Timeline */}
        <div className="lg:col-span-2 space-y-6">
          <VitalsProgressionTable
            observations={observations}
            onOpenUpdateModal={() => setShowUpdateConditionModal(true)}
          />

          <ClinicalTimeline timeline={timeline} />
        </div>

        {/* Right 1 Column: AI Clinical Risk & Model Explainability */}
        <div className="space-y-6">
          <AiRiskCard
            aiRisk={ai_risk}
            encounter={encounter}
            onTriggerAssessment={fetchDetails}
          />

          <ExplainabilityCard
            explanation={ai_explanation}
          />

          {/* Active Alerts for this Patient */}
          {alerts.length > 0 && (
            <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Active Condition Alerts</h3>
              </div>
              
              <div className="space-y-2">
                {alerts.map((alert) => (
                  <div key={alert.alert_id} className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                        alert.severity === 'CRITICAL' ? 'bg-rose-950 text-rose-300 border border-rose-800' : 'bg-amber-950 text-amber-300 border border-amber-800'
                      }`}>
                        {alert.severity}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(alert.detected_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-xs text-slate-200">{alert.summary}</p>
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        onClick={() => {
                          setSelectedAlertForAction(alert);
                          setActionType('resolve');
                        }}
                        className="px-2 py-1 rounded bg-emerald-950 hover:bg-emerald-900 text-emerald-300 text-[10px] font-bold border border-emerald-800"
                      >
                        Resolve Alert
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Update Condition & Vitals Modal */}
      {showUpdateConditionModal && (
        <UpdatePatientConditionModal
          isOpen={showUpdateConditionModal}
          onClose={() => setShowUpdateConditionModal(false)}
          encounter={encounter}
          patient={patient}
          currentTriageLevel={triage?.triage_level}
          onConditionUpdated={() => {
            fetchDetails();
            if (onAlertStateChanged) onAlertStateChanged();
          }}
        />
      )}

      {/* Observation Correction Modal */}
      {selectedObsForCorrection && (
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
      )}

      {/* Alert Resolution Modal */}
      {selectedAlertForAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white">Resolve Clinical Alert</h3>
              <button onClick={() => setSelectedAlertForAction(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-300">{selectedAlertForAction.summary}</p>
            <form onSubmit={handleResolveAlert} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-bold mb-1">Resolution Clinical Note *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Document clinical resolution..."
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedAlertForAction(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAction}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                >
                  Confirm Resolution
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
