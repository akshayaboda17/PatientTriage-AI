import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Users, Activity, ShieldAlert, Clock, Bell, Heart, AlertOctagon,
  AlertTriangle, CheckCircle2, TrendingUp, TrendingDown, Stethoscope,
  ChevronRight, Sparkles, UserCheck, RefreshCw, BarChart2, PlusCircle,
  ShieldCheck, Eye, ArrowUpRight, Flame
} from 'lucide-react';
import { LoadingSkeleton, EmptyState, ErrorState, AcuityBadge, SafetyStatusBadge, ConfidenceBadge, AgeGroupBadge } from './common/StateViews';
import { PRIORITY_LEVELS } from '../utils/terminology';

export const DashboardView = ({ onSelectPatient, onReviewPatient, onOpenRegister, onNavigateTab }) => {
  const { authHeaders, hasPermission, addToast, currentStaff, hospital } = useAuth();
  const [encounters, setEncounters] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [acknowledgingId, setAcknowledgingId] = useState(null);

  useEffect(() => {
    fetchDashboardData();
  }, [authHeaders['X-Hospital-Id']]);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [encRes, alertRes] = await Promise.all([
        fetch('/api/encounters', { headers: authHeaders }),
        fetch('/api/alerts?status=UNACKNOWLEDGED', { headers: authHeaders })
      ]);

      if (!encRes.ok) {
        throw new Error(`Failed to load emergency department patient data (HTTP ${encRes.status})`);
      }

      const encData = await encRes.json();
      setEncounters(encData.queue || []);

      if (alertRes.ok) {
        const alertData = await alertRes.json();
        setAlerts(alertData.alerts || []);
      }
    } catch (err) {
      console.error('Dashboard data error:', err);
      setError(err.message || 'Failed to refresh patient dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickAcknowledge = async (e, alertId) => {
    e.stopPropagation();
    if (!hasPermission('alert:acknowledge')) {
      addToast("Access Denied: You need 'alert:acknowledge' permission.", "error");
      return;
    }
    setAcknowledgingId(alertId);
    try {
      const res = await fetch(`/api/alerts/${alertId}/acknowledge`, {
        method: 'POST',
        headers: authHeaders
      });
      if (res.ok) {
        addToast(`Clinical alert ${alertId} acknowledged.`, "success");
        setAlerts(prev => prev.filter(a => a.alert_id !== alertId));
      }
    } catch (err) {
      addToast("Failed to acknowledge alert.", "error");
    } finally {
      setAcknowledgingId(null);
    }
  };

  // Operational counts
  const totalInED = encounters.length;
  const waitingCount = encounters.filter(e => e.status === 'WAITING').length;
  const inTriageCount = encounters.filter(e => e.status === 'IN_TRIAGE').length;
  const inTreatmentCount = encounters.filter(e => e.status === 'IN_TREATMENT').length;
  const immediateAttentionCount = encounters.filter(e => e.safety_status === 'ESCALATE').length;
  const reassessCount = encounters.filter(e => e.safety_status === 'REASSESS' || e.reassessment_required).length;
  const highRiskCount = encounters.filter(e => e.triage_level <= 2 || (e.ai_risk && ['HIGH', 'CRITICAL'].includes(e.ai_risk.risk_category))).length;
  const activeAlertsCount = alerts.length;

  // Average wait time
  const avgWaitMins = totalInED > 0
    ? Math.round(encounters.reduce((acc, curr) => acc + (curr.wait_time_mins || 0), 0) / totalInED)
    : 0;

  // Sorted Priority Patients (Critical / Immediate first, then time waiting)
  const priorityPatients = [...encounters].sort((a, b) => {
    if (a.triage_level !== b.triage_level) return a.triage_level - b.triage_level;
    const safetyRank = { ESCALATE: 1, REASSESS: 2, MONITOR: 3, STABLE: 4 };
    const rankA = safetyRank[a.safety_status] || 5;
    const rankB = safetyRank[b.safety_status] || 5;
    if (rankA !== rankB) return rankA - rankB;
    return (b.wait_time_mins || 0) - (a.wait_time_mins || 0);
  }).slice(0, 8);

  // Priority Distribution Breakdown
  const priorityDist = [1, 2, 3, 4, 5].map(level => {
    const count = encounters.filter(e => e.triage_level === level).length;
    const pct = totalInED > 0 ? Math.round((count / totalInED) * 100) : 0;
    const meta = PRIORITY_LEVELS[level];
    return {
      level,
      count,
      pct,
      label: meta.primary,
      secondary: meta.secondary,
      color: level === 1 ? 'bg-rose-500' :
             level === 2 ? 'bg-amber-500' :
             level === 3 ? 'bg-yellow-500' :
             level === 4 ? 'bg-emerald-500' : 'bg-blue-500'
    };
  });

  return (
    <div className="space-y-6">
      
      {/* Top Banner & Quick Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white tracking-tight">Emergency Department Overview</h1>
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                LIVE CAPACITY
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Real-time patient priority tracking, early condition warnings, and safe wait time monitoring
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {hasPermission('patient:create') && onOpenRegister && (
            <button
              onClick={onOpenRegister}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-md shadow-cyan-900/30 transition-all cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Add Patient</span>
            </button>
          )}

          <button
            onClick={fetchDashboardData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Patients Currently in ED */}
        <div 
          onClick={() => onNavigateTab && onNavigateTab('categories')}
          className="bg-slate-900/90 border border-slate-800 p-4.5 rounded-2xl shadow-xl flex items-center justify-between border-l-4 border-l-cyan-500 hover:border-slate-700 cursor-pointer transition-all group"
        >
          <div className="space-y-1">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Patients Currently in ED</div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-white font-mono">{totalInED}</span>
              <span className="text-xs text-slate-400">total in facility</span>
            </div>
            <div className="text-[10px] text-slate-500">
              {waitingCount} waiting · {inTreatmentCount} in treatment
            </div>
          </div>
          <div className="p-3 rounded-2xl bg-cyan-950/60 border border-cyan-800/60 text-cyan-400 group-hover:scale-105 transition-transform">
            <Users className="w-6 h-6" />
          </div>
        </div>

        {/* Critical & Emergency Priority */}
        <div 
          onClick={() => onNavigateTab && onNavigateTab('categories')}
          className="bg-slate-900/90 border border-slate-800 p-4.5 rounded-2xl shadow-xl flex items-center justify-between border-l-4 border-l-rose-500 hover:border-slate-700 cursor-pointer transition-all group"
        >
          <div className="space-y-1">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Critical &amp; Emergency Priority</div>
            <div className="flex items-baseline gap-2">
              <span className={`text-3xl font-black font-mono ${highRiskCount > 0 ? 'text-rose-400' : 'text-slate-200'}`}>
                {highRiskCount}
              </span>
              <span className="text-xs text-slate-400">immediate / high priority</span>
            </div>
            <div className="text-[10px] text-slate-500">
              {immediateAttentionCount} require immediate attention
            </div>
          </div>
          <div className="p-3 rounded-2xl bg-rose-950/60 border border-rose-800/60 text-rose-400 group-hover:scale-105 transition-transform">
            <ShieldAlert className="w-6 h-6" />
          </div>
        </div>

        {/* Active Clinical Alerts */}
        <div 
          onClick={() => onNavigateTab && onNavigateTab('alerts')}
          className="bg-slate-900/90 border border-slate-800 p-4.5 rounded-2xl shadow-xl flex items-center justify-between border-l-4 border-l-amber-500 hover:border-slate-700 cursor-pointer transition-all group"
        >
          <div className="space-y-1">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Active Clinical Alerts</div>
            <div className="flex items-baseline gap-2">
              <span className={`text-3xl font-black font-mono ${activeAlertsCount > 0 ? 'text-amber-400 animate-pulse' : 'text-slate-200'}`}>
                {activeAlertsCount}
              </span>
              <span className="text-xs text-slate-400">actionable alerts</span>
            </div>
            <div className="text-[10px] text-slate-500">
              {reassessCount} require reassessment
            </div>
          </div>
          <div className={`p-3 rounded-2xl bg-amber-950/60 border border-amber-800/60 text-amber-400 group-hover:scale-105 transition-transform ${activeAlertsCount > 0 ? 'animate-bounce' : ''}`}>
            <Bell className="w-6 h-6" />
          </div>
        </div>

        {/* Average Wait Time */}
        <div className="bg-slate-900/90 border border-slate-800 p-4.5 rounded-2xl shadow-xl flex items-center justify-between border-l-4 border-l-indigo-500">
          <div className="space-y-1">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Average Wait Time</div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-white font-mono">{avgWaitMins}</span>
              <span className="text-xs text-slate-400">minutes</span>
            </div>
            <div className="text-[10px] text-slate-500">
              Safe guidelines: Immediate (0m) · Emergency (10-15m)
            </div>
          </div>
          <div className="p-3 rounded-2xl bg-indigo-950/60 border border-indigo-800/60 text-indigo-400">
            <Clock className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Main Grid: Priority Patients + Care Priority Breakdown */}
      {loading ? (
        <LoadingSkeleton type="table" rows={6} />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchDashboardData} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* LEFT 2 COLUMNS: Patients Waiting for Care by Priority */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
              
              <div className="p-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400">
                    <ShieldAlert className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Patients in Care by Priority</h3>
                    <p className="text-[10px] text-slate-400">Ordered by care priority, possible condition change, and time waiting</p>
                  </div>
                </div>

                <button
                  onClick={() => onNavigateTab && onNavigateTab('categories')}
                  className="flex items-center gap-1 text-xs font-bold text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
                >
                  <span>View All Categories ({encounters.length})</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {priorityPatients.length === 0 ? (
                <EmptyState
                  icon={CheckCircle2}
                  title="No Patients Currently in Queue"
                  description="The emergency department waiting area is currently clear."
                  actionText={hasPermission('patient:create') ? "Add Patient" : undefined}
                  onAction={onOpenRegister}
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950/50 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
                      <tr>
                        <th className="px-4 py-3">Care Priority</th>
                        <th className="px-4 py-3">Patient &amp; Demographics</th>
                        <th className="px-4 py-3">Chief Complaint</th>
                        <th className="px-4 py-3">AI Risk &amp; Confidence</th>
                        <th className="px-4 py-3">Care Status</th>
                        <th className="px-4 py-3">Time Waiting</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {priorityPatients.map((patient) => {
                        const isBreached = patient.wait_time_mins > (patient.safe_wait_threshold_mins || 60);
                        const isImmediate = patient.safety_status === 'ESCALATE';
                        return (
                          <tr
                            key={patient.encounter_id}
                            onClick={() => onSelectPatient && onSelectPatient(patient.encounter_id)}
                            className={`hover:bg-slate-800/40 transition-colors cursor-pointer ${
                              isImmediate ? 'bg-rose-950/20' : ''
                            }`}
                          >
                            {/* Care Priority */}
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              <AcuityBadge level={patient.triage_level} />
                            </td>

                            {/* Patient Name */}
                            <td className="px-4 py-3.5">
                              <div className="font-bold text-slate-100 text-xs">{patient.patient_name}</div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <AgeGroupBadge ageGroup={patient.age_group} age={patient.age} />
                                <span className="text-[10px] text-slate-500 font-mono">Visit #{patient.encounter_id}</span>
                              </div>
                            </td>

                            {/* Chief Complaint */}
                            <td className="px-4 py-3.5 text-slate-300 max-w-[180px] truncate">
                              {patient.chief_complaint}
                            </td>

                            {/* AI Risk Score & Confidence */}
                            <td className="px-4 py-3.5 whitespace-nowrap font-mono">
                              {patient.ai_risk ? (
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`font-bold ${
                                      patient.ai_risk.risk_category === 'HIGH' || patient.ai_risk.risk_category === 'CRITICAL'
                                        ? 'text-rose-400'
                                        : patient.ai_risk.risk_category === 'MODERATE'
                                        ? 'text-amber-400'
                                        : 'text-emerald-400'
                                    }`}>
                                      {patient.ai_risk.risk_probability !== undefined
                                        ? `${(patient.ai_risk.risk_probability * 100).toFixed(0)}%`
                                        : `${patient.ai_risk.risk_score}%`} Estimated Risk
                                    </span>
                                  </div>
                                  <ConfidenceBadge confidence={patient.ai_risk.confidence || 'HIGH'} />
                                </div>
                              ) : (
                                <span className="text-slate-600 text-[10px]">Triage Assigned</span>
                              )}
                            </td>

                            {/* Care Status */}
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              <SafetyStatusBadge status={patient.safety_status} />
                            </td>

                            {/* Time Waiting */}
                            <td className="px-4 py-3.5 whitespace-nowrap font-mono">
                              <div className="flex items-center gap-1 text-slate-300">
                                <Clock className="w-3 h-3 text-slate-500" />
                                <span>{patient.wait_time_mins || 0} mins</span>
                              </div>
                              {isBreached && (
                                <span className="text-[9px] font-bold text-rose-400 bg-rose-950/80 px-1.5 py-0.5 rounded border border-rose-800/60 block mt-0.5">
                                  Safe Wait Time Exceeded
                                </span>
                              )}
                            </td>

                            {/* Actions */}
                            <td className="px-4 py-3.5 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                {hasPermission('physician:review') && onReviewPatient && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onReviewPatient(patient.encounter_id);
                                    }}
                                    className="p-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 transition-all cursor-pointer"
                                    title="Physician Review & Clinical Decision"
                                  >
                                    <Stethoscope className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectPatient && onSelectPatient(patient.encounter_id);
                                  }}
                                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
                                  title="View Patient Care Workspace"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT 1 COLUMN: Care Priority Breakdown & Live Alerts */}
          <div className="space-y-4">
            
            {/* Priority Distribution Bar Chart */}
            <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-sm font-bold text-white">Care Priority Breakdown</h3>
                </div>
                <span className="text-[10px] font-mono text-slate-400">{totalInED} Total Patients</span>
              </div>

              <div className="space-y-2.5">
                {priorityDist.map((item) => (
                  <div key={item.level} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <div className="flex items-center gap-1.5 text-[11px] font-sans text-slate-300">
                        <span className="font-semibold">{item.label}</span>
                        <span className="text-[10px] text-slate-500">({item.secondary})</span>
                      </div>
                      <span className="text-slate-400 text-[11px]">
                        <strong>{item.count}</strong> ({item.pct}%)
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
                      <div
                        className={`h-full ${item.color} rounded-full transition-all duration-500`}
                        style={{ width: `${item.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Active Clinical Alerts Feed */}
            <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl space-y-3.5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-bold text-white">Active Clinical Alerts</h3>
                </div>
                {alerts.length > 0 && (
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-600 text-white animate-pulse">
                    {alerts.length} Actionable
                  </span>
                )}
              </div>

              {alerts.length === 0 ? (
                <div className="text-center py-6 space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                  <p className="text-xs font-bold text-slate-300">All Clinical Alerts Resolved</p>
                  <p className="text-[11px] text-slate-500">No active patient condition warnings pending review.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {alerts.slice(0, 4).map((alert) => (
                    <div
                      key={alert.alert_id}
                      onClick={() => alert.encounter_id && onSelectPatient && onSelectPatient(alert.encounter_id)}
                      className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors space-y-1.5 cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${
                            alert.severity === 'CRITICAL' ? 'bg-rose-500 animate-pulse' :
                            alert.severity === 'HIGH' ? 'bg-amber-500' : 'bg-yellow-500'
                          }`} />
                          <span className="text-xs font-bold text-slate-200 truncate max-w-[160px]">
                            {alert.patient_name || 'Patient'}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-500">
                          {alert.created_at ? new Date(alert.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-300 leading-snug line-clamp-2">
                        {alert.message}
                      </p>

                      <div className="flex items-center justify-between pt-1 text-[10px]">
                        <span className="text-slate-500 font-mono">Visit #{alert.encounter_id || alert.alert_id}</span>
                        {hasPermission('alert:acknowledge') && (
                          <button
                            onClick={(e) => handleQuickAcknowledge(e, alert.alert_id)}
                            disabled={acknowledgingId === alert.alert_id}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold border border-slate-700 transition-colors cursor-pointer"
                          >
                            {acknowledgingId === alert.alert_id ? 'Acknowledging...' : 'Acknowledge Alert'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  {alerts.length > 4 && (
                    <button
                      onClick={() => onNavigateTab && onNavigateTab('alerts')}
                      className="w-full py-2 text-center text-xs font-bold text-cyan-400 hover:text-cyan-300 bg-slate-950 rounded-xl border border-slate-800 transition-colors cursor-pointer"
                    >
                      View All {alerts.length} Clinical Alerts →
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
