import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Users, ShieldCheck, UserPlus, Search, Key, Shield, UserX, 
  CheckCircle2, RefreshCw, X, AlertTriangle, Building2, User
} from 'lucide-react';
import { LoadingSkeleton, EmptyState, ErrorState } from './common/StateViews';
import { ROLE_LABELS } from '../utils/terminology';

export const StaffManagementView = () => {
  const { authHeaders, hasPermission, addToast, user, hospital, currentStaff } = useAuth();
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');

  // Modal for adding new staff
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'EMERGENCY_PHYSICIAN',
    password: ''
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchStaff();
  }, [authHeaders['X-Hospital-Id']]);

  const fetchStaff = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/staff', { headers: authHeaders });
      if (res.status === 403) {
        setError("Access Restricted: You need 'staff:view' permission to view the staff directory.");
        return;
      }
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}: Failed to load staff directory.`);
      }
      const data = await res.json();
      setStaffList(data.staff || data || []);
    } catch (err) {
      console.error('Staff fetch error:', err);
      setError('Unable to load staff directory. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateStaff = async (e) => {
    e.preventDefault();
    if (!hasPermission('staff:create')) {
      addToast("Access Restricted: You do not have permission to add staff members.", "error");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        addToast(`Staff member "${formData.name}" added successfully.`, 'success');
        setIsAddOpen(false);
        setFormData({ name: '', email: '', role: 'EMERGENCY_PHYSICIAN', password: '' });
        fetchStaff();
      } else {
        const errorData = await res.json().catch(() => ({}));
        addToast(errorData.detail || 'Failed to add staff member.', 'error');
      }
    } catch (err) {
      addToast('Network error creating staff account.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async (staffId, name) => {
    if (staffId === currentStaff?.staff_id) {
      addToast("You cannot deactivate your own active session account.", "warning");
      return;
    }

    if (!confirm(`Are you sure you want to deactivate account for "${name}" (${staffId})?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/staff/${staffId}/deactivate`, {
        method: 'POST',
        headers: authHeaders
      });

      if (res.ok) {
        addToast(`Account for ${name} deactivated.`, 'success');
        fetchStaff();
      } else {
        const err = await res.json().catch(() => ({}));
        addToast(err.detail || 'Failed to deactivate staff member.', 'error');
      }
    } catch (err) {
      addToast('Network error deactivating account.', 'error');
    }
  };

  const filteredStaff = staffList.filter((s) => {
    if (roleFilter !== 'ALL' && s.role !== roleFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        (s.name || '').toLowerCase().includes(q) ||
        (s.staff_id || '').toLowerCase().includes(q) ||
        (s.email || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getRoleBadge = (role) => {
    const label = ROLE_LABELS[role] || role;
    switch (role) {
      case 'CLINICAL_DIRECTOR':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-800">{label}</span>;
      case 'HOSPITAL_ADMIN':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">{label}</span>;
      case 'EMERGENCY_PHYSICIAN':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-800">{label}</span>;
      case 'TRIAGE_NURSE':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">{label}</span>;
      case 'STAFF_NURSE':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-950 text-teal-300 border border-teal-800">{label}</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">{label}</span>;
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white tracking-tight">Staff Directory &amp; Access Permissions</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                Facility: {hospital?.name || currentStaff?.hospital_id}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Authorized clinical staff accounts, role assignment, and access control permissions
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {hasPermission('staff:create') && (
            <button
              onClick={() => setIsAddOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-md shadow-cyan-900/30 transition-all cursor-pointer"
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

      {/* Filter Bar */}
      <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-lg flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search staff name, ID, email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
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
            <option value="HOSPITAL_ADMIN">Hospital Administrator</option>
          </select>
        </div>
      </div>

      {/* Staff Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        {loading ? (
          <LoadingSkeleton type="table" rows={5} />
        ) : error ? (
          <div className="p-8">
            <ErrorState message={error} onRetry={fetchStaff} />
          </div>
        ) : filteredStaff.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={Users}
              title="No Staff Accounts Found"
              description="No clinical staff accounts currently match your search or filter settings."
              actionText={hasPermission('staff:create') ? "Add Staff Account" : undefined}
              onAction={() => setIsAddOpen(true)}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">Clinician / Staff Member</th>
                  <th className="px-5 py-3.5">Staff ID</th>
                  <th className="px-5 py-3.5">Role</th>
                  <th className="px-5 py-3.5">Email Address</th>
                  <th className="px-5 py-3.5">Account Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredStaff.map((staff) => (
                  <tr key={staff.staff_id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="font-bold text-white text-xs">{staff.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">Facility: {staff.hospital_id}</div>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-cyan-400 font-bold">
                      {staff.staff_id}
                    </td>
                    <td className="px-5 py-3.5">
                      {getRoleBadge(staff.role)}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-slate-300">
                      {staff.email || '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      {staff.is_active ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-400">
                          <X className="w-3.5 h-3.5" />
                          Deactivated
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {hasPermission('staff:update') && staff.is_active && staff.staff_id !== currentStaff?.staff_id && (
                        <button
                          onClick={() => handleDeactivate(staff.staff_id, staff.name)}
                          className="px-2.5 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/60 text-xs font-semibold transition-colors cursor-pointer"
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
      {isAddOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-bold text-white">Add New Clinical Staff Member</h3>
              </div>
              <button
                onClick={() => setIsAddOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateStaff} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="block font-bold text-slate-300 uppercase tracking-wider">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dr. Robert Chase"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-300 uppercase tracking-wider">Email Address *</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. chase@hospital.org"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-300 uppercase tracking-wider">Role &amp; Clinical Permissions *</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer font-medium"
                >
                  <option value="EMERGENCY_PHYSICIAN">Emergency Physician (Clinical Decision &amp; Triage Review)</option>
                  <option value="TRIAGE_NURSE">Triage Nurse (Patient Intake &amp; Vital Signs Recording)</option>
                  <option value="STAFF_NURSE">Staff Nurse (Bedside Care &amp; Observations)</option>
                  <option value="CLINICAL_DIRECTOR">Clinical Director (Full Clinical Administration &amp; Governance)</option>
                  <option value="HOSPITAL_ADMIN">Hospital Administrator (Facility Management &amp; Staff Access)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-300 uppercase tracking-wider">Initial Password *</label>
                <input
                  type="password"
                  required
                  placeholder="Temporary login password..."
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-md shadow-cyan-900/30 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Creating...' : 'Create Staff Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
