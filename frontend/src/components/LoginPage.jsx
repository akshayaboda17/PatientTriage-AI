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
      setErrorMsg('Please enter your Staff ID or Email.');
      return;
    }

    if (!password) {
      setErrorMsg('Please enter your password.');
      return;
    }

    const res = await login(staffId, password, hospitalId);
    if (!res.success) {
      setErrorMsg(res.error || 'Authentication failed. Please check your credentials.');
    }
  };

  const handleRegisterHospitalSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!hospForm.hospital_name.trim() || !hospForm.hospital_code.trim()) {
      setErrorMsg('Hospital name and unique hospital code are required.');
      return;
    }

    if (!hospForm.admin_name.trim() || !hospForm.admin_staff_id.trim() || !hospForm.admin_email.trim()) {
      setErrorMsg('Clinician / Admin name, staff ID, and email are required.');
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
      setErrorMsg(res.error || 'Failed to register hospital.');
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
            Emergency Department Clinical Decision Support &amp; AI Deterioration Engine
          </p>
        </div>

        {/* Tab Switcher: Sign In vs Onboard Hospital */}
        <div className="flex rounded-2xl bg-slate-900/90 p-1 border border-slate-800 shadow-lg">
          <button
            type="button"
            onClick={() => { setAuthMode('login'); setErrorMsg(null); }}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              authMode === 'login'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Sign In to Facility</span>
          </button>

          <button
            type="button"
            onClick={() => { setAuthMode('register-hospital'); setErrorMsg(null); }}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
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
              <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-rose-200 font-bold ml-2">×</button>
            </div>
          )}

          {/* ============================================================ */}
          {/* TAB 1: SIGN IN FORM                                          */}
          {/* ============================================================ */}
          {authMode === 'login' ? (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <h2 className="text-base font-bold text-white">Clinical Staff Sign In</h2>
                <p className="text-xs text-slate-400 mt-0.5">Enter your authorized credentials to access your hospital workspace.</p>
              </div>

              {/* Hospital Facility Dropdown */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Hospital System / Facility
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
                  Staff ID or Email
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
                className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-900/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-2 cursor-pointer"
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
          ) : (
            /* ============================================================ */
            /* TAB 2: REGISTER NEW HOSPITAL FORM                            */
            /* ============================================================ */
            <form onSubmit={handleRegisterHospitalSubmit} className="space-y-4">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                  <h2 className="text-base font-bold text-white">Onboard New Hospital Facility</h2>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Provisions a brand new hospital tenant with <strong>0 demo data</strong> so you can create your own patients, vitals, and tests from scratch.
                </p>
              </div>

              {/* Hospital Name & Code */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Hospital Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. City Care Hospital"
                    value={hospForm.hospital_name}
                    onChange={(e) => setHospForm({ ...hospForm, hospital_name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Unique Code (ID) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. CITYCARE"
                    value={hospForm.hospital_code}
                    onChange={(e) => setHospForm({ ...hospForm, hospital_code: e.target.value.toUpperCase() })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-500 uppercase font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              {/* Hospital Address */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Facility Address (Optional)
                </label>
                <div className="relative">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="e.g. 100 Medical Center Way, Suite 400"
                    value={hospForm.address}
                    onChange={(e) => setHospForm({ ...hospForm, address: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              {/* Admin Clinician Details */}
              <div className="border-t border-slate-800/80 pt-3 space-y-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Primary Clinician / Administrator Account
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Your Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Dr. Jane Smith, MD"
                      value={hospForm.admin_name}
                      onChange={(e) => setHospForm({ ...hospForm, admin_name: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Your Staff ID *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. DIR001 or DOC_JANE"
                      value={hospForm.admin_staff_id}
                      onChange={(e) => setHospForm({ ...hospForm, admin_staff_id: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-500 font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Email Address *
                    </label>
                    <div className="relative">
                      <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="email"
                        required
                        placeholder="e.g. jane@hospital.org"
                        value={hospForm.admin_email}
                        onChange={(e) => setHospForm({ ...hospForm, admin_email: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Account Password *
                    </label>
                    <div className="relative">
                      <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="password"
                        required
                        placeholder="••••••••"
                        value={hospForm.password}
                        onChange={(e) => setHospForm({ ...hospForm, password: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Primary Role
                  </label>
                  <select
                    value={hospForm.role}
                    onChange={(e) => setHospForm({ ...hospForm, role: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 font-medium focus:outline-none focus:border-cyan-500"
                  >
                    <option value="CLINICAL_DIRECTOR">Clinical Director (Full Clinical Review, Staff, AI & MLOps Governance)</option>
                    <option value="EMERGENCY_PHYSICIAN">Emergency Physician (Clinical Decisions & AI Overrides)</option>
                    <option value="HOSPITAL_ADMIN">Hospital Administrator (Facility & Staff Provisioning)</option>
                  </select>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-600 hover:opacity-90 text-white text-xs font-bold shadow-lg shadow-indigo-900/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-3 cursor-pointer"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <PlusCircle className="w-4 h-4" />
                    <span>Create Hospital &amp; Enter Clean Workspace</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* Help & Support Notice */}
          <div className="pt-3 border-t border-slate-800/80 flex items-start gap-2 text-[11px] text-slate-500">
            <HelpCircle className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
            <span>
              All data is strictly multi-tenant isolated by hospital facility code. Clinicians from one facility cannot view another facility's records.
            </span>
          </div>
        </div>

        {/* Security & Compliance Footer */}
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
