import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  ChevronRight,
  Clock,
  LineChart,
  RefreshCw,
  Shield,
  Stethoscope,
  Users,
} from 'lucide-react';

const formatMetric = (value, suffix = '') => {
  if (value === null || value === undefined) return 'N/A';
  return `${value}${suffix}`;
};

const maxSeriesValue = (series, key) => Math.max(1, ...series.map((item) => item[key] || 0));

const KpiCard = ({ icon: Icon, label, value, detail, tone = 'cyan', onClick }) => {
  const tones = {
    cyan: 'border-cyan-500/30 text-cyan-300 bg-cyan-500/10',
    amber: 'border-amber-500/30 text-amber-300 bg-amber-500/10',
    rose: 'border-rose-500/30 text-rose-300 bg-rose-500/10',
    emerald: 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10',
    slate: 'border-slate-700 text-slate-300 bg-slate-800/60',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left bg-slate-900/95 border border-slate-800 rounded-xl p-4 shadow-md hover:border-cyan-500/40 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-normal text-slate-400">{label}</div>
          <div className="mt-1 text-2xl font-black text-white">{value}</div>
          {detail && <div className="mt-1 text-[11px] text-slate-400">{detail}</div>}
        </div>
        <span className={`p-2 rounded-lg border ${tones[tone]}`}>
          <Icon className="w-4 h-4" />
        </span>
      </div>
    </button>
  );
};

const BarSeries = ({ series, valueKey = 'count', labelFormatter = (x) => x }) => {
  const max = maxSeriesValue(series, valueKey);
  return (
    <div className="space-y-2" role="img" aria-label="Time series bar chart">
      {series.map((item) => {
        const value = item[valueKey] || 0;
        return (
          <div key={item.label} className="grid grid-cols-[72px_1fr_48px] items-center gap-3 text-xs">
            <span className="text-slate-400 font-mono truncate">{labelFormatter(item.label)}</span>
            <div className="h-2.5 bg-slate-950 border border-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-500"
                style={{ width: `${Math.max(4, (value / max) * 100)}%` }}
              />
            </div>
            <span className="text-right text-slate-200 font-semibold">{formatMetric(value)}</span>
          </div>
        );
      })}
    </div>
  );
};

