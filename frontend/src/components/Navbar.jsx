import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Activity,
  LayoutDashboard,
  Users,
  ShieldAlert,
  Sparkles,
  FileText,
  ShieldCheck,
  BarChart2,
  Cpu,
  UserPlus,
  LogOut,
  Building2,
  User,
  Mail,
  Shield,
  Layers,
  Bed,
  CheckCircle2,
  X,
  Menu
} from 'lucide-react';
import { ROLE_LABELS } from '../utils/terminology';

/* ─────────────────────────────────────────────
   Role → Pill Meta
───────────────────────────────────────────── */
const ROLE_META = {
  CLINICAL_DIRECTOR: {
    label: 'Clinical Director',
    cls: 'bg-purple-950/80 text-purple-300 border-purple-800/60',
  },
  HOSPITAL_ADMIN: {
    label: 'Hospital Administrator',
    cls: 'bg-cyan-950/80 text-cyan-300 border-cyan-800/60',
  },
  EMERGENCY_PHYSICIAN: {
    label: 'Emergency Physician',
    cls: 'bg-indigo-950/80 text-indigo-300 border-indigo-800/60',
  },
  TRIAGE_NURSE: {
    label: 'Triage Nurse',
    cls: 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60',
  },
  STAFF_NURSE: {
    label: 'Staff Nurse',
    cls: 'bg-teal-950/80 text-teal-300 border-teal-800/60',
  },
};

const RolePill = ({ role }) => {
  const meta = ROLE_META[role] || {
    label: ROLE_LABELS[role] || role || 'Staff',
    cls: 'bg-slate-800 text-slate-300 border-slate-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${meta.cls}`}>
      {meta.label}
    </span>
  );
};

