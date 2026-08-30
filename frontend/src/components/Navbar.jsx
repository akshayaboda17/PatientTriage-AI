import React from 'react';
import { useAuth, DEMO_USERS } from '../context/AuthContext';
import { Activity, BarChart3, Users, ShieldAlert, FileText, Building2, RefreshCw } from 'lucide-react';

export const Navbar = ({ activeTab, setActiveTab, unacknowledgedAlertCount = 0, onRefresh }) => {
  const { currentStaff, switchStaff, switchHospital, hospitals, addToast, authHeaders } = useAuth();

  const handleSeedDemo = async () => {
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
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & Clinical Operational Indicator */}
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 shadow-md shadow-cyan-500/20">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-white tracking-tight">PatientTriage<span className="text-cyan-400">.ai</span></span>
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  ED LIVE
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Emergency Clinical Decision Support</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'dashboard'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>ED Dashboard</span>
            </button>

            <button
              onClick={() => setActiveTab('queue')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'queue'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>ED Waiting Queue</span>
            </button>

            <button
              onClick={() => setActiveTab('alerts')}
              className={`relative flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'alerts'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <ShieldAlert className="w-4 h-4" />
              <span>Clinical Alerts</span>
              {unacknowledgedAlertCount > 0 && (
                <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-white text-rose-600 animate-pulse-subtle">
                  {unacknowledgedAlertCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('audit')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'audit'
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Audit Trail</span>
            </button>
          </nav>

          {/* Hospital Tenant & Staff Account Selectors */}
          <div className="flex items-center gap-3">
            
            {/* Hospital Selector */}
            <div className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1.5 rounded-lg border border-slate-700 text-xs">
              <Building2 className="w-3.5 h-3.5 text-cyan-400" />
              <select
                value={currentStaff.hospital_id}
                onChange={(e) => switchHospital(e.target.value)}
                className="bg-transparent text-slate-200 text-xs font-medium focus:outline-none cursor-pointer"
                title="Hospital Tenant"
              >
                <option value="DEMO001" className="bg-slate-900 text-slate-200">Demo General (DEMO001)</option>
                <option value="METRO002" className="bg-slate-900 text-slate-200">Metro Health (METRO002)</option>
              </select>
            </div>

            {/* Staff Switcher */}
            <div className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1.5 rounded-lg border border-slate-700 text-xs">
              <div className="w-2 h-2 rounded-full bg-cyan-400"></div>
              <select
                value={currentStaff.staff_id}
                onChange={(e) => switchStaff(e.target.value)}
                className="bg-transparent text-slate-200 text-xs font-medium focus:outline-none cursor-pointer max-w-[160px] truncate"
                title="Active Clinician Session"
              >
                {DEMO_USERS.map((u) => (
                  <option key={u.staff_id} value={u.staff_id} className="bg-slate-900 text-slate-200">
                    {u.name} ({u.role_label})
                  </option>
                ))}
              </select>
            </div>

            {/* Re-seed Button */}
            <button
              onClick={handleSeedDemo}
              className="flex items-center gap-1.5 p-1.5 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded-lg transition-colors"
              title="Reset synthetic demo data"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

        </div>
      </div>
    </header>
  );
};
