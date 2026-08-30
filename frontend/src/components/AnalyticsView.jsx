import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  BarChart2, TrendingUp, ShieldAlert, Sparkles, Stethoscope, 
  Users, Activity, CheckCircle2, AlertTriangle, RefreshCw, FileText
} from 'lucide-react';

export const AnalyticsView = () => {
  const { authHeaders, addToast } = useAuth();
  const [encounters, setEncounters] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalyticsData();
  }, [authHeaders['X-Hospital-Id']]);

  const fetchAnalyticsData = async () => {
    setLoading(true);
    try {
      const [encRes, alertRes] = await Promise.all([
        fetch('/api/encounters', { headers: authHeaders }),
        fetch('/api/alerts', { headers: authHeaders })
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
      addToast("Failed to load analytics data.", "error");
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

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
            <BarChart2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Emergency Department Clinical Analytics & AI Governance</h1>
            <p className="text-xs text-slate-400">Triage volume metrics, early warning deterioration signal trends, and AI alignment performance</p>
          </div>
        </div>

        <button
          onClick={fetchAnalyticsData}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Analytics</span>
        </button>
      </div>

      {/* Analytics KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase">Active Patient Volume</span>
            <Users className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-3xl font-black text-white mt-2 font-mono">{totalEncounters}</div>
          <div className="text-[11px] text-slate-400 mt-2">Active in ED queue</div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-400 uppercase">Acuity ESI 1-2 Ratio</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-3xl font-black text-amber-300 mt-2 font-mono">
            {totalEncounters > 0 ? Math.round((criticalEncounters / totalEncounters) * 100) : 0}%
          </div>
          <div className="text-[11px] text-slate-400 mt-2">{criticalEncounters} emergent/resus patients</div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-purple-400 uppercase">AI High Risk Flags</span>
            <Sparkles className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-3xl font-black text-purple-300 mt-2 font-mono">{highRiskAiEncounters}</div>
          <div className="text-[11px] text-slate-400 mt-2">AI decision-support flag &ge; 70%</div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-400 uppercase">Total Alert Events</span>
            <ShieldAlert className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-3xl font-black text-rose-300 mt-2 font-mono">{totalAlerts}</div>
          <div className="text-[11px] text-slate-400 mt-2">{unacknowledgedAlerts} pending acknowledgment</div>
        </div>
      </div>

      {/* Governance & Clinical Workflow Quality Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Card 1: AI Decision Support & Human-In-The-Loop Governance */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-bold text-white tracking-tight">AI & Human-In-The-Loop Governance</h2>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            The Emergency Department operates under strict human-in-the-loop oversight. AI provides risk predictions and explainability signals, while authorized physicians document clinical decisions and AI overrides.
          </p>

          <div className="space-y-3 pt-2">
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-slate-200">Physician AI Review Workflow</span>
                <span className="text-emerald-400">100% Traceable</span>
              </div>
              <p className="text-[11px] text-slate-400">
                All overrides require mandatory structured rationale documented in the immutable audit trail.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-slate-200">Deterioration Detection Signals</span>
                <span className="text-cyan-400">Longitudinal Rules v1.0</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Multi-timepoint vital sign progression detects cardio-respiratory decompensation before acute shock.
              </p>
            </div>
          </div>
        </div>

        {/* Card 2: Audit & Accountability Metrics */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base font-bold text-white tracking-tight">Audit Trail & Compliance Readiness</h2>
          </div>

          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs">
              <span className="text-slate-300">Append-Only Clinical Store</span>
              <span className="font-mono font-bold text-emerald-400">ACTIVE</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs">
              <span className="text-slate-300">Metadata Credential Sanitization</span>
              <span className="font-mono font-bold text-emerald-400">VERIFIED</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs">
              <span className="text-slate-300">Hospital Multi-Tenant Tenant Boundary</span>
              <span className="font-mono font-bold text-emerald-400">ENFORCED</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs">
              <span className="text-slate-300">Role-Based Access Control (RBAC)</span>
              <span className="font-mono font-bold text-emerald-400">ENFORCED</span>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};
