import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  FileText, Shield, Clock, Search, RefreshCw, CheckCircle2, 
  AlertTriangle, XCircle, User, Bot, Cpu, Filter, Eye, X,
  ChevronLeft, ChevronRight, ArrowUpDown, History, ShieldAlert
} from 'lucide-react';

export const AuditLogView = () => {
  const { authHeaders, addToast, user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedEvent, setSelectedEvent] = useState(null);

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [actorTypeFilter, setActorTypeFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [resultFilter, setResultFilter] = useState('');
  const [encounterFilter, setEncounterFilter] = useState('');
  const [sortOrder, setSortOrder] = useState('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    fetchAuditLogs();
  }, [
    authHeaders['X-Hospital-Id'],
    page,
    pageSize,
    actorTypeFilter,
    roleFilter,
    actionFilter,
    entityTypeFilter,
    resultFilter,
    encounterFilter,
    sortOrder
  ]);

  const fetchAuditLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('page_size', pageSize.toString());
      params.append('sort_order', sortOrder);

      if (searchQuery.trim()) params.append('q', searchQuery.trim());
      if (actorTypeFilter) params.append('actor_type', actorTypeFilter);
      if (roleFilter) params.append('actor_role', roleFilter);
      if (actionFilter) params.append('action', actionFilter);
      if (entityTypeFilter) params.append('entity_type', entityTypeFilter);
      if (resultFilter) params.append('result', resultFilter);
      if (encounterFilter.trim()) params.append('encounter_id', encounterFilter.trim());

      const res = await fetch(`/api/audit-logs?${params.toString()}`, { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || data.audit_logs || []);
        setTotalCount(data.total || (data.logs || []).length);
        setTotalPages(data.total_pages || 1);
      } else if (res.status === 403) {
        addToast("Access Denied: Your role does not have 'audit:view' permission.", "error");
      } else {
        addToast("Failed to load audit logs.", "error");
      }
    } catch (err) {
      addToast("Network error while loading audit logs.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchAuditLogs();
  };

  const clearFilters = () => {
    setSearchQuery('');
    setActorTypeFilter('');
    setRoleFilter('');
    setActionFilter('');
    setEntityTypeFilter('');
    setResultFilter('');
    setEncounterFilter('');
    setSortOrder('desc');
    setPage(1);
  };

  const formatActionLabel = (action) => {
    switch (action) {
      case 'AI_OVERRIDDEN':
      case 'AI_OVERRIDE_RECORDED':
        return 'AI Override Recorded';
      case 'CLINICAL_DECISION_SAVED':
      case 'CLINICAL_DECISION_RECORDED':
        return 'Clinical Decision Recorded';
      case 'OBSERVATION_CORRECTED':
        return 'Observation Corrected';
      case 'OBSERVATION_RECORDED':
        return 'Observation Recorded';
      case 'ALERT_CREATED':
        return 'Clinical Alert Created';
      case 'ALERT_ACKNOWLEDGED':
        return 'Alert Acknowledged';
      case 'ALERT_RESOLVED':
        return 'Alert Resolved';
      case 'ALERT_DISMISSED':
        return 'Alert Dismissed';
      case 'AI_ASSESSMENT_GENERATED':
        return 'AI Risk Generated';
      case 'AI_EXPLANATION_GENERATED':
        return 'AI Explanation Generated';
      case 'TRIAGE_CREATED':
        return 'Triage Intake Recorded';
      case 'ENCOUNTER_CREATED':
        return 'ED Encounter Created';
      case 'ENCOUNTER_STATUS_CHANGED':
        return 'Encounter Status Changed';
      case 'PATIENT_CREATED':
        return 'Patient Registered';
      case 'PATIENT_UPDATED':
        return 'Patient Demographic Updated';
      case 'LOGIN_SUCCESS':
        return 'Staff Login Success';
      case 'LOGIN_FAILURE':
        return 'Staff Login Failed';
      case 'LOGOUT':
        return 'Staff Logout';
      case 'STAFF_CREATED':
        return 'Staff Account Created';
      case 'STAFF_DEACTIVATED':
        return 'Staff Account Deactivated';
      case 'ROLE_CHANGED':
        return 'Staff Role Changed';
      default:
        return action ? action.replace(/_/g, ' ') : 'Action';
    }
  };

  const getActionBadgeStyle = (action) => {
    if (action.includes('OVERRIDDEN') || action.includes('OVERRIDE')) {
      return 'bg-amber-950/80 text-amber-300 border-amber-800';
    }
    if (action.includes('CORRECTED')) {
      return 'bg-purple-950/80 text-purple-300 border-purple-800';
    }
    if (action.includes('CREATED') || action.includes('ESCALATED')) {
      return 'bg-cyan-950/80 text-cyan-300 border-cyan-800';
    }
    if (action.includes('RESOLVED')) {
      return 'bg-emerald-950/80 text-emerald-300 border-emerald-800';
    }
    if (action.includes('ACKNOWLEDGED')) {
      return 'bg-blue-950/80 text-blue-300 border-blue-800';
    }
    if (action.includes('FAILURE') || action.includes('DENIED')) {
      return 'bg-rose-950/80 text-rose-300 border-rose-800';
    }
    return 'bg-slate-800 text-slate-300 border-slate-700';
  };

  const getActorTypeBadge = (actorType) => {
    switch (actorType) {
      case 'AI_SYSTEM':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-800">
            <Bot className="w-3 h-3" /> AI
          </span>
        );
      case 'SYSTEM':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">
            <Cpu className="w-3 h-3" /> System
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
            <User className="w-3 h-3" /> Human
          </span>
        );
    }
  };

  const getResultBadge = (result) => {
    switch (result) {
      case 'SUCCESS':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" /> SUCCESS
          </span>
        );
      case 'DENIED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-950/80 text-rose-300 border border-rose-800">
            <ShieldAlert className="w-3 h-3 text-rose-400" /> DENIED
          </span>
        );
      case 'FAILURE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-800">
            <XCircle className="w-3 h-3 text-amber-400" /> FAILURE
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
            {result || 'SUCCESS'}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-cyan-950/60 border border-cyan-700/50 text-cyan-400">
            <Shield className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white tracking-tight">Clinical Audit Trail & Governance</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-cyan-400 border border-cyan-800/40">
                Task 11 Append-Only Store
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Cryptographically timestamped accountability log tracking: Who did what, to which patient/encounter, and when
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-semibold text-slate-200">{totalCount} Total Logged Events</div>
            <div className="text-[10px] text-slate-400 font-mono">Hospital: {authHeaders['X-Hospital-Id'] || 'DEMO001'}</div>
          </div>
          <button
            onClick={() => { setPage(1); fetchAuditLogs(); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Console */}
      <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl shadow-md space-y-3">
        <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by Actor Name, Staff ID, Entity ID, Action, or Event ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold transition-colors"
          >
            Search
          </button>
        </form>

        {/* Multi-Parameter Filter Selectors */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5 pt-2 border-t border-slate-800">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Actor Type</label>
            <select
              value={actorTypeFilter}
              onChange={(e) => { setActorTypeFilter(e.target.value); setPage(1); }}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="">All Actors</option>
              <option value="HUMAN">Human (Clinician/Staff)</option>
              <option value="AI_SYSTEM">AI System (ML Models)</option>
              <option value="SYSTEM">System (Rule Engine)</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Role</label>
            <select
              value={roleFilter}
              onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="">All Roles</option>
              <option value="EMERGENCY_PHYSICIAN">Emergency Physician</option>
              <option value="TRIAGE_NURSE">Triage Nurse</option>
              <option value="CLINICAL_DIRECTOR">Clinical Director</option>
              <option value="HOSPITAL_ADMIN">Hospital Admin</option>
              <option value="STAFF_NURSE">Staff Nurse</option>
              <option value="EMERGENCY_TECHNICIAN">Emergency Tech</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Action</label>
            <select
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="">All Actions</option>
              <option value="AI_OVERRIDDEN">AI Override Recorded</option>
              <option value="CLINICAL_DECISION_SAVED">Clinical Decision Recorded</option>
              <option value="OBSERVATION_CORRECTED">Observation Corrected</option>
              <option value="OBSERVATION_RECORDED">Observation Recorded</option>
              <option value="ALERT_CREATED">Alert Created</option>
              <option value="ALERT_ACKNOWLEDGED">Alert Acknowledged</option>
              <option value="ALERT_RESOLVED">Alert Resolved</option>
              <option value="AI_ASSESSMENT_GENERATED">AI Risk Generated</option>
              <option value="TRIAGE_CREATED">Triage Recorded</option>
              <option value="ENCOUNTER_CREATED">Encounter Created</option>
              <option value="PATIENT_CREATED">Patient Created</option>
              <option value="LOGIN_SUCCESS">Login Success</option>
              <option value="LOGIN_FAILURE">Login Failure</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Entity</label>
            <select
              value={entityTypeFilter}
              onChange={(e) => { setEntityTypeFilter(e.target.value); setPage(1); }}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="">All Entities</option>
              <option value="PATIENT">Patient</option>
              <option value="ENCOUNTER">Encounter</option>
              <option value="TRIAGE_ASSESSMENT">Triage Assessment</option>
              <option value="ClinicalObservation">Clinical Observation</option>
              <option value="AIRiskAssessment">AI Assessment</option>
              <option value="ClinicalAlert">Clinical Alert</option>
              <option value="PhysicianAssessment">Physician Assessment</option>
              <option value="AUTHENTICATION">Authentication</option>
              <option value="STAFF">Staff</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Result</label>
            <select
              value={resultFilter}
              onChange={(e) => { setResultFilter(e.target.value); setPage(1); }}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="">All Results</option>
              <option value="SUCCESS">SUCCESS</option>
              <option value="DENIED">DENIED</option>
              <option value="FAILURE">FAILURE</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={clearFilters}
              className="w-full py-1 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-colors flex items-center justify-center gap-1"
            >
              <X className="w-3.5 h-3.5" /> Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-16 text-center text-slate-400 text-sm">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-cyan-400" />
            Loading clinical audit trail...
          </div>
        ) : logs.length === 0 ? (
          <div className="p-16 text-center text-slate-400 text-sm">
            <Shield className="w-8 h-8 mx-auto mb-2 text-slate-600" />
            No audit records found matching current query filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/90 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3.5">Event ID & Time</th>
                  <th className="px-4 py-3.5">Actor / Origin</th>
                  <th className="px-4 py-3.5">Action</th>
                  <th className="px-4 py-3.5">Entity / Target</th>
                  <th className="px-4 py-3.5">Encounter / Patient</th>
                  <th className="px-4 py-3.5">Result</th>
                  <th className="px-4 py-3.5 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {logs.map((log) => (
                  <tr key={log.id || log.event_id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                      <div className="font-bold text-slate-200 text-xs">{log.event_id || `AUD-${log.id}`}</div>
                      <div className="text-[10px] text-slate-500 font-sans">
                        {new Date(log.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' })}
                      </div>
                    </td>

                    <td className="px-4 py-3 font-sans">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-200">{log.actor_name || log.staff_name || log.actor_id}</span>
                        {getActorTypeBadge(log.actor_type)}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {log.actor_role || log.role} • {log.actor_id || log.staff_id}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border font-sans ${getActionBadgeStyle(log.action)}`}>
                        {formatActionLabel(log.action)}
                      </span>
                    </td>

                    <td className="px-4 py-3 font-mono">
                      <div className="font-semibold text-slate-200 text-xs">{log.entity_id}</div>
                      <div className="text-[10px] text-slate-500 font-sans">{log.entity_type}</div>
                    </td>

                    <td className="px-4 py-3 font-mono text-[11px]">
                      {log.encounter_id ? (
                        <div className="text-cyan-400 font-semibold">{log.encounter_id}</div>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                      {log.patient_id && (
                        <div className="text-[10px] text-slate-500 font-sans">{log.patient_id}</div>
                      )}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      {getResultBadge(log.result)}
                    </td>

                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setSelectedEvent(log)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                        title="View Event Details"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Server-Side Pagination Bar */}
        <div className="px-4 py-3 bg-slate-950/80 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span>Showing page <strong className="text-slate-200">{page}</strong> of <strong className="text-slate-200">{totalPages}</strong> ({totalCount} total events)</span>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-300"
            >
              <option value={10}>10 per page</option>
              <option value={25}>25 per page</option>
              <option value={50}>50 per page</option>
              <option value={100}>100 per page</option>
            </select>

            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none text-slate-200 border border-slate-700"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none text-slate-200 border border-slate-700"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Audit Event Detail Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-bold text-white">Audit Event Details</h3>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Event ID</span>
                <span className="font-mono text-cyan-400 font-bold">{selectedEvent.event_id || `AUD-${selectedEvent.id}`}</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Timestamp (UTC)</span>
                <span className="text-slate-200">{new Date(selectedEvent.timestamp).toLocaleString()}</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Action</span>
                <span className="font-bold text-slate-200">{selectedEvent.action}</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Result</span>
                <div>{getResultBadge(selectedEvent.result)}</div>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Actor</span>
                <span className="text-slate-200">{selectedEvent.actor_name || selectedEvent.staff_name} ({selectedEvent.actor_id || selectedEvent.staff_id})</span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Role: {selectedEvent.actor_role || selectedEvent.role}</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Entity</span>
                <span className="text-slate-200 font-mono">{selectedEvent.entity_id}</span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Type: {selectedEvent.entity_type}</span>
              </div>
            </div>

            {/* Context references */}
            {(selectedEvent.encounter_id || selectedEvent.patient_id) && (
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs space-y-1">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Clinical Context</span>
                {selectedEvent.encounter_id && <div>Encounter ID: <strong className="text-cyan-400 font-mono">{selectedEvent.encounter_id}</strong></div>}
                {selectedEvent.patient_id && <div>Patient ID: <strong className="text-slate-300 font-mono">{selectedEvent.patient_id}</strong></div>}
              </div>
            )}

            {/* Metadata Payload */}
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Metadata & Rationale (Sanitized)</span>
              {selectedEvent.metadata ? (
                <pre className="text-[11px] font-mono text-slate-300 bg-slate-900 p-2.5 rounded-lg overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(selectedEvent.metadata, null, 2)}
                </pre>
              ) : (
                <p className="text-slate-500 text-xs italic">No additional metadata payload.</p>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedEvent(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
