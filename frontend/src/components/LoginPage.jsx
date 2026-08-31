import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Activity, Lock, User, Building2, ShieldCheck, 
  ArrowRight, Key, HelpCircle, PlusCircle, LogIn, Mail, MapPin, Sparkles
} from 'lucide-react';

export const LoginPage = () => {
  const { login, registerHospital, loading, hospitals } = useAuth();
  
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register-hospital'

  // Login Form State
  const [staffId, setStaffId] = useState('');
  const [password, setPassword] = useState('');
  const [hospitalId, setHospitalId] = useState('DEMO001');
  
  // Hospital Registration State
  const [hospForm, setHospForm] = useState({
    hospital_name: '',
    hospital_code: '',
    address: '',
    admin_name: '',
    admin_staff_id: '',
    admin_email: '',
    password: '',
    role: 'CLINICAL_DIRECTOR'
  });

  const [errorMsg, setErrorMsg] = useState(null);

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    
    if (!staffId.trim()) {
      setErrorMsg('Please enter your Staff ID or Email Address.');
      return;
    }

    if (!password) {
      setErrorMsg('Please enter your password.');
      return;
    }

    const res = await login(staffId, password, hospitalId);
    if (!res.success) {
      setErrorMsg(res.error || 'Authentication failed. Please verify your credentials and facility.');
    }
  };

  const handleRegisterHospitalSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!hospForm.hospital_name.trim() || !hospForm.hospital_code.trim()) {
      setErrorMsg('Hospital facility name and unique hospital code are required.');
      return;
    }

    if (!hospForm.admin_name.trim() || !hospForm.admin_staff_id.trim() || !hospForm.admin_email.trim()) {
      setErrorMsg('Clinical Director name, staff ID, and email address are required.');
      return;
    }

    if (!hospForm.password) {
      setErrorMsg('Please choose a secure password.');
      return;
    }

    const payload = {
      hospital_name: hospForm.hospital_name.trim(),
      hospital_code: hospForm.hospital_code.trim().toUpperCase(),
      address: hospForm.address.trim() || undefined,
      admin_name: hospForm.admin_name.trim(),
      admin_staff_id: hospForm.admin_staff_id.trim(),
      admin_email: hospForm.admin_email.trim(),
      password: hospForm.password,
      role: hospForm.role
    };

    const res = await registerHospital(payload);
    if (!res.success) {
      setErrorMsg(res.error || 'Failed to register hospital facility.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden selection:bg-cyan-500 selection:text-white">
      {/* Background Ambient Glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-tr from-cyan-600/10 to-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-lg w-full space-y-6 relative z-10">
        
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-600 to-blue-600 shadow-xl shadow-cyan-500/20 border border-cyan-400/30 mb-2">
            <Activity className="w-8 h-8 text-white animate-pulse" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            PatientTriage<span className="text-cyan-400">.ai</span>
          </h1>
          <p className="text-xs text-slate-400">
            Emergency Department Clinical Decision Support &amp; AI Risk Intelligence
          </p>
        </div>

        {/* Tab Switcher: Sign In vs Register Hospital */}
        <div className="flex rounded-2xl bg-slate-900/90 p-1 border border-slate-800 shadow-lg">
          <button
            type="button"
            onClick={() => { setAuthMode('login'); setErrorMsg(null); }}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              authMode === 'login'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Sign In to Hospital</span>
          </button>

          <button
            type="button"
            onClick={() => { setAuthMode('register-hospital'); setErrorMsg(null); }}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              authMode === 'register-hospital'
                ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Register New Hospital</span>
          </button>
        </div>

        {/* Main Card */}
        <div className="bg-slate-900/90 border border-slate-800/90 backdrop-blur-xl rounded-3xl p-6 sm:p-8 shadow-2xl space-y-5">
          
          {errorMsg && (
            <div className="p-3.5 bg-rose-950/80 border border-rose-700/60 rounded-xl text-rose-200 text-xs flex items-center justify-between">
              <span>{errorMsg}</span>
              <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-rose-200 font-bold ml-2 cursor-pointer">×</button>
            </div>
          )}

          {/* TAB 1: SIGN IN FORM */}
          {authMode === 'login' ? (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <h2 className="text-base font-bold text-white">Staff Sign In</h2>
                <p className="text-xs text-slate-400 mt-0.5">Sign in with your authorized hospital credentials to access the clinical workspace.</p>
              </div>

              {/* Hospital Facility Dropdown */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Select Hospital Facility
                </label>
                <div className="relative">
                  <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <select
                    value={hospitalId}
                    onChange={(e) => setHospitalId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 font-medium focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 cursor-pointer"
                  >
                    {hospitals && hospitals.length > 0 ? (
                      hospitals.map((h) => (
                        <option key={h.hospital_code} value={h.hospital_code}>
                          {h.name} ({h.hospital_code})
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="DEMO001">Demo General Hospital (DEMO001)</option>
                        <option value="METRO002">Metro Health Emergency Center (METRO002)</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              {/* Staff ID or Email Input */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Staff ID or Email Address
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. DOC001 or nurse@hospital.org"
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
                    required
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 font-mono"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg shadow-cyan-900/40 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <span>{loading ? 'Authenticating...' : 'Sign In to Hospital Portal'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              {/* Demo Help Footnote */}
              <div className="pt-2 text-center text-[11px] text-slate-500 border-t border-slate-800/80">
                Demo Accounts (Password: <code>demo123</code>): <strong>DOC001</strong> (Physician), <strong>NUR001</strong> (Triage Nurse), <strong>DIR001</strong> (Clinical Director)
              </div>
            </form>
          ) : (
            /* TAB 2: REGISTER NEW HOSPITAL */
            <form onSubmit={handleRegisterHospitalSubmit} className="space-y-4">
              <div>
                <h2 className="text-base font-bold text-white">Register New Hospital Facility</h2>
                <p className="text-xs text-slate-400 mt-0.5">Create a clean, isolated facility workspace and Clinical Director account.</p>
              </div>

              {/* Hospital Details */}
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">Hospital Facility Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. CityCare Emergency & Trauma Center"
                    value={hospForm.hospital_name}
                    onChange={(e) => setHospForm({ ...hospForm, hospital_name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">Hospital Code *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. CITY001"
                      value={hospForm.hospital_code}
                      onChange={(e) => setHospForm({ ...hospForm, hospital_code: e.target.value.toUpperCase() })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 uppercase font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">Address / City</label>
                    <input
                      type="text"
                      placeholder="e.g. Metro District"
                      value={hospForm.address}
                      onChange={(e) => setHospForm({ ...hospForm, address: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
              </div>

              {/* Admin Clinician Account */}
              <div className="space-y-3 pt-2 border-t border-slate-800/80">
                <span className="text-[11px] uppercase font-bold text-cyan-400 tracking-wider block">
                  Founding Clinical Director Account
                </span>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">Clinician Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Dr. Ananya Mehta"
                      value={hospForm.admin_name}
                      onChange={(e) => setHospForm({ ...hospForm, admin_name: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">Staff ID *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. DIR001"
                      value={hospForm.admin_staff_id}
                      onChange={(e) => setHospForm({ ...hospForm, admin_staff_id: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">Email Address *</label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. ananya@citycare.org"
                    value={hospForm.admin_email}
                    onChange={(e) => setHospForm({ ...hospForm, admin_email: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">Secure Password *</label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••••••"
                    value={hospForm.password}
                    onChange={(e) => setHospForm({ ...hospForm, password: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:opacity-90 text-white font-bold text-xs shadow-lg shadow-indigo-900/40 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <span>{loading ? 'Creating Facility...' : 'Complete Facility Registration & Sign In'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

        </div>

      </div>
    </div>
  );
};
