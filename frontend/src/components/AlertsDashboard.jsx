import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  ShieldAlert, AlertTriangle, AlertOctagon, CheckCircle2, Clock, 
  ArrowRight, Search, Filter, Stethoscope, ChevronRight, XCircle, Check, Eye,
  Bell, RefreshCw, X, User, Activity, AlertCircle, ShieldCheck
} from 'lucide-react';
import { LoadingSkeleton, EmptyState, ErrorState } from './common/StateViews';

export const AlertsDashboard = ({ onSelectPatient, onAlertStateChanged }) => {
  const { authHeaders, hasPermission, addToast, currentStaff } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [metrics, setMetrics] = useState({ unacknowledged: 0, acknowledged: 0, resolved: 0, critical: 0, high: 0, moderate: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Resolution & Dismissal Modal
  const [selectedAlertForAction, setSelectedAlertForAction] = useState(null);
  const [actionType, setActionType] = useState(null); // 'resolve' | 'dismiss'
  const [actionReason, setActionReason] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);

  useEffect(() => {
    fetchAlerts();
  }, [authHeaders['X-Hospital-Id']]);

  const fetchAlerts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/alerts', { headers: authHeaders });
      if (res.status === 403) {
        setError("Access Denied: Your role does not have permission to view clinical alerts.");
        return;
      }
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}: Failed to load clinical alerts.`);
      }
      const data = await res.json();
      setAlerts(data.alerts || []);
      setMetrics(data.metrics || {});
    } catch (err) {
      console.error('Alerts fetch error:', err);
      setError(err.message || 'Failed to load clinical alerts.');
    } finally {
      setLoading(false);
    }
  };

  const handleAcknowledge = async (e, alertId) => {
    e.stopPropagation();
    if (!hasPermission('alert:acknowledge')) {
      addToast("Access Denied: Your role does not have 'alert:acknowledge' permission.", "error");
      return;
    }

    try {
      const res = await fetch(`/api/alerts/${alertId}/acknowledge`, {
        method: 'POST',
        headers: authHeaders
      });
      if (res.ok) {
        const data = await res.json();
        addToast(`Alert ${alertId} acknowledged successfully by ${currentStaff.name}.`, 'success');
        fetchAlerts();
        if (onAlertStateChanged) onAlertStateChanged();
      } else {
        const err = await res.json().catch(() => ({}));
        addToast(err.detail || "Failed to acknowledge alert.", "error");
      }
    } catch (err) {
      addToast("Network error acknowledging alert.", "error");
    }
  };

  const handleOpenActionModal = (e, alert, type) => {
    e.stopPropagation();
    setSelectedAlertForAction(alert);
    setActionType(type);
    setActionReason('');
  };

  const handleSubmitAction = async (e) => {
    e.preventDefault();
    if (!actionReason.trim()) {
      addToast("Clinical documentation / justification note is required.", "warning");
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
        addToast(
          `Alert ${selectedAlertForAction.alert_id} ${actionType === 'resolve' ? 'resolved' : 'dismissed'} successfully.`,
          'success'
        );
        setSelectedAlertForAction(null);
        setActionReason('');
        setActionType(null);
        fetchAlerts();
        if (onAlertStateChanged) onAlertStateChanged();
      } else {
        const err = await res.json().catch(() => ({}));
        addToast(err.detail || `Failed to ${actionType} alert.`, "error");
      }
    } catch (err) {
      addToast("Network error submitting alert resolution.", "error");
    } finally {
      setSubmittingAction(false);
    }
  };

  // Client-side filtering
  const filteredAlerts = alerts.filter((alert) => {
    if (statusFilter !== 'ALL' && alert.status !== statusFilter) return false;
    if (severityFilter !== 'ALL' && alert.severity !== severityFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const patName = (alert.patient_name || '').toLowerCase();
      const msg = (alert.message || '').toLowerCase();
      const type = (alert.alert_type || '').toLowerCase();
      const encId = (alert.encounter_id || '').toLowerCase();
      return patName.includes(q) || msg.includes(q) || type.includes(q) || encId.includes(q);
    }
    return true;
  });

  const getSeverityPill = (severity) => {
    switch (severity) {
      case 'CRITICAL':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-600 text-white shadow-md shadow-rose-950 animate-pulse shrink-0">
            <AlertOctagon className="w-3 h-3" />
            CRITICAL
          </span>
        );
      case 'HIGH':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950 shrink-0">
            <AlertTriangle className="w-3 h-3" />
            HIGH RISK
          </span>
        );
      case 'MODERATE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-yellow-950 text-yellow-300 border border-yellow-800 shrink-0">
            MODERATE
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-800 shrink-0">
            INFO
          </span>
        );
    }
  };

  const getClinicalRationale = (alertType) => {
    switch (alertType) {
      case 'VITALS_DETERIORATION':
        return 'Early warning deterioration detected by continuous physiological trend analysis. Elevated risk of cardiopulmonary decompensation.';
      case 'WAIT_THRESHOLD_BREACHED':
        return 'Patient has exceeded safe emergency department waiting limit for assigned triage acuity level. Immediate clinician triage required.';
      case 'AI_RISK_ELEVATION':
        return 'Machine learning inference model predicts >75% likelihood of critical clinical decompensation within 24 hours.';
      case 'CLINICAL_DISCORDANCE':
        return 'Intake symptoms and objective vital signs conflict. Under-triage protection escalation applied.';
      default:
        return 'Active clinical event requiring clinician awareness and structured review.';
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-white tracking-tight">Clinical Alerts &amp; Deterioration Dashboard</h1>
              {metrics.unacknowledged > 0 && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-600 text-white animate-pulse">
                  {metrics.unacknowledged} UNACKNOWLEDGED
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Early warning physiological alarms, safe wait threshold monitoring, and clinician response workflow
            </p>
          </div>
        </div>

        <button
          onClick={fetchAlerts}
          disabled={loading}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Alarms</span>
        </button>
      </div>

      {/* Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        
        {/* Total Alerts */}
        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-xl flex items-center justify-between border-l-4 border-l-cyan-500">
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Generated</div>
            <div className="text-2xl font-black text-white font-mono mt-0.5">{alerts.length}</div>
          </div>
          <Bell className="w-6 h-6 text-cyan-400/80" />
        </div>

        {/* Unacknowledged Alarms */}
        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-xl flex items-center justify-between border-l-4 border-l-rose-500">
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Unacknowledged</div>
            <div className={`text-2xl font-black font-mono mt-0.5 ${metrics.unacknowledged > 0 ? 'text-rose-400 animate-pulse' : 'text-slate-200'}`}>
              {metrics.unacknowledged || 0}
            </div>
          </div>
          <AlertOctagon className="w-6 h-6 text-rose-400/80" />
        </div>

        {/* Critical Severity */}
        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-xl flex items-center justify-between border-l-4 border-l-amber-500">
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Critical Severity</div>
            <div className={`text-2xl font-black font-mono mt-0.5 ${metrics.critical > 0 ? 'text-amber-400' : 'text-slate-200'}`}>
              {metrics.critical || 0}
            </div>
          </div>
          <AlertTriangle className="w-6 h-6 text-amber-400/80" />
        </div>

        {/* Resolved Count */}
        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-xl flex items-center justify-between border-l-4 border-l-emerald-500">
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Resolved Alarms</div>
            <div className="text-2xl font-black text-emerald-400 font-mono mt-0.5">{metrics.resolved || 0}</div>
          </div>
          <CheckCircle2 className="w-6 h-6 text-emerald-400/80" />
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-lg flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        
        {/* Status Tabs */}
        <div className="flex flex-wrap items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
          {['ALL', 'UNACKNOWLEDGED', 'ACKNOWLEDGED', 'RESOLVED'].map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                statusFilter === tab
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab === 'ALL' ? 'All Alerts' : tab}
            </button>
          ))}
        </div>

        {/* Severity & Search */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300 font-medium focus:outline-none focus:border-cyan-500 cursor-pointer"
          >
            <option value="ALL">All Severities</option>
            <option value="CRITICAL">Critical Severity</option>
            <option value="HIGH">High Risk</option>
            <option value="MODERATE">Moderate</option>
            <option value="LOW">Low / Info</option>
          </select>

          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2" />
            <input
              type="text"
              placeholder="Search alert, patient name, type..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>
      </div>

      {/* Alerts List */}
      <div className="space-y-3">
        {loading ? (
          <LoadingSkeleton type="table" rows={6} />
        ) : error ? (
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6">
            <ErrorState message={error} onRetry={fetchAlerts} />
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-8">
            <EmptyState
              icon={CheckCircle2}
              title="No Active Alerts"
              description="No clinical alerts or patient deterioration warnings match your active filters."
              actionText="Reset Filters"
              onAction={() => {
                setStatusFilter('ALL');
                setSeverityFilter('ALL');
                setSearchQuery('');
              }}
            />
          </div>
        ) : (
          filteredAlerts.map((alert) => {
            const isUnack = alert.status === 'UNACKNOWLEDGED';
            const isCritical = alert.severity === 'CRITICAL';

            return (
              <div
                key={alert.alert_id}
                onClick={() => alert.encounter_id && onSelectPatient && onSelectPatient(alert.encounter_id)}
                className={`bg-slate-900/90 border rounded-2xl p-5 shadow-xl transition-all duration-150 hover:border-slate-700 cursor-pointer space-y-3 ${
                  isUnack && isCritical
                    ? 'border-rose-600/80 bg-rose-950/20 shadow-rose-950/30'
                    : isUnack
                    ? 'border-amber-600/70 bg-amber-950/10'
                    : 'border-slate-800'
                }`}
              >
                {/* Header Row: Severity Pill, Patient Name, Timestamp, Status */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {getSeverityPill(alert.severity)}
                    <span className="font-bold text-white text-sm">
                      {alert.patient_name ? `Patient: ${alert.patient_name}` : alert.alert_type}
                    </span>
                    {alert.encounter_id && (
                      <span className="text-[11px] text-slate-400 font-mono">
                        ENC: #{alert.encounter_id}
                      </span>
                    )}
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 text-cyan-300 border border-slate-800">
                      {alert.alert_type}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    <span>
                      {alert.created_at ? new Date(alert.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </span>
                    <span className="text-slate-500">·</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      alert.status === 'UNACKNOWLEDGED' ? 'bg-rose-950 text-rose-300 border border-rose-800' :
                      alert.status === 'ACKNOWLEDGED' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                      'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    }`}>
                      {alert.status}
                    </span>
                  </div>
                </div>

                {/* Body Row: 3 Clinical Sections */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  
                  {/* 1. What Happened */}
                  <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800/80 space-y-1">
                    <div className="text-[10px] uppercase font-bold text-slate-400">1. What Happened</div>
                    <p className="text-slate-200 leading-snug font-medium">{alert.message}</p>
                  </div>

                  {/* 2. Why It Matters */}
                  <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800/80 space-y-1">
                    <div className="text-[10px] uppercase font-bold text-slate-400">2. Clinical Context</div>
                    <p className="text-slate-300 leading-snug">{getClinicalRationale(alert.alert_type)}</p>
                  </div>

                  {/* 3. Action / Resolution History */}
                  <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800/80 space-y-1">
                    <div className="text-[10px] uppercase font-bold text-slate-400">3. Governance &amp; Response</div>
                    {alert.status === 'RESOLVED' ? (
                      <div className="space-y-0.5 text-slate-300">
                        <div className="text-emerald-400 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Resolved by {alert.resolved_by || 'Staff'}
                        </div>
                        <p className="text-slate-400 text-[11px]">{alert.resolution_notes || 'Action documented.'}</p>
                      </div>
                    ) : alert.status === 'ACKNOWLEDGED' ? (
                      <div className="text-amber-300">
                        Acknowledged by <strong>{alert.acknowledged_by || 'Clinician'}</strong>. Pending resolution.
                      </div>
                    ) : (
                      <div className="text-rose-300 font-medium">
                        Immediate clinician acknowledgment &amp; bedside reassessment required.
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
                  <span className="text-[11px] text-slate-500 font-mono">
                    ID: {alert.alert_id}
                  </span>

                  <div className="flex items-center gap-2">
                    {/* Acknowledge Button */}
                    {alert.status === 'UNACKNOWLEDGED' && hasPermission('alert:acknowledge') && (
                      <button
                        onClick={(e) => handleAcknowledge(e, alert.alert_id)}
                        className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-bold transition-all shadow cursor-pointer"
                      >
                        Acknowledge Alarm
                      </button>
                    )}

                    {/* Resolve Button */}
                    {alert.status !== 'RESOLVED' && hasPermission('alert:resolve') && (
                      <button
                        onClick={(e) => handleOpenActionModal(e, alert, 'resolve')}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/40 text-xs font-bold transition-all cursor-pointer"
                      >
                        Resolve with Notes
                      </button>
                    )}

                    {/* Dismiss Button */}
                    {alert.status !== 'RESOLVED' && hasPermission('alert:dismiss') && (
                      <button
                        onClick={(e) => handleOpenActionModal(e, alert, 'dismiss')}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-rose-300 border border-slate-700 text-xs font-medium transition-all cursor-pointer"
                      >
                        Dismiss
                      </button>
                    )}

                    {/* View Patient Chart */}
                    {alert.encounter_id && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectPatient && onSelectPatient(alert.encounter_id);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Chart</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Resolution / Dismissal Justification Modal */}
      {selectedAlertForAction && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">
                  {actionType === 'resolve' ? 'Resolve Clinical Alarm' : 'Dismiss Clinical Alarm'}
                </h3>
              </div>
              <button
                onClick={() => setSelectedAlertForAction(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitAction} className="space-y-4">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1">
                <div className="font-bold text-slate-200">Alert: {selectedAlertForAction.message}</div>
                <div className="text-slate-400 font-mono">ID: {selectedAlertForAction.alert_id}</div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Clinical Documentation / Resolution Rationale <span className="text-rose-400">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Document the bedside clinical action taken (e.g. O2 administered, re-triaged ESI 2, vital signs stabilized)..."
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
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
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-900/30 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {submittingAction ? 'Documenting...' : `Confirm ${actionType === 'resolve' ? 'Resolution' : 'Dismissal'}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
