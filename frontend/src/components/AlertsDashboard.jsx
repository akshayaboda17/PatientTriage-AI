import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  ShieldAlert, AlertTriangle, AlertOctagon, CheckCircle2, Clock, 
  ArrowRight, Search, Filter, Stethoscope, ChevronRight, XCircle, Check, Eye
} from 'lucide-react';

export const AlertsDashboard = ({ onSelectPatient, onAlertStateChanged }) => {
  const { authHeaders, hasPermission, addToast, currentStaff } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [metrics, setMetrics] = useState({ unacknowledged: 0, acknowledged: 0, resolved: 0, critical: 0, high: 0, moderate: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Resolution modal state
  const [selectedAlertForAction, setSelectedAlertForAction] = useState(null);
  const [actionType, setActionType] = useState(null); // 'resolve' or 'dismiss'
  const [actionReason, setActionReason] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);

  useEffect(() => {
    fetchAlerts();
  }, [authHeaders['X-Hospital-Id']]);

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/alerts', { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.alerts || []);
        setMetrics(data.metrics || {});
      } else if (res.status === 403) {
        addToast("You do not have permission to view clinical alerts.", "error");
      }
    } catch (err) {
      addToast("Failed to load clinical alerts.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleAcknowledge = async (alertId) => {
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
        const err = await res.json();
        addToast(err.detail || "Unable to acknowledge alert.", "error");
      }
    } catch (err) {
      addToast("Network error acknowledging alert.", "error");
    }
  };

  const handleResolveOrDismissSubmit = async () => {
    if (!actionReason.trim()) {
      addToast("Clinical documentation / justification is required.", "warning");
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
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ [bodyKey]: actionReason })
      });

      if (res.ok) {
        addToast(`Alert ${selectedAlertForAction.alert_id} ${actionType === 'resolve' ? 'resolved' : 'dismissed'} successfully.`, 'success');
        setSelectedAlertForAction(null);
        setActionReason('');
        setActionType(null);
        fetchAlerts();
        if (onAlertStateChanged) onAlertStateChanged();
      } else {
        const err = await res.json();
        addToast(err.detail || "Action failed.", "error");
      }
    } catch (err) {
      addToast("Network error submitting action.", "error");
    } finally {
      setSubmittingAction(false);
    }
  };

  // Filter & Priority Sorting
  const filteredAlerts = alerts
    .filter((a) => {
      if (statusFilter !== 'ALL' && a.status !== statusFilter) return false;
      if (severityFilter !== 'ALL' && a.severity !== severityFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          a.patient_id.toLowerCase().includes(q) ||
          a.encounter_id.toLowerCase().includes(q) ||
          a.summary.toLowerCase().includes(q) ||
          a.alert_id.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      // Prioritize CRITICAL over HIGH over MODERATE
      const sevOrder = { CRITICAL: 1, HIGH: 2, MODERATE: 3, INFORMATIONAL: 4 };
      const statusOrder = { UNACKNOWLEDGED: 1, ACKNOWLEDGED: 2, RESOLVED: 3, DISMISSED: 4 };
      
      if (statusOrder[a.status] !== statusOrder[b.status]) {
        return statusOrder[a.status] - statusOrder[b.status];
      }
      if (sevOrder[a.severity] !== sevOrder[b.severity]) {
        return sevOrder[a.severity] - sevOrder[b.severity];
      }
      return new Date(b.detected_at) - new Date(a.detected_at);
    });

  const getSeverityBadge = (severity) => {
    switch (severity) {
      case 'CRITICAL':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
            <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
            CRITICAL
          </span>
        );
      case 'HIGH':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            HIGH
          </span>
        );
      case 'MODERATE':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-yellow-500/20 text-yellow-300 border border-yellow-500/40">
            <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
            MODERATE
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40">
            INFORMATIONAL
          </span>
        );
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'UNACKNOWLEDGED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-950 text-rose-300 border border-rose-700 animate-pulse-subtle">
            UNACKNOWLEDGED
          </span>
        );
      case 'ACKNOWLEDGED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-950 text-amber-300 border border-amber-700">
            ACKNOWLEDGED
          </span>
        );
      case 'RESOLVED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700">
            RESOLVED
          </span>
        );
      case 'DISMISSED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
            DISMISSED
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header & Metrics Overview */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Clinical Alerts & Deterioration Center</h1>
              <p className="text-xs text-slate-400">Longitudinal vital trend alerts requiring Emergency Department review</p>
            </div>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="bg-slate-900/90 border border-rose-500/30 p-3 rounded-xl">
            <div className="text-[11px] font-medium text-rose-400">Unacknowledged</div>
            <div className="text-2xl font-black text-rose-200 mt-0.5">{metrics.unacknowledged || 0}</div>
          </div>
          <div className="bg-slate-900/90 border border-amber-500/30 p-3 rounded-xl">
            <div className="text-[11px] font-medium text-amber-400">Acknowledged</div>
            <div className="text-2xl font-black text-amber-200 mt-0.5">{metrics.acknowledged || 0}</div>
          </div>
          <div className="bg-slate-900/90 border border-emerald-500/30 p-3 rounded-xl">
            <div className="text-[11px] font-medium text-emerald-400">Resolved</div>
            <div className="text-2xl font-black text-emerald-200 mt-0.5">{metrics.resolved || 0}</div>
          </div>
          <div className="bg-slate-900/90 border border-slate-700 p-3 rounded-xl">
            <div className="text-[11px] font-medium text-slate-400">Active Critical/High</div>
            <div className="text-2xl font-black text-slate-200 mt-0.5">{(metrics.critical || 0) + (metrics.high || 0)}</div>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search patient, encounter, alert ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950/80 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          {/* Status filter */}
          <div className="flex items-center gap-1 text-xs text-slate-400">
            <Filter className="w-3.5 h-3.5" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="UNACKNOWLEDGED">Unacknowledged Only</option>
              <option value="ACKNOWLEDGED">Acknowledged Only</option>
              <option value="RESOLVED">Resolved Only</option>
              <option value="DISMISSED">Dismissed Only</option>
            </select>
          </div>

          {/* Severity filter */}
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MODERATE">Moderate</option>
          </select>
        </div>
      </div>

      {/* Alerts List */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 text-sm">Loading clinical deterioration alerts...</div>
      ) : filteredAlerts.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/40">
          <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-slate-200">No matching clinical alerts</h3>
          <p className="text-xs text-slate-400 mt-1">No active patient deterioration alerts matching the current filter criteria.</p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {filteredAlerts.map((alert) => (
            <div
              key={alert.alert_id}
              className={`p-4 sm:p-5 rounded-2xl border transition-all duration-200 shadow-md ${
                alert.status === 'UNACKNOWLEDGED'
                  ? alert.severity === 'CRITICAL'
                    ? 'bg-rose-950/40 border-rose-600/70 shadow-rose-950/30'
                    : 'bg-slate-900/95 border-amber-500/50'
                  : alert.status === 'ACKNOWLEDGED'
                  ? 'bg-slate-900/90 border-slate-700'
                  : 'bg-slate-900/60 border-slate-800/80 opacity-80'
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                
                {/* Left info column */}
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    {getSeverityBadge(alert.severity)}
                    {getStatusBadge(alert.status)}
                    
                    <span className="text-xs font-mono font-bold text-slate-300">
                      {alert.alert_id}
                    </span>

                    <span className="text-xs text-slate-400">•</span>

                    <button
                      onClick={() => onSelectPatient(alert.encounter_id)}
                      className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 hover:underline flex items-center gap-1"
                    >
                      Patient {alert.patient_id} ({alert.encounter_id})
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>

                    <span className="text-xs text-slate-400">•</span>
                    
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      Detected {new Date(alert.detected_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {/* Summary */}
                  <p className="text-sm font-medium text-slate-100 leading-snug">
                    {alert.summary}
                  </p>

                  {/* Evidence Pills Breakdown */}
                  {alert.evidence && alert.evidence.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {alert.evidence.map((sig, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px]"
                        >
                          <span className="font-semibold text-slate-300">{sig.feature_name || sig.feature}:</span>
                          <span className="font-mono text-slate-400">{sig.previous_value}</span>
                          <span className="text-slate-500">→</span>
                          <span className={`font-mono font-bold ${
                            sig.feature === 'spo2' ? (sig.change < 0 ? 'text-rose-400' : 'text-emerald-400') :
                            sig.change > 0 ? 'text-rose-400' : 'text-slate-300'
                          }`}>
                            {sig.current_value} {sig.unit}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            ({sig.change > 0 ? `+${sig.change}` : sig.change} {sig.unit})
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Rule version & Clinical Attribution trail */}
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400 pt-1">
                    <span className="text-slate-400 font-mono">Rule: {alert.detection_rule_id} (v{alert.detection_version})</span>
                    
                    {alert.acknowledged_at && (
                      <>
                        <span>•</span>
                        <span className="text-amber-400">
                          Acknowledged by {alert.acknowledged_by_name} ({alert.acknowledged_by_role}) at{' '}
                          {new Date(alert.acknowledged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </>
                    )}

                    {alert.resolved_at && (
                      <>
                        <span>•</span>
                        <span className="text-emerald-400">
                          Resolved by {alert.resolved_by_name} ({alert.resolved_by_role}): "{alert.resolution_reason}"
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Right Action Buttons */}
                <div className="flex items-center gap-2.5 shrink-0 self-start lg:self-center">
                  
                  {/* View Patient Button */}
                  <button
                    onClick={() => onSelectPatient(alert.encounter_id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors border border-slate-700"
                  >
                    <Eye className="w-3.5 h-3.5 text-cyan-400" />
                    <span>View Patient</span>
                  </button>

                  {/* Acknowledge Action */}
                  {alert.status === 'UNACKNOWLEDGED' && (
                    <button
                      onClick={() => handleAcknowledge(alert.alert_id)}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-md shadow-amber-900/30 transition-colors"
                      title="Acknowledge clinical alert"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Acknowledge</span>
                    </button>
                  )}

                  {/* Resolve Action */}
                  {alert.status === 'ACKNOWLEDGED' && hasPermission('alert:resolve') && (
                    <button
                      onClick={() => {
                        setSelectedAlertForAction(alert);
                        setActionType('resolve');
                        setActionReason('');
                      }}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-900/30 transition-colors"
                      title="Resolve clinical alert with clinical documentation"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Resolve Alert</span>
                    </button>
                  )}

                  {/* Dismiss Action */}
                  {alert.status === 'UNACKNOWLEDGED' && hasPermission('alert:dismiss') && (
                    <button
                      onClick={() => {
                        setSelectedAlertForAction(alert);
                        setActionType('dismiss');
                        setActionReason('');
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-rose-300 text-xs font-medium transition-colors border border-slate-700"
                      title="Dismiss alert with justification"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Dismiss</span>
                    </button>
                  )}
                </div>

              </div>
            </div>
          ))}
        </div>
      )}

      {/* Resolution & Dismissal Clinical Dialog Modal */}
      {selectedAlertForAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {actionType === 'resolve' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : (
                  <XCircle className="w-5 h-5 text-rose-400" />
                )}
                <h3 className="text-base font-bold text-white">
                  {actionType === 'resolve' ? 'Resolve Clinical Alert' : 'Dismiss Clinical Alert'}
                </h3>
              </div>
              <button
                onClick={() => setSelectedAlertForAction(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 text-xs text-slate-300 space-y-1">
              <div className="font-semibold text-slate-200">Alert: {selectedAlertForAction.alert_id}</div>
              <div>Patient: {selectedAlertForAction.patient_id} ({selectedAlertForAction.encounter_id})</div>
              <div className="text-slate-400">{selectedAlertForAction.summary}</div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                {actionType === 'resolve' ? 'Clinical Reassessment & Resolution Note *' : 'Clinical Justification for Dismissal *'}
              </label>
              <textarea
                rows={3}
                placeholder={
                  actionType === 'resolve'
                    ? 'e.g., Reassessed after 4L O2 via nasal cannula and nebulized bronchodilator. SpO2 recovered to 96%, RR 18, patient stable.'
                    : 'e.g., Clinical artifact due to loose probe during patient movement.'
                }
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                This action will be attributed to <strong className="text-slate-300">{currentStaff.name} ({currentStaff.role})</strong> and recorded in the audit trail.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setSelectedAlertForAction(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={submittingAction || !actionReason.trim()}
                onClick={handleResolveOrDismissSubmit}
                className={`px-4 py-2 rounded-xl text-xs font-bold text-white transition-all shadow-md ${
                  actionType === 'resolve'
                    ? 'bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50'
                    : 'bg-rose-600 hover:bg-rose-500 disabled:opacity-50'
                }`}
              >
                {submittingAction ? 'Recording...' : actionType === 'resolve' ? 'Confirm Resolution' : 'Confirm Dismissal'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
