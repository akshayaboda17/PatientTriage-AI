import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Users, Clock, AlertTriangle, AlertOctagon, Heart, Activity, 
  ChevronRight, RefreshCw, UserCheck, ShieldAlert, Sparkles, Filter,
  Stethoscope, Search, UserPlus
} from 'lucide-react';

export const EDQueueView = ({ onSelectPatient, onReviewPatient, onOpenRegister, onAlertStateChanged }) => {
  const { authHeaders, hasPermission, addToast, currentStaff } = useAuth();
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [acuityFilter, setAcuityFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

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

  const getAcuityBadge = (level, category) => {
    switch (level) {
      case 1:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black bg-rose-500/20 text-rose-300 border border-rose-500/40">
            <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
            ESI 1 • Resuscitation
          </span>
        );
      case 2:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-500/40">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            ESI 2 • Emergent
          </span>
        );
      case 3:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-yellow-500/20 text-yellow-300 border border-yellow-500/40">
            ESI 3 • Urgent
          </span>
        );
      case 4:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            ESI 4 • Less Urgent
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40">
            ESI 5 • Non-Urgent
          </span>
        );
    }
  };

  const getWaitTimeColor = (mins) => {
    if (mins >= 60) return 'text-rose-400 font-bold';
    if (mins >= 30) return 'text-amber-400 font-semibold';
    return 'text-slate-200';
  };

  const filteredQueue = queue.filter((item) => {
    if (statusFilter === 'ALERTS_ONLY' && item.active_alert_count === 0) return false;
    if (statusFilter !== 'ALL' && statusFilter !== 'ALERTS_ONLY' && item.status !== statusFilter) return false;
    if (acuityFilter !== 'ALL' && item.triage_level !== parseInt(acuityFilter)) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        item.patient_name.toLowerCase().includes(q) ||
        item.patient_id.toLowerCase().includes(q) ||
        item.encounter_id.toLowerCase().includes(q) ||
        item.chief_complaint.toLowerCase().includes(q) ||
        (item.bed_number && item.bed_number.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white tracking-tight">Emergency Department Waiting Queue</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-800 text-cyan-400 border border-cyan-800/40">
                {filteredQueue.length} Active
              </span>
            </div>
            <p className="text-xs text-slate-400">Prioritized by ESI Acuity level, elapsed wait duration, and longitudinal deterioration status</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {hasPermission('patient:create') && onOpenRegister && (
            <button
              onClick={onOpenRegister}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-md shadow-cyan-900/30 transition-all"
            >
              <UserPlus className="w-4 h-4" />
              <span>Register Patient</span>
            </button>
          )}

          <button
            onClick={fetchQueue}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl flex flex-col md:flex-row items-center justify-between gap-3 shadow-md">
        
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search patient, ID, complaint, bed..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        {/* Dropdown Filters */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          
          <select
            value={acuityFilter}
            onChange={(e) => setAcuityFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300 font-medium focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Acuity Levels</option>
            <option value="1">ESI 1 - Resuscitation</option>
            <option value="2">ESI 2 - Emergent</option>
            <option value="3">ESI 3 - Urgent</option>
            <option value="4">ESI 4 - Less Urgent</option>
            <option value="5">ESI 5 - Non-Urgent</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300 font-medium focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Patients</option>
            <option value="ALERTS_ONLY">🚨 With Active Alerts</option>
            <option value="WAITING">Waiting Room Only</option>
            <option value="IN_TRIAGE">In Triage</option>
            <option value="IN_TREATMENT">In Treatment</option>
          </select>

        </div>

      </div>

      {/* Queue Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Loading active ED waiting queue...</div>
        ) : filteredQueue.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Users className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-sm font-semibold text-slate-300">No active patients in ED queue</p>
            <p className="text-xs text-slate-500">All registered patients have been processed or discharged.</p>
            {hasPermission('patient:create') && onOpenRegister && (
              <button
                onClick={onOpenRegister}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow"
              >
                <UserPlus className="w-4 h-4" />
                <span>Register First Patient</span>
              </button>
            )}
          </div>
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
                  <th className="px-4 py-3.5">AI Risk Support</th>
                  <th className="px-4 py-3.5">Deterioration Alert</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
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
                      {getAcuityBadge(item.triage_level, item.acuity_category)}
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
                      <div className="text-[10px] text-slate-400 mt-0.5 capitalize font-mono">
                        Status: {item.status.replace('_', ' ')}
                      </div>
                    </td>

                    {/* Wait Time */}
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className={`flex items-center gap-1.5 font-mono ${getWaitTimeColor(item.wait_time_mins)}`}>
                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                        <span>{item.wait_time_mins} min</span>
                      </div>
                    </td>

                    {/* Latest Vitals */}
                    <td className="px-4 py-4">
                      {item.latest_vitals ? (
                        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 font-mono text-[11px]">
                          <div><span className="text-slate-400">SpO₂:</span> <strong className={item.latest_vitals.spo2 < 90 ? 'text-rose-400 font-black' : 'text-slate-200'}>{item.latest_vitals.spo2}%</strong></div>
                          <div><span className="text-slate-400">HR:</span> <strong className={item.latest_vitals.hr >= 110 ? 'text-amber-400 font-bold' : 'text-slate-200'}>{item.latest_vitals.hr}</strong></div>
                          <div><span className="text-slate-400">RR:</span> <strong className={item.latest_vitals.rr >= 24 ? 'text-rose-400 font-bold' : 'text-slate-200'}>{item.latest_vitals.rr}</strong></div>
                          <div><span className="text-slate-400">BP:</span> <strong>{item.latest_vitals.sbp}/{item.latest_vitals.dbp || '-'}</strong></div>
                        </div>
                      ) : (
                        <span className="text-slate-500 italic">No vitals yet</span>
                      )}
                    </td>

                    {/* AI Risk Score (Decision Support) */}
                    <td className="px-4 py-4 whitespace-nowrap">
                      {item.ai_risk ? (
                        <div className="space-y-0.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            item.ai_risk.risk_category === 'HIGH' || item.ai_risk.risk_category === 'CRITICAL'
                              ? 'bg-rose-950 text-rose-300 border border-rose-700'
                              : item.ai_risk.risk_category === 'MODERATE'
                              ? 'bg-amber-950 text-amber-300 border border-amber-700'
                              : 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                          }`}>
                            <Sparkles className="w-2.5 h-2.5" />
                            {item.ai_risk.risk_category} ({item.ai_risk.risk_score}%)
                          </span>
                          <div className="text-[9px] text-slate-500 font-mono">Decision Support</div>
                        </div>
                      ) : (
                        <span className="text-slate-500 italic text-[11px]">Pending</span>
                      )}
                    </td>

                    {/* Deterioration Alert Badge */}
                    <td className="px-4 py-4 whitespace-nowrap">
                      {item.active_alert_count > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-extrabold bg-rose-600 text-white shadow-md shadow-rose-950 animate-pulse-subtle">
                          <ShieldAlert className="w-3.5 h-3.5" />
                          {item.max_alert_severity || 'DETERIORATING'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                          Stable Trend
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        {onReviewPatient && hasPermission('clinical_decision:create') && (
                          <button
                            onClick={() => onReviewPatient(item.encounter_id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow transition-colors"
                            title="Open Physician Review Workspace"
                          >
                            <Stethoscope className="w-3.5 h-3.5" />
                            <span>Review</span>
                          </button>
                        )}
                        <button
                          onClick={() => onSelectPatient(item.encounter_id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition-colors"
                          title="Inspect complete patient clinical chart"
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
