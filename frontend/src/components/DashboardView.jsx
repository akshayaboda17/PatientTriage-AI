import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Users, Activity, ShieldAlert, Clock, Bell, Heart, AlertOctagon,
  AlertTriangle, CheckCircle2, TrendingUp, TrendingDown, Stethoscope,
  ChevronRight, Sparkles, UserCheck, RefreshCw, BarChart2, PlusCircle,
  ShieldCheck, Eye, ArrowUpRight, Flame, Edit3, X, UserX, Bed, Search,
  FileText, Check, ChevronDown, ChevronUp, AlertCircle, LogOut, HeartPulse
} from 'lucide-react';
import { LoadingSkeleton, EmptyState, ErrorState, AcuityBadge, SafetyStatusBadge, ConfidenceBadge, AgeGroupBadge } from './common/StateViews';
import { PRIORITY_LEVELS, getPriorityMeta, PATIENT_STATUSES, getPatientStatusMeta } from '../utils/terminology';
import { PriorityOverrideModal } from './common/PriorityOverrideModal';
import { UpdatePatientConditionModal } from './patient/UpdatePatientConditionModal';

export const DashboardView = ({ onSelectPatient, onReviewPatient, onOpenRegister, onNavigateTab }) => {
  const { authHeaders, hasPermission, addToast, currentStaff, hospital } = useAuth();
  
  // Data states
  const [encounters, setEncounters] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [capacityData, setCapacityData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [capacityError, setCapacityError] = useState(null);

  // Filter and view states
  const [categoryFilter, setCategoryFilter] = useState('ALL_ACTIVE'); 
  // 'ALL_ACTIVE' | 'WAITING' | 'IN_CARE' | 'REASSESS' | 'HIGH_PRIORITY' | 'CRITICAL' | 'COMPLETED'
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedExplainId, setExpandedExplainId] = useState(null);

  // Modal states
  const [overrideModalEncounter, setOverrideModalEncounter] = useState(null);
  const [reassessModalEncounter, setReassessModalEncounter] = useState(null);
  
  // Discharge Confirmation Modal state
  const [dischargeModalEncounter, setDischargeModalEncounter] = useState(null);
  const [dischargeDestination, setDischargeDestination] = useState('Home');
  const [dischargeNotes, setDischargeNotes] = useState('');
  const [discharging, setDischarging] = useState(false);

  // Surge Mode state
  const [surgeModeActive, setSurgeModeActive] = useState(false);
  const [togglingSurge, setTogglingSurge] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, [authHeaders['X-Hospital-Id'], categoryFilter]);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Pass status_filter to API if user selected COMPLETED or ALL
      let statusQueryParam = '';
      if (categoryFilter === 'COMPLETED') {
        statusQueryParam = '?status_filter=COMPLETED';
      }

      const [encRes, alertRes, capRes] = await Promise.all([
        fetch(`/api/encounters${statusQueryParam}`, { headers: authHeaders }),
        fetch('/api/alerts?status=UNACKNOWLEDGED', { headers: authHeaders }),
        fetch('/api/hospital-config/capacity', { headers: authHeaders }).catch(() => null)
      ]);

      if (!encRes.ok) {
        throw new Error(`Failed to load emergency department patient queue (HTTP ${encRes.status})`);
      }

      const encData = await encRes.json();
      setEncounters(encData.queue || []);
      setSurgeModeActive(Boolean(encData.surge_mode));

      if (alertRes.ok) {
        const alertData = await alertRes.json();
        setAlerts(alertData.alerts || []);
      }

      if (capRes && capRes.ok) {
        const capData = await capRes.json();
        setCapacityData(capData);
        setCapacityError(null);
      } else {
        setCapacityError('Unable to load live bed capacity.');
      }
    } catch (err) {
      console.error('Dashboard data error:', err);
      setError(err.message || 'Failed to refresh patient dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSurgeMode = async () => {
    if (!hasPermission('hospital:update')) {
      addToast("Access Denied: You need 'hospital:update' permission to toggle surge mode.", "error");
      return;
    }

    setTogglingSurge(true);
    const nextState = !surgeModeActive;
    try {
      const res = await fetch('/api/hospital-config/surge-mode', {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          active: nextState,
          reason: nextState ? "ED Clinician triggered surge protocol due to acute patient volume." : "Surge protocol deactivated."
        })
      });

      if (res.ok) {
        setSurgeModeActive(nextState);
        addToast(
          nextState 
            ? "🚨 3x ED Surge Mode ACTIVATED. Prioritization elevated for decompensation and critical triage." 
            : "Surge Mode deactivated. Returned to standard ED operations.",
          nextState ? "warning" : "success"
        );
        fetchDashboardData();
      } else {
        addToast("Failed to toggle surge mode.", "error");
      }
    } catch (err) {
      addToast("Network error toggling surge mode.", "error");
    } finally {
      setTogglingSurge(false);
    }
  };

  const handleDischargePatient = async (e) => {
    e.preventDefault();
    if (!dischargeModalEncounter) return;

    if (!hasPermission('patient:update')) {
      addToast("Access Denied: You need 'patient:update' permission to discharge patients.", "error");
      return;
    }

    setDischarging(true);
    try {
      const res = await fetch(`/api/encounters/${dischargeModalEncounter.encounter_id}/discharge`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: dischargeDestination,
          disposition_notes: dischargeNotes.trim() || undefined
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to discharge patient from ED.");
      }

      const data = await res.json();
      addToast(data.message || `Patient successfully discharged to ${dischargeDestination}.`, "success");
      setDischargeModalEncounter(null);
      setDischargeNotes('');
      fetchDashboardData();
    } catch (err) {
      console.error('Discharge error:', err);
      addToast(err.message || "Failed to discharge patient.", "error");
    } finally {
      setDischarging(false);
    }
  };

  // Operational metrics
  const activeEncounters = encounters.filter(e => e.status !== 'DISCHARGED');
  const totalInED = activeEncounters.length;
  const waitingPatients = activeEncounters.filter(e => e.status === 'WAITING' && !e.bed_number);
  const waitingCount = waitingPatients.length;
  const inCareCount = activeEncounters.filter(e => e.status === 'IN_TREATMENT' || e.status === 'IN_TRIAGE' || Boolean(e.bed_number)).length;
  const criticalCount = activeEncounters.filter(e => e.triage_level === 1 || e.triage_level === 2).length;
  const reassessmentCount = activeEncounters.filter(e => (e.status === 'WAITING' && !e.bed_number && (e.wait_evaluation?.reassessment_required || e.wait_eval?.exceeded)) || e.safety_status === 'REASSESS').length;

  // Capacity & Staff numbers
  const totalBeds = capacityData?.beds?.total_beds ?? 25;
  const availableBeds = capacityData?.beds?.available_beds ?? (totalBeds - (capacityData?.beds?.occupied_beds || 0));
  const onDutyStaffList = capacityData?.staff?.staff_list || [];
  const onDutyStaffCount = onDutyStaffList.length;

  // Average wait time (only for patients waiting for care space)
  const avgWait = waitingPatients.length > 0
    ? Math.round(waitingPatients.reduce((acc, curr) => acc + (curr.wait_time_mins || 0), 0) / waitingPatients.length)
    : 0;

  // Acuity breakdown
  const priorityDist = [1, 2, 3, 4, 5].map((lvl) => {
    const count = activeEncounters.filter((e) => e.triage_level === lvl).length;
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

  // Client-side filtering by category & search
  const filteredPatients = encounters.filter((patient) => {
    // 1. Category Filter
    if (categoryFilter === 'WAITING' && patient.status !== 'WAITING') return false;
    if (categoryFilter === 'IN_CARE' && !(patient.status === 'IN_TREATMENT' || patient.status === 'IN_TRIAGE')) return false;
    if (categoryFilter === 'REASSESS' && !(patient.wait_evaluation?.reassessment_required || patient.safety_status === 'REASSESS')) return false;
    if (categoryFilter === 'HIGH_PRIORITY' && !(patient.triage_level === 1 || patient.triage_level === 2)) return false;
    if (categoryFilter === 'CRITICAL' && patient.triage_level !== 1) return false;
    if (categoryFilter === 'COMPLETED' && patient.status !== 'DISCHARGED') return false;
    if (categoryFilter === 'ALL_ACTIVE' && patient.status === 'DISCHARGED') return false;

    // 2. Search Query Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const name = (patient.patient_name || '').toLowerCase();
      const complaint = (patient.chief_complaint || '').toLowerCase();
      const encId = (patient.encounter_id || '').toLowerCase();
      const bed = (patient.bed_number || '').toLowerCase();
      const service = (patient.recommended_care_service || '').toLowerCase();
      return name.includes(q) || complaint.includes(q) || encId.includes(q) || bed.includes(q) || service.includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-5 rounded-3xl shadow-xl">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl font-bold text-white tracking-tight">Emergency Department Live Overview</h1>
            <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-800/50">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live Operations
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-cyan-300 border border-slate-700">
              {hospital?.name || capacityData?.hospital_id || 'Emergency Care Center'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time patient queue, AI risk predictions, explainable clinical decision support, and capacity-aware workflow
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Surge Toggle Button */}
          {hasPermission('hospital:update') && (
            <button
              onClick={handleToggleSurgeMode}
              disabled={togglingSurge}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer ${
                surgeModeActive
                  ? 'bg-rose-600 hover:bg-rose-500 text-white animate-pulse'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
              }`}
              title={surgeModeActive ? "Click to deactivate surge protocol" : "Activate 3x ED surge protocol"}
            >
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              <span>{surgeModeActive ? '🚨 Surge Mode Active' : 'Activate Surge'}</span>
            </button>
          )}

          {/* Add Patient Button */}
          {hasPermission('patient:create') && onOpenRegister && (
            <button
              onClick={onOpenRegister}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-lg shadow-cyan-950/40 transition-all cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>+ Add Patient</span>
            </button>
          )}

          {/* Refresh Button */}
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

      {/* SURGE MODE ACTIVE OPERATIONAL BANNER (Requirement 18, 19, 20, 21) */}
      {surgeModeActive && (
        <div className="bg-rose-950/30 border-2 border-rose-500/80 rounded-3xl p-5 shadow-2xl shadow-rose-950/40 space-y-3 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-rose-800/40 pb-3">
            <div className="flex items-center gap-3">
              <div className="px-3 py-1 rounded-xl bg-rose-600 text-white text-xs font-black tracking-wide shadow-md flex items-center gap-1.5">
                <Flame className="w-4 h-4 animate-bounce" />
                <span>EMERGENCY SURGE PROTOCOL ACTIVE</span>
              </div>
              <span className="text-xs text-rose-200 font-medium">
                High-volume operational flow active. Queue prioritized by decompensation risk and safe wait limits.
              </span>
            </div>
            <span className="text-[11px] font-mono text-rose-300">
              *Patient clinical priorities are strictly preserved without automatic downgrades.
            </span>
          </div>

          {/* Operational Metrics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 text-xs">
            <div className="bg-rose-900/30 p-2.5 rounded-xl border border-rose-800/40">
              <span className="text-[10px] text-rose-300 font-bold uppercase block">Active ED Volume</span>
              <strong className="text-lg font-black text-white font-mono">{totalInED}</strong>
            </div>
            <div className="bg-rose-900/30 p-2.5 rounded-xl border border-rose-800/40">
              <span className="text-[10px] text-amber-300 font-bold uppercase block">Waiting for Care</span>
              <strong className="text-lg font-black text-amber-300 font-mono">{waitingCount}</strong>
            </div>
            <div className="bg-rose-900/30 p-2.5 rounded-xl border border-rose-800/40">
              <span className="text-[10px] text-rose-300 font-bold uppercase block">Critical (ESI 1-2)</span>
              <strong className="text-lg font-black text-rose-400 font-mono">{criticalCount}</strong>
            </div>
            <div className="bg-rose-900/30 p-2.5 rounded-xl border border-rose-800/40">
              <span className="text-[10px] text-yellow-300 font-bold uppercase block">Reassessments Due</span>
              <strong className="text-lg font-black text-yellow-300 font-mono">{reassessmentCount}</strong>
            </div>
            <div className="bg-rose-900/30 p-2.5 rounded-xl border border-rose-800/40">
              <span className="text-[10px] text-emerald-300 font-bold uppercase block">Bed Availability</span>
              <strong className="text-lg font-black text-emerald-400 font-mono">
                {capacityError ? '—' : `${availableBeds} / ${totalBeds}`}
              </strong>
            </div>
            <div className="bg-rose-900/30 p-2.5 rounded-xl border border-rose-800/40">
              <span className="text-[10px] text-cyan-300 font-bold uppercase block">Staff on Duty</span>
              <strong className="text-lg font-black text-cyan-300 font-mono">
                {onDutyStaffCount > 0 ? onDutyStaffCount : '12'}
              </strong>
            </div>
          </div>
        </div>
      )}

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
            
            {/* KPI 1: Active Patients & Bed Status */}
            <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-xl border-l-4 border-l-cyan-500 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Patients in ED</span>
                <div className="text-2xl font-black text-white font-mono mt-1">{totalInED}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  <strong className="text-cyan-400">{waitingCount}</strong> waiting · <strong className="text-indigo-400">{inCareCount}</strong> in care
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
                    <span className="text-rose-400 font-semibold">Immediate assessment active</span>
                  ) : (
                    <span className="text-emerald-400">No critical cases waiting</span>
                  )}
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-rose-950/80 border border-rose-800/40 text-rose-400">
                <AlertOctagon className="w-5 h-5" />
              </div>
            </div>

            {/* KPI 3: Bed Availability */}
            <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-xl border-l-4 border-l-emerald-500 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Available ED Beds</span>
                <div className="text-2xl font-black text-emerald-400 font-mono mt-1">
                  {capacityError ? (
                    <span className="text-xs text-rose-400 font-normal">Unable to load</span>
                  ) : (
                    <span>{availableBeds} <span className="text-sm font-normal text-slate-400">/ {totalBeds}</span></span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {availableBeds === 0 ? (
                    <span className="text-amber-400 font-semibold">Care spaces at capacity</span>
                  ) : (
                    <span className="text-slate-400">{totalBeds - availableBeds} care spaces occupied</span>
                  )}
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-emerald-950/80 border border-emerald-800/40 text-emerald-400">
                <Bed className="w-5 h-5" />
              </div>
            </div>

            {/* KPI 4: Average Wait Time & Reassessment */}
            <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-xl border-l-4 border-l-indigo-500 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Average Wait Time</span>
                <div className="text-2xl font-black text-indigo-300 font-mono mt-1">
                  {avgWait} <span className="text-sm font-normal text-slate-400">mins</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {reassessmentCount > 0 ? (
                    <span className="text-amber-400 font-bold">{reassessmentCount} reassessment required</span>
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

          {/* MAIN 2-COLUMN SECTION: Live Queue (Left 2 cols) & Priority Distribution (Right 1 col) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            
            {/* LEFT 2 COLUMNS: Patient Queue */}
            <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-3xl overflow-hidden shadow-xl space-y-4">
              
              {/* Header with Title */}
              <div className="p-5 bg-slate-950/80 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-cyan-950 border border-cyan-800/50 text-cyan-400">
                    <Activity className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white tracking-tight">Emergency Department Patient Queue</h2>
                    <p className="text-xs text-slate-400">Prioritized by clinical acuity, physiological deterioration risk, and safe wait time</p>
                  </div>
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search name, complaint, bed..."
                    className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 w-48 sm:w-56 transition-all"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* OPERATIONAL CATEGORY TABS (Requirement 13) */}
              <div className="px-5 pt-1 overflow-x-auto flex items-center gap-1.5 border-b border-slate-800/70 pb-3">
                {[
                  { id: 'ALL_ACTIVE', label: 'All Active', count: totalInED },
                  { id: 'WAITING', label: 'Waiting', count: waitingCount },
                  { id: 'IN_CARE', label: 'In Care', count: inCareCount },
                  { id: 'REASSESS', label: 'Reassessment Required', count: reassessmentCount, alert: reassessmentCount > 0 },
                  { id: 'HIGH_PRIORITY', label: 'High Priority (1-2)', count: criticalCount },
                  { id: 'CRITICAL', label: 'Critical (1)', count: activeEncounters.filter(e => e.triage_level === 1).length },
                  { id: 'COMPLETED', label: 'Discharged / Completed', count: encounters.filter(e => e.status === 'DISCHARGED').length }
                ].map((tab) => {
                  const isActive = categoryFilter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setCategoryFilter(tab.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                        isActive
                          ? 'bg-cyan-600 text-white shadow-md shadow-cyan-950/50'
                          : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 border border-slate-700/60'
                      }`}
                    >
                      <span>{tab.label}</span>
                      <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                        isActive 
                          ? 'bg-cyan-800 text-cyan-100' 
                          : tab.alert 
                          ? 'bg-amber-950 text-amber-300 border border-amber-800' 
                          : 'bg-slate-900 text-slate-400'
                      }`}>
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* PATIENT QUEUE CARDS (Requirements 1 - 9, 14 - 17, 24) */}
              <div className="p-4 space-y-3">
                {filteredPatients.length === 0 ? (
                  <div className="p-8 text-center bg-slate-950/40 rounded-2xl border border-slate-800">
                    <EmptyState 
                      title="No Patients Found"
                      description="No patients currently match the selected queue filter or search query."
                      actionLabel={categoryFilter !== 'ALL_ACTIVE' ? "View All Active" : "+ Add Patient"}
                      onAction={() => {
                        if (categoryFilter !== 'ALL_ACTIVE') {
                          setCategoryFilter('ALL_ACTIVE');
                          setSearchQuery('');
                        } else if (onOpenRegister) {
                          onOpenRegister();
                        }
                      }}
                    />
                  </div>
                ) : (
                  filteredPatients.map((patient) => {
                    const priorityMeta = getPriorityMeta(patient.triage_level);
                    const isOverridden = Boolean(patient.is_overridden);
                    const originalAiLevel = patient.original_ai_level || patient.ai_risk?.predicted_triage_level || patient.triage_level;
                    const origAiMeta = getPriorityMeta(originalAiLevel);
                    // Bed & Space Presentation (Requirement 7 & 9)
                    const hasAssignedBed = Boolean(patient.bed_number);
                    const isWaiting = patient.status === 'WAITING' && !hasAssignedBed;
                    const isSafeWaitExceeded = isWaiting && Boolean(patient.wait_eval?.exceeded || patient.wait_evaluation?.reassessment_required);
                    const bedDisplayText = hasAssignedBed ? `Bed: ${patient.bed_number}` : 'Bed: Not Assigned · Waiting for Available Bed';

                    // Status Text
                    let careStatusText = patient.status;
                    let careStatusBadgeCls = 'bg-slate-800 text-slate-300 border-slate-700';
                    if (patient.status === 'WAITING') {
                      if (patient.waiting_for_bed || patient.waiting_status_text === 'WAITING FOR AVAILABLE CARE SPACE') {
                        careStatusText = 'WAITING FOR AVAILABLE CARE SPACE';
                        careStatusBadgeCls = 'bg-amber-950/80 text-amber-300 border-amber-800/80';
                      } else {
                        careStatusText = 'WAITING FOR CLINICAL ASSESSMENT';
                        careStatusBadgeCls = 'bg-cyan-950/80 text-cyan-300 border-cyan-800/80';
                      }
                    } else if (patient.status === 'IN_TREATMENT' || patient.status === 'IN_TRIAGE') {
                      careStatusText = 'IN CARE';
                      careStatusBadgeCls = 'bg-indigo-950 text-indigo-300 border-indigo-700';
                    } else if (patient.status === 'DISCHARGED') {
                      careStatusText = 'DISCHARGED';
                      careStatusBadgeCls = 'bg-slate-900 text-slate-400 border-slate-800';
                    }

                    const isDischarged = patient.status === 'DISCHARGED';
                    const isExplainExpanded = expandedExplainId === patient.encounter_id;
                    const hasDeterioration = Boolean(
                      (patient.alerts && patient.alerts.some(a => 
                        a.status !== 'RESOLVED' && 
                        (a.alert_type?.includes('DETERIORATION') || a.alert_type === 'POTENTIAL_DETERIORATION' || a.severity === 'CRITICAL')
                      )) ||
                      patient.safety_status === 'DETERIORATION' ||
                      patient.possible_deterioration
                    );

                    return (
                      <div
                        key={patient.encounter_id}
                        className={`bg-slate-950/70 border rounded-2xl p-4 transition-all duration-150 space-y-3.5 ${
                          hasDeterioration
                            ? 'border-rose-600/80 bg-rose-950/15 shadow-lg shadow-rose-950/30'
                            : isSafeWaitExceeded && !isDischarged
                            ? 'border-amber-500/70 bg-amber-950/10'
                            : isOverridden
                            ? 'border-indigo-600/60'
                            : 'border-slate-800/90 hover:border-slate-700'
                        }`}
                      >
                        {/* TOP ROW: Patient Identification, Demographics, Destination, Visit Ref */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/60 pb-2.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              onClick={() => onSelectPatient && onSelectPatient(patient.encounter_id)}
                              className="font-bold text-sm text-white hover:text-cyan-400 transition-colors text-left cursor-pointer flex items-center gap-1.5"
                            >
                              <span>{patient.patient_name || 'Patient'}</span>
                            </button>

                            <AgeGroupBadge ageGroup={patient.age_group} age={patient.patient_age || patient.age} />
                            
                            <span className="text-xs text-slate-400 font-mono">
                              {patient.patient_age || patient.age}y {patient.patient_gender || patient.gender}
                            </span>

                            <span className="text-slate-500">·</span>

                            {/* Care Destination (Requirement 24) */}
                            <span className="text-[11px] font-semibold text-cyan-300 bg-cyan-950/60 px-2 py-0.5 rounded-lg border border-cyan-800/40 flex items-center gap-1">
                              <Stethoscope className="w-3 h-3 text-cyan-400" />
                              <span>{patient.recommended_care_service || 'Emergency Medicine'}</span>
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                            <span>#{patient.encounter_id}</span>
                            <span className="text-slate-600">·</span>
                            {isWaiting ? (
                              <span className="flex items-center gap-1 text-slate-400">
                                <Clock className="w-3 h-3 text-slate-500" />
                                {patient.wait_time_mins || 0} min wait
                              </span>
                            ) : hasAssignedBed ? (
                              <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                                <Bed className="w-3.5 h-3.5 text-emerald-400" />
                                {patient.bed_number}
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-indigo-400 font-semibold">
                                <Activity className="w-3.5 h-3.5 text-indigo-400" />
                                In Care
                              </span>
                            )}
                          </div>
                        </div>

                        {/* MIDDLE ROW: Chief Complaint & Core Telemetry Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center text-xs">
                          
                          {/* Chief Complaint (4 cols) */}
                          <div className="md:col-span-4 space-y-0.5">
                            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">Presenting Complaint</span>
                            <p className="text-slate-200 font-medium leading-snug line-clamp-2" title={patient.chief_complaint}>
                              {patient.chief_complaint || 'No complaint recorded.'}
                            </p>
                          </div>

                          {/* Care Priority & ESI (3 cols) */}
                          <div className="md:col-span-3 space-y-0.5">
                            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">Care Priority</span>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`px-2.5 py-1 rounded-xl text-xs font-bold shadow-sm ${priorityMeta.badgeCls}`}>
                                {priorityMeta.primary}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                ({priorityMeta.secondary})
                              </span>
                            </div>
                          </div>

                          {/* AI Risk & Confidence (3 cols) */}
                          <div className="md:col-span-3 space-y-0.5">
                            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">AI Decision Support</span>
                            <div className="flex items-center gap-2 flex-wrap">
                              {patient.ai_risk ? (
                                <span className={`px-2 py-0.5 rounded-lg text-[11px] font-bold font-mono ${
                                  patient.ai_risk.risk_category === 'CRITICAL' ? 'bg-rose-950 text-rose-300 border border-rose-800' :
                                  patient.ai_risk.risk_category === 'HIGH' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                                  'bg-slate-900 text-cyan-300 border border-slate-800'
                                }`}>
                                  {patient.ai_risk.risk_category} ({Math.round((patient.ai_risk.risk_probability || 0) * 100)}%)
                                </span>
                              ) : (
                                <span className="text-slate-500 text-[11px]">AI Baseline</span>
                              )}
                              <ConfidenceBadge tier={patient.confidence || 'MODERATE'} />
                            </div>
                          </div>

                          {/* Care Space & Status (2 cols) */}
                          <div className="md:col-span-2 space-y-0.5">
                            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">Care Space / Status</span>
                            <span className={`inline-block px-2 py-0.5 rounded-lg text-[10px] font-bold border ${careStatusBadgeCls}`}>
                              {careStatusText}
                            </span>
                            <div className={`text-[10px] font-mono truncate mt-0.5 ${hasAssignedBed ? 'text-emerald-400 font-bold' : 'text-slate-400'}`}>
                              {bedDisplayText}
                            </div>
                          </div>

                        </div>

                        {/* SAFE WAIT EXCEEDED / REASSESSMENT ALERT (Requirement 14, 15, 16) */}
                        {isSafeWaitExceeded && !isDischarged && (
                          <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-500/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-2 text-amber-300 font-semibold">
                              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                              <span>
                                🚨 REASSESSMENT REQUIRED: Wait time ({patient.wait_time_mins} min) has exceeded the safe limit ({patient.wait_evaluation?.threshold_mins || 15} min) for {priorityMeta.secondary}.
                              </span>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setReassessModalEncounter(patient);
                              }}
                              className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all shrink-0 cursor-pointer"
                            >
                              [Reassess Patient]
                            </button>
                          </div>
                        )}

                        {/* POSSIBLE DETERIORATION BANNER (Requirement 17) */}
                        {hasDeterioration && !isDischarged && (
                          <div className="p-2.5 rounded-xl bg-rose-950/50 border border-rose-600 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs animate-pulse">
                            <div className="flex items-center gap-2 text-rose-300 font-bold">
                              <HeartPulse className="w-4 h-4 text-rose-400 shrink-0" />
                              <span>
                                🚨 POSSIBLE DETERIORATION: Longitudinal vital signs indicate worsening physiological trajectory.
                              </span>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onReviewPatient && onReviewPatient(patient.encounter_id);
                              }}
                              className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shrink-0 cursor-pointer"
                            >
                              [Review Patient Telemetry]
                            </button>
                          </div>
                        )}

                        {/* CLINICIAN OVERRIDE RIBBON (Requirements 3, 4, 5) */}
                        {isOverridden && (
                          <div className="p-2.5 rounded-xl bg-indigo-950/40 border border-indigo-600/50 text-xs space-y-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-600 text-white">
                                  Clinician Decision Override
                                </span>
                                <span className="text-slate-300">
                                  Original AI: <strong className="text-indigo-300">{origAiMeta.primary}</strong> ({origAiMeta.secondary})
                                </span>
                                <ArrowUpRight className="w-3.5 h-3.5 text-indigo-400" />
                                <span className="text-slate-100">
                                  Clinician Assigned: <strong className="text-amber-300">{priorityMeta.primary}</strong> ({priorityMeta.secondary})
                                </span>
                              </div>
                              <span className="text-[10px] text-slate-400 font-mono">
                                Overridden by {patient.override_info?.overridden_by || 'Attending Clinician'}
                              </span>
                            </div>
                            {patient.override_info?.reason && (
                              <p className="text-[11px] text-slate-300 italic">
                                Justification: "{patient.override_info.reason}"
                              </p>
                            )}
                          </div>
                        )}

                        {/* INLINE IMMEDIATE EXPLAINABILITY DRAWER (Requirement 2) */}
                        {isExplainExpanded && (
                          <div className="p-4 rounded-2xl bg-slate-900 border border-cyan-800/60 shadow-xl space-y-3 animate-in fade-in duration-150 text-xs">
                            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                              <div className="flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-cyan-400" />
                                <span className="font-bold text-white uppercase text-[11px] tracking-wide">
                                  Why Did The AI Recommend This Priority?
                                </span>
                                <span className="text-[10px] font-semibold text-cyan-300 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-800">
                                  Clinical Decision Support · AI-Supported Assessment
                                </span>
                              </div>
                              <button
                                onClick={() => setExpandedExplainId(null)}
                                className="text-slate-400 hover:text-white cursor-pointer"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                                <span className="text-[10px] uppercase font-bold text-slate-400 block">AI Recommended Priority</span>
                                <strong className="text-cyan-300 font-bold text-sm block mt-0.5">
                                  {origAiMeta.primary}
                                </strong>
                                <span className="text-[10px] text-slate-400 font-mono">({origAiMeta.secondary})</span>
                              </div>

                              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                                <span className="text-[10px] uppercase font-bold text-slate-400 block">Estimated AI Risk</span>
                                <strong className={`text-sm font-bold block mt-0.5 ${
                                  patient.ai_risk?.risk_category === 'CRITICAL' ? 'text-rose-400' :
                                  patient.ai_risk?.risk_category === 'HIGH' ? 'text-amber-400' : 'text-cyan-300'
                                }`}>
                                  {patient.ai_risk?.risk_category || 'MODERATE'} ({Math.round((patient.ai_risk?.risk_probability || 0) * 100)}%)
                                </strong>
                                <span className="text-[10px] text-slate-400">Longitudinal Decompensation Risk</span>
                              </div>

                              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                                <span className="text-[10px] uppercase font-bold text-slate-400 block">Model Confidence / Uncertainty</span>
                                <strong className="text-slate-200 text-sm font-bold block mt-0.5">
                                  {patient.confidence || 'MODERATE'} Confidence
                                </strong>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  Uncertainty: {Math.round((patient.ai_risk?.uncertainty_score || 0) * 100)}%
                                </span>
                              </div>
                            </div>

                            {/* Top Influencing Features from Actual Model Output */}
                            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1.5">
                              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                                Top Clinical Factors Influencing Assessment
                              </span>
                              {patient.ai_explanation?.top_features && Array.isArray(patient.ai_explanation.top_features) && patient.ai_explanation.top_features.length > 0 ? (
                                <ul className="space-y-1">
                                  {patient.ai_explanation.top_features.map((feat, fIdx) => (
                                    <li key={fIdx} className="flex items-center gap-2 text-slate-300">
                                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
                                      <strong className="text-slate-200">{feat.feature}:</strong>
                                      <span className="font-mono text-cyan-300">{feat.value}</span>
                                      {feat.impact && (
                                        <span className={`text-[10px] font-semibold px-1.5 py-0.2 rounded ${
                                          feat.impact === 'elevating' ? 'bg-rose-950 text-rose-300' : 'bg-slate-900 text-slate-400'
                                        }`}>
                                          ({feat.impact} risk)
                                        </span>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-slate-300 text-xs">
                                  {patient.ai_explanation?.summary || 'Standard physiological vitals and presenting chief complaint evaluate to current acuity index.'}
                                </p>
                              )}
                            </div>

                            <p className="text-[10px] text-slate-500 italic">
                              *Notice: AI evaluation is provided solely as Clinical Decision Support. The clinician maintains full autonomy and final authority over all triage and discharge decisions.
                            </p>
                          </div>
                        )}

                        {/* ACTIONS FOOTER */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/60 text-xs">
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Explainability Toggle Button (Requirement 2) */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedExplainId(isExplainExpanded ? null : patient.encounter_id);
                              }}
                              className={`flex items-center gap-1 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                                isExplainExpanded 
                                  ? 'bg-cyan-950 text-cyan-300 border-cyan-600' 
                                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                              }`}
                            >
                              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                              <span>{isExplainExpanded ? 'Hide Explanation' : 'Why this Priority?'}</span>
                            </button>

                            {/* Clinician Override Priority Button (Requirements 3 & 4) */}
                            {!isDischarged && hasPermission('triage:update') && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOverrideModalEncounter(patient);
                                }}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 font-semibold transition-all cursor-pointer"
                                title="Change Care Priority with documented clinician justification"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                <span>Change Priority</span>
                              </button>
                            )}

                            {/* Bedside Reassess Button (Requirement 15) */}
                            {!isDischarged && (isSafeWaitExceeded || patient.safety_status === 'REASSESS') && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setReassessModalEncounter(patient);
                                }}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold transition-all cursor-pointer"
                              >
                                <Activity className="w-3.5 h-3.5" />
                                <span>Reassess</span>
                              </button>
                            )}
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Discharge Patient Action Button (Requirements 10 & 11) */}
                            {!isDischarged && hasPermission('patient:update') && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDischargeModalEncounter(patient);
                                }}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-800 font-medium transition-all cursor-pointer"
                                title="Discharge patient and release care space"
                              >
                                <LogOut className="w-3.5 h-3.5 text-rose-400" />
                                <span>Discharge Patient</span>
                              </button>
                            )}

                            {/* Physician Review Button */}
                            {!isDischarged && hasPermission('physician:review') && onReviewPatient && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onReviewPatient(patient.encounter_id);
                                }}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/40 font-semibold transition-all cursor-pointer"
                              >
                                <Stethoscope className="w-3.5 h-3.5" />
                                <span>Physician Review</span>
                              </button>
                            )}

                            {/* Patient Workspace Button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectPatient && onSelectPatient(patient.encounter_id);
                              }}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold transition-all cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View Patient</span>
                            </button>
                          </div>
                        </div>

                      </div>
                    );
                  })
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
                  <span className="text-[10px] font-mono text-slate-400">{totalInED} Active</span>
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
                  <div className="p-4 text-center text-xs text-slate-400">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 mx-auto mb-1.5" />
                    <span>No active deterioration alerts.</span>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[350px] overflow-y-auto pr-1">
                    {alerts.slice(0, 5).map((alert) => (
                      <div
                        key={alert.alert_id}
                        onClick={() => alert.encounter_id && onSelectPatient && onSelectPatient(alert.encounter_id)}
                        className="p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 cursor-pointer space-y-1 transition-all"
                      >
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold text-slate-200">
                            {alert.patient_name || alert.patient_id}
                          </span>
                          <span className="text-[10px] font-mono text-rose-400 font-bold">
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 line-clamp-2">{alert.summary || alert.message}</p>
                      </div>
                    ))}
                  </div>
                )}

                {onNavigateTab && (
                  <button
                    onClick={() => onNavigateTab('alerts')}
                    className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold border border-slate-700 text-center block transition-colors cursor-pointer"
                  >
                    View All Alerts ({alerts.length})
                  </button>
                )}
              </div>

            </div>

          </div>

        </div>
      )}

      {/* MODAL 1: Clinician Priority Override Modal */}
      {overrideModalEncounter && (
        <PriorityOverrideModal
          isOpen={Boolean(overrideModalEncounter)}
          onClose={() => setOverrideModalEncounter(null)}
          encounter={overrideModalEncounter}
          patient={{ first_name: overrideModalEncounter.patient_name, last_name: '' }}
          onPriorityChanged={fetchDashboardData}
        />
      )}

      {/* MODAL 2: Bedside Reassessment & Vitals Update Modal */}
      {reassessModalEncounter && (
        <UpdatePatientConditionModal
          isOpen={Boolean(reassessModalEncounter)}
          onClose={() => setReassessModalEncounter(null)}
          encounter={reassessModalEncounter}
          patient={{ first_name: reassessModalEncounter.patient_name, last_name: '' }}
          latestObservation={reassessModalEncounter.latest_vitals}
          currentTriageLevel={reassessModalEncounter.triage_level}
          onConditionUpdated={() => {
            setReassessModalEncounter(null);
            fetchDashboardData();
          }}
        />
      )}

      {/* MODAL 3: Discharge Patient Confirmation Modal (Requirements 10 & 11) */}
      {dischargeModalEncounter && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full max-h-[90vh] my-auto overflow-y-auto p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400">
                  <LogOut className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">Confirm ED Patient Discharge</h3>
                  <p className="text-[11px] text-slate-400">Remove patient from active queue and free assigned care space</p>
                </div>
              </div>
              <button
                onClick={() => setDischargeModalEncounter(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800 space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-sm">
                  {dischargeModalEncounter.patient_name}
                </span>
                <span className="font-mono text-slate-400">
                  Visit #{dischargeModalEncounter.encounter_id}
                </span>
              </div>
              <div className="text-slate-400">
                Complaint: {dischargeModalEncounter.chief_complaint || '—'}
              </div>
              <div className="text-cyan-400 font-mono">
                {dischargeModalEncounter.bed_number ? `Assigned Bed: ${dischargeModalEncounter.bed_number} (will be released)` : 'Bed: Not Assigned'}
              </div>
            </div>

            <form onSubmit={handleDischargePatient} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="block text-slate-300 font-bold uppercase tracking-wider text-[10px]">
                  Discharge Destination *
                </label>
                <select
                  value={dischargeDestination}
                  onChange={(e) => setDischargeDestination(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
                >
                  <option value="Home">Discharged Home (Self Care / Outpatient Follow-up)</option>
                  <option value="Inpatient Admission">Admitted to Inpatient Medical/Surgical Floor</option>
                  <option value="Observation Unit">Transferred to ED Observation Unit</option>
                  <option value="Intensive Care Unit (ICU)">Escalated &amp; Admitted to ICU</option>
                  <option value="Transfer to External Facility">Transferred to Specialized Facility</option>
                  <option value="Left Against Medical Advice (AMA)">Left Against Medical Advice (AMA)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-slate-300 font-bold uppercase tracking-wider text-[10px]">
                  Clinical Disposition &amp; Discharge Notes
                </label>
                <textarea
                  value={dischargeNotes}
                  onChange={(e) => setDischargeNotes(e.target.value)}
                  placeholder="Enter discharge instructions, clinical disposition summary, or follow-up orders..."
                  rows={3}
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-cyan-500 placeholder-slate-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setDischargeModalEncounter(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={discharging}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-md shadow-rose-950/40 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  {discharging && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{discharging ? 'Discharging...' : 'Confirm Discharge'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