/* ─────────────────────────────────────────────
   Shared NavButton
───────────────────────────────────────────── */
const NavBtn = ({ tab, active, onClick, icon: Icon, label, badge }) => (
  <button
    onClick={() => onClick(tab)}
    className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 select-none cursor-pointer ${
      active
        ? 'bg-cyan-600 text-white shadow-md shadow-cyan-950/40'
        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
    }`}
  >
    <Icon className="w-3.5 h-3.5 flex-shrink-0" />
    <span>{label}</span>
    {badge != null && badge > 0 && (
      <span className="flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[9px] font-black bg-rose-500 text-white leading-none animate-pulse">
        {badge > 99 ? '99+' : badge}
      </span>
    )}
  </button>
);

export const Navbar = ({
  activeTab,
  setActiveTab,
  unacknowledgedAlertCount = 0,
  onOpenRegister,
}) => {
  const { user, hospital, logout, hasPermission, currentStaff, permissions } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const profileRef = useRef(null);

  const role = currentStaff?.role;
  const isAdmin = ['CLINICAL_DIRECTOR', 'HOSPITAL_ADMIN'].includes(role);

  // Close profile dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const initials = currentStaff?.name
    ? currentStaff.name
        .split(' ')
        .map((w) => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'ST';

  const handleTab = (tab) => {
    setActiveTab(tab);
    setMobileOpen(false);
  };

  const navItems = [
    { tab: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { tab: 'categories', icon: Layers, label: 'Care Priorities' },
    { tab: 'capacity', icon: Bed, label: 'Beds & Staff' },
    {
      tab: 'alerts',
      icon: ShieldAlert,
      label: 'Alerts',
      badge: unacknowledgedAlertCount,
    },
    hasPermission('audit:view') && { tab: 'audit', icon: FileText, label: 'Audit Trail' },
    hasPermission('staff:view') && { tab: 'staff', icon: ShieldCheck, label: 'Staff & Roles' },
    isAdmin && { tab: 'mlops', icon: Cpu, label: 'AI Operations' },
  ].filter(Boolean);

  return (
    <header className="sticky top-0 z-40 bg-[#0a0f1e]/95 backdrop-blur-md border-b border-slate-800/80 shadow-lg">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">

        {/* ── LEFT: Brand Logo & ED LIVE status ── */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            onClick={() => handleTab('dashboard')}
            className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 shadow-md shadow-cyan-900/30 hover:opacity-90 transition-opacity flex-shrink-0 cursor-pointer"
            title="Go to Dashboard"
          >
            <Activity className="w-5 h-5 text-white" />
          </button>

          <div className="flex flex-col leading-tight">
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleTab('dashboard')}
                className="text-base font-black text-white tracking-tight hover:text-cyan-300 transition-colors cursor-pointer"
              >
                PatientTriage<span className="text-cyan-400">.ai</span>
              </button>
              <span className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-800/50">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                ED LIVE
              </span>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">
              Clinical Decision Support System
            </span>
          </div>
        </div>

        {/* ── CENTER: Navigation Tabs (Desktop) ── */}
        <nav className="hidden lg:flex items-center gap-1 bg-slate-950/80 px-2 py-1.5 rounded-2xl border border-slate-800/90 shadow-inner">
          {navItems.map((item) => (
            <NavBtn
              key={item.tab}
              tab={item.tab}
              active={activeTab === item.tab}
              onClick={handleTab}
              icon={item.icon}
              label={item.label}
              badge={item.badge}
            />
          ))}
        </nav>

        {/* ── RIGHT CORNER ON EVERY PAGE: Hospital Name + Profile Circle ── */}
        <div className="flex items-center gap-3">
          
          {/* Quick Add Patient Button */}
          {hasPermission('patient:create') && onOpenRegister && (
            <button
              onClick={onOpenRegister}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-md shadow-cyan-900/30 transition-all cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Add Patient</span>
            </button>
          )}

          {/* Hospital Facility Name display */}
          <div className="hidden sm:flex flex-col text-right leading-tight max-w-[200px]">
            <span className="text-xs font-bold text-slate-200 truncate">
              {hospital?.name || currentStaff?.hospital_id || 'Demo General Hospital'}
            </span>
            <span className="text-[10px] text-slate-500 font-mono">
              Facility: {currentStaff?.hospital_id || 'DEMO001'}
            </span>
          </div>

          {/* Small Profile Circle Avatar with Interactive Popup */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-tr from-cyan-600 via-indigo-600 to-purple-600 border-2 border-cyan-400/40 text-white font-black text-xs shadow-lg shadow-cyan-950/50 hover:scale-105 active:scale-95 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-400"
              title="Click to view logged-in staff info"
              aria-label="User Profile"
            >
              {initials}
            </button>

            {/* Profile Info Modal Dropdown */}
            {profileOpen && (
              <div className="absolute right-0 mt-3 w-80 bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-5 space-y-4 z-50 animate-in fade-in zoom-in-95 duration-150">
                
                {/* Profile Header */}
                <div className="flex items-start gap-3 border-b border-slate-800 pb-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center text-white font-black text-base shadow-md">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-white truncate">{currentStaff.name}</h4>
                    <p className="text-[11px] text-cyan-400 font-mono">Staff ID: {currentStaff.staff_id}</p>
                    <div className="mt-1">
                      <RolePill role={currentStaff.role} />
                    </div>
                  </div>
                </div>

                {/* Info Fields */}
                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center gap-2 text-slate-300">
                    <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <div className="truncate">
                      <span className="text-[10px] text-slate-500 block uppercase font-bold">Hospital Facility:</span>
                      <span className="font-semibold text-slate-200">{hospital?.name || currentStaff.hospital_id}</span>
                    </div>
                  </div>

                  {currentStaff.email && (
                    <div className="flex items-center gap-2 text-slate-300">
                      <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <div className="truncate">
                        <span className="text-[10px] text-slate-500 block uppercase font-bold">Email Address:</span>
                        <span className="font-mono text-slate-300">{currentStaff.email}</span>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-slate-300">
                    <Shield className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <div>
                      <span className="text-[10px] text-slate-500 block uppercase font-bold">Session Access:</span>
                      <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Authenticated &amp; Role-Verified
                      </span>
                    </div>
                  </div>
                </div>

                {/* Logout Button */}
                <div className="pt-2 border-t border-slate-800">
                  <button
                    onClick={() => {
                      setProfileOpen(false);
                      logout();
                    }}
                    className="w-full py-2.5 px-3 rounded-xl bg-rose-950/80 hover:bg-rose-900 text-rose-200 text-xs font-bold border border-rose-800/80 transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out of Session</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Mobile Hamburger Toggle */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="lg:hidden p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white cursor-pointer"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="lg:hidden bg-slate-950 border-b border-slate-800 px-4 py-3 space-y-1 animate-in slide-in-from-top-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.tab;
            return (
              <button
                key={item.tab}
                onClick={() => handleTab(item.tab)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  active ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </div>
                {item.badge != null && item.badge > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-rose-500 text-white">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
};
