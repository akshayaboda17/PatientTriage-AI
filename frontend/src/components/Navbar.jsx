import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Activity,
  LayoutDashboard,
  Users,
  ShieldAlert,
  Sparkles,
  Brain,
  FileText,
  ShieldCheck,
  BarChart2,
  Cpu,
  UserPlus,
  LogOut,
  ChevronDown,
  Menu,
  X,
} from 'lucide-react';

/* ─────────────────────────────────────────────
   Role → pill meta
───────────────────────────────────────────── */
const ROLE_META = {
  CLINICAL_DIRECTOR: {
    label: 'Clinical Director',
    cls: 'bg-purple-950/80 text-purple-300 border-purple-800/60',
  },
  HOSPITAL_ADMIN: {
    label: 'Hospital Admin',
    cls: 'bg-cyan-950/80 text-cyan-300 border-cyan-800/60',
  },
  EMERGENCY_PHYSICIAN: {
    label: 'Physician',
    cls: 'bg-indigo-950/80 text-indigo-300 border-indigo-800/60',
  },
  TRIAGE_NURSE: {
    label: 'Triage Nurse',
    cls: 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60',
  },
};

const RolePill = ({ role }) => {
  const meta = ROLE_META[role] || {
    label: role || 'Staff',
    cls: 'bg-slate-800 text-slate-300 border-slate-700',
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${meta.cls}`}
    >
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
    className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all duration-150 select-none ${
      active
        ? 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/30'
        : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
    }`}
  >
    <Icon className="w-3.5 h-3.5 flex-shrink-0" />
    <span>{label}</span>
    {badge != null && badge > 0 && (
      <span className="flex items-center justify-center min-w-[16px] h-4 px-0.5 rounded-full text-[9px] font-black bg-rose-500 text-white leading-none">
        {badge > 99 ? '99+' : badge}
      </span>
    )}
  </button>
);

/* ─────────────────────────────────────────────
   Vertical divider
───────────────────────────────────────────── */
const Divider = () => (
  <span className="w-px h-4 bg-slate-700/70 flex-shrink-0 mx-0.5" />
);

/* ─────────────────────────────────────────────
   Mobile section label
───────────────────────────────────────────── */
const MobileSectionLabel = ({ children }) => (
  <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest px-1 mt-2 mb-0.5 first:mt-0">
    {children}
  </p>
);

