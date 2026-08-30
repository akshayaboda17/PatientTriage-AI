import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Users, UserPlus, Shield, CheckCircle2, XCircle, Search, 
  RefreshCw, Lock, AlertTriangle, X, Check, Edit2, ShieldAlert
} from 'lucide-react';

export const StaffManagementView = () => {
  const { authHeaders, hasPermission, addToast, currentStaff } = useAuth();
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
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
    try {
      const res = await fetch('/api/staff', { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setStaffList(data.staff || []);
      } else if (res.status === 403) {
        addToast("Access Denied: You need 'staff:view' permission.", "error");
      }
    } catch (err) {
      addToast("Failed to load hospital staff directory.", "error");
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
        body: JSON.stringify(newStaff)
      });

      if (res.ok) {
        addToast(`Staff member '${newStaff.name}' created successfully.`, "success");
        setShowAddModal(false);
        setNewStaff({ staff_id: '', name: '', email: '', role: 'EMERGENCY_PHYSICIAN' });
        fetchStaff();
      } else {
        const err = await res.json();
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
        const err = await res.json();
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
        return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-800 text-slate-300 border border-slate-700">Emergency Tech</span>;
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Hospital Staff Management & RBAC</h1>
            <p className="text-xs text-slate-400">Authorized personnel accounts, clinical roles, and active credential governance</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {hasPermission('staff:create') && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-md shadow-cyan-900/30 transition-all"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add Staff Member</span>
            </button>
          )}

          <button
            onClick={fetchStaff}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search staff name, ID, email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300 font-medium focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Roles</option>
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
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Loading staff directory...</div>
        ) : filteredStaff.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">No staff accounts found matching criteria.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3.5">Staff Member</th>
                  <th className="px-4 py-3.5">Staff ID</th>
                  <th className="px-4 py-3.5">Role</th>
                  <th className="px-4 py-3.5">Email</th>
                  <th className="px-4 py-3.5">Account Status</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredStaff.map((staff) => (
                  <tr key={staff.staff_id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-4">
                      <div className="font-bold text-slate-100 text-sm">{staff.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">Hospital: {staff.hospital_id}</div>
                    </td>
                    <td className="px-4 py-4 font-mono text-cyan-400 font-semibold">
                      {staff.staff_id}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {getRoleBadge(staff.role)}
                    </td>
                    <td className="px-4 py-4 text-slate-300">
                      {staff.email || '—'}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {staff.is_active ? (
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Active
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-rose-400">
                          <XCircle className="w-3.5 h-3.5" />
                          Deactivated
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right whitespace-nowrap">
                      {hasPermission('staff:deactivate') && staff.is_active && staff.staff_id !== currentStaff.staff_id && (
                        <button
                          onClick={() => setDeactivatingStaff(staff)}
                          className="px-2.5 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800 text-xs font-semibold transition-colors"
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

      {/* Add Staff Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-cyan-400 font-bold text-sm">
                <UserPlus className="w-5 h-5" />
                <span>Provision New Staff Member</span>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateStaff} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Official Staff ID *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. DOC005, NUR008"
                  value={newStaff.staff_id}
                  onChange={(e) => setNewStaff({ ...newStaff, staff_id: e.target.value.trim() })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 font-mono text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Full Legal Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dr. Robert Chase, MD"
                  value={newStaff.name}
                  onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Hospital Email</label>
                <input
                  type="email"
                  placeholder="e.g. r.chase@hospital.org"
                  value={newStaff.email}
                  onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value.trim() })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Assigned Clinical Role *</label>
                <select
                  value={newStaff.role}
                  onChange={(e) => setNewStaff({ ...newStaff, role: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="EMERGENCY_PHYSICIAN">Emergency Physician</option>
                  <option value="TRIAGE_NURSE">Triage Nurse</option>
                  <option value="STAFF_NURSE">Staff Nurse</option>
                  <option value="EMERGENCY_TECHNICIAN">Emergency Technician</option>
                  <option value="CLINICAL_DIRECTOR">Clinical Director</option>
                  <option value="HOSPITAL_ADMIN">Hospital Administrator</option>
                </select>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400">
                <span>Hospital Tenant: <strong>{currentStaff.hospital_id}</strong> (Auto-enforced)</span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAdd}
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow disabled:opacity-50"
                >
                  {submittingAdd ? 'Provisioning...' : 'Provision Staff Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deactivate Confirmation Modal */}
      {deactivatingStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-rose-600/70 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
              <AlertTriangle className="w-5 h-5" />
              <span>Confirm Staff Account Deactivation</span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to deactivate <strong className="text-white">{deactivatingStaff.name}</strong> ({deactivatingStaff.staff_id})? 
              This will immediately revoke active sessions and prevent access to the clinical system.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeactivatingStaff(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeactivate}
                disabled={submittingDeactivate}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow disabled:opacity-50"
              >
                {submittingDeactivate ? 'Deactivating...' : 'Deactivate Staff Account'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
