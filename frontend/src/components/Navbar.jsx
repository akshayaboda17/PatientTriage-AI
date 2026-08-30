import React from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Activity, Bell, Users, ShieldAlert, FileText, Building2, 
  LayoutDashboard, UserPlus, LogOut, BarChart2, ShieldCheck, 
  Stethoscope, Cpu, User
} from 'lucide-react';

export const Navbar = ({ 
  activeTab, 
  setActiveTab, 
  unacknowledgedAlertCount = 0, 
  onOpenRegister
}) => {
  const { user, hospital, logout, hasPermission, currentStaff } = useAuth();

  const getRolePill = (role) => {
    switch (role) {
      case 'CLINICAL_DIRECTOR':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-950/80 text-purple-300 border border-purple-800/60">Clinical Director</span>;
      case 'HOSPITAL_ADMIN':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950/80 text-cyan-300 border border-cyan-800/60">Hospital Admin</span>;
      case 'EMERGENCY_PHYSICIAN':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-950/80 text-indigo-300 border border-indigo-800/60">Physician</span>;
      case 'TRIAGE_NURSE':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">Triage Nurse</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">{role || 'Staff'}</span>;
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 shadow-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Brand Logo & Hospital Name */}
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setActiveTab('dashboard')}
              className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 shadow-md shadow-cyan-500/20 hover:opacity-90 transition-opacity"
              title="PatientTriage.ai Dashboard"
            >
              <Activity className="w-6 h-6 text-white" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setActiveTab('dashboard')}
                  className="text-lg font-black text-white tracking-tight hover:text-cyan-400 transition-colors"
                >
                  PatientTriage<span className="text-cyan-400">.ai</span>
                </button>
                <span className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  ED LIVE
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium truncate max-w-[180px] sm:max-w-xs">
                {hospital?.name || `Hospital Facility: ${currentStaff?.hospital_id || 'DEMO001'}`}
              </p>
            </div>
          </div>

          {/* Center Navigation Tabs */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-950/70 p-1 rounded-xl border border-slate-800/90">
            
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
                <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-white text-rose-600 animate-pulse">
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

            {/* Staff Management Tab */}
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
                <span>Staff &amp; Roles</span>
              </button>
            )}

            {/* Analytics Tab */}
            {hasPermission('dashboard:view') && ['CLINICAL_DIRECTOR', 'HOSPITAL_ADMIN'].includes(currentStaff?.role) && (
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

            {/* MLOps Governance Tab */}
            {['CLINICAL_DIRECTOR', 'HOSPITAL_ADMIN'].includes(currentStaff?.role) && (
              <button
                onClick={() => setActiveTab('mlops')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'mlops'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                <span>MLOps</span>
              </button>
            )}

          </nav>

          {/* Right Header User Profile & Action Controls */}
          <div className="flex items-center gap-3">
            
            {/* Quick Register Patient Action */}
            {hasPermission('patient:create') && onOpenRegister && (
              <button
                onClick={onOpenRegister}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-md shadow-cyan-900/30 transition-all"
                title="Register New Patient Intake"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>+ Intake</span>
              </button>
            )}

            {/* Logged-In User Profile Pill */}
            <div className="flex items-center gap-2 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800">
              <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center text-white text-[11px] font-bold">
                {currentStaff?.name ? currentStaff.name.charAt(0) : 'U'}
              </div>
              <div className="hidden lg:block text-left">
                <div className="text-xs font-bold text-slate-200 leading-tight truncate max-w-[130px]">
                  {currentStaff?.name || 'Authorized Staff'}
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  ID: {currentStaff?.staff_id}
                </div>
              </div>
              <div className="hidden sm:block">
                {getRolePill(currentStaff?.role)}
              </div>
            </div>

            {/* Real Logout Button */}
            <button
              onClick={logout}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded-xl border border-slate-800 hover:border-rose-800/60 transition-all text-xs font-semibold"
              title="Sign Out of Clinical Session"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>

          </div>

        </div>
      </div>
    </header>
  );
};
