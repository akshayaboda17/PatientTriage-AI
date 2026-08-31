import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  FileText, Shield, Clock, Search, RefreshCw, CheckCircle2, 
  AlertTriangle, XCircle, User, Bot, Cpu, Filter, Eye, X,
  ChevronLeft, ChevronRight, ArrowUpDown, History, ShieldAlert,
  AlertOctagon, Database, Copy, Check, Lock, Layers
} from 'lucide-react';
import { LoadingSkeleton, EmptyState, ErrorState } from './common/StateViews';

export const AuditLogView = () => {
  const { authHeaders, hasPermission, addToast, user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null); // { type: '403' | 'network' | 'server', message: string }
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
          message: "Access Denied: Your staff role does not possess the required 'audit:view' governance permission. Please contact your Clinical Director or Hospital Administrator."
        });
        setLogs([]);
        return;
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        setError({
          type: 'server',
          message: errorData.detail || `Server returned HTTP ${res.status}: Failed to retrieve hospital audit trail.`
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
      console.error('Audit trail fetch exception:', err);
      setError({
        type: 'network',
        message: 'Network connection error. Unable to reach the clinical audit log server. Please check your network connection.'
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
    switch (result) {
      case 'SUCCESS':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            SUCCESS
          </span>
        );
      case 'FAILURE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-950/80 text-rose-300 border border-rose-800/60">
            <XCircle className="w-3 h-3 text-rose-400" />
            FAILURE
          </span>
        );
      case 'DENIED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-800/60">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            DENIED
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
            {result || 'UNKNOWN'}
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
              <h1 className="text-xl font-bold text-white tracking-tight">Clinical Governance &amp; Audit Trail</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 flex items-center gap-1">
                <Lock className="w-2.5 h-2.5" />
                Immutable Log
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Tamper-evident, HIPAA-aligned chronological log of all ED clinical assessments, AI inference, and staff actions
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300">
            Records: <strong className="text-cyan-400">{totalCount.toLocaleString()}</strong>
          </div>
          <button
            onClick={() => fetchAuditLogs()}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
            title="Refresh audit logs"
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
              <option value="">All Actors</option>
              <option value="HUMAN">Human Staff</option>
              <option value="AI_MODEL">AI Deterioration Engine</option>
              <option value="SYSTEM">System Background</option>
            </select>

            {/* Role Filter */}
            <select
              value={roleFilter}
              onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
              className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-300 font-medium focus:outline-none focus:border-cyan-500 cursor-pointer"
            >
              <option value="">All Roles</option>
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
              <option value="">All Results</option>
              <option value="SUCCESS">Success Only</option>
              <option value="FAILURE">Failures</option>
              <option value="DENIED">Denied / 403</option>
            </select>

            {/* Entity Type Filter */}
            <select
              value={entityTypeFilter}
              onChange={(e) => { setEntityTypeFilter(e.target.value); setPage(1); }}
              className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-300 font-medium focus:outline-none focus:border-cyan-500 cursor-pointer"
            >
              <option value="">All Entities</option>
              <option value="ENCOUNTER">ED Encounter</option>
              <option value="PATIENT">Patient</option>
              <option value="OBSERVATION">Vitals Observation</option>
              <option value="AI_RISK">AI Prediction</option>
              <option value="ALERT">Clinical Alert</option>
              <option value="PHYSICIAN_REVIEW">Physician Decision</option>
              <option value="STAFF">Staff Account</option>
            </select>

            {/* Sort Order */}
            <button
              type="button"
              onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
              className="flex items-center gap-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 px-3 py-2 rounded-xl text-xs text-slate-300 transition-colors cursor-pointer"
              title={`Sort by Timestamp (${sortOrder.toUpperCase()})`}
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
                <span>Reset</span>
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
        
        {/* State 1: Loading Skeleton */}
        {loading ? (
          <LoadingSkeleton type="table" rows={8} />
        ) : error ? (
          /* State 2: Recoverable Error State */
          <div className="p-8">
            <ErrorState
              title={error.type === '403' ? 'Access Restricted' : 'Failed to Retrieve Audit Logs'}
              message={error.message}
              onRetry={error.type !== '403' ? fetchAuditLogs : undefined}
              retryText="Retry Audit Fetch"
            />
          </div>
        ) : logs.length === 0 ? (
          /* State 3: Clean Empty State (Distinguishes filtered vs true zero) */
          <div className="p-8">
            <EmptyState
              icon={hasActiveFilters ? Filter : Database}
              title={hasActiveFilters ? 'No Matching Audit Events' : 'No Audit Events Recorded'}
              description={
                hasActiveFilters
                  ? 'No audit log entries match your current search filters. Try adjusting or resetting the filter parameters.'
                  : 'The audit trail for this facility is currently empty. Clinical actions and triage assessments will appear here automatically.'
              }
              actionText={hasActiveFilters ? 'Clear All Filters' : undefined}
              onAction={hasActiveFilters ? handleClearFilters : undefined}
            />
          </div>
        ) : (
          /* State 4: Interactive Audit Table */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3.5">Timestamp</th>
                  <th className="px-4 py-3.5">Event ID</th>
                  <th className="px-4 py-3.5">Actor</th>
                  <th className="px-4 py-3.5">Action Executed</th>
                  <th className="px-4 py-3.5">Target Entity</th>
                  <th className="px-4 py-3.5">Encounter ID</th>
                  <th className="px-4 py-3.5">Result</th>
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
                    {/* Timestamp */}
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

                    {/* Event ID */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-[11px] text-slate-300 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                        {log.event_id || `AUD-${log.id}`}
                      </span>
                    </td>

                    {/* Actor */}
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
                            {log.actor_role || log.role || log.actor_type || 'STAFF'}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Action Executed */}
                    <td className="px-4 py-3 font-mono">
                      <span className="text-cyan-300 font-semibold bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-900/50">
                        {log.action}
                      </span>
                    </td>

                    {/* Target Entity */}
                    <td className="px-4 py-3 font-sans text-slate-300">
                      <div className="text-xs font-semibold">{log.entity_type}</div>
                      <div className="text-[10px] text-slate-500 font-mono truncate max-w-[120px]">
                        {log.entity_id || '—'}
                      </div>
                    </td>

                    {/* Encounter ID */}
                    <td className="px-4 py-3 font-mono text-slate-400">
                      {log.encounter_id ? (
                        <span className="text-slate-300 bg-slate-950 px-1.5 py-0.5 rounded">
                          {log.encounter_id}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>

                    {/* Result */}
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
                        className="p-1.5 rounded-lg text-slate-400 group-hover:text-cyan-400 group-hover:bg-slate-800 transition-colors"
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
                  <h3 className="text-base font-bold text-white tracking-tight">Audit Event Inspector</h3>
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
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800/80 font-mono">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-sans font-bold">Action</div>
                  <div className="text-cyan-300 font-bold mt-0.5">{selectedEvent.action}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-sans font-bold">Result</div>
                  <div className="mt-0.5">{getResultBadge(selectedEvent.result)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-sans font-bold">Actor Type</div>
                  <div className="text-slate-200 mt-0.5">{selectedEvent.actor_type || 'HUMAN'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-sans font-bold">Hospital</div>
                  <div className="text-slate-200 mt-0.5">{selectedEvent.hospital_id}</div>
                </div>
              </div>

              {/* Actor & Entity Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Actor Info */}
                <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-slate-400 font-bold text-[11px] uppercase tracking-wider">
                    <User className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Actor Information</span>
                  </div>
                  <div className="space-y-1 text-slate-300 font-mono">
                    <div>Name: <strong className="text-slate-100 font-sans">{selectedEvent.actor_name || selectedEvent.staff_name || 'N/A'}</strong></div>
                    <div>Staff ID: <span className="text-cyan-400">{selectedEvent.actor_id || selectedEvent.staff_id || 'N/A'}</span></div>
                    <div>Role: <span className="text-slate-300">{selectedEvent.actor_role || selectedEvent.role || 'N/A'}</span></div>
                    <div>IP Address: <span className="text-slate-400">{selectedEvent.ip_address || '127.0.0.1'}</span></div>
                  </div>
                </div>

                {/* Target Entity */}
                <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-slate-400 font-bold text-[11px] uppercase tracking-wider">
                    <Layers className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Target Clinical Entity</span>
                  </div>
                  <div className="space-y-1 text-slate-300 font-mono">
                    <div>Entity Type: <strong className="text-slate-100 font-sans">{selectedEvent.entity_type}</strong></div>
                    <div>Entity ID: <span className="text-indigo-400">{selectedEvent.entity_id || 'N/A'}</span></div>
                    <div>Encounter ID: <span className="text-slate-300">{selectedEvent.encounter_id || 'N/A'}</span></div>
                    <div>Patient ID: <span className="text-slate-300">{selectedEvent.patient_id || 'N/A'}</span></div>
                  </div>
                </div>
              </div>

              {/* Timestamp & Integrity Details */}
              <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800 flex items-center justify-between text-slate-400 font-mono">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-500" />
                  <span>Timestamp: {selectedEvent.timestamp ? new Date(selectedEvent.timestamp).toISOString() : '—'}</span>
                </div>
                <div className="flex items-center gap-1.5 text-emerald-400 text-[11px]">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Cryptographically Verified</span>
                </div>
              </div>

              {/* Raw Event Metadata JSON */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-bold uppercase">
                  <span>Structured Metadata Payload</span>
                  <button
                    onClick={() => copyToClipboard(JSON.stringify(selectedEvent.metadata || {}, null, 2))}
                    className="flex items-center gap-1 text-[10px] text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
                  >
                    {copiedId ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedId ? 'Copied JSON' : 'Copy JSON'}</span>
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
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
