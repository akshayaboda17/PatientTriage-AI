import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Users, Clock, AlertTriangle, AlertOctagon, Heart, Activity, 
  ChevronRight, RefreshCw, UserCheck, ShieldAlert, Sparkles, Filter,
  Stethoscope, Search, UserPlus, Flame, ShieldCheck, AlertCircle, Info,
  Eye, CheckCircle2, Bed, Ambulance
} from 'lucide-react';
import { LoadingSkeleton, EmptyState, ErrorState, AcuityBadge, SafetyStatusBadge, ConfidenceBadge, AgeGroupBadge } from './common/StateViews';

export const EDQueueView = ({ onSelectPatient, onReviewPatient, onOpenRegister, onAlertStateChanged }) => {
  const { authHeaders, hasPermission, addToast, currentStaff, hospital } = useAuth();
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [surgeMode, setSurgeMode] = useState(false);
  const [hospConfig, setHospConfig] = useState(null);
  const [togglingSurge, setTogglingSurge] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [acuityFilter, setAcuityFilter] = useState('ALL');
  const [safetyFilter, setSafetyFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchQueue();
  }, [authHeaders['X-Hospital-Id']]);

  const fetchQueue = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/encounters', { headers: authHeaders });
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}: Failed to load ED patient queue.`);
      }
      const data = await res.json();
      setQueue(data.queue || []);
      setSurgeMode(data.surge_mode || false);
      setHospConfig(data.hospital_config || null);
    } catch (err) {
      console.error('Queue fetch error:', err);
      setError(err.message || 'Network error loading active ED queue.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSurge = async () => {
    if (!hasPermission('hospital:update')) {
      addToast("Access Denied: Only Clinical Director or Hospital Admin can toggle ED Surge Mode.", "error");
      return;
    }

    setTogglingSurge(true);
    try {
      const res = await fetch('/api/hospital-config/surge-mode', {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !surgeMode })
      });
      if (res.ok) {
        const data = await res.json();
        setSurgeMode(!surgeMode);
        addToast(data.message || `Surge mode ${!surgeMode ? 'activated' : 'deactivated'}.`, surgeMode ? 'info' : 'warning');
        fetchQueue();
      } else {
        const err = await res.json().catch(() => ({}));
        addToast(err.detail || "Failed to update surge mode.", "error");
      }
    } catch (err) {
      addToast("Network error updating surge mode.", "error");
    } finally {
      setTogglingSurge(false);
    }
  };

  // Client-side filtering
  const filteredQueue = queue.filter((patient) => {
    // Status Filter
    if (statusFilter !== 'ALL' && patient.status !== statusFilter) return false;

    // Acuity Filter
    if (acuityFilter !== 'ALL' && Number(patient.triage_level) !== Number(acuityFilter)) return false;

    // Safety State Filter
    if (safetyFilter !== 'ALL' && patient.safety_status !== safetyFilter) return false;

    // Search Query (name, id, MRN, chief complaint)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const name = (patient.patient_name || '').toLowerCase();
      const encId = (patient.encounter_id || '').toLowerCase();
      const patId = (patient.patient_id || '').toLowerCase();
      const complaint = (patient.chief_complaint || '').toLowerCase();
      return name.includes(q) || encId.includes(q) || patId.includes(q) || complaint.includes(q);
    }

    return true;
  });

  // Sort queue by triage level (ESI 1 first), then safety rank, then longest wait
  const sortedQueue = [...filteredQueue].sort((a, b) => {
    if (a.triage_level !== b.triage_level) return a.triage_level - b.triage_level;
    const safetyRank = { ESCALATE: 1, REASSESS: 2, MONITOR: 3, STABLE: 4 };
    const rankA = safetyRank[a.safety_status] || 5;
    const rankB = safetyRank[b.safety_status] || 5;
    if (rankA !== rankB) return rankA - rankB;
    return (b.wait_time_mins || 0) - (a.wait_time_mins || 0);
  });

  // Quick stats
  const totalCount = queue.length;
  const waitingCount = queue.filter(e => e.status === 'WAITING').length;
  const inTriageCount = queue.filter(e => e.status === 'IN_TRIAGE').length;
  const inTreatmentCount = queue.filter(e => e.status === 'IN_TREATMENT').length;
  const escalateCount = queue.filter(e => e.safety_status === 'ESCALATE').length;
  const breachedCount = queue.filter(e => e.wait_time_mins > (e.safe_wait_threshold_mins || 60)).length;

  return (
    <div className="space-y-6">
      
      {/* Top Banner & Surge Controls */}
      <div className="space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold text-white tracking-tight">Emergency Department Live Queue</h1>
                {hospConfig && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-cyan-300 border border-slate-700">
                    {hospConfig.scale_tier?.replace('_', ' ') || 'ED FACILITY'}
                  </span>
                )}
                {surgeMode && (
                  <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-600 text-white animate-pulse shadow-md">
                    <Flame className="w-3 h-3" />
                    3× SURGE ACTIVE
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Prioritized patient intake, real-time vital sign tracking, and clinician review governance
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Surge Mode Toggle Button (Admins only) */}
            {hasPermission('hospital:update') && (
              <button
                onClick={handleToggleSurge}
                disabled={togglingSurge}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                  surgeMode
                    ? 'bg-rose-950/80 hover:bg-rose-900 text-rose-200 border-rose-600 shadow-md shadow-rose-950/50'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                }`}
                title="Toggle 3x Mass-Casualty Surge Mode"
              >
                <Flame className={`w-4 h-4 ${surgeMode ? 'text-rose-400 animate-bounce' : 'text-slate-400'}`} />
                <span>{surgeMode ? 'Disable Surge' : 'Enable 3× Surge Mode'}</span>
              </button>
            )}

            {/* Register Patient */}
            {hasPermission('patient:create') && onOpenRegister && (
              <button
                onClick={onOpenRegister}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-md shadow-cyan-900/30 transition-all cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>Register Patient</span>
              </button>
            )}

            {/* Refresh */}
            <button
              onClick={fetchQueue}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Surge Mode Warning Strip */}
        {surgeMode && (
          <div className="bg-amber-950/80 border border-amber-600/80 rounded-2xl p-4 text-amber-200 flex items-center justify-between text-xs shadow-lg">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
                <Flame className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="font-bold text-sm text-amber-300">ED Disaster / Mass-Casualty Surge Mode Active</div>
                <div className="text-[11px] text-amber-200/90 mt-0.5">
                  Safe waiting thresholds tightened to 3× standard frequency. Automatic reassessment triggers prioritized for all patients.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick Aggregate Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
        <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl">
          <div className="text-[10px] text-slate-400 uppercase font-bold">Total Census</div>
          <div className="text-xl font-black text-white font-mono mt-0.5">{totalCount}</div>
        </div>
        <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl border-l-2 border-l-amber-500">
          <div className="text-[10px] text-slate-400 uppercase font-bold">Waiting Room</div>
          <div className="text-xl font-black text-amber-400 font-mono mt-0.5">{waitingCount}</div>
        </div>
        <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl border-l-2 border-l-cyan-500">
          <div className="text-[10px] text-slate-400 uppercase font-bold">In Triage</div>
          <div className="text-xl font-black text-cyan-400 font-mono mt-0.5">{inTriageCount}</div>
        </div>
        <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl border-l-2 border-l-indigo-500">
          <div className="text-[10px] text-slate-400 uppercase font-bold">In Treatment</div>
          <div className="text-xl font-black text-indigo-400 font-mono mt-0.5">{inTreatmentCount}</div>
        </div>
        <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl border-l-2 border-l-rose-500">
          <div className="text-[10px] text-slate-400 uppercase font-bold">Escalations</div>
          <div className={`text-xl font-black font-mono mt-0.5 ${escalateCount > 0 ? 'text-rose-400 animate-pulse' : 'text-slate-200'}`}>
            {escalateCount}
          </div>
        </div>
        <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl border-l-2 border-l-rose-600">
          <div className="text-[10px] text-slate-400 uppercase font-bold">Wait Breaches</div>
          <div className={`text-xl font-black font-mono mt-0.5 ${breachedCount > 0 ? 'text-rose-400' : 'text-slate-200'}`}>
            {breachedCount}
          </div>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-lg flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        
        {/* Status Tabs */}
        <div className="flex flex-wrap items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
          {['ALL', 'WAITING', 'IN_TRIAGE', 'IN_TREATMENT', 'DISCHARGED'].map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                statusFilter === tab
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab === 'ALL' ? 'All Encounters' : tab.replace('_', ' ')}
            </button>
          ))}
        </div>

        {/* Dropdowns + Search */}
        <div className="flex flex-wrap items-center gap-2">
          
          {/* Acuity Filter */}
          <select
            value={acuityFilter}
            onChange={(e) => setAcuityFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300 font-medium focus:outline-none focus:border-cyan-500 cursor-pointer"
          >
            <option value="ALL">All Acuity Levels</option>
            <option value="1">ESI 1 · Resuscitation</option>
            <option value="2">ESI 2 · Emergent</option>
            <option value="3">ESI 3 · Urgent</option>
            <option value="4">ESI 4 · Less Urgent</option>
            <option value="5">ESI 5 · Non-Urgent</option>
          </select>

          {/* Safety Workflow Filter */}
          <select
            value={safetyFilter}
            onChange={(e) => setSafetyFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300 font-medium focus:outline-none focus:border-cyan-500 cursor-pointer"
          >
            <option value="ALL">All Safety States</option>
            <option value="ESCALATE">ESCALATE (Critical)</option>
            <option value="REASSESS">REASSESS (Warning)</option>
            <option value="MONITOR">MONITOR</option>
            <option value="STABLE">STABLE</option>
          </select>

          {/* Search Input */}
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2" />
            <input
              type="text"
              placeholder="Search patient, complaint, ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>
      </div>

      {/* Main Queue List */}
      <div className="space-y-3">
        {loading ? (
          <LoadingSkeleton type="table" rows={8} />
        ) : error ? (
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6">
            <ErrorState message={error} onRetry={fetchQueue} />
          </div>
        ) : sortedQueue.length === 0 ? (
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-8">
            <EmptyState
              icon={Users}
              title="No Patients Found"
              description="No active emergency department patients match your current filter settings."
              actionText="Reset Filters"
              onAction={() => {
                setStatusFilter('ALL');
                setAcuityFilter('ALL');
                setSafetyFilter('ALL');
                setSearchQuery('');
              }}
            />
          </div>
        ) : (
          sortedQueue.map((patient) => {
            const isBreached = patient.wait_time_mins > (patient.safe_wait_threshold_mins || 60);
            const isEscalate = patient.safety_status === 'ESCALATE';
            const isReassess = patient.safety_status === 'REASSESS' || patient.reassessment_required;

            return (
              <div
                key={patient.encounter_id}
                onClick={() => onSelectPatient && onSelectPatient(patient.encounter_id)}
                className={`bg-slate-900/90 border rounded-2xl p-4 shadow-xl transition-all duration-150 hover:border-slate-700 hover:bg-slate-900 cursor-pointer flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                  isEscalate
                    ? 'border-rose-600/80 bg-rose-950/20 shadow-rose-950/40'
                    : isReassess
                    ? 'border-amber-600/70 bg-amber-950/10'
                    : 'border-slate-800/90'
                }`}
              >
                {/* LEFT SECTION: Acuity, Patient Info & Presentation */}
                <div className="flex items-start gap-3.5 flex-1 min-w-0">
                  
                  {/* Acuity Badge Block */}
                  <div className="shrink-0">
                    <AcuityBadge level={patient.triage_level} />
                  </div>

                  {/* Patient Details & Chief Complaint */}
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center flex-wrap gap-2">
                      <span className="font-bold text-white text-sm hover:text-cyan-300 transition-colors">
                        {patient.patient_name}
                      </span>
                      <AgeGroupBadge ageGroup={patient.age_group} age={patient.age} />
                      <span className="text-[10px] text-slate-500 font-mono">
                        {patient.gender} · ID: {patient.patient_id}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        ENC: #{patient.encounter_id}
                      </span>
                    </div>

                    <div className="text-xs text-slate-300 font-medium">
                      {patient.chief_complaint}
                    </div>

                    {/* Arrival & Bed Info */}
                    <div className="flex items-center gap-3 text-[11px] text-slate-500 font-mono">
                      {patient.bed_number && (
                        <span className="flex items-center gap-1 text-slate-400">
                          <Bed className="w-3 h-3 text-slate-500" />
                          <span>{patient.bed_number}</span>
                        </span>
                      )}
                      {patient.arrival_mode && (
                        <span className="flex items-center gap-1 text-slate-400">
                          <Ambulance className="w-3 h-3 text-slate-500" />
                          <span>{patient.arrival_mode}</span>
                        </span>
                      )}
                      <span className="px-2 py-0.2 rounded bg-slate-950 text-slate-400">
                        Status: <strong>{patient.status}</strong>
                      </span>
                    </div>
                  </div>
                </div>

                {/* MIDDLE & RIGHT SECTION: AI Risk, Safety State, Wait Time & Actions */}
                <div className="flex items-center flex-wrap lg:flex-nowrap gap-4 shrink-0 justify-between lg:justify-end border-t lg:border-t-0 pt-3 lg:pt-0 border-slate-800">
                  
                  {/* AI Risk Score & Confidence */}
                  <div className="text-left lg:text-right font-mono min-w-[110px]">
                    <div className="text-[10px] uppercase text-slate-500 font-sans font-bold">AI Decompensation</div>
                    {patient.ai_risk ? (
                      <div className="flex items-center lg:justify-end gap-1.5 mt-0.5">
                        <span className={`text-sm font-black ${
                          patient.ai_risk.risk_category === 'HIGH' || patient.ai_risk.risk_category === 'CRITICAL'
                            ? 'text-rose-400'
                            : patient.ai_risk.risk_category === 'MODERATE'
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                        }`}>
                          {patient.ai_risk.risk_probability !== undefined
                            ? `${(patient.ai_risk.risk_probability * 100).toFixed(0)}%`
                            : `${patient.ai_risk.risk_score}%`}
                        </span>
                        <ConfidenceBadge confidence={patient.ai_risk.confidence || 'HIGH'} />
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-600">Pending AI</span>
                    )}
                  </div>

                  {/* Safety Workflow Status */}
                  <div className="min-w-[90px]">
                    <SafetyStatusBadge status={patient.safety_status} />
                  </div>

                  {/* Waiting Time & Threshold */}
                  <div className="font-mono text-left lg:text-right min-w-[95px]">
                    <div className="text-[10px] uppercase text-slate-500 font-sans font-bold">Wait Time</div>
                    <div className="flex items-center lg:justify-end gap-1 text-slate-200 text-xs mt-0.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <strong>{patient.wait_time_mins || 0}m</strong>
                      <span className="text-[10px] text-slate-500">/ {patient.safe_wait_threshold_mins || 60}m</span>
                    </div>
                    {isBreached && (
                      <span className="text-[9px] font-bold text-rose-400 bg-rose-950/80 px-1.5 py-0.2 rounded border border-rose-800/60 block mt-0.5">
                        BREACHED ⚠️
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {hasPermission('physician:review') && onReviewPatient && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onReviewPatient(patient.encounter_id);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                        title="Physician Review"
                      >
                        <Stethoscope className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Review</span>
                      </button>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectPatient && onSelectPatient(patient.encounter_id);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                      title="View Clinical Chart"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Chart</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
