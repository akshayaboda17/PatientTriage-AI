import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { FileText, Shield, Clock, Search, RefreshCw, CheckCircle2 } from 'lucide-react';

export const AuditLogView = () => {
  const { authHeaders, hasPermission, addToast } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchAuditLogs();
  }, [authHeaders['X-Hospital-Id']]);

  const fetchAuditLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/audit-logs', { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.audit_logs || []);
      } else if (res.status === 403) {
        addToast("Access Denied: Your role does not have 'audit:view' permission.", "error");
      }
    } catch (err) {
      addToast("Failed to load audit logs.", "error");
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter((log) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      log.staff_id.toLowerCase().includes(q) ||
      (log.staff_name && log.staff_name.toLowerCase().includes(q)) ||
      log.action.toLowerCase().includes(q) ||
      log.entity_id.toLowerCase().includes(q)
    );
  });

  const getActionBadge = (action) => {
    if (action.includes('CREATED') || action.includes('ESCALATED')) {
      return 'bg-rose-950 text-rose-300 border-rose-800';
    }
    if (action.includes('ACKNOWLEDGED')) {
      return 'bg-amber-950 text-amber-300 border-amber-800';
    }
    if (action.includes('RESOLVED')) {
      return 'bg-emerald-950 text-emerald-300 border-emerald-800';
    }
    return 'bg-slate-800 text-slate-300 border-slate-700';
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-cyan-400">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Clinical Governance & Audit Trail</h1>
              <p className="text-xs text-slate-400">Tamper-evident log of all clinical alerts, acknowledgments, and resolutions</p>
            </div>
          </div>
        </div>

        <button
          onClick={fetchAuditLogs}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition-colors self-start"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Logs</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl shadow-md">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search action, staff ID, entity..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950/80 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          />
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Loading clinical audit trail...</div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">No audit records found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3.5">Timestamp</th>
                  <th className="px-4 py-3.5">Clinician / Actor</th>
                  <th className="px-4 py-3.5">Role</th>
                  <th className="px-4 py-3.5">Clinical Action</th>
                  <th className="px-4 py-3.5">Entity</th>
                  <th className="px-4 py-3.5">Metadata / Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' })}
                    </td>

                    <td className="px-4 py-3 font-sans">
                      <div className="font-bold text-slate-200">{log.staff_name || log.staff_id}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{log.staff_id}</div>
                    </td>

                    <td className="px-4 py-3 text-slate-400 font-sans text-[11px]">
                      {log.role}
                    </td>

                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getActionBadge(log.action)}`}>
                        {log.action}
                      </span>
                    </td>

                    <td className="px-4 py-3 font-semibold text-slate-200">
                      {log.entity_id}
                    </td>

                    <td className="px-4 py-3 font-sans text-slate-400 text-xs max-w-xs truncate">
                      {log.metadata ? JSON.stringify(log.metadata) : '-'}
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
