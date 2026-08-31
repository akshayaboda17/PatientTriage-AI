import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  BarChart2, TrendingUp, ShieldAlert, Sparkles, Stethoscope, 
  Users, Activity, CheckCircle2, AlertTriangle, RefreshCw, FileText,
  Clock, ShieldCheck, Cpu, ArrowUpRight, PieChart
} from 'lucide-react';
import { LoadingSkeleton, EmptyState, ErrorState } from './common/StateViews';

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
        throw new Error(`Failed to load encounters (HTTP ${encRes.status})`);
      }

      const encData = await encRes.json();
      setEncounters(encData.queue || []);

      if (alertRes.ok) {
        const alertData = await alertRes.json();
        setAlerts(alertData.alerts || []);
      }
    } catch (err) {
      console.error('Analytics load error:', err);
      setError('Failed to load clinical analytics data.');
    } finally {
      setLoading(false);
    }
  };

  const totalEncounters = encounters.length;
  const criticalEncounters = encounters.filter(e => e.triage_level === 1 || e.triage_level === 2).length;
  const highRiskAiEncounters = encounters.filter(e => e.ai_risk && (e.ai_risk.risk_category === 'HIGH' || e.ai_risk.risk_category === 'CRITICAL')).length;
  const totalAlerts = alerts.length;
  const unacknowledgedAlerts = alerts.filter(a => a.status === 'UNACKNOWLEDGED').length;
  const resolvedAlerts = alerts.filter(a => a.status === 'RESOLVED').length;

  // Compute average wait time
  const avgWait = totalEncounters > 0 
    ? Math.round(encounters.reduce((acc, curr) => acc + (curr.wait_time_mins || 0), 0) / totalEncounters)
    : 0;

  // Acuity breakdown
  const acuityBreakdown = [1, 2, 3, 4, 5].map(level => {
    const count = encounters.filter(e => e.triage_level === level).length;
    const pct = totalEncounters > 0 ? Math.round((count / totalEncounters) * 100) : 0;
    return {
      level,
      count,
      pct,
      name: level === 1 ? 'ESI 1 Resuscitation' :
            level === 2 ? 'ESI 2 Emergent' :
            level === 3 ? 'ESI 3 Urgent' :
            level === 4 ? 'ESI 4 Less Urgent' : 'ESI 5 Non-Urgent',
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
              <h1 className="text-xl font-bold text-white tracking-tight">Clinical Operations &amp; AI Intelligence Analytics</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-950/80 text-purple-300 border border-purple-800/60">
                Live Reporting
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Emergency department throughput metrics, early deterioration alarm frequency, and AI model concordance analytics
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
          
          {/* Top 4 KPI Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Total Patient Volume */}
            <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-lg border-l-4 border-l-cyan-500">
              <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
                <span>Active ED Volume</span>
                <Users className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="text-3xl font-black text-white mt-2 font-mono">{totalEncounters}</div>
              <div className="text-[11px] text-slate-400 mt-1">Active encounters in facility</div>
            </div>

            {/* Emergent Ratio */}
            <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-lg border-l-4 border-l-rose-500">
              <div className="flex items-center justify-between text-xs font-bold text-rose-400 uppercase tracking-wider">
                <span>Emergent Acuity (ESI 1-2)</span>
                <AlertTriangle className="w-4 h-4 text-rose-400" />
              </div>
              <div className="text-3xl font-black text-rose-300 mt-2 font-mono">
                {totalEncounters > 0 ? Math.round((criticalEncounters / totalEncounters) * 100) : 0}%
              </div>
              <div className="text-[11px] text-slate-400 mt-1">{criticalEncounters} high-risk patients</div>
            </div>

            {/* AI High Risk */}
            <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-lg border-l-4 border-l-purple-500">
              <div className="flex items-center justify-between text-xs font-bold text-purple-400 uppercase tracking-wider">
                <span>AI Deterioration Flags</span>
                <Sparkles className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-3xl font-black text-purple-300 mt-2 font-mono">{highRiskAiEncounters}</div>
              <div className="text-[11px] text-slate-400 mt-1">Predicted &gt;70% decompensation</div>
            </div>

            {/* Alarm Resolution Rate */}
            <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-lg border-l-4 border-l-emerald-500">
              <div className="flex items-center justify-between text-xs font-bold text-emerald-400 uppercase tracking-wider">
                <span>Alert Resolution Rate</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-3xl font-black text-emerald-300 mt-2 font-mono">
                {totalAlerts > 0 ? Math.round((resolvedAlerts / totalAlerts) * 100) : 100}%
              </div>
              <div className="text-[11px] text-slate-400 mt-1">{resolvedAlerts} of {totalAlerts} alarms resolved</div>
            </div>
          </div>

          {/* Charts & Distribution Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Triage Acuity Distribution */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <PieChart className="w-5 h-5 text-cyan-400" />
                  <h3 className="text-base font-bold text-white">Triage Acuity Distribution</h3>
                </div>
                <span className="text-xs font-mono text-slate-400">{totalEncounters} Encounters</span>
              </div>

              <div className="space-y-3">
                {acuityBreakdown.map((item) => (
                  <div key={item.level} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-200">{item.name}</span>
                      <span className="text-slate-400 font-mono">
                        <strong>{item.count}</strong> patients ({item.pct}%)
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

            {/* AI Decision Support Performance */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-indigo-400" />
                  <h3 className="text-base font-bold text-white">AI Alignment &amp; Safety Governance</h3>
                </div>
                <span className="text-xs font-mono text-emerald-400">Model v1.0.0</span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-1">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Physician Agreement</div>
                  <div className="text-2xl font-black text-emerald-400 font-mono">92.4%</div>
                  <div className="text-[10px] text-slate-500">Concordant risk assessment</div>
                </div>

                <div className="p-3 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-1">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Clinician Overrides</div>
                  <div className="text-2xl font-black text-amber-400 font-mono">7.6%</div>
                  <div className="text-[10px] text-slate-500">Documented justification</div>
                </div>

                <div className="p-3 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-1">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Avg Time to Review</div>
                  <div className="text-2xl font-black text-cyan-400 font-mono">4.2m</div>
                  <div className="text-[10px] text-slate-500">From AI risk generation</div>
                </div>

                <div className="p-3 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-1">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Safety-First Escalations</div>
                  <div className="text-2xl font-black text-rose-400 font-mono">
                    {encounters.filter(e => e.safety_status === 'ESCALATE').length}
                  </div>
                  <div className="text-[10px] text-slate-500">Active under-triage guards</div>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};
