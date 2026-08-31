import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Users, UserPlus, Shield, CheckCircle2, XCircle, Search, 
  RefreshCw, Lock, AlertTriangle, X, Check, Edit2, ShieldAlert,
  ShieldCheck, UserCheck, Mail, Building2
} from 'lucide-react';
import { LoadingSkeleton, EmptyState, ErrorState } from './common/StateViews';

export const StaffManagementView = () => {
  const { authHeaders, hasPermission, addToast, currentStaff, hospital } = useAuth();
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');

  // Modal States
  const [showAddModal, setShowAddModal] = useState(false);
  const [newStaff, setNewStaff] = useState({
    staff_id: '',
    name: '',
    email: '',
    role: 'EMERGENCY_PHYSICIAN'
  });
  const [submittingAdd, setSubmittingAdd] = useState(false);

  // Deactivate Confirmation Modal
  const [deactivatingStaff, setDeactivatingStaff] = useState(null);
  const [submittingDeactivate, setSubmittingDeactivate] = useState(false);

  useEffect(() => {
    fetchStaff();
  }, [authHeaders['X-Hospital-Id']]);

  const fetchStaff = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/staff', { headers: authHeaders });
      if (res.status === 403) {
        setError("Access Denied: You need 'staff:view' permission to view the staff directory.");
        return;
      }
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}: Failed to load staff directory.`);
      }
      const data = await res.json();
      setStaffList(data.staff || []);
    } catch (err) {
      console.error('Staff directory error:', err);
      setError(err.message || 'Failed to load hospital staff directory.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateStaff = async (e) => {
    e.preventDefault();
    if (!newStaff.staff_id.trim() || !newStaff.name.trim()) {
      addToast("Staff ID and Name are required.", "warning");
      return;
    }

    setSubmittingAdd(true);
    try {
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          staff_id: newStaff.staff_id.trim().toUpperCase(),
          name: newStaff.name.trim(),
          email: newStaff.email.trim() || undefined,
          role: newStaff.role
        })
      });

      if (res.ok) {
        addToast(`Staff member '${newStaff.name}' created successfully.`, "success");
        setShowAddModal(false);
        setNewStaff({ staff_id: '', name: '', email: '', role: 'EMERGENCY_PHYSICIAN' });
        fetchStaff();
      } else {
        const err = await res.json().catch(() => ({}));
        addToast(err.detail || "Failed to create staff account.", "error");
      }
    } catch (err) {
      addToast("Network error creating staff.", "error");
    } finally {
      setSubmittingAdd(false);
    }
  };

  const handleDeactivate = async () => {
    if (!deactivatingStaff) return;
    setSubmittingDeactivate(true);
    try {
      const res = await fetch(`/api/staff/${deactivatingStaff.staff_id}/deactivate`, {
        method: 'PUT',
        headers: authHeaders
      });

      if (res.ok) {
        addToast(`Staff account '${deactivatingStaff.name}' deactivated.`, "success");
        setDeactivatingStaff(null);
        fetchStaff();
      } else {
        const err = await res.json().catch(() => ({}));
        addToast(err.detail || "Failed to deactivate staff.", "error");
      }
    } catch (err) {
      addToast("Network error deactivating staff.", "error");
    } finally {
      setSubmittingDeactivate(false);
    }
  };

  const filteredStaff = staffList.filter((s) => {
    if (roleFilter !== 'ALL' && s.role !== roleFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        s.name.toLowerCase().includes(q) ||
        s.staff_id.toLowerCase().includes(q) ||
        (s.email && s.email.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const getRoleBadge = (role) => {
    switch (role) {
      case 'CLINICAL_DIRECTOR':
        return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-950 text-purple-300 border border-purple-800">Clinical Director</span>;
      case 'HOSPITAL_ADMIN':
        return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">Hospital Admin</span>;
      case 'EMERGENCY_PHYSICIAN':
        return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-800">Emergency Physician</span>;
      case 'TRIAGE_NURSE':
        return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">Triage Nurse</span>;
      case 'STAFF_NURSE':
        return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-950 text-teal-300 border border-teal-800">Staff Nurse</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-800 text-slate-300 border border-slate-700">Staff ({role})</span>;
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white tracking-tight">Hospital Staff Directory &amp; RBAC Governance</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                Facility: {hospital?.name || currentStaff?.hospital_id}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Authorized clinical accounts, multi-factor credential governance, and RBAC permission assignment
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {hasPermission('staff:create') && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-md shadow-cyan-900/30 transition-all cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add Staff Account</span>
            </button>
          )}

          <button
            onClick={fetchStaff}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-lg flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search staff name, ID, email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-sans"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 font-medium focus:outline-none focus:border-cyan-500 cursor-pointer"
          >
            <option value="ALL">All Clinical Roles</option>
            <option value="CLINICAL_DIRECTOR">Clinical Director</option>
            <option value="EMERGENCY_PHYSICIAN">Emergency Physician</option>
            <option value="TRIAGE_NURSE">Triage Nurse</option>
            <option value="STAFF_NURSE">Staff Nurse</option>
            <option value="EMERGENCY_TECHNICIAN">Emergency Technician</option>
            <option value="HOSPITAL_ADMIN">Hospital Administrator</option>
          </select>
        </div>
      </div>

      {/* Staff Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl shadow-xl overflow-hidden">
        {loading ? (
          <LoadingSkeleton type="table" rows={6} />
        ) : error ? (
          <div className="p-8">
            <ErrorState message={error} onRetry={fetchStaff} />
          </div>
        ) : filteredStaff.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={Users}
              title="No Staff Accounts Found"
              description="No authorized personnel accounts match your search filters."
              actionText={hasPermission('staff:create') ? "Add Staff Member" : undefined}
              onAction={() => setShowAddModal(true)}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">Staff Personnel</th>
                  <th className="px-5 py-3.5">Staff ID</th>
                  <th className="px-5 py-3.5">Clinical Role</th>
                  <th className="px-5 py-3.5">Email Address</th>
                  <th className="px-5 py-3.5">Account Status</th>
                  <th className="px-5 py-3.5 text-right">Governance Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {filteredStaff.map((staff) => (
                  <tr key={staff.staff_id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-5 py-4">
                      <div className="font-bold text-slate-100 text-sm">{staff.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">Facility: {staff.hospital_id}</div>
                    </td>
                    <td className="px-5 py-4 font-mono text-cyan-400 font-bold">
                      {staff.staff_id}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      {getRoleBadge(staff.role)}
                    </td>
                    <td className="px-5 py-4 text-slate-300 font-mono">
                      {staff.email || '—'}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      {staff.is_active ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800/60">
                          <CheckCircle2 className="w-3 h-3" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-400 bg-rose-950/60 px-2 py-0.5 rounded-full border border-rose-800/60">
                          <XCircle className="w-3 h-3" />
                          Deactivated
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {hasPermission('staff:deactivate') && staff.is_active && staff.staff_id !== currentStaff.staff_id && (
                        <button
                          onClick={() => setDeactivatingStaff(staff)}
                          className="px-2.5 py-1 rounded-lg bg-rose-950/40 hover:bg-rose-900 text-rose-300 hover:text-white border border-rose-800/50 text-[11px] font-semibold transition-colors cursor-pointer"
                        >
                          Deactivate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Staff Account Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-bold text-white">Create Staff Account</h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateStaff} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="block text-slate-300 font-bold uppercase tracking-wider text-[10px]">
                  Unique Staff ID (e.g. DOC005, NUR008) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. DOC005"
                  value={newStaff.staff_id}
                  onChange={(e) => setNewStaff({ ...newStaff, staff_id: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500 uppercase"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-300 font-bold uppercase tracking-wider text-[10px]">
                  Full Clinician Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dr. Robert Chase, MD"
                  value={newStaff.name}
                  onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-300 font-bold uppercase tracking-wider text-[10px]">
                  Staff Email Address
                </label>
                <input
                  type="email"
                  placeholder="e.g. chase@hospital.org"
                  value={newStaff.email}
                  onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-300 font-bold uppercase tracking-wider text-[10px]">
                  Clinical Role &amp; Permission Tier *
                </label>
                <select
                  value={newStaff.role}
                  onChange={(e) => setNewStaff({ ...newStaff, role: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 font-semibold focus:outline-none focus:border-cyan-500 cursor-pointer"
                >
                  <option value="EMERGENCY_PHYSICIAN">Emergency Physician</option>
                  <option value="TRIAGE_NURSE">Triage Nurse</option>
                  <option value="CLINICAL_DIRECTOR">Clinical Director</option>
                  <option value="HOSPITAL_ADMIN">Hospital Administrator</option>
                  <option value="STAFF_NURSE">Staff Nurse</option>
                  <option value="EMERGENCY_TECHNICIAN">Emergency Technician</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAdd}
                  className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-md shadow-cyan-900/30 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {submittingAdd ? 'Provisioning...' : 'Provision Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deactivate Confirmation Modal */}
      {deactivatingStaff && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2.5 rounded-2xl bg-rose-950 border border-rose-800">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Deactivate Staff Account</h3>
                <p className="text-xs text-slate-400">Confirm access revocation</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to deactivate <strong className="text-white">{deactivatingStaff.name}</strong> ({deactivatingStaff.staff_id})? 
              This staff member will immediately lose access to patient triage charts and clinical decision consoles.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setDeactivatingStaff(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeactivate}
                disabled={submittingDeactivate}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md shadow-rose-950/50 transition-all disabled:opacity-50 cursor-pointer"
              >
                {submittingDeactivate ? 'Deactivating...' : 'Confirm Deactivation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
