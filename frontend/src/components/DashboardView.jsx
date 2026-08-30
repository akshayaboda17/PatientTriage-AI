import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Users, Activity, ShieldAlert, Clock, Heart, AlertOctagon,
  AlertTriangle, CheckCircle2, TrendingUp, TrendingDown, Stethoscope,
  ChevronRight, Sparkles, UserCheck, RefreshCw, BarChart2, PlusCircle
} from 'lucide-react';

export const DashboardView = ({ onSelectPatient, onReviewPatient, onOpenRegister, onNavigateTab }) => {
  const { authHeaders, hasPermission, addToast, currentStaff } = useAuth();
  const [encounters, setEncounters] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, [authHeaders['X-Hospital-Id']]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [encRes, alertRes] = await Promise.all([
        fetch('/api/encounters', { headers: authHeaders }),
        fetch('/api/alerts?status=UNACKNOWLEDGED', { headers: authHeaders })
      ]);

      if (encRes.ok) {
        const encData = await encRes.json();
        setEncounters(encData.queue || []);
      }
      if (alertRes.ok) {
        const alertData = await alertRes.json();
        setAlerts(alertData.alerts || []);
      }
    } catch (err) {
      addToast("Failed to refresh ED dashboard data.", "error");
    } finally {
      setLoading(false);
    }
  };

  // Compute operational aggregates
  const activeCount = encounters.length;
  const waitingCount = encounters.filter(e => e.status === 'WAITING').length;
  const inTreatmentCount = encounters.filter(e => e.status === 'IN_TREATMENT' || e.status === 'IN_TRIAGE').length;
  const highRiskCount = encounters.filter(e => e.triage_level <= 2 || (e.ai_risk && ['HIGH', 'CRITICAL'].includes(e.ai_risk.risk_category))).length;
  const unackAlertsCount = alerts.length;
  const criticalAlerts = alerts.filter(a => a.severity === 'CRITICAL' || a.severity === 'HIGH');

  // Compute triage distribution
  const triageDist = [1, 2, 3, 4, 5].map(level => ({
    level,
    count: encounters.filter(e => e.triage_level === level).length,
    label: level === 1 ? 'Resuscitation (ESI 1)' :
           level === 2 ? 'Emergent (ESI 2)' :
           level === 3 ? 'Urgent (ESI 3)' :
           level === 4 ? 'Less Urgent (ESI 4)' : 'Non-Urgent (ESI 5)'
  }));

  // Average wait time
  const avgWaitMins = activeCount > 0
    ? Math.round(encounters.reduce((acc, curr) => acc + (curr.wait_time_mins || 0), 0) / activeCount)
    : 0;

  return (
    <div className="space-y-6">
      
      {/* Top Banner & Quick Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Emergency Department Operational Dashboard</h1>
              <p className="text-xs text-slate-400">Live clinical capacity, triage distribution, and early deterioration tracking</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {hasPermission('patient:create') && (
            <button
              onClick={onOpenRegister}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-md shadow-cyan-900/30 transition-all"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Register New Patient</span>
            </button>
          )}

          <button
            onClick={fetchDashboardData}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
            title="Refresh dashboard"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* 4 Primary Operational Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Active Patients */}
        <div 
          onClick={() => onNavigateTab('queue')}
          className="bg-slate-900/90 border border-slate-800 hover:border-cyan-500/50 p-4 rounded-2xl shadow-lg cursor-pointer transition-all hover:bg-slate-850"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active ED Census</span>
            <Users className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-3xl font-black text-white mt-2 font-mono">{activeCount}</div>
          <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-400">
            <span>{waitingCount} waiting</span>
            <span>•</span>
            <span>{inTreatmentCount} in treatment</span>
          </div>
        </div>

        {/* Card 2: High & Critical Risk */}
        <div 
          onClick={() => onNavigateTab('queue')}
          className="bg-slate-900/90 border border-slate-800 hover:border-amber-500/50 p-4 rounded-2xl shadow-lg cursor-pointer transition-all hover:bg-slate-850"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">High / Emergent Acuity</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-3xl font-black text-amber-300 mt-2 font-mono">{highRiskCount}</div>
          <div className="text-[11px] text-slate-400 mt-2">
            ESI Level 1-2 or AI Risk &ge; 70%
          </div>
        </div>

        {/* Card 3: Unacknowledged Alerts */}
        <div 
          onClick={() => onNavigateTab('alerts')}
          className={`p-4 rounded-2xl shadow-lg cursor-pointer transition-all ${
            unackAlertsCount > 0
              ? 'bg-rose-950/40 border border-rose-600/70 hover:bg-rose-950/60'
              : 'bg-slate-900/90 border border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-semibold uppercase tracking-wider ${unackAlertsCount > 0 ? 'text-rose-300' : 'text-slate-400'}`}>
              Active Deterioration Alerts
            </span>
            <ShieldAlert className={`w-4 h-4 ${unackAlertsCount > 0 ? 'text-rose-400 animate-pulse' : 'text-slate-400'}`} />
          </div>
          <div className={`text-3xl font-black mt-2 font-mono ${unackAlertsCount > 0 ? 'text-rose-200' : 'text-slate-100'}`}>
            {unackAlertsCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-2">
            {unackAlertsCount > 0 ? '⚠️ Immediate clinician review needed' : 'All alerts acknowledged'}
          </div>
        </div>

        {/* Card 4: Average Wait Duration */}
        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Avg ED Wait Time</span>
            <Clock className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-3xl font-black text-slate-100 mt-2 font-mono">{avgWaitMins} <span className="text-sm font-normal text-slate-400">min</span></div>
          <div className="text-[11px] text-slate-400 mt-2">
            From arrival to clinician review
          </div>
        </div>

      </div>

      {/* 2-Column Section: Active Urgent Alerts & Triage Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Urgent Attention Feed (Span 2) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-rose-400" />
              <h2 className="text-base font-bold text-white tracking-tight">Active Clinical Deterioration Alerts</h2>
            </div>
            <button
              onClick={() => onNavigateTab('alerts')}
              className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
            >
              <span>View All Alerts</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {criticalAlerts.length === 0 ? (
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto opacity-80" />
              <p className="text-sm font-semibold text-slate-200">No unacknowledged high-priority alerts</p>
              <p className="text-xs text-slate-400">All current waiting patients are physiologically stable within expected baseline parameters.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {criticalAlerts.slice(0, 3).map((alert) => (
                <div
                  key={alert.alert_id}
                  className="bg-rose-950/30 border border-rose-600/60 p-4 rounded-2xl shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                        {alert.severity}
                      </span>
                      <span className="text-xs font-mono text-slate-300 font-bold">Patient: {alert.patient_id}</span>
                      <span className="text-xs text-slate-400">•</span>
                      <span className="text-xs text-slate-400">{new Date(alert.detected_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className="text-sm font-bold text-white">{alert.summary}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => onSelectPatient(alert.encounter_id)}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
                    >
                      Inspect Chart
                    </button>
                    {onReviewPatient && hasPermission('clinical_decision:create') && (
                      <button
                        onClick={() => onReviewPatient(alert.encounter_id)}
                        className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow transition-colors"
                      >
                        Physician Review
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Quick ED Queue Snapshot */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-bold text-white">Priority ED Queue Snapshot</h3>
              </div>
              <button
                onClick={() => onNavigateTab('queue')}
                className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
              >
                <span>Full Queue ({encounters.length})</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
                  <tr>
                    <th className="px-3 py-2.5">Acuity</th>
                    <th className="px-3 py-2.5">Patient</th>
                    <th className="px-3 py-2.5">Chief Complaint</th>
                    <th className="px-3 py-2.5">Wait</th>
                    <th className="px-3 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {encounters.slice(0, 4).map((item) => (
                    <tr key={item.encounter_id} className="hover:bg-slate-800/40">
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${
                          item.triage_level === 1 ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' :
                          item.triage_level === 2 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' :
                          item.triage_level === 3 ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40' :
                          'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        }`}>
                          ESI {item.triage_level}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-bold text-slate-200">{item.patient_name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{item.patient_id}</div>
                      </td>
                      <td className="px-3 py-3 max-w-[200px] truncate text-slate-300">
                        {item.chief_complaint}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap font-mono text-slate-200">
                        {item.wait_time_mins} min
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button
                          onClick={() => onSelectPatient(item.encounter_id)}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 font-semibold text-xs transition-colors"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* Right Column: Triage Distribution & AI Governance Card */}
        <div className="space-y-6">
          
          {/* Triage Acuity Breakdown Card */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-cyan-400" />
              <h3 className="text-base font-bold text-white">ESI Acuity Distribution</h3>
            </div>

            <div className="space-y-3 pt-1">
              {triageDist.map((item) => {
                const pct = activeCount > 0 ? Math.round((item.count / activeCount) * 100) : 0;
                return (
                  <div key={item.level} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className={item.level <= 2 ? 'text-amber-300' : 'text-slate-300'}>
                        {item.label}
                      </span>
                      <span className="font-mono text-slate-400">
                        {item.count} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                      <div
                        className={`h-full rounded-full transition-all ${
                          item.level === 1 ? 'bg-rose-500' :
                          item.level === 2 ? 'bg-amber-500' :
                          item.level === 3 ? 'bg-yellow-500' :
                          item.level === 4 ? 'bg-emerald-500' : 'bg-cyan-500'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* AI Decision Support Transparency Card */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-400" />
              <h3 className="text-base font-bold text-white">AI Decision Support Notice</h3>
            </div>
            
            <p className="text-xs text-slate-300 leading-relaxed">
              PatientTriage.ai provides <strong className="text-cyan-400">clinical decision support</strong>. AI risk scores and deterioration trends highlight concerning changes to assist authorized clinicians.
            </p>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 space-y-1.5">
              <div className="flex items-center gap-1.5 text-amber-400 font-bold">
                <span>⚠️ Clinical Responsibility</span>
              </div>
              <p>
                The AI does not diagnose or determine final disposition. The treating clinician reviews all data and retains sole decision authority.
              </p>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
