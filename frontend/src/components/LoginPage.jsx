import React, { useState } from 'react';
import { useAuth, DEFAULT_STAFF_ACCOUNTS } from '../context/AuthContext';
import { 
  Activity, Lock, User, Building2, ShieldCheck, 
  ArrowRight, Key, Info, ChevronDown, ChevronUp, Stethoscope, Sparkles
} from 'lucide-react';

export const LoginPage = () => {
  const { login, loading, hospitals } = useAuth();
  
  const [staffId, setStaffId] = useState('DOC001');
  const [password, setPassword] = useState('Doctor@123');
  const [hospitalId, setHospitalId] = useState('DEMO001');
  const [showAccountsHelper, setShowAccountsHelper] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    
    if (!staffId.trim()) {
      setErrorMsg('Please enter your Staff ID or Email.');
      return;
    }

    const res = await login(staffId, password, hospitalId);
    if (!res.success) {
      setErrorMsg(res.error || 'Authentication failed. Please check your credentials.');
    }
  };

  const handleAutofill = (acc) => {
    setStaffId(acc.staff_id);
    setHospitalId(acc.hospital_id);
    setPassword('Doctor@123');
    setErrorMsg(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden selection:bg-cyan-500 selection:text-white">
      {/* Background Decorative Rings */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-tr from-cyan-600/10 to-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-md w-full space-y-6 relative z-10">
        
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-600 to-blue-600 shadow-xl shadow-cyan-500/20 border border-cyan-400/30 mb-2">
            <Activity className="w-8 h-8 text-white animate-pulse" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            PatientTriage<span className="text-cyan-400">.ai</span>
          </h1>
          <p className="text-xs text-slate-400">
            Emergency Department Clinical Decision Support &amp; Deterioration Detection
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-slate-900/90 border border-slate-800/90 backdrop-blur-xl rounded-3xl p-6 sm:p-8 shadow-2xl space-y-5">
          <div>
            <h2 className="text-base font-bold text-white">Staff Authentication</h2>
            <p className="text-xs text-slate-400 mt-0.5">Sign in to access your authorized clinical workspace.</p>
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-950/80 border border-rose-700/60 rounded-xl text-rose-200 text-xs flex items-center justify-between">
              <span>{errorMsg}</span>
              <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-rose-200 font-bold ml-2">×</button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Hospital Facility Dropdown */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Hospital Facility / Tenant
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <select
                  value={hospitalId}
                  onChange={(e) => setHospitalId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 font-medium focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 cursor-pointer"
                >
                  <option value="DEMO001">Demo General Hospital (DEMO001)</option>
                  <option value="METRO002">Metro Health Emergency Center (METRO002)</option>
                </select>
              </div>
            </div>

            {/* Staff ID or Email Input */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Staff ID or Email
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  required
                  placeholder="e.g. DOC001 or NUR001"
                  value={staffId}
                  onChange={(e) => setStaffId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-900/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Sign In to Clinical Workspace</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Staff Accounts Helper Accordion */}
          <div className="pt-2 border-t border-slate-800/80">
            <button
              type="button"
              onClick={() => setShowAccountsHelper(!showAccountsHelper)}
              className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-slate-200 transition py-1"
            >
              <span className="flex items-center gap-1.5 font-semibold text-[11px]">
                <Key className="w-3.5 h-3.5 text-cyan-400" />
                Available Staff Roles &amp; Logins (Click to autofill)
              </span>
              {showAccountsHelper ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showAccountsHelper && (
              <div className="mt-2 space-y-1.5">
                {DEFAULT_STAFF_ACCOUNTS.map((acc) => (
                  <div
                    key={acc.staff_id}
                    onClick={() => handleAutofill(acc)}
                    className="p-2 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-cyan-500/60 transition cursor-pointer flex items-center justify-between group"
                  >
                    <div>
                      <div className="text-xs font-bold text-slate-200 group-hover:text-cyan-300 transition">
                        {acc.name}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        ID: <span className="text-slate-300 font-bold">{acc.staff_id}</span> • {acc.role_label}
                      </div>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 group-hover:bg-cyan-950 group-hover:text-cyan-300 border border-slate-700 transition">
                      Auto-fill
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Security & Regulatory Footer */}
        <div className="text-center space-y-1 text-[11px] text-slate-500">
          <div className="flex items-center justify-center gap-1.5 text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Role-Based Access Control • PBKDF2-HMAC-SHA256 • Tenant Isolated</span>
          </div>
          <p>© 2026 PatientTriage.ai Clinical Decision Support Platform</p>
        </div>

      </div>
    </div>
  );
};
