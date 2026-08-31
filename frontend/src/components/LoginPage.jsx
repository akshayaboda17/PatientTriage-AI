import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Activity, Lock, User, Building2, ShieldCheck, 
  ArrowRight, Key, HelpCircle, PlusCircle, LogIn, Mail, 
  MapPin, Sparkles, Stethoscope, ChevronLeft, CheckCircle2,
  Bed, Shield, AlertCircle, UserPlus, Hospital
} from 'lucide-react';

export const LoginPage = () => {
  const { 
    login, 
    registerStaff, 
    verifyHospitalFacility, 
    registerHospitalFacility, 
    selectedHospitalFacility, 
    clearSelectedHospital,
    hospitals, 
    loading 
  } = useAuth();
  
  // Stages: 'hospital' (Stage 1) | 'staff' (Stage 2)
  const currentStage = selectedHospitalFacility ? 'staff' : 'hospital';

  // Stage 1: Hospital Form State
  const [hospMode, setHospMode] = useState('signin'); // 'signin' | 'register'
  const [hospCodeInput, setHospCodeInput] = useState('DEMO001');
  const [hospPasswordInput, setHospPasswordInput] = useState('');
  
  const [newHospForm, setNewHospForm] = useState({
    hospital_name: '',
    hospital_code: '',
    password: '',
    address: '',
    bed_capacity: 25
  });

  // Stage 2: Staff Form State
  const [staffMode, setStaffMode] = useState('signin'); // 'signin' | 'signup'
  const [staffSignIn, setStaffSignIn] = useState({
    staff_id: '',
    password: ''
  });

  const [staffSignUp, setStaffSignUp] = useState({
    name: '',
    staff_id: `DOC-${Math.floor(100 + Math.random() * 900)}`,
    email: '',
    role: 'EMERGENCY_PHYSICIAN',
    specialization: 'Emergency Medicine & Resuscitation',
    password: '',
    confirm_password: ''
  });

  const [errorMsg, setErrorMsg] = useState(null);

  // Auto-sync selected hospital code if exists
  useEffect(() => {
    if (selectedHospitalFacility) {
      setErrorMsg(null);
    }
  }, [selectedHospitalFacility]);

  // ─────────────────────────────────────────────
  // Stage 1 Handlers: Hospital Facility
  // ─────────────────────────────────────────────

  const handleHospitalSignIn = async (e) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!hospCodeInput.trim()) {
      setErrorMsg('Please enter or select a Hospital ID / Facility Code.');
      return;
    }

    const res = await verifyHospitalFacility(hospCodeInput, hospPasswordInput);
    if (!res.success) {
      setErrorMsg(res.error || 'Hospital verification failed.');
    }
  };

  const handleHospitalRegister = async (e) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!newHospForm.hospital_name.trim() || !newHospForm.hospital_code.trim()) {
      setErrorMsg('Hospital facility name and unique Hospital ID are required.');
      return;
    }

    const res = await registerHospitalFacility(newHospForm);
    if (!res.success) {
      setErrorMsg(res.error || 'Hospital registration failed.');
    }
  };

  // ─────────────────────────────────────────────
  // Stage 2 Handlers: Staff Authentication
  // ─────────────────────────────────────────────

  const handleStaffSignIn = async (e) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!staffSignIn.staff_id.trim()) {
      setErrorMsg('Please enter your Staff ID or registered Email Address.');
      return;
    }

    if (!staffSignIn.password) {
      setErrorMsg('Please enter your password.');
      return;
    }

    const res = await login(
      staffSignIn.staff_id, 
      staffSignIn.password, 
      selectedHospitalFacility.hospital_code
    );
    if (!res.success) {
      setErrorMsg(res.error || 'Staff authentication failed. Please check your credentials.');
    }
  };

  const handleStaffSignUp = async (e) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!staffSignUp.name.trim() || !staffSignUp.staff_id.trim() || !staffSignUp.email.trim()) {
      setErrorMsg('Full name, Staff ID, and email address are required.');
      return;
    }

    if (!staffSignUp.password || staffSignUp.password.length < 4) {
      setErrorMsg('Password must be at least 4 characters long.');
      return;
    }

    if (staffSignUp.password !== staffSignUp.confirm_password) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    const res = await registerStaff({
      hospital_id: selectedHospitalFacility.hospital_code,
      name: staffSignUp.name.trim(),
      staff_id: staffSignUp.staff_id.trim(),
      email: staffSignUp.email.trim(),
      role: staffSignUp.role,
      specialization: staffSignUp.specialization.trim(),
      password: staffSignUp.password
    });

    if (!res.success) {
      setErrorMsg(res.error || 'Staff sign up failed.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center px-4 py-10 relative overflow-hidden selection:bg-cyan-500 selection:text-white">
      {/* Background Ambient Glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[650px] bg-gradient-to-tr from-cyan-600/10 via-indigo-600/10 to-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-xl w-full space-y-5 relative z-10">
        
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-600 to-blue-600 shadow-xl shadow-cyan-500/20 border border-cyan-400/30 mb-1">
            <Activity className="w-8 h-8 text-white animate-pulse" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            PatientTriage<span className="text-cyan-400">.ai</span>
          </h1>
          <p className="text-xs text-slate-400">
            Emergency Department Clinical Decision Support &amp; AI Risk Platform
          </p>
        </div>

        {/* 2-Step Progress Indicator */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-2.5 flex items-center justify-between shadow-lg text-xs">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all ${
            currentStage === 'hospital' ? 'bg-cyan-950 text-cyan-300 border border-cyan-800 font-bold' : 'text-slate-400'
          }`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
              currentStage === 'hospital' ? 'bg-cyan-500 text-slate-950' : 'bg-slate-800 text-slate-400'
            }`}>1</span>
            <span>Hospital Facility</span>
          </div>

          <ArrowRight className="w-3.5 h-3.5 text-slate-600" />

          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all ${
            currentStage === 'staff' ? 'bg-indigo-950 text-indigo-300 border border-indigo-800 font-bold' : 'text-slate-500'
          }`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
              currentStage === 'staff' ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-500'
            }`}>2</span>
            <span>Staff Authentication</span>
          </div>
        </div>

        {/* Error Alert Box */}
        {errorMsg && (
          <div className="p-3.5 bg-rose-950/80 border border-rose-700/60 rounded-2xl text-rose-200 text-xs flex items-center justify-between shadow-lg animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-rose-200 font-bold ml-2 cursor-pointer">×</button>
          </div>
        )}

        {/* Main Authentication Container Card */}
        <div className="bg-slate-900/90 border border-slate-800/90 backdrop-blur-xl rounded-3xl p-6 sm:p-8 shadow-2xl space-y-5">
          
          {/* ============================================================ */}
          {/* STAGE 1: HOSPITAL FACILITY SIGN IN OR REGISTER               */}
          {/* ============================================================ */}
          {currentStage === 'hospital' && (
            <div className="space-y-5">
              
              {/* Tab Switcher: Hospital Sign In vs Hospital Register */}
              <div className="flex rounded-2xl bg-slate-950 p-1 border border-slate-800 shadow-inner">
                <button
                  type="button"
                  onClick={() => { setHospMode('signin'); setErrorMsg(null); }}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    hospMode === 'signin'
                      ? 'bg-cyan-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Hospital Sign In</span>
                </button>

                <button
                  type="button"
                  onClick={() => { setHospMode('register'); setErrorMsg(null); }}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    hospMode === 'register'
                      ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Register Hospital</span>
                </button>
              </div>

              {/* TAB 1A: HOSPITAL SIGN IN */}
              {hospMode === 'signin' ? (
                <form onSubmit={handleHospitalSignIn} className="space-y-4">
                  <div>
                    <h2 className="text-base font-bold text-white">Sign In as Hospital Facility</h2>
                    <p className="text-xs text-slate-400 mt-0.5">Select or enter your authorized hospital facility credentials to access its workspace.</p>
                  </div>

                  {/* Quick Select from Registered Hospitals */}
                  {hospitals && hospitals.length > 0 && (
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Select Existing Hospital Facility
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {hospitals.map((h) => {
                          const isSelected = hospCodeInput === h.hospital_code;
                          return (
                            <button
                              key={h.hospital_code}
                              type="button"
                              onClick={() => setHospCodeInput(h.hospital_code)}
                              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-cyan-950/70 border-cyan-500 text-white shadow-md'
                                  : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800/60'
                              }`}
                            >
                              <div className="font-bold text-xs truncate">{h.name}</div>
                              <div className="text-[10px] text-cyan-400 font-mono mt-0.5">ID: {h.hospital_code}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Manual Hospital ID Input */}
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Hospital ID / Facility Code *
                    </label>
                    <div className="relative">
                      <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                      <input
                        type="text"
                        required
                        placeholder="e.g. DEMO001 or CITY001"
                        value={hospCodeInput}
                        onChange={(e) => setHospCodeInput(e.target.value.toUpperCase())}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 uppercase font-mono placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  </div>

                  {/* Hospital Password / Master Key */}
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Hospital Password / Facility Master Key
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                      <input
                        type="password"
                        placeholder="•••••••••••• (Optional for demo facilities)"
                        value={hospPasswordInput}
                        onChange={(e) => setHospPasswordInput(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg shadow-cyan-900/40 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <span>{loading ? 'Verifying Facility...' : 'Sign In as Hospital & Continue to Staff Access'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              ) : (
                /* TAB 1B: REGISTER HOSPITAL */
                <form onSubmit={handleHospitalRegister} className="space-y-4">
                  <div>
                    <h2 className="text-base font-bold text-white">Register New Hospital Facility</h2>
                    <p className="text-xs text-slate-400 mt-0.5">Register your hospital system to create an isolated, secure clinical workspace.</p>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">Hospital Facility Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. CityCare Emergency & Trauma Center"
                        value={newHospForm.hospital_name}
                        onChange={(e) => setNewHospForm({ ...newHospForm, hospital_name: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">Hospital ID / Code *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. CITY001"
                          value={newHospForm.hospital_code}
                          onChange={(e) => setNewHospForm({ ...newHospForm, hospital_code: e.target.value.toUpperCase() })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 uppercase font-mono focus:outline-none focus:border-cyan-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">Hospital Password *</label>
                        <input
                          type="password"
                          required
                          placeholder="••••••••••••"
                          value={newHospForm.password}
                          onChange={(e) => setNewHospForm({ ...newHospForm, password: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2 space-y-1">
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">Facility Address / City</label>
                        <input
                          type="text"
                          placeholder="e.g. 124 Healthcare Boulevard, Metro District"
                          value={newHospForm.address}
                          onChange={(e) => setNewHospForm({ ...newHospForm, address: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">ED Bed Capacity</label>
                        <input
                          type="number"
                          min={1}
                          max={500}
                          value={newHospForm.bed_capacity}
                          onChange={(e) => setNewHospForm({ ...newHospForm, bed_capacity: Number(e.target.value) })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:opacity-95 text-white font-bold text-xs shadow-lg shadow-indigo-900/40 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <span>{loading ? 'Creating Hospital Facility...' : 'Register Hospital & Proceed to Staff Account'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              )}

            </div>
          )}

          {/* ============================================================ */}
          {/* STAGE 2: STAFF SIGN IN OR SIGN UP AS STAFF                  */}
          {/* ============================================================ */}
          {currentStage === 'staff' && (
            <div className="space-y-5">
              
              {/* Selected Hospital Facility Banner with Back Button */}
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-cyan-950 text-cyan-400 border border-cyan-800">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">{selectedHospitalFacility.name}</div>
                    <div className="text-[10px] text-cyan-400 font-mono">Hospital ID: {selectedHospitalFacility.hospital_code}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={clearSelectedHospital}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Switch Hospital</span>
                </button>
              </div>

              {/* Tab Switcher: Sign In as Staff vs Sign Up as Staff */}
              <div className="flex rounded-2xl bg-slate-950 p-1 border border-slate-800 shadow-inner">
                <button
                  type="button"
                  onClick={() => { setStaffMode('signin'); setErrorMsg(null); }}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    staffMode === 'signin'
                      ? 'bg-cyan-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Sign In as Staff</span>
                </button>

                <button
                  type="button"
                  onClick={() => { setStaffMode('signup'); setErrorMsg(null); }}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    staffMode === 'signup'
                      ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Sign Up as Staff</span>
                </button>
              </div>

              {/* TAB 2A: SIGN IN AS STAFF */}
              {staffMode === 'signin' ? (
                <form onSubmit={handleStaffSignIn} className="space-y-4">
                  <div>
                    <h2 className="text-base font-bold text-white">Staff Sign In</h2>
                    <p className="text-xs text-slate-400 mt-0.5">Enter your clinician credentials to access the emergency care dashboard.</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Staff ID or Registered Email *
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                      <input
                        type="text"
                        required
                        placeholder="e.g. DOC001 or nurse@hospital.org"
                        value={staffSignIn.staff_id}
                        onChange={(e) => setStaffSignIn({ ...staffSignIn, staff_id: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Password *
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                      <input
                        type="password"
                        required
                        placeholder="••••••••••••"
                        value={staffSignIn.password}
                        onChange={(e) => setStaffSignIn({ ...staffSignIn, password: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg shadow-cyan-900/40 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <span>{loading ? 'Authenticating...' : 'Sign In as Staff'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <div className="pt-2 text-center text-[11px] text-slate-500 border-t border-slate-800/80">
                    Demo Staff Accounts (Password: <code>demo123</code>): <strong>DOC001</strong> (Physician), <strong>NUR001</strong> (Triage Nurse), <strong>DIR001</strong> (Clinical Director)
                  </div>
                </form>
              ) : (
                /* TAB 2B: SIGN UP AS STAFF (AUTOMATICALLY ADDS TO STAFF ROSTER) */
                <form onSubmit={handleStaffSignUp} className="space-y-4">
                  <div>
                    <h2 className="text-base font-bold text-white">Sign Up as Staff Member</h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Register your clinician account. Your profile will automatically be added to this hospital's staff roster.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">Full Name *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Dr. Robert Chase, MD"
                          value={staffSignUp.name}
                          onChange={(e) => setStaffSignUp({ ...staffSignUp, name: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">Staff ID *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. DOC002"
                          value={staffSignUp.staff_id}
                          onChange={(e) => setStaffSignUp({ ...staffSignUp, staff_id: e.target.value.toUpperCase() })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 uppercase font-mono focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">Email Address *</label>
                        <input
                          type="email"
                          required
                          placeholder="e.g. chase@hospital.org"
                          value={staffSignUp.email}
                          onChange={(e) => setStaffSignUp({ ...staffSignUp, email: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">Clinical Role *</label>
                        <select
                          value={staffSignUp.role}
                          onChange={(e) => setStaffSignUp({ ...staffSignUp, role: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-semibold cursor-pointer"
                        >
                          <option value="EMERGENCY_PHYSICIAN">Emergency Physician</option>
                          <option value="TRIAGE_NURSE">Triage Nurse</option>
                          <option value="STAFF_NURSE">Staff Nurse</option>
                          <option value="CLINICAL_DIRECTOR">Clinical Director</option>
                          <option value="HOSPITAL_ADMIN">Hospital Administrator</option>
                          <option value="EMERGENCY_TECHNICIAN">Emergency Technician</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">Clinical Specialization / Department</label>
                      <input
                        type="text"
                        placeholder="e.g. Emergency Medicine &amp; Critical Care / Intake Triage"
                        value={staffSignUp.specialization}
                        onChange={(e) => setStaffSignUp({ ...staffSignUp, specialization: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">Password *</label>
                        <input
                          type="password"
                          required
                          placeholder="••••••••••••"
                          value={staffSignUp.password}
                          onChange={(e) => setStaffSignUp({ ...staffSignUp, password: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">Confirm Password *</label>
                        <input
                          type="password"
                          required
                          placeholder="••••••••••••"
                          value={staffSignUp.confirm_password}
                          onChange={(e) => setStaffSignUp({ ...staffSignUp, confirm_password: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:opacity-95 text-white font-bold text-xs shadow-lg shadow-indigo-900/40 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{loading ? 'Creating Staff Account...' : 'Sign Up as Staff & Enter System'}</span>
                  </button>
                </form>
              )}

            </div>
          )}

        </div>

      </div>
    </div>
  );
};
