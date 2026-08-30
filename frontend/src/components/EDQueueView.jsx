import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Users, Clock, AlertTriangle, AlertOctagon, Heart, Activity, 
  ChevronRight, RefreshCw, UserCheck, ShieldAlert, Sparkles, Filter,
  Stethoscope
} from 'lucide-react';

export const EDQueueView = ({ onSelectPatient, onReviewPatient, onAlertStateChanged }) => {
  const { authHeaders, addToast } = useAuth();
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');

  useEffect(() => {
    fetchQueue();
  }, [authHeaders['X-Hospital-Id']]);

  const fetchQueue = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/encounters', { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setQueue(data.queue || []);
      }
    } catch (err) {
      addToast("Failed to load active ED queue.", "error");
    } finally {
      setLoading(false);
    }
  };

  const getAcuityColor = (level) => {
    switch (level) {
      case 1:
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      case 2:
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 3:
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40';
      case 4:
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      default:
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
    }
  };

  const filteredQueue = queue.filter((item) => {
    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'ALERTS_ONLY') return item.active_alert_count > 0;
    return item.status === statusFilter;
  });

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Active Emergency Department Queue</h1>
              <p className="text-xs text-slate-400">Dynamic priority queue sorted by ESI Acuity and wait duration</p>
            </div>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-slate-200 text-xs font-medium focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900">All Active Patients</option>
              <option value="ALERTS_ONLY" className="bg-slate-900">🚨 Patients with Active Alerts</option>
              <option value="WAITING" className="bg-slate-900">Waiting Room Only</option>
              <option value="IN_TREATMENT" className="bg-slate-900">In Treatment Only</option>
            </select>
          </div>

          <button
            onClick={fetchQueue}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh Queue</span>
          </button>
        </div>
      </div>

      {/* Queue Table Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Loading active ED queue...</div>
        ) : filteredQueue.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">No active patients in ED queue matching criteria.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3.5">Priority / ESI</th>
                  <th className="px-4 py-3.5">Patient Details</th>
                  <th className="px-4 py-3.5">Chief Complaint</th>
                  <th className="px-4 py-3.5">Wait Time</th>
                  <th className="px-4 py-3.5">Latest Vitals</th>
                  <th className="px-4 py-3.5">AI Risk (Task 7)</th>
                  <th className="px-4 py-3.5">Deterioration (Task 9)</th>
                  <th className="px-4 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredQueue.map((item) => (
                  <tr
                    key={item.encounter_id}
                    className={`hover:bg-slate-800/40 transition-colors ${
                      item.active_alert_count > 0 ? 'bg-rose-950/20' : ''
                    }`}
                  >
                    {/* ESI Level Badge */}
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex flex-col items-start gap-1">
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-black border ${getAcuityColor(item.triage_level)}`}>
                          ESI Level {item.triage_level}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {item.acuity_category}
                        </span>
                      </div>
                    </td>

                    {/* Patient info */}
                    <td className="px-4 py-4">
                      <div className="font-bold text-slate-100 text-sm">{item.patient_name}</div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {item.patient_id} • {item.age}y {item.gender}
                      </div>
                      <div className="text-[10px] text-cyan-400 font-mono mt-0.5">
                        Bed: {item.bed_number || 'Waiting Area'}
                      </div>
                    </td>

                    {/* Chief complaint */}
                    <td className="px-4 py-4 max-w-[220px]">
                      <div className="font-medium text-slate-200 line-clamp-2">{item.chief_complaint}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5 capitalize">Status: {item.status.replace('_', ' ')}</div>
                    </td>

                    {/* Wait Time */}
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 font-mono font-semibold text-slate-200">
                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                        <span>{item.wait_time_mins} min</span>
                      </div>
                    </td>

                    {/* Latest Vitals */}
                    <td className="px-4 py-4">
                      {item.latest_vitals ? (
                        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 font-mono text-[11px]">
                          <div><span className="text-slate-400">SpO₂:</span> <strong className={item.latest_vitals.spo2 < 90 ? 'text-rose-400' : 'text-slate-200'}>{item.latest_vitals.spo2}%</strong></div>
                          <div><span className="text-slate-400">HR:</span> <strong className={item.latest_vitals.hr >= 110 ? 'text-amber-400' : 'text-slate-200'}>{item.latest_vitals.hr}</strong></div>
                          <div><span className="text-slate-400">RR:</span> <strong className={item.latest_vitals.rr >= 24 ? 'text-rose-400' : 'text-slate-200'}>{item.latest_vitals.rr}</strong></div>
                          <div><span className="text-slate-400">BP:</span> <strong>{item.latest_vitals.sbp}/{item.latest_vitals.dbp || '-'}</strong></div>
                        </div>
                      ) : (
                        <span className="text-slate-500 italic">No vitals yet</span>
                      )}
                    </td>

                    {/* AI Risk Score (Task 7) */}
                    <td className="px-4 py-4 whitespace-nowrap">
                      {item.ai_risk ? (
                        <div className="flex items-center gap-1.5">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            item.ai_risk.risk_category === 'HIGH' ? 'bg-rose-950 text-rose-300 border border-rose-700' :
                            item.ai_risk.risk_category === 'MODERATE' ? 'bg-amber-950 text-amber-300 border border-amber-700' :
                            'bg-emerald-950 text-emerald-300 border border-emerald-700'
                          }`}>
                            {item.ai_risk.risk_category} ({item.ai_risk.risk_score}%)
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-500 italic">Pending</span>
                      )}
                    </td>

                    {/* Task 9 Deterioration Alert Badge */}
                    <td className="px-4 py-4">
                      {item.active_alert_count > 0 ? (
                        <div className="flex items-center gap-1.5">
                          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-extrabold bg-rose-600 text-white shadow-md shadow-rose-950 animate-pulse-subtle">
                            <ShieldAlert className="w-3.5 h-3.5" />
                            {item.max_alert_severity || 'DETERIORATING'}
                          </span>
                        </div>
                      ) : (
                        <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                          Stable
                        </span>
                      )}
                    </td>

                    {/* Action */}
                    <td className="px-4 py-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        {onReviewPatient && (
                          <button
                            onClick={() => onReviewPatient(item.encounter_id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow transition-colors"
                            title="Open Human-In-The-Loop Physician Review"
                          >
                            <Stethoscope className="w-3.5 h-3.5" />
                            <span>Review</span>
                          </button>
                        )}
                        <button
                          onClick={() => onSelectPatient(item.encounter_id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition-colors"
                        >
                          <span>Inspect</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};
