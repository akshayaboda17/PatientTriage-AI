import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Building2, Users, Bed, Activity, CheckCircle2, AlertTriangle, 
  RefreshCw, Search, ShieldCheck, Stethoscope, Heart, UserCheck, 
  MapPin, Clock, Flame, ShieldAlert, Mail
} from 'lucide-react';
import { LoadingSkeleton, EmptyState, ErrorState } from './common/StateViews';

export const HospitalCapacityView = ({ onSelectPatient, onOpenRegister }) => {
  const { authHeaders, hasPermission, addToast, hospital, currentStaff } = useAuth();
  const [capacityData, setCapacityData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [bedFilter, setBedFilter] = useState('ALL'); // 'ALL', 'AVAILABLE', 'OCCUPIED'
  const [staffSearch, setStaffSearch] = useState('');
  const [selectedBed, setSelectedBed] = useState(null);

  useEffect(() => {
    fetchCapacity();
  }, [authHeaders['X-Hospital-Id']]);

  const fetchCapacity = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/hospital-config/capacity', { headers: authHeaders });
      if (!res.ok) {
        throw new Error(`Failed to load capacity data (HTTP ${res.status})`);
      }
      const data = await res.json();
      setCapacityData(data);
    } catch (err) {
      console.error('Capacity fetch error:', err);
      setError('Unable to load real-time bed capacity and staff roster.');
    } finally {
      setLoading(false);
    }
  };

  const getRoleBadge = (role) => {
    switch (role) {
      case 'CLINICAL_DIRECTOR':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-800">Clinical Director</span>;
      case 'HOSPITAL_ADMIN':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">Hospital Admin</span>;
      case 'EMERGENCY_PHYSICIAN':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-800">Emergency Physician</span>;
      case 'TRIAGE_NURSE':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">Triage Nurse</span>;
      case 'STAFF_NURSE':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-950 text-teal-300 border border-teal-800">Staff Nurse</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">{role}</span>;
    }
  };

  const beds = capacityData?.beds?.bed_list || [];
  const filteredBeds = beds.filter(b => {
    if (bedFilter === 'AVAILABLE') return b.status === 'AVAILABLE';
    if (bedFilter === 'OCCUPIED') return b.status === 'OCCUPIED';
    return true;
  });

  const staffList = capacityData?.staff?.staff_list || [];
  const filteredStaff = staffList.filter(s => {
    if (staffSearch.trim()) {
      const q = staffSearch.toLowerCase();
      return s.name.toLowerCase().includes(q) || s.role.toLowerCase().includes(q) || s.assigned_zone.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white tracking-tight">Hospital Bed Capacity &amp; On-Duty Staff</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-cyan-300 border border-slate-700">
                {hospital?.name || capacityData?.hospital_id}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Live emergency department bed occupancy tracking and active on-duty clinician resource directory
            </p>
          </div>
        </div>

        <button
          onClick={fetchCapacity}
          disabled={loading}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Live Status</span>
        </button>
      </div>

      {loading ? (
        <LoadingSkeleton type="cards" />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchCapacity} />
      ) : (
        <div className="space-y-6">
          
          {/* SECTION 1: BED AVAILABILITY SUMMARY CARDS */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Total Bed Capacity */}
            <div className="bg-slate-900/90 border border-slate-800 p-4.5 rounded-2xl shadow-lg border-l-4 border-l-cyan-500">
              <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
                <span>Total ED Beds</span>
                <Bed className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="text-3xl font-black text-white mt-2 font-mono">{capacityData?.beds?.total || 0}</div>
              <div className="text-[11px] text-slate-400 mt-1">Configured operational capacity</div>
            </div>

            {/* Available Beds */}
            <div className="bg-slate-900/90 border border-slate-800 p-4.5 rounded-2xl shadow-lg border-l-4 border-l-emerald-500">
              <div className="flex items-center justify-between text-xs font-bold text-emerald-400 uppercase tracking-wider">
                <span>Available Beds</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-3xl font-black text-emerald-300 mt-2 font-mono">{capacityData?.beds?.available || 0}</div>
              <div className="text-[11px] text-slate-400 mt-1">Ready for patient intake</div>
            </div>

            {/* Occupied Beds */}
            <div className="bg-slate-900/90 border border-slate-800 p-4.5 rounded-2xl shadow-lg border-l-4 border-l-amber-500">
              <div className="flex items-center justify-between text-xs font-bold text-amber-400 uppercase tracking-wider">
                <span>Occupied Beds</span>
                <Users className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-3xl font-black text-amber-300 mt-2 font-mono">{capacityData?.beds?.occupied || 0}</div>
              <div className="text-[11px] text-slate-400 mt-1">Patients actively admitted/in triage</div>
            </div>

            {/* Occupancy Rate */}
            <div className="bg-slate-900/90 border border-slate-800 p-4.5 rounded-2xl shadow-lg border-l-4 border-l-indigo-500">
              <div className="flex items-center justify-between text-xs font-bold text-indigo-400 uppercase tracking-wider">
                <span>Occupancy Rate</span>
                <Activity className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="text-3xl font-black text-white mt-2 font-mono">{capacityData?.beds?.occupancy_rate_pct || 0}%</div>
              <div className="w-full h-1.5 rounded-full bg-slate-950 mt-2 overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${
                    (capacityData?.beds?.occupancy_rate_pct || 0) > 85 ? 'bg-rose-500' : 'bg-cyan-500'
                  }`}
                  style={{ width: `${capacityData?.beds?.occupancy_rate_pct || 0}%` }}
                />
              </div>
            </div>

          </div>

          {/* SECTION 2: LIVE BED MATRIX GRID */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-cyan-950 text-cyan-400 border border-cyan-800">
                  <Bed className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-white">Live Emergency Department Bed Status Matrix</h2>
                  <p className="text-xs text-slate-400">Click an occupied bed to view occupant clinical details</p>
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  onClick={() => setBedFilter('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    bedFilter === 'ALL' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  All Beds ({beds.length})
                </button>
                <button
                  onClick={() => setBedFilter('AVAILABLE')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    bedFilter === 'AVAILABLE' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Available ({capacityData?.beds?.available || 0})
                </button>
                <button
                  onClick={() => setBedFilter('OCCUPIED')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    bedFilter === 'OCCUPIED' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Occupied ({capacityData?.beds?.occupied || 0})
                </button>
              </div>
            </div>

            {/* Bed Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
              {filteredBeds.map((bed) => {
                const isOccupied = bed.status === 'OCCUPIED';
                return (
                  <div
                    key={bed.bed_id}
                    onClick={() => {
                      if (bed.occupant?.encounter_id && onSelectPatient) {
                        onSelectPatient(bed.occupant.encounter_id);
                      }
                    }}
                    className={`p-4 rounded-2xl border transition-all space-y-2.5 ${
                      isOccupied 
                        ? 'bg-slate-950/90 border-amber-500/50 hover:border-amber-400 cursor-pointer shadow-lg' 
                        : 'bg-slate-950/40 border-slate-800/80'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm font-black text-white">{bed.bed_id}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        isOccupied 
                          ? 'bg-amber-950/80 text-amber-300 border border-amber-700' 
                          : 'bg-emerald-950/80 text-emerald-300 border border-emerald-700'
                      }`}>
                        {bed.status}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-400 font-medium">
                      {bed.bed_type}
                    </div>

                    {isOccupied && bed.occupant ? (
                      <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800 space-y-1 text-xs">
                        <div className="font-bold text-slate-200 flex items-center gap-1 truncate">
                          <User className="w-3 h-3 text-cyan-400 shrink-0" />
                          <span>{bed.occupant.patient_name}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {bed.occupant.chief_complaint}
                        </div>
                        <div className="text-[10px] text-cyan-400 font-mono">
                          ENC: #{bed.occupant.encounter_id}
                        </div>
                      </div>
                    ) : (
                      <div className="py-2 text-center text-slate-600 text-xs font-mono">
                        Ready for Placement
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* SECTION 3: ON-DUTY STAFF & PERSONNEL */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-950 text-indigo-400 border border-indigo-800">
                  <Stethoscope className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-white">Active On-Duty Emergency Department Staff</h2>
                  <p className="text-xs text-slate-400">Current personnel roster, clinical specializations, and active assignment zones</p>
                </div>
              </div>

              {/* Staff Search */}
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search staff, zone, role..."
                  value={staffSearch}
                  onChange={(e) => setStaffSearch(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            {/* Staff Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredStaff.map((staff) => (
                <div
                  key={staff.staff_id}
                  className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 hover:border-slate-700 transition-all space-y-3 shadow-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-900 to-indigo-900 border border-cyan-800/40 flex items-center justify-center text-cyan-300 font-bold text-sm">
                        {staff.name.split(' ').map(w => w[0]).slice(0, 2).join('')}
                      </div>
                      <div>
                        <div className="font-bold text-white text-sm">{staff.name}</div>
                        <div className="text-[10px] text-cyan-400 font-mono">{staff.staff_id}</div>
                      </div>
                    </div>

                    <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-800/60">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      ON DUTY
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs border-t border-slate-800/80 pt-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 uppercase font-bold">Clinical Role:</span>
                      {getRoleBadge(staff.role)}
                    </div>
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="text-[10px] text-slate-400 uppercase font-bold">Assigned Zone:</span>
                      <span className="font-semibold text-cyan-300 text-[11px]">{staff.assigned_zone}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="text-[10px] text-slate-400 uppercase font-bold">Specialty:</span>
                      <span className="text-slate-300 text-[11px] truncate max-w-[170px]">{staff.specialization}</span>
                    </div>
                    {staff.email && (
                      <div className="flex items-center gap-1 text-[10px] text-slate-500 font-mono pt-1">
                        <Mail className="w-3 h-3" />
                        <span>{staff.email}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

    </div>
  );
};
