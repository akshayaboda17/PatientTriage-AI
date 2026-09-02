import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Users, Clock, AlertTriangle, AlertOctagon, Heart, Activity, 
  ChevronRight, RefreshCw, UserCheck, ShieldAlert, Sparkles, Filter,
  Stethoscope, Search, UserPlus, Flame, ShieldCheck, AlertCircle, Info,
  Eye, CheckCircle2, Bed, Ambulance, LogOut, X
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

  // Discharge Modal state
  const [dischargeModalPatient, setDischargeModalPatient] = useState(null);
  const [dischargeDestination, setDischargeDestination] = useState('Home');
  const [dischargeNotes, setDischargeNotes] = useState('');
  const [submittingDischarge, setSubmittingDischarge] = useState(false);

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
        throw new Error(`Server returned HTTP ${res.status}: Failed to load patient list.`);
      }
      const data = await res.json();
      setQueue(data.queue || []);
      setSurgeMode(data.surge_mode || false);
      setHospConfig(data.hospital_config || null);
    } catch (err) {
      console.error('Queue fetch error:', err);
      setError(err.message || 'Network error loading active patient queue.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSurge = async () => {
    if (!hasPermission('hospital:update')) {
      addToast("Access Restricted: Only Clinical Director or Hospital Administrator can toggle Surge Care Mode.", "error");
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
        addToast(data.message || `Surge care mode ${!surgeMode ? 'activated' : 'deactivated'}.`, surgeMode ? 'info' : 'warning');
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

  const handleDischargeFromQueue = async (e) => {
    e.preventDefault();
    if (!dischargeModalPatient) return;
    setSubmittingDischarge(true);
    try {
      const res = await fetch(`/api/encounters/${dischargeModalPatient.encounter_id}/discharge`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: dischargeDestination,
          disposition_notes: dischargeNotes.trim() || undefined
        })
      });

      if (res.ok) {
        addToast(`Patient ${dischargeModalPatient.patient_name} successfully discharged. Bed released.`, "success");
        setDischargeModalPatient(null);
        setDischargeNotes('');
        fetchQueue();
        if (onAlertStateChanged) onAlertStateChanged();
      } else {
        const err = await res.json().catch(() => ({}));
        addToast(err.detail || "Failed to discharge patient.", "error");
      }
    } catch (err) {
      addToast("Network error executing discharge.", "error");
    } finally {
      setSubmittingDischarge(false);
    }
  };

  // Client-side filtering
  const filteredQueue = queue.filter((patient) => {
    if (statusFilter !== 'ALL' && patient.status !== statusFilter) return false;
    if (acuityFilter !== 'ALL' && Number(patient.triage_level) !== Number(acuityFilter)) return false;
    if (safetyFilter !== 'ALL' && patient.safety_status !== safetyFilter) return false;
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

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white tracking-tight">Patients Waiting for Care</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">
                {filteredQueue.length} Active Patients
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Live emergency department queue prioritized by clinical urgency, early warning indicators, and time waiting
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Surge Mode Toggle */}
          {hasPermission('hospital:update') && (
            <button
              onClick={handleToggleSurge}
              disabled={togglingSurge}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border shadow-md cursor-pointer disabled:opacity-50 ${
                surgeMode
                  ? 'bg-rose-950 text-rose-300 border-rose-600 animate-pulse'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
              title="Enhance prioritization during high influx surge"
            >
              <Flame className={`w-3.5 h-3.5 ${surgeMode ? 'text-rose-400' : 'text-slate-500'}`} />
              <span>{surgeMode ? 'Surge Care Mode ACTIVE' : 'Surge Care Mode: OFF'}</span>
            </button>
          )}

          {/* Add Patient */}
          {hasPermission('patient:create') && onOpenRegister && (
            <button
              onClick={onOpenRegister}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-md shadow-cyan-900/30 transition-all cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add Patient</span>
            </button>
          )}

          {/* Refresh */}
          <button
            onClick={fetchQueue}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Surge Notice Strip */}
      {surgeMode && (
        <div className="bg-rose-950/40 border border-rose-600/80 rounded-2xl p-4 flex items-center justify-between gap-3 text-xs text-rose-200 animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <Flame className="w-5 h-5 text-rose-400 shrink-0" />
            <div>
              <span className="font-bold text-rose-300">Surge Care Mode Active:</span>
              <span className="ml-1 text-slate-300">
                Prioritization algorithm dynamically elevated for rapid vital re-evaluations and expedited care routing.
              </span>
            </div>
          </div>
          <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-rose-900/80 border border-rose-700 font-bold shrink-0">
            Enhanced Monitoring
          </span>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-lg flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search patient name, visit ID, symptoms..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        {/* Dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          
          {/* Care Priority Filter */}
          <select
            value={acuityFilter}
            onChange={(e) => setAcuityFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 font-medium focus:outline-none focus:border-cyan-500 cursor-pointer"
          >
            <option value="ALL">All Care Priorities</option>
            <option value="1">Critical — Immediate Care (ESI 1)</option>
            <option value="2">Emergency — Immediate Assessment (ESI 2)</option>
            <option value="3">Urgent — Prompt Assessment (ESI 3)</option>
            <option value="4">Less Urgent (ESI 4)</option>
            <option value="5">Non-Urgent (ESI 5)</option>
          </select>

          {/* Patient Safety Status Filter */}
          <select
            value={safetyFilter}
            onChange={(e) => setSafetyFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 font-medium focus:outline-none focus:border-cyan-500 cursor-pointer"
          >
            <option value="ALL">All Care Statuses</option>
            <option value="ESCALATE">Immediate Attention Needed</option>
            <option value="REASSESS">Reassessment Required</option>
            <option value="MONITOR">Monitoring Active</option>
            <option value="STABLE">Stable</option>
          </select>

          {/* Visit State Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 font-medium focus:outline-none focus:border-cyan-500 cursor-pointer"
          >
            <option value="ALL">All Visit Stages</option>
            <option value="WAITING">Waiting for Care</option>
            <option value="IN_TRIAGE">In Triage Assessment</option>
            <option value="IN_TREATMENT">In Treatment</option>
          </select>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        {loading ? (
          <LoadingSkeleton type="table" rows={8} />
        ) : error ? (
          <div className="p-8">
            <ErrorState message={error} onRetry={fetchQueue} />
          </div>
        ) : filteredQueue.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={Users}
              title="No Patients in Queue"
              description="No active patients match your active search or filter criteria."
              actionText={hasPermission('patient:create') ? "Add Patient" : undefined}
              onAction={onOpenRegister}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3.5">Care Priority</th>
                  <th className="px-4 py-3.5">Patient &amp; Age</th>
                  <th className="px-4 py-3.5">Chief Complaint / Symptoms</th>
                  <th className="px-4 py-3.5">AI Risk &amp; Confidence</th>
                  <th className="px-4 py-3.5">Care Status</th>
                  <th className="px-4 py-3.5">Time Waiting</th>
                  <th className="px-4 py-3.5">Bed / Location</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredQueue.map((patient) => {
                  const isBreached = patient.wait_time_mins > (patient.safe_wait_threshold_mins || 60);
                  const isImmediate = patient.safety_status === 'ESCALATE';

                  return (
                    <tr
                      key={patient.encounter_id}
                      onClick={() => onSelectPatient && onSelectPatient(patient.encounter_id)}
                      className={`hover:bg-slate-800/40 transition-colors cursor-pointer ${
                        isImmediate ? 'bg-rose-950/20' : ''
                      }`}
                    >
                      {/* Priority */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <AcuityBadge level={patient.triage_level} />
                      </td>

                      {/* Patient Name */}
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-white text-xs">{patient.patient_name}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <AgeGroupBadge ageGroup={patient.age_group} age={patient.age} />
                          <span className="text-[10px] text-slate-500 font-mono">Visit #{patient.encounter_id}</span>
                        </div>
                      </td>

                      {/* Chief Complaint */}
                      <td className="px-4 py-3.5 text-slate-300 max-w-[200px] truncate">
                        {patient.chief_complaint}
                      </td>

                      {/* AI Risk Assessment */}
                      <td className="px-4 py-3.5 whitespace-nowrap font-mono">
                        {patient.ai_risk ? (
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className={`font-bold ${
                                patient.ai_risk.risk_category === 'HIGH' || patient.ai_risk.risk_category === 'CRITICAL'
                                  ? 'text-rose-400'
                                  : patient.ai_risk.risk_category === 'MODERATE'
                                  ? 'text-amber-400'
                                  : 'text-emerald-400'
                              }`}>
                                {patient.ai_risk.risk_probability !== undefined
                                  ? `${(patient.ai_risk.risk_probability * 100).toFixed(0)}%`
                                  : `${patient.ai_risk.risk_score}%`} Estimated Risk
                              </span>
                            </div>
                            <ConfidenceBadge confidence={patient.ai_risk.confidence || 'HIGH'} />
                          </div>
                        ) : (
                          <span className="text-slate-600 text-[10px]">Triage Assigned</span>
                        )}
                      </td>

                      {/* Care Status */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <SafetyStatusBadge status={patient.safety_status} />
                        {(patient.active_alerts_count > 0 || patient.safety_status === 'ESCALATE') && (
                          <span className="text-[9px] font-bold text-amber-300 bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-800 flex items-center gap-1 mt-1 w-fit">
                            <ShieldAlert className="w-3 h-3 text-amber-400 animate-pulse" />
                            <span>Condition Alert ({patient.active_alerts_count || 1})</span>
                          </span>
                        )}
                      </td>

                      {/* Time Waiting */}
                      <td className="px-4 py-3.5 whitespace-nowrap font-mono">
                        <div className="flex items-center gap-1 text-slate-300">
                          <Clock className="w-3 h-3 text-slate-500" />
                          <span>{patient.wait_time_mins || 0} mins</span>
                        </div>
                        {isBreached && (
                          <span className="text-[9px] font-black text-rose-300 bg-rose-950 px-2 py-0.5 rounded border border-rose-700 flex items-center gap-1 mt-1 animate-pulse">
                            <AlertTriangle className="w-3 h-3 text-rose-400" />
                            <span>REASSESSMENT REQUIRED</span>
                          </span>
                        )}
                      </td>

                      {/* Bed Location */}
                      <td className="px-4 py-3.5 font-mono text-slate-400 whitespace-nowrap">
                        {patient.bed_number ? (
                          <span className="text-cyan-300 font-bold bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 font-mono">
                            Bed {patient.bed_number}
                          </span>
                        ) : (
                          <span className="text-amber-300 font-semibold bg-amber-950/40 px-2 py-0.5 rounded-lg border border-amber-800/50 flex items-center gap-1 w-fit text-[11px]">
                            <Clock className="w-3 h-3 text-amber-400" />
                            <span>Waiting for Bed</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
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
                          {hasPermission('patient:update') && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDischargeModalPatient(patient);
                              }}
                              className="p-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 transition-all cursor-pointer"
                              title="Discharge Patient & Free Bed"
                            >
                              <LogOut className="w-3.5 h-3.5" />
                            </button>
                          )}
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

      {/* Discharge Confirmation Modal */}
      {dischargeModalPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400">
                  <LogOut className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">Discharge Patient &amp; Free Bed</h3>
                  <p className="text-xs text-slate-400">Conclude ED encounter and release assigned care space</p>
                </div>
              </div>
              <button
                onClick={() => setDischargeModalPatient(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 bg-slate-950/70 rounded-2xl border border-slate-800/80 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Patient Name:</span>
                <span className="font-bold text-white">{dischargeModalPatient.patient_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Encounter ID:</span>
                <span className="font-mono text-cyan-300">{dischargeModalPatient.encounter_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Current Priority:</span>
                <span className="font-bold text-white">Level {dischargeModalPatient.triage_level}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Assigned Bed:</span>
                <span className="font-mono text-amber-300">{dischargeModalPatient.bed_number ? `Bed ${dischargeModalPatient.bed_number}` : 'Waiting Area (Unbedded)'}</span>
              </div>
            </div>

            <form onSubmit={handleDischargeFromQueue} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1.5 uppercase tracking-wider text-[10px]">
                  Discharge Destination *
                </label>
                <select
                  value={dischargeDestination}
                  onChange={(e) => setDischargeDestination(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-200 focus:outline-none focus:border-rose-500 cursor-pointer"
                >
                  <option value="Home">Home (Safe for Outpatient Management)</option>
                  <option value="Inpatient Ward">Admit to Inpatient Unit</option>
                  <option value="Observation Unit">Observation Unit (12-24h Monitoring)</option>
                  <option value="Transfer Facility">Transfer to Specialized Facility</option>
                  <option value="Against Medical Advice">Against Medical Advice (AMA)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1.5 uppercase tracking-wider text-[10px]">
                  Clinical Disposition Notes
                </label>
                <textarea
                  rows={3}
                  placeholder="Document discharge instructions, prescriptions provided, and follow-up plan..."
                  value={dischargeNotes}
                  onChange={(e) => setDischargeNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-200 focus:outline-none focus:border-rose-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDischargeModalPatient(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingDischarge}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-950/50 transition-all disabled:opacity-50 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>{submittingDischarge ? 'Processing Discharge...' : 'Confirm Discharge & Release Bed'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
