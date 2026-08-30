import React, { useState } from 'react';
import { useAuth, DEMO_USERS } from '../context/AuthContext';
import { 
  Activity, Bell, Users, ShieldAlert, FileText, Building2, 
  RefreshCw, AlertCircle, LayoutDashboard, UserPlus, LogIn,
  BarChart2, ShieldCheck, Stethoscope, ChevronDown, Cpu
} from 'lucide-react';

export const Navbar = ({ 
  activeTab, 
  setActiveTab, 
  unacknowledgedAlertCount = 0, 
  onRefresh, 
  onOpenRegister,
  onOpenLogin
}) => {
  const { currentStaff, switchStaff, switchHospital, hospitals, addToast, authHeaders, hasPermission } = useAuth();
  const [seeding, setSeeding] = useState(false);

  const handleSeedDemo = async () => {
    setSeeding(true);
    try {
      const res = await fetch('/api/demo/seed', {
        method: 'POST',
        headers: { ...authHeaders }
      });
      if (res.ok) {
        addToast('Synthetic demo data re-initialized successfully for DEMO001 & METRO002.', 'success');
        if (onRefresh) onRefresh();
      }
    } catch (err) {
      addToast('Failed to seed demo data', 'error');
    } finally {
      setSeeding(false);
    }
  };

  const getRolePill = (role) => {
    switch (role) {
      case 'CLINICAL_DIRECTOR':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-800">Director</span>;
      case 'HOSPITAL_ADMIN':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">Admin</span>;
      case 'EMERGENCY_PHYSICIAN':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-800">Physician</span>;
      case 'TRIAGE_NURSE':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">Nurse</span>;
      default:
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">Tech</span>;
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & Operational Status */}
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setActiveTab('dashboard')}
              className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 shadow-md shadow-cyan-500/20 hover:opacity-90 transition-opacity"
              title="Return to Dashboard"
            >
              <Activity className="w-6 h-6 text-white" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setActiveTab('dashboard')}
                  className="text-lg font-bold text-white tracking-tight hover:text-cyan-400 transition-colors"
                >
                  PatientTriage<span className="text-cyan-400">.ai</span>
                </button>
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  ED LIVE
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Emergency Clinical Decision Support</p>
            </div>
          </div>

          {/* Role-Aware Navigation Tabs */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800">
            
            {/* Dashboard Tab */}
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'dashboard'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Dashboard</span>
            </button>

            {/* ED Queue Tab */}
            <button
              onClick={() => setActiveTab('queue')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'queue'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>ED Queue</span>
            </button>

            {/* Alerts Tab */}
            <button
              onClick={() => setActiveTab('alerts')}
              className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'alerts'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Alerts</span>
              {unacknowledgedAlertCount > 0 && (
                <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-white text-rose-600 animate-pulse-subtle">
                  {unacknowledgedAlertCount}
                </span>
              )}
            </button>

            {/* Audit Trail Tab */}
            {hasPermission('audit:view') && (
              <button
                onClick={() => setActiveTab('audit')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'audit'
                    ? 'bg-slate-700 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Audit</span>
              </button>
            )}

            {/* Staff Management Tab (Admin & Director) */}
            {hasPermission('staff:view') && (
              <button
                onClick={() => setActiveTab('staff')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'staff'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Staff & RBAC</span>
              </button>
            )}

            {/* Analytics Tab (Admin & Director) */}
            {hasPermission('dashboard:view') && ['CLINICAL_DIRECTOR', 'HOSPITAL_ADMIN'].includes(currentStaff.role) && (
              <button
                onClick={() => setActiveTab('analytics')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'analytics'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <BarChart2 className="w-3.5 h-3.5" />
                <span>Analytics</span>
              </button>
            )}

            {/* MLOps Governance Tab (Admin & Director) */}
            {['CLINICAL_DIRECTOR', 'HOSPITAL_ADMIN'].includes(currentStaff.role) && (
              <button
                onClick={() => setActiveTab('mlops')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'mlops'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                <span>MLOps &amp; Governance</span>
              </button>
            )}

          </nav>

          {/* Right Header Controls */}
          <div className="flex items-center gap-2.5">
            
            {/* Quick Register Patient Action */}
            {hasPermission('patient:create') && (
              <button
                onClick={onOpenRegister}
                className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow transition-colors"
                title="Register New Patient & Initiate Encounter"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Intake</span>
              </button>
            )}

            {/* Hospital Tenant Selector */}
            <div className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1.5 rounded-lg border border-slate-700 text-xs">
              <Building2 className="w-3.5 h-3.5 text-cyan-400" />
              <select
                value={currentStaff.hospital_id}
                onChange={(e) => switchHospital(e.target.value)}
                className="bg-transparent text-slate-200 text-xs font-medium focus:outline-none cursor-pointer"
                title="Hospital Tenant Boundary"
              >
                <option value="DEMO001" className="bg-slate-900 text-slate-200">Demo General (DEMO001)</option>
                <option value="METRO002" className="bg-slate-900 text-slate-200">Metro Health (METRO002)</option>
              </select>
            </div>

            {/* Staff Account Switcher */}
            <div className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1.5 rounded-lg border border-slate-700 text-xs">
              <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
              <select
                value={currentStaff.staff_id}
                onChange={(e) => switchStaff(e.target.value)}
                className="bg-transparent text-slate-200 text-xs font-medium focus:outline-none cursor-pointer max-w-[150px] truncate"
                title="Active Clinician Session"
              >
                {DEMO_USERS.map((u) => (
                  <option key={u.staff_id} value={u.staff_id} className="bg-slate-900 text-slate-200">
                    {u.name} ({u.role_label})
                  </option>
                ))}
              </select>
              {getRolePill(currentStaff.role)}
            </div>

            {/* Login / Switch Persona Modal Trigger */}
            <button
              onClick={onOpenLogin}
              className="p-1.5 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded-lg transition-colors"
              title="Clinical Login / Persona Switcher"
            >
              <LogIn className="w-4 h-4" />
            </button>

            {/* Re-seed Synthetic Demo Data Button */}
            <button
              onClick={handleSeedDemo}
              disabled={seeding}
              className="p-1.5 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
              title="Reset synthetic demo data (DEMO001 & METRO002)"
            >
              <RefreshCw className={`w-4 h-4 ${seeding ? 'animate-spin text-cyan-400' : ''}`} />
            </button>

          </div>

        </div>
      </div>
    </header>
  );
};
