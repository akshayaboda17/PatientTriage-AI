import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Users, Activity, ShieldAlert, Clock, Bell, Heart, AlertOctagon,
  AlertTriangle, CheckCircle2, TrendingUp, TrendingDown, Stethoscope,
  ChevronRight, Sparkles, UserCheck, RefreshCw, BarChart2, PlusCircle,
  ShieldCheck, Eye, ArrowUpRight, Flame, Edit3
} from 'lucide-react';
import { LoadingSkeleton, EmptyState, ErrorState, AcuityBadge, SafetyStatusBadge, ConfidenceBadge, AgeGroupBadge } from './common/StateViews';
import { PRIORITY_LEVELS } from '../utils/terminology';
import { PriorityOverrideModal } from './common/PriorityOverrideModal';

export const DashboardView = ({ onSelectPatient, onReviewPatient, onOpenRegister, onNavigateTab }) => {
  const { authHeaders, hasPermission, addToast, currentStaff, hospital } = useAuth();
  const [encounters, setEncounters] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [acknowledgingId, setAcknowledgingId] = useState(null);
  const [overrideModalEncounter, setOverrideModalEncounter] = useState(null);

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
  const criticalCount = encounters.filter(e => e.triage_level === 1 || e.triage_level === 2).length;

  // Average wait time
  const avgWait = totalInED > 0
    ? Math.round(encounters.reduce((acc, curr) => acc + (curr.wait_time_mins || 0), 0) / totalInED)
    : 0;

  // Acuity breakdown
  const priorityDist = [1, 2, 3, 4, 5].map((lvl) => {
    const count = encounters.filter((e) => e.triage_level === lvl).length;
    const pct = totalInED > 0 ? Math.round((count / totalInED) * 100) : 0;
    const meta = PRIORITY_LEVELS[lvl];
    return {
      level: lvl,
      count,
      pct,
      label: meta.primary,
      secondary: meta.secondary,
      color:
        lvl === 1 ? 'bg-rose-500' :
        lvl === 2 ? 'bg-amber-500' :
        lvl === 3 ? 'bg-yellow-500' :
        lvl === 4 ? 'bg-emerald-500' : 'bg-blue-500',
    };
  });

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-5 rounded-3xl shadow-xl">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-white tracking-tight">Emergency Department Live Overview</h1>
            <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-800/50">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live Operations
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time patient queue, AI risk predictions, early deterioration alerts, and rapid clinical intake
          </p>
        </div>

        <div className="flex items-center gap-3">
          {hasPermission('patient:create') && onOpenRegister && (
            <button
              onClick={onOpenRegister}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-lg shadow-cyan-950/40 transition-all cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>+ Add Patient</span>
            </button>
          )}

          <button
            onClick={fetchDashboardData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
            title="Refresh Live Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton type="table" />
      ) : error ? (
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6">
          <ErrorState message={error} onRetry={fetchDashboardData} />
        </div>
      ) : (
        <div className="space-y-6">
          
          {/* Top 4 KPI Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* KPI 1: Active Patients */}
            <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-xl border-l-4 border-l-cyan-500 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Patients Currently in ED</span>
                <div className="text-2xl font-black text-white font-mono mt-1">{totalInED}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  <strong className="text-cyan-400">{waitingCount}</strong> waiting · <strong className="text-indigo-400">{inTreatmentCount}</strong> in care
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-cyan-950/80 border border-cyan-800/40 text-cyan-400">
                <Users className="w-5 h-5" />
              </div>
            </div>

            {/* KPI 2: Critical & Emergency */}
            <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-xl border-l-4 border-l-rose-500 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Critical &amp; Emergency</span>
                <div className="text-2xl font-black text-rose-400 font-mono mt-1">{criticalCount}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {criticalCount > 0 ? (
                    <span className="text-rose-400 font-semibold">Immediate attention needed</span>
                  ) : (
                    <span className="text-emerald-400">No critical cases pending</span>
                  )}
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-rose-950/80 border border-rose-800/40 text-rose-400">
                <AlertOctagon className="w-5 h-5" />
              </div>
            </div>

            {/* KPI 3: Active Alerts */}
            <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-xl border-l-4 border-l-amber-500 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Active Clinical Alerts</span>
                <div className={`text-2xl font-black font-mono mt-1 ${alerts.length > 0 ? 'text-amber-400 animate-pulse' : 'text-slate-200'}`}>
                  {alerts.length}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {alerts.length > 0 ? (
                    <span className="text-amber-400 font-semibold">{alerts.length} require action</span>
                  ) : (
                    <span className="text-emerald-400">All alerts cleared</span>
                  )}
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-amber-950/80 border border-amber-800/40 text-amber-400">
                <Bell className="w-5 h-5" />
              </div>
            </div>

            {/* KPI 4: Average Wait Time */}
            <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-xl border-l-4 border-l-indigo-500 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Average Wait Time</span>
                <div className="text-2xl font-black text-indigo-300 font-mono mt-1">
                  {avgWait} <span className="text-sm font-normal text-slate-400">mins</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {immediateAttentionCount > 0 ? (
                    <span className="text-rose-400 font-bold">{immediateAttentionCount} escalate required</span>
                  ) : (
                    <span className="text-emerald-400">Within safe threshold</span>
                  )}
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-indigo-950/80 border border-indigo-800/40 text-indigo-400">
                <Clock className="w-5 h-5" />
              </div>
            </div>

          </div>

          {/* MAIN 2-COLUMN SECTION: Live Queue (Left 2 cols) & Feed/Chart (Right 1 col) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            
            {/* LEFT 2 COLUMNS: Patient Queue Table */}
            <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-3xl overflow-hidden shadow-xl space-y-4">
              
              {/* Header with Title & Action */}
              <div className="p-5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-cyan-950 border border-cyan-800/50 text-cyan-400">
                    <Activity className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white tracking-tight">Live Emergency Department Patient Queue</h2>
                    <p className="text-xs text-slate-400">Ordered by care priority, safe wait-time thresholds, and AI risk prediction</p>
                  </div>
                </div>

                <span className="text-xs font-mono text-cyan-400 font-bold">
                  {totalInED} Patients Active
                </span>
              </div>

              {/* Table */}
              {encounters.length === 0 ? (
                <div className="p-8 text-center">
                  <EmptyState 
                    title="No Patients Currently in Emergency Department"
                    description="All patients have been triaged, admitted, or discharged. Click '+ Add Patient' to register new arrivals."
                    actionLabel="+ Add Patient"
                    onAction={onOpenRegister}
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800 tracking-wider">
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
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {encounters.map((patient) => {
                        const isImmediate = patient.safety_status === 'ESCALATE';
                        const isReassess = patient.safety_status === 'REASSESS';

                        return (
                          <tr
                            key={patient.encounter_id}
                            onClick={() => onSelectPatient && onSelectPatient(patient.encounter_id)}
                            className={`transition-colors hover:bg-slate-800/40 cursor-pointer ${
                              isImmediate ? 'bg-rose-950/20' : isReassess ? 'bg-amber-950/20' : ''
                            }`}
                          >
                            {/* Priority Badge */}
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              <AcuityBadge level={patient.triage_level} compact />
                            </td>

                            {/* Demographics */}
                            <td className="px-4 py-3.5 font-sans">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-slate-100 hover:text-cyan-300 transition-colors">
                                  {patient.patient_name || 'Patient'}
                                </span>
                                <AgeGroupBadge ageGroup={patient.age_group} age={patient.patient_age} />
                              </div>
                              <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                                {patient.patient_age}y {patient.patient_gender} · #{patient.encounter_id} · <span className="text-cyan-300">{patient.bed_number || 'Waiting Area'}</span>
                              </div>
                            </td>

                            {/* Chief Complaint */}
                            <td className="px-4 py-3.5 font-sans text-slate-300 max-w-[200px] truncate" title={patient.chief_complaint}>
                              {patient.chief_complaint || '—'}
                            </td>

                            {/* AI Risk & Confidence */}
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              {patient.ai_risk ? (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5 font-sans font-bold text-[11px]">
                                    <span className={patient.ai_risk.risk_category === 'CRITICAL' ? 'text-rose-400' : patient.ai_risk.risk_category === 'HIGH' ? 'text-amber-400' : 'text-cyan-300'}>
                                      {patient.ai_risk.risk_category} RISK
                                    </span>
                                    <span className="font-mono text-slate-400 text-[10px]">
                                      ({(patient.ai_risk.risk_probability * 100).toFixed(0)}%)
                                    </span>
                                  </div>
                                  <ConfidenceBadge tier={patient.ai_risk.confidence_tier} />
                                </div>
                              ) : (
                                <span className="text-[10px] text-slate-500 font-sans">Awaiting AI Evaluation</span>
                              )}
                            </td>

                            {/* Safety Status Badge */}
                            <td className="px-4 py-3.5 whitespace-nowrap font-sans">
                              <SafetyStatusBadge status={patient.safety_status} />
                            </td>

                            {/* Wait Time */}
                            <td className="px-4 py-3.5 whitespace-nowrap font-sans">
                              <div className="flex items-center gap-1 font-mono text-slate-200">
                                <Clock className="w-3.5 h-3.5 text-slate-400" />
                                <span>{patient.wait_time_mins || 0} mins</span>
                              </div>
                              {patient.wait_eval?.exceeded && (
                                <span className="text-[10px] font-bold text-rose-400 block mt-0.5">
                                  Safe Wait Time Exceeded
                                </span>
                              )}
                            </td>

                            {/* Actions */}
                            <td className="px-4 py-3.5 text-right whitespace-nowrap font-sans">
                              <div className="flex items-center justify-end gap-1.5">
                                {hasPermission('triage:update') && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOverrideModalEncounter(patient);
                                    }}
                                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 transition-all cursor-pointer"
                                    title="Adjust Care Priority (Clinician Override)"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                )}

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
                        onClick={() => onSelectPatient && onSelectPatient(alert.encounter_id)}
                        className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5 hover:border-amber-500/50 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center justify-between">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black ${
                            alert.severity === 'CRITICAL' ? 'bg-rose-950 text-rose-300 border border-rose-800' : 'bg-amber-950 text-amber-300 border border-amber-800'
                          }`}>
                            {alert.severity} ALERT
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {new Date(alert.detected_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        <p className="text-xs text-slate-200 font-semibold line-clamp-2">{alert.summary}</p>
                        
                        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                          <span>Patient: <strong>{alert.patient_id}</strong></span>
                          <button
                            onClick={(e) => handleQuickAcknowledge(e, alert.alert_id)}
                            disabled={acknowledgingId === alert.alert_id}
                            className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold rounded border border-slate-700 transition-colors"
                          >
                            {acknowledgingId === alert.alert_id ? 'Acknowledging...' : 'Acknowledge'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

          </div>

        </div>
      )}

      {/* Priority Override Modal */}
      {overrideModalEncounter && (
        <PriorityOverrideModal
          isOpen={!!overrideModalEncounter}
          encounter={overrideModalEncounter}
          patient={overrideModalEncounter.patient}
          onClose={() => setOverrideModalEncounter(null)}
          onPriorityChanged={fetchDashboardData}
        />
      )}

    </div>
  );
};
