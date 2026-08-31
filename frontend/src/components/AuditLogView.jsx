import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  FileText, Shield, Clock, Search, RefreshCw, CheckCircle2, 
  AlertTriangle, XCircle, User, Bot, Cpu, Filter, Eye, X,
  ChevronLeft, ChevronRight, ArrowUpDown, History, ShieldAlert,
  AlertOctagon, Database, Copy, Check, Lock, Layers, UserCheck
} from 'lucide-react';
import { LoadingSkeleton, EmptyState, ErrorState } from './common/StateViews';
import { 
  formatAuditAction, 
  formatAuditEntity, 
  formatAuditActorType, 
  formatAuditResult,
  ROLE_LABELS
} from '../utils/terminology';

export const AuditLogView = () => {
  const { authHeaders, hasPermission, addToast, user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [copiedId, setCopiedId] = useState(false);

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
    setError(null);
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
      
      if (res.status === 403) {
        setError({
          type: '403',
          message: "Access Restricted: Your staff account does not have permission to view the audit history. Please contact your Clinical Director or Hospital Administrator."
        });
        setLogs([]);
        return;
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        setError({
          type: 'server',
          message: errorData.detail || `Unable to retrieve hospital audit logs (HTTP ${res.status}).`
        });
        setLogs([]);
        return;
      }

      const data = await res.json();
      const loadedLogs = data.audit_logs || data.logs || [];
      setLogs(loadedLogs);
      setTotalCount(data.total !== undefined ? data.total : loadedLogs.length);
      setTotalPages(data.total_pages || Math.max(1, Math.ceil((data.total || loadedLogs.length) / pageSize)));
    } catch (err) {
      console.error('Audit trail fetch error:', err);
      setError({
        type: 'network',
        message: 'Network connection error. Unable to load clinical audit history. Please check your network connection.'
      });
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchAuditLogs();
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setActorTypeFilter('');
    setRoleFilter('');
    setActionFilter('');
    setEntityTypeFilter('');
    setResultFilter('');
    setEncounterFilter('');
    setPage(1);
  };

  const hasActiveFilters = Boolean(
    searchQuery || actorTypeFilter || roleFilter || actionFilter || 
    entityTypeFilter || resultFilter || encounterFilter
  );

  const getResultBadge = (result) => {
    const outcome = formatAuditResult(result);
    switch (result) {
      case 'SUCCESS':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            {outcome.label}
          </span>
        );
      case 'FAILURE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-950/80 text-rose-300 border border-rose-800/60">
            <XCircle className="w-3 h-3 text-rose-400" />
            {outcome.label}
          </span>
        );
      case 'DENIED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-800/60">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            {outcome.label}
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
            {outcome.label}
          </span>
        );
    }
  };

  const getActorIcon = (actorType) => {
    switch (actorType) {
      case 'HUMAN':
        return <User className="w-3.5 h-3.5 text-cyan-400" />;
      case 'AI_MODEL':
        return <Bot className="w-3.5 h-3.5 text-indigo-400" />;
      case 'SYSTEM':
        return <Cpu className="w-3.5 h-3.5 text-purple-400" />;
      default:
        return <User className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-white tracking-tight">Clinical Audit History &amp; Activity Log</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 flex items-center gap-1">
                <Lock className="w-2.5 h-2.5" />
                Permanent Record
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Chronological log of all patient care assessments, vital signs entries, AI risk calculations, and staff actions
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300">
            Recorded Events: <strong className="text-cyan-400">{totalCount.toLocaleString()}</strong>
          </div>
          <button
            onClick={() => fetchAuditLogs()}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
            title="Refresh audit history"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-lg space-y-3">
        <form onSubmit={handleSearchSubmit} className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
          
          {/* Free Text Search */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search event ID, staff name, staff ID, action, or patient ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-sans"
            />
          </div>

          {/* Quick Filters */}
          <div className="flex flex-wrap items-center gap-2">
            
            {/* Actor Type */}
            <select
              value={actorTypeFilter}
              onChange={(e) => { setActorTypeFilter(e.target.value); setPage(1); }}
              className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-300 font-medium focus:outline-none focus:border-cyan-500 cursor-pointer"
            >
              <option value="">All Staff &amp; Systems</option>
              <option value="HUMAN">Clinical Staff Members</option>
              <option value="AI_MODEL">AI Deterioration Engine</option>
              <option value="SYSTEM">Automated System Tasks</option>
            </select>

            {/* Role Filter */}
            <select
              value={roleFilter}
              onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
              className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-300 font-medium focus:outline-none focus:border-cyan-500 cursor-pointer"
            >
              <option value="">All Staff Roles</option>
              <option value="EMERGENCY_PHYSICIAN">Emergency Physician</option>
              <option value="TRIAGE_NURSE">Triage Nurse</option>
              <option value="CLINICAL_DIRECTOR">Clinical Director</option>
              <option value="HOSPITAL_ADMIN">Hospital Administrator</option>
              <option value="STAFF_NURSE">Staff Nurse</option>
            </select>

            {/* Result Filter */}
            <select
              value={resultFilter}
              onChange={(e) => { setResultFilter(e.target.value); setPage(1); }}
              className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-300 font-medium focus:outline-none focus:border-cyan-500 cursor-pointer"
            >
              <option value="">All Outcomes</option>
              <option value="SUCCESS">Completed Actions</option>
              <option value="FAILURE">Failed Actions</option>
              <option value="DENIED">Access Denied</option>
            </select>

            {/* Entity Type Filter */}
            <select
              value={entityTypeFilter}
              onChange={(e) => { setEntityTypeFilter(e.target.value); setPage(1); }}
              className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-300 font-medium focus:outline-none focus:border-cyan-500 cursor-pointer"
            >
              <option value="">All Record Types</option>
              <option value="ENCOUNTER">Patient Visit</option>
              <option value="PATIENT">Patient Record</option>
              <option value="OBSERVATION">Vital Signs</option>
              <option value="AI_RISK">AI Assessment</option>
              <option value="ALERT">Clinical Alert</option>
              <option value="PHYSICIAN_REVIEW">Physician Clinical Decision</option>
              <option value="STAFF">Staff Account</option>
            </select>

            {/* Sort Order */}
            <button
              type="button"
              onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
              className="flex items-center gap-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 px-3 py-2 rounded-xl text-xs text-slate-300 transition-colors cursor-pointer"
              title={`Sort by Date & Time (${sortOrder.toUpperCase()})`}
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-cyan-400" />
              <span>{sortOrder === 'desc' ? 'Newest First' : 'Oldest First'}</span>
            </button>

            {/* Clear Filters */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 px-2 py-1.5 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Reset Filters</span>
              </button>
            )}

            <button
              type="submit"
              className="bg-cyan-600 hover:bg-cyan-500 text-white px-3.5 py-2 rounded-xl text-xs font-bold shadow-md shadow-cyan-900/30 transition-all cursor-pointer"
            >
              Search
            </button>
          </div>
        </form>
      </div>

      {/* Main Content Area */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        
        {/* Loading */}
        {loading ? (
          <LoadingSkeleton type="table" rows={8} />
        ) : error ? (
          <div className="p-8">
            <ErrorState
              title={error.type === '403' ? 'Access Restricted' : 'Unable to Load Audit History'}
              message={error.message}
              onRetry={error.type !== '403' ? fetchAuditLogs : undefined}
              retryText="Retry Loading"
            />
          </div>
        ) : logs.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={hasActiveFilters ? Filter : Database}
              title={hasActiveFilters ? 'No Matching Audit Events' : 'No Audit History Recorded'}
              description={
                hasActiveFilters
                  ? 'No audit log entries match your active search filters. Try adjusting or resetting the filter parameters.'
                  : 'The activity log for this hospital facility is currently clear. Clinical evaluations and vital signs entries will appear here automatically.'
              }
              actionText={hasActiveFilters ? 'Clear All Filters' : undefined}
              onAction={hasActiveFilters ? handleClearFilters : undefined}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3.5">Date &amp; Time</th>
                  <th className="px-4 py-3.5">Audit Event ID</th>
                  <th className="px-4 py-3.5">Performed By</th>
                  <th className="px-4 py-3.5">Action Performed</th>
                  <th className="px-4 py-3.5">Record / Item</th>
                  <th className="px-4 py-3.5">Visit ID</th>
                  <th className="px-4 py-3.5">Outcome</th>
                  <th className="px-4 py-3.5 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {logs.map((log) => (
                  <tr
                    key={log.event_id || log.id}
                    onClick={() => setSelectedEvent(log)}
                    className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                  >
                    {/* Date & Time */}
                    <td className="px-4 py-3 whitespace-nowrap text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span>
                          {log.timestamp 
                            ? new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                            : '—'}
                        </span>
                        <span className="text-[10px] text-slate-500 font-sans ml-1">
                          {log.timestamp ? new Date(log.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''}
                        </span>
                      </div>
                    </td>

                    {/* Audit Event ID */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-[11px] text-slate-300 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                        {log.event_id || `AUD-${log.id}`}
                      </span>
                    </td>

                    {/* Performed By */}
                    <td className="px-4 py-3 font-sans">
                      <div className="flex items-center gap-2">
                        <div className="p-1 rounded-lg bg-slate-950 border border-slate-800">
                          {getActorIcon(log.actor_type)}
                        </div>
                        <div>
                          <div className="font-bold text-slate-200 text-xs">
                            {log.actor_name || log.staff_name || log.actor_id || 'System'}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {ROLE_LABELS[log.actor_role] || log.actor_role || formatAuditActorType(log.actor_type)}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Action Performed */}
                    <td className="px-4 py-3 font-sans">
                      <span className="text-cyan-300 font-semibold bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-900/50">
                        {formatAuditAction(log.action)}
                      </span>
                    </td>

                    {/* Record / Item */}
                    <td className="px-4 py-3 font-sans text-slate-300">
                      <div className="text-xs font-semibold">{formatAuditEntity(log.entity_type)}</div>
                      <div className="text-[10px] text-slate-500 font-mono truncate max-w-[120px]">
                        {log.entity_id || '—'}
                      </div>
                    </td>

                    {/* Visit ID */}
                    <td className="px-4 py-3 font-mono text-slate-400">
                      {log.encounter_id ? (
                        <span className="text-slate-300 bg-slate-950 px-1.5 py-0.5 rounded">
                          #{log.encounter_id}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>

                    {/* Outcome */}
                    <td className="px-4 py-3 whitespace-nowrap font-sans">
                      {getResultBadge(log.result)}
                    </td>

                    {/* Action View */}
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedEvent(log);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 group-hover:text-cyan-400 group-hover:bg-slate-800 transition-colors cursor-pointer"
                        title="View Full Event Details"
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

        {/* Pagination Controls */}
        {!loading && !error && logs.length > 0 && (
          <div className="bg-slate-950/90 border-t border-slate-800 px-4 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span>Showing</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-slate-200 text-xs font-medium focus:outline-none focus:border-cyan-500 cursor-pointer"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span>records per page · Total <strong>{totalCount.toLocaleString()}</strong> events</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-mono">Page {page} of {totalPages}</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page <= 1}
                  className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-slate-900 transition-colors cursor-pointer"
                  title="Previous Page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page >= totalPages}
                  className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-slate-900 transition-colors cursor-pointer"
                  title="Next Page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Event Details Inspection Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full max-h-[85vh] overflow-hidden shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">Audit Event Details</h3>
                  <p className="text-[11px] text-slate-400 font-mono">ID: {selectedEvent.event_id || `AUD-${selectedEvent.id}`}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              
              {/* Top Meta Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800/80">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Action</div>
                  <div className="text-cyan-300 font-bold mt-0.5">{formatAuditAction(selectedEvent.action)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Outcome</div>
                  <div className="mt-0.5">{getResultBadge(selectedEvent.result)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Initiated By</div>
                  <div className="text-slate-200 mt-0.5">{formatAuditActorType(selectedEvent.actor_type)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Hospital Facility</div>
                  <div className="text-slate-200 mt-0.5">{selectedEvent.hospital_id}</div>
                </div>
              </div>

              {/* Actor & Entity Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Staff Info */}
                <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-slate-400 font-bold text-[11px] uppercase tracking-wider">
                    <User className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Staff / System Information</span>
                  </div>
                  <div className="space-y-1 text-slate-300">
                    <div>Name: <strong className="text-slate-100">{selectedEvent.actor_name || selectedEvent.staff_name || 'Automated System'}</strong></div>
                    <div>Staff ID: <span className="text-cyan-400 font-mono">{selectedEvent.actor_id || selectedEvent.staff_id || 'N/A'}</span></div>
                    <div>Role: <span className="text-slate-300">{ROLE_LABELS[selectedEvent.actor_role] || selectedEvent.actor_role || 'Staff'}</span></div>
                    <div>Network IP: <span className="text-slate-400 font-mono">{selectedEvent.ip_address || '127.0.0.1'}</span></div>
                  </div>
                </div>

                {/* Target Entity */}
                <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-slate-400 font-bold text-[11px] uppercase tracking-wider">
                    <Layers className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Associated Patient / Record</span>
                  </div>
                  <div className="space-y-1 text-slate-300">
                    <div>Record Type: <strong className="text-slate-100">{formatAuditEntity(selectedEvent.entity_type)}</strong></div>
                    <div>Record Ref: <span className="text-indigo-400 font-mono">{selectedEvent.entity_id || 'N/A'}</span></div>
                    <div>Visit ID: <span className="text-slate-300 font-mono">{selectedEvent.encounter_id ? `#${selectedEvent.encounter_id}` : 'N/A'}</span></div>
                    <div>Patient ID: <span className="text-slate-300 font-mono">{selectedEvent.patient_id || 'N/A'}</span></div>
                  </div>
                </div>
              </div>

              {/* Timestamp & Verification */}
              <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800 flex items-center justify-between text-slate-400">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-500" />
                  <span>Date &amp; Time: {selectedEvent.timestamp ? new Date(selectedEvent.timestamp).toLocaleString() : '—'}</span>
                </div>
                <div className="flex items-center gap-1.5 text-emerald-400 text-[11px]">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Audit Record Verified</span>
                </div>
              </div>

              {/* Structured Event Data */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-bold uppercase">
                  <span>Detailed Event Data</span>
                  <button
                    onClick={() => copyToClipboard(JSON.stringify(selectedEvent.metadata || {}, null, 2))}
                    className="flex items-center gap-1 text-[10px] text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
                  >
                    {copiedId ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedId ? 'Copied' : 'Copy Data'}</span>
                  </button>
                </div>
                <pre className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-[11px] font-mono text-cyan-200/90 overflow-x-auto max-h-48 leading-relaxed">
                  {JSON.stringify(selectedEvent.metadata || {}, null, 2)}
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-end">
              <button
                onClick={() => setSelectedEvent(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-colors cursor-pointer"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