const DistributionBars = ({ rows }) => {
  const max = Math.max(1, ...rows.map((row) => row.count || 0));
  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <div className="text-sm text-slate-500">No risk records in the selected range.</div>
      ) : (
        rows.map((row) => (
          <div key={row.category} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-200">{row.category.replaceAll('_', ' ')}</span>
              <span className="font-mono text-slate-400">{row.count}</span>
            </div>
            <div className="h-2.5 bg-slate-950 border border-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full ${
                  row.category === 'CRITICAL' || row.category === 'HIGH'
                    ? 'bg-rose-500'
                    : row.category === 'MODERATE'
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.max(5, (row.count / max) * 100)}%` }}
              />
            </div>
          </div>
        ))
      )}
    </div>
  );
};

export const EDOperationsDashboard = ({ onSelectPatient }) => {
  const { authHeaders, addToast, hasPermission } = useAuth();
  const [summary, setSummary] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [timeRange, setTimeRange] = useState('today');
  const [loading, setLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [drilldown, setDrilldown] = useState(null);
  const [error, setError] = useState('');

  const canUseDashboard = hasPermission('dashboard:view');
  const hospitalId = authHeaders['X-Hospital-Id'];
  const staffId = authHeaders['X-Staff-Id'];

  const fetchSummary = useCallback(async () => {
    setError('');
    try {
      const res = await fetch('/api/dashboard/summary', { headers: authHeaders });
      const data = await res.json();
      if (res.ok) {
        setSummary(data);
      } else {
        setError(data.detail || 'Dashboard summary unavailable.');
      }
    } catch {
      setError('Dashboard summary unavailable.');
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  const fetchAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const res = await fetch(`/api/dashboard/analytics?range=${timeRange}`, { headers: authHeaders });
      const data = await res.json();
      if (res.ok) {
        setAnalytics(data);
      } else {
        addToast(data.detail || 'Analytics unavailable for selected range.', 'error');
      }
    } catch {
      addToast('Failed to load hospital analytics.', 'error');
    } finally {
      setAnalyticsLoading(false);
    }
  }, [addToast, authHeaders, timeRange]);

  useEffect(() => {
    // The dashboard intentionally synchronizes component state with backend polling.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetchSummary();
    const interval = setInterval(fetchSummary, 15000);
    return () => clearInterval(interval);
  }, [fetchSummary, hospitalId, staffId]);

  useEffect(() => {
    // The analytics panel intentionally refreshes when the selected server-side range changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAnalytics();
  }, [fetchAnalytics, hospitalId, staffId]);

  const openDrilldown = async (metric) => {
    try {
      const res = await fetch(`/api/dashboard/drilldown/${metric}`, { headers: authHeaders });
      const data = await res.json();
      if (res.ok) {
        setDrilldown(data);
      } else {
        addToast(data.detail || 'Unable to open dashboard drill-down.', 'error');
      }
    } catch {
      addToast('Unable to open dashboard drill-down.', 'error');
    }
  };

  const lastUpdated = useMemo(() => {
    if (!summary?.last_updated) return 'Not updated';
    return new Date(summary.last_updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }, [summary]);

  if (!canUseDashboard) {
    return (
      <div className="p-12 rounded-2xl border border-slate-800 bg-slate-900/80 text-center">
        <Shield className="w-10 h-10 text-amber-400 mx-auto mb-3" />
        <h1 className="text-lg font-bold text-white">Dashboard Access Restricted</h1>
        <p className="text-sm text-slate-400 mt-1">Your current role does not include dashboard:view permission.</p>
      </div>
    );
  }

  if (loading) {
    return <div className="p-12 text-center text-slate-400 text-sm">Loading ED operations dashboard...</div>;
  }

  if (error) {
    return (
      <div className="p-12 rounded-2xl border border-rose-800 bg-rose-950/30 text-center">
        <AlertTriangle className="w-10 h-10 text-rose-300 mx-auto mb-3" />
        <h1 className="text-lg font-bold text-white">Dashboard Unavailable</h1>
        <p className="text-sm text-rose-100 mt-1">{error}</p>
      </div>
    );
  }

  const metrics = summary?.metrics || {};
  const volumeSeries = analytics?.volume?.series || [];
  const waitSeries = analytics?.wait_times?.series || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Emergency Department Dashboard</h1>
            <p className="text-xs text-slate-400">
              {summary?.hospital?.name || summary?.hospital?.hospital_id} · Auto-refreshes every {summary?.refresh_interval_seconds || 15}s · Last updated {lastUpdated}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
            aria-label="Analytics time range"
          >
            <option value="today">Today</option>
            <option value="last_7_days">Last 7 days</option>
            <option value="last_30_days">Last 30 days</option>
          </select>
          <button
            onClick={() => {
              setLoading(true);
              fetchSummary();
              fetchAnalytics();
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={Users} label="Active ED Encounters" value={metrics.active_encounters || 0} detail="Counts encounters, not unique patients" onClick={() => openDrilldown('active_encounters')} />
        <KpiCard icon={Clock} label="Waiting for Triage" value={metrics.waiting_for_triage || 0} detail={`Current avg wait ${formatMetric(metrics.current_average_waiting_for_triage_minutes, ' min')}`} tone="amber" onClick={() => openDrilldown('waiting_for_triage')} />
        <KpiCard icon={Stethoscope} label="Under Evaluation" value={metrics.under_evaluation || 0} detail={`${metrics.waiting_for_physician || 0} waiting for physician`} tone="emerald" onClick={() => openDrilldown('under_evaluation')} />
        <KpiCard icon={AlertTriangle} label="High-Risk Encounters" value={metrics.high_risk_encounters || 0} detail={`${metrics.active_alerts || 0} active alerts`} tone="rose" onClick={() => openDrilldown('high_risk_encounters')} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard icon={Activity} label="Triage In Progress" value={metrics.triage_in_progress || 0} tone="cyan" onClick={() => openDrilldown('triage_in_progress')} />
        <KpiCard icon={Users} label="Waiting for Physician" value={metrics.waiting_for_physician || 0} tone="slate" onClick={() => openDrilldown('waiting_for_physician')} />
        <KpiCard icon={Shield} label="Active Alerts" value={metrics.active_alerts || 0} tone="rose" onClick={() => openDrilldown('active_alerts')} />
        <KpiCard icon={Clock} label="Avg Arrival to Triage" value={formatMetric(metrics.average_arrival_to_triage_minutes, ' min')} detail={`Median ${formatMetric(metrics.median_arrival_to_triage_minutes, ' min')}`} tone="amber" />
        <KpiCard icon={Clock} label="Avg Triage Time" value={formatMetric(metrics.average_triage_time_minutes, ' min')} detail="Unavailable in current schema" tone="slate" />
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <section className="bg-slate-900/95 border border-slate-800 rounded-2xl p-5 shadow-xl">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-cyan-300" />
            ED Queue Overview
          </h2>
          <div className="mt-4 space-y-3">
            {summary.queue.map((row) => {
              const max = Math.max(1, ...summary.queue.map((item) => item.count));
              return (
                <button key={row.key} onClick={() => openDrilldown(row.key)} className="w-full text-left">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-300">{row.label}</span>
                    <span className="text-white font-bold">{row.count}</span>
                  </div>
                  <div className="mt-1 h-2 bg-slate-950 border border-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-cyan-500" style={{ width: `${Math.max(4, (row.count / max) * 100)}%` }} />
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="bg-slate-900/95 border border-slate-800 rounded-2xl p-5 shadow-xl">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <BrainCircuit className="w-4 h-4 text-violet-300" />
            AI Workflow Overview
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3">
              <div className="text-[10px] uppercase text-slate-400">Assessments Today</div>
              <div className="text-xl font-black text-white">{summary.ai_overview.assessments_today}</div>
            </div>
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3">
              <div className="text-[10px] uppercase text-slate-400">Overrides Today</div>
              <div className="text-xl font-black text-amber-300">{summary.ai_overview.clinician_overrides_today}</div>
            </div>
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 col-span-2">
              <div className="text-[10px] uppercase text-slate-400">Override Rate</div>
              <div className="text-xl font-black text-white">{formatMetric(summary.ai_overview.override_rate_today, '%')}</div>
              <p className="text-[11px] text-slate-400 mt-1">Workflow usage metric, not AI accuracy.</p>
            </div>
          </div>
        </section>

        <section className="bg-slate-900/95 border border-slate-800 rounded-2xl p-5 shadow-xl">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <LineChart className="w-4 h-4 text-emerald-300" />
            Wait-Time Definitions
          </h2>
          <div className="mt-4 space-y-3 text-xs text-slate-400">
            <p>Average wait uses completed arrival to triage intervals only.</p>
            <p>Current waiting time is calculated separately for encounters still waiting for triage.</p>
            <p>Detailed clinical review continues through the existing encounter workspace.</p>
          </div>
        </section>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <section className="bg-slate-900/95 border border-slate-800 rounded-2xl p-5 shadow-xl">
          <h2 className="text-sm font-bold text-white">Encounter Volume</h2>
          <p className="text-xs text-slate-400 mb-4">Calculated from ED encounter arrival_time in the selected range.</p>
          {analyticsLoading ? <div className="text-sm text-slate-500">Loading volume chart...</div> : <BarSeries series={volumeSeries} />}
        </section>

        <section className="bg-slate-900/95 border border-slate-800 rounded-2xl p-5 shadow-xl">
          <h2 className="text-sm font-bold text-white">Arrival to Triage Wait Trend</h2>
          <p className="text-xs text-slate-400 mb-4">Average minutes from arrival to recorded triage assessment.</p>
          {analyticsLoading ? (
            <div className="text-sm text-slate-500">Loading wait-time chart...</div>
          ) : (
            <BarSeries
              series={waitSeries.map((row) => ({ label: row.label, count: row.average_minutes || 0 }))}
              labelFormatter={(label) => label}
            />
          )}
        </section>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <section className="bg-slate-900/95 border border-slate-800 rounded-2xl p-5 shadow-xl">
          <h2 className="text-sm font-bold text-white">Risk Distribution</h2>
          <p className="text-xs text-slate-400 mb-4">Descriptive risk mix, not model performance.</p>
          <DistributionBars rows={analytics?.risk_distribution || []} />
        </section>

        <section className="bg-slate-900/95 border border-slate-800 rounded-2xl p-5 shadow-xl">
          <h2 className="text-sm font-bold text-white">Alert Analytics</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3">
              <div className="text-[10px] uppercase text-slate-400">Alerts</div>
              <div className="text-xl font-black text-white">{analytics?.alerts?.total || 0}</div>
            </div>
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3">
              <div className="text-[10px] uppercase text-slate-400">Avg Ack</div>
              <div className="text-xl font-black text-white">{formatMetric(analytics?.alerts?.average_acknowledgement_minutes, ' min')}</div>
            </div>
          </div>
        </section>

        <section className="bg-slate-900/95 border border-slate-800 rounded-2xl p-5 shadow-xl">
          <h2 className="text-sm font-bold text-white">AI Usage</h2>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-slate-400">Assessments</span><strong>{analytics?.ai_usage?.assessments || 0}</strong></div>
            <div className="flex justify-between"><span className="text-slate-400">Clinician overrides</span><strong>{analytics?.ai_usage?.clinician_overrides || 0}</strong></div>
            <div className="flex justify-between"><span className="text-slate-400">Override rate</span><strong>{formatMetric(analytics?.ai_usage?.override_rate, '%')}</strong></div>
          </div>
        </section>
      </div>

      {drilldown && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm p-4 flex items-center justify-center">
          <div className="w-full max-w-3xl max-h-[82vh] overflow-hidden bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl">
            <div className="p-5 border-b border-slate-800 flex justify-between items-start gap-4">
              <div>
                <h2 className="text-base font-bold text-white">{drilldown.metric.replaceAll('_', ' ')} Drill-Down</h2>
                <p className="text-xs text-slate-400">{drilldown.count} encounter rows · aggregate-first privacy controls applied</p>
              </div>
              <button onClick={() => setDrilldown(null)} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="overflow-y-auto max-h-[64vh]">
              {drilldown.items.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">No encounters currently match this metric.</div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-950 text-slate-400 uppercase text-[10px]">
                    <tr>
                      <th className="px-4 py-3">Encounter</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Risk</th>
                      <th className="px-4 py-3">Alerts</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {drilldown.items.map((item) => (
                      <tr key={item.encounter_id} className="hover:bg-slate-800/40">
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-100">{item.encounter_id}</div>
                          <div className="text-[10px] text-slate-500 font-mono">{item.patient_id ? `Patient ${item.patient_id}` : 'Patient identifier withheld'}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-300">{item.status.replaceAll('_', ' ')}</td>
                        <td className="px-4 py-3 text-slate-300">{item.risk_category || `ESI ${item.triage_level || 'N/A'}`}</td>
                        <td className="px-4 py-3 text-slate-300">{item.active_alert_count}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => {
                              setDrilldown(null);
                              onSelectPatient(item.encounter_id);
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs"
                          >
                            Open
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
