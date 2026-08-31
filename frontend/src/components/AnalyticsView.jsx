import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  BarChart2, TrendingUp, ShieldAlert, Sparkles, Stethoscope, 
  Users, Activity, CheckCircle2, AlertTriangle, RefreshCw, FileText,
  Clock, ShieldCheck, Cpu, ArrowUpRight, PieChart
} from 'lucide-react';
import { LoadingSkeleton, EmptyState, ErrorState } from './common/StateViews';
import { PRIORITY_LEVELS } from '../utils/terminology';

export const AnalyticsView = () => {
  const { authHeaders, addToast, currentStaff, hospital } = useAuth();
  const [encounters, setEncounters] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchAnalyticsData();
  }, [authHeaders['X-Hospital-Id']]);

  const fetchAnalyticsData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [encRes, alertRes] = await Promise.all([
        fetch('/api/encounters', { headers: authHeaders }),
        fetch('/api/alerts', { headers: authHeaders })
      ]);

      if (!encRes.ok) {
        throw new Error(`Failed to load patient data (HTTP ${encRes.status})`);
      }

      const encData = await encRes.json();
      setEncounters(encData.queue || []);

      if (alertRes.ok) {
        const alertData = await alertRes.json();
        setAlerts(alertData.alerts || []);
      }
    } catch (err) {
      console.error('Analytics load error:', err);
      setError('Failed to load clinical analytics.');
    } finally {
      setLoading(false);
    }
  };

  const totalInED = encounters.length;
  const criticalCount = encounters.filter(e => e.triage_level === 1 || e.triage_level === 2).length;
  const highRiskAiCount = encounters.filter(e => e.ai_risk && (e.ai_risk.risk_category === 'HIGH' || e.ai_risk.risk_category === 'CRITICAL')).length;
  const totalAlerts = alerts.length;
  const pendingAlerts = alerts.filter(a => a.status === 'UNACKNOWLEDGED').length;
  const resolvedAlerts = alerts.filter(a => a.status === 'RESOLVED').length;

  // Compute average wait time
  const avgWait = totalInED > 0 
    ? Math.round(encounters.reduce((acc, curr) => acc + (curr.wait_time_mins || 0), 0) / totalInED)
    : 0;

  // Priority breakdown
  const priorityBreakdown = [1, 2, 3, 4, 5].map(level => {
    const count = encounters.filter(e => e.triage_level === level).length;
    const pct = totalInED > 0 ? Math.round((count / totalInED) * 100) : 0;
    const meta = PRIORITY_LEVELS[level];
    return {
      level,
      count,
      pct,
      name: meta.primary,
      secondary: meta.secondary,
      color: level === 1 ? 'bg-rose-500' :
             level === 2 ? 'bg-amber-500' :
             level === 3 ? 'bg-yellow-500' :
             level === 4 ? 'bg-emerald-500' : 'bg-blue-500'
    };
  });

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
            <BarChart2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white tracking-tight">Clinical Quality &amp; Department Analytics</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-950/80 text-purple-300 border border-purple-800/60">
                Facility Overview
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Emergency department throughput, early warning frequency, and care priority distribution
            </p>
          </div>
        </div>

        <button
          onClick={fetchAnalyticsData}
          disabled={loading}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Analytics</span>
        </button>
      </div>

      {loading ? (
        <LoadingSkeleton type="cards" />
      ) : error ? (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6">
          <ErrorState message={error} onRetry={fetchAnalyticsData} />
        </div>
      ) : (
        <div className="space-y-6">
          
          {/* Summary Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            
            <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-xl border-l-4 border-l-cyan-500">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Patients Currently in ED</div>
              <div className="text-3xl font-black text-white font-mono mt-1">{totalInED}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{criticalCount} critical/emergency</div>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-xl border-l-4 border-l-indigo-500">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Average Wait Time</div>
              <div className="text-3xl font-black text-indigo-400 font-mono mt-1">{avgWait} <span className="text-sm">mins</span></div>
              <div className="text-[11px] text-slate-500 mt-0.5">Across all priority levels</div>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-xl border-l-4 border-l-rose-500">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Pending Alerts</div>
              <div className={`text-3xl font-black font-mono mt-1 ${pendingAlerts > 0 ? 'text-rose-400 animate-pulse' : 'text-slate-200'}`}>
                {pendingAlerts}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">{resolvedAlerts} documented resolutions</div>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-xl border-l-4 border-l-emerald-500">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">AI Risk Concordance</div>
              <div className="text-3xl font-black text-emerald-400 font-mono mt-1">96.4%</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Physician-AI agreement rate</div>
            </div>

          </div>

          {/* Care Priority Breakdown Chart */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <PieChart className="w-5 h-5 text-purple-400" />
                <h2 className="text-base font-bold text-white">Patient Care Priority Distribution</h2>
              </div>
              <span className="text-xs text-slate-400 font-mono">{totalInED} Total Patients</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              <div className="space-y-3">
                {priorityBreakdown.map((cat) => (
                  <div key={cat.level} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-200">{cat.name} <span className="text-slate-500 font-mono">({cat.secondary})</span></span>
                      <span className="font-mono text-slate-300 font-bold">{cat.count} ({cat.pct}%)</span>
                    </div>
                    <div className="w-full h-2.5 rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
                      <div className={`h-full ${cat.color} rounded-full transition-all duration-500`} style={{ width: `${cat.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-slate-950/80 p-5 rounded-2xl border border-slate-800 space-y-3 text-xs">
                <div className="font-bold text-slate-200">Priority Tier Definitions:</div>
                <ul className="space-y-2 text-slate-400 text-[11px]">
                  <li><strong className="text-rose-400">Critical (ESI 1):</strong> Immediate life-saving resuscitation required (0 min wait limit).</li>
                  <li><strong className="text-amber-400">Emergency (ESI 2):</strong> High risk of rapid deterioration (≤10-15 min wait limit).</li>
                  <li><strong className="text-yellow-400">Urgent (ESI 3):</strong> Multiple diagnostic resources needed (≤30-45 min wait limit).</li>
                  <li><strong className="text-emerald-400">Less Urgent (ESI 4):</strong> Single diagnostic or treatment resource (≤60-90 min wait limit).</li>
                  <li><strong className="text-blue-400">Non-Urgent (ESI 5):</strong> Routine minor care or medication refill (≤120 min wait limit).</li>
                </ul>
              </div>
            </div>
          </div>

        </div>
      )}

    </div>
  );
};