/* ─────────────────────────────────────────────
   Mobile nav button
───────────────────────────────────────────── */
const MobileNavBtn = ({ tab, active, onClick, icon: Icon, label, badge }) => (
  <button
    onClick={() => onClick(tab)}
    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
      active
        ? 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/30'
        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
    }`}
  >
    <Icon className="w-3.5 h-3.5 flex-shrink-0" />
    {label}
    {badge != null && badge > 0 && (
      <span className="ml-auto flex items-center justify-center min-w-[16px] h-4 px-0.5 rounded-full text-[9px] font-black bg-rose-500 text-white">
        {badge > 99 ? '99+' : badge}
      </span>
    )}
  </button>
);

/* ─────────────────────────────────────────────
   Main Navbar
───────────────────────────────────────────── */
export const Navbar = ({
  activeTab,
  setActiveTab,
  unacknowledgedAlertCount = 0,
  onOpenRegister,
}) => {
  const { user, hospital, logout, hasPermission, currentStaff } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const role = currentStaff?.role;
  const isAdmin = ['CLINICAL_DIRECTOR', 'HOSPITAL_ADMIN'].includes(role);

  const initials = currentStaff?.name
    ? currentStaff.name
        .split(' ')
        .map((w) => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'U';

  const handleTab = (tab) => {
    setActiveTab(tab);
    setMobileOpen(false);
  };

  /* ── nav groups ── */
  const clinicalItems = [
    { tab: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { tab: 'queue',     icon: Users,           label: 'ED Queue'  },
    {
      tab: 'alerts',
      icon: ShieldAlert,
      label: 'Alerts',
      badge: unacknowledgedAlertCount,
    },
  ];

  const aiItems = [
    { tab: 'ai-risk', icon: Sparkles, label: 'AI Risk', always: true },
    {
      tab: 'review',
      icon: Brain,
      label: 'Review',
      permission: 'physician:review',
    },
  ].filter((i) => i.always || hasPermission(i.permission));

  const adminItems = [
    hasPermission('audit:view') && {
      tab: 'audit',
      icon: FileText,
      label: 'Audit',
    },
    hasPermission('staff:view') && {
      tab: 'staff',
      icon: ShieldCheck,
      label: 'Staff',
    },
    isAdmin && { tab: 'analytics', icon: BarChart2, label: 'Analytics' },
    isAdmin && { tab: 'mlops',     icon: Cpu,       label: 'MLOps'     },
  ].filter(Boolean);

  return (
    <>
      <header className="sticky top-0 z-40 bg-[#0a0f1e]/95 backdrop-blur-md border-b border-slate-800/60 h-14">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-5 h-full flex items-center justify-between gap-4">

          {/* ── LEFT: Brand ── */}
          <div className="flex items-center gap-2.5 flex-shrink-0">
            {/* Logo icon */}
            <button
              onClick={() => handleTab('dashboard')}
              className="flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-700 to-cyan-500 shadow-md shadow-cyan-900/40 hover:opacity-90 transition-opacity flex-shrink-0"
              title="Go to Dashboard"
            >
              <Activity className="w-[18px] h-[18px] text-white" />
            </button>

            {/* Brand name + badges */}
            <div className="flex flex-col leading-none gap-0.5">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleTab('dashboard')}
                  className="text-[15px] font-black text-slate-100 tracking-tight hover:text-white transition-colors"
                >
                  PatientTriage
                  <span className="text-cyan-400">.ai</span>
                </button>

                {/* ED LIVE pulse badge */}
                <span className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-950/70 text-emerald-400 border border-emerald-800/50">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  ED LIVE
                </span>
              </div>

              {/* Hospital name */}
              <p className="text-[10px] text-slate-500 font-medium truncate max-w-[160px] sm:max-w-[220px]">
                {hospital?.name ||
                  currentStaff?.hospital_id ||
                  'General Hospital'}
              </p>
            </div>
          </div>

          {/* ── CENTER: Navigation (desktop) ── */}
          <nav className="hidden md:flex items-center gap-0.5 bg-slate-900/70 px-2 py-1.5 rounded-xl border border-slate-800/80 flex-1 justify-center min-w-0">

            {/* Clinical group */}
            {clinicalItems.map((item) => (
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

            {/* AI / Intel group */}
            {aiItems.length > 0 && <Divider />}
            {aiItems.map((item) => (
              <NavBtn
                key={item.tab}
                tab={item.tab}
                active={activeTab === item.tab}
                onClick={handleTab}
                icon={item.icon}
                label={item.label}
              />
            ))}

            {/* Admin group */}
            {adminItems.length > 0 && <Divider />}
            {adminItems.map((item) => (
              <NavBtn
                key={item.tab}
                tab={item.tab}
                active={activeTab === item.tab}
                onClick={handleTab}
                icon={item.icon}
                label={item.label}
              />
            ))}
          </nav>

          {/* ── RIGHT: Actions ── */}
          <div className="flex items-center gap-2 flex-shrink-0">

            {/* Register Patient button */}
            {onOpenRegister && (
              <button
                onClick={onOpenRegister}
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-cyan-600/60 text-cyan-400 hover:bg-cyan-600/10 hover:border-cyan-500 text-[11px] font-semibold transition-all duration-150"
                title="Register New Patient"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Register</span>
              </button>
            )}

            {/* User avatar chip */}
            <div className="flex items-center gap-1.5 bg-slate-900/80 pl-1.5 pr-2 py-1 rounded-xl border border-slate-800 min-w-0">
              {/* Initials circle */}
              <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center text-white text-[10px] font-black flex-shrink-0">
                {initials}
              </div>

              {/* Name + staff id */}
              <div className="hidden lg:flex flex-col leading-none min-w-0 mr-1">
                <span className="text-[11px] font-bold text-slate-200 truncate max-w-[110px]">
                  {currentStaff?.name || 'Authorized Staff'}
                </span>
                <span className="text-[9px] text-slate-500 font-mono">
                  {currentStaff?.staff_id
                    ? `ID: ${currentStaff.staff_id}`
                    : 'ED Staff'}
                </span>
              </div>

              {/* Role pill */}
              <div className="hidden sm:block">
                <RolePill role={role} />
              </div>

              {/* Logout */}
              <button
                onClick={logout}
                className="ml-1 flex items-center justify-center w-6 h-6 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 transition-all duration-150 flex-shrink-0"
                title="Sign Out"
              >
                <LogOut className="w-3 h-3" />
              </button>
            </div>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="md:hidden flex items-center justify-center w-8 h-8 rounded-lg border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-all"
              title="Menu"
            >
              {mobileOpen ? (
                <X className="w-4 h-4" />
              ) : (
                <Menu className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* ── MOBILE drawer ── */}
        {mobileOpen && (
          <div className="md:hidden border-t border-slate-800/60 bg-[#0a0f1e]/98 backdrop-blur-md px-4 py-3 flex flex-col gap-1">

            <MobileSectionLabel>Clinical</MobileSectionLabel>
            {clinicalItems.map((item) => (
              <MobileNavBtn
                key={item.tab}
                tab={item.tab}
                active={activeTab === item.tab}
                onClick={handleTab}
                icon={item.icon}
                label={item.label}
                badge={item.badge}
              />
            ))}

            {aiItems.length > 0 && (
              <>
                <MobileSectionLabel>AI / Intel</MobileSectionLabel>
                {aiItems.map((item) => (
                  <MobileNavBtn
                    key={item.tab}
                    tab={item.tab}
                    active={activeTab === item.tab}
                    onClick={handleTab}
                    icon={item.icon}
                    label={item.label}
                  />
                ))}
              </>
            )}

            {adminItems.length > 0 && (
              <>
                <MobileSectionLabel>Admin</MobileSectionLabel>
                {adminItems.map((item) => (
                  <MobileNavBtn
                    key={item.tab}
                    tab={item.tab}
                    active={activeTab === item.tab}
                    onClick={handleTab}
                    icon={item.icon}
                    label={item.label}
                  />
                ))}
              </>
            )}

            {onOpenRegister && (
              <button
                onClick={() => {
                  onOpenRegister();
                  setMobileOpen(false);
                }}
                className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg border border-cyan-600/50 text-cyan-400 hover:bg-cyan-600/10 text-xs font-semibold transition-all"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Register Patient
              </button>
            )}
          </div>
        )}
      </header>
    </>
  );
};
