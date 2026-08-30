/* eslint-disable no-unused-vars, no-undef, react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import PatientProfile from './components/PatientProfile';
import PatientRegistration from './components/PatientRegistration';
import React, { useState, useEffect } from 'react';
import { 
  Activity, AlertTriangle, ShieldCheck, LogOut, Plus, Search, Filter, 
  RefreshCw, Key, Shield, User, Building, HeartPulse, Check, X, ShieldAlert,
  UserMinus, UserCheck, AlertOctagon, Info, FileText, ChevronRight, CheckCircle,
  Link
} from 'lucide-react';
import TriageDecisionModal from './components/TriageModal';
import AIRiskAssessmentCard from './components/AIRiskAssessmentCard';

// Predefined role names
const ROLE_NAMES = {
  HOSPITAL_ADMINISTRATOR: "Hospital Administrator",
  TRIAGE_NURSE: "Triage Nurse",
  EMERGENCY_PHYSICIAN: "Emergency Physician",
  STAFF_NURSE: "Staff Nurse",
  EMERGENCY_TECHNICIAN: "Emergency Technician",
  CLINICAL_DIRECTOR: "Clinical Director"
};

const ESI_BADGES = {
  1: { bg: 'bg-red-600/20 text-red-400 border-red-500/50', label: 'ESI 1: Resuscitation' },
  2: { bg: 'bg-orange-600/20 text-orange-400 border-orange-500/50', label: 'ESI 2: Emergent' },
  3: { bg: 'bg-yellow-600/20 text-yellow-400 border-yellow-500/50', label: 'ESI 3: Urgent' },
  4: { bg: 'bg-green-600/20 text-green-400 border-green-500/50', label: 'ESI 4: Less Urgent' },
  5: { bg: 'bg-blue-600/20 text-blue-400 border-blue-500/50', label: 'ESI 5: Non-Urgent' },
};

export default function App() {
  // Session State
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [user, setUser] = useState(JSON.parse(localStorage.getItem("user")) || null);
  const [route, setRoute] = useState(window.location.hash || '#/login');

  // UI state
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Sync route hash changes
  useEffect(() => {
    const handleHashChange = () => {
      const currentHash = window.location.hash || '#/login';
      setRoute(currentHash);
      
      // Redirect unauthenticated users
      const publicRoutes = ['#/login', '#/register', '#/forgot-password', '#/reset-password', '#/activate'];
      const isPublic = publicRoutes.some(r => currentHash.startsWith(r));
      if (!localStorage.getItem("token") && !isPublic) {
        window.location.hash = '#/login';
      }
    };
    
    window.addEventListener('hashchange', handleHashChange);
    // Initial check
    handleHashChange();
    
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [token]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken("");
    setUser(null);
    setSuccess("You have been securely logged out.");
    window.location.hash = '#/login';
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      
      {/* Toast Banner */}
      {(error || success) && (
        <div className="fixed top-4 right-4 z-50 max-w-md w-full animate-bounce">
          {error && (
            <div className="bg-red-950 border border-red-500 text-red-200 px-4 py-3 rounded-lg flex items-center justify-between shadow-2xl">
              <span className="flex items-center gap-2"><AlertOctagon className="w-5 h-5 text-red-500" /> {error}</span>
              <button onClick={() => setError("")} className="text-red-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
          )}
          {success && (
            <div className="bg-emerald-950 border border-emerald-500 text-emerald-200 px-4 py-3 rounded-lg flex items-center justify-between shadow-2xl">
              <span className="flex items-center gap-2"><CheckCircle className="w-5 h-5 text-emerald-500" /> {success}</span>
              <button onClick={() => setSuccess("")} className="text-emerald-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
          )}
        </div>
      )}

      {/* Main Layout Header */}
      {user && (
        <header className="bg-slate-900/80 border-b border-slate-800 backdrop-blur-md sticky top-0 z-40 px-6 py-4 flex justify-between items-center shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-600/10 border border-red-500/30 flex items-center justify-center animate-pulse">
              <Activity className="text-red-500 w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white m-0">PatientTriage.ai</h1>
              <p className="text-xs text-slate-400 font-mono flex items-center gap-1"><Building className="w-3 h-3 text-cyan-400" /> {user.hospital_id}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-white leading-tight flex items-center gap-1.5 justify-end">
                <User className="w-3.5 h-3.5 text-cyan-400" /> {user.full_name}
              </p>
              <p className="text-xs text-slate-400 font-mono bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 mt-1 inline-block">
                {ROLE_NAMES[user.role] || user.role}
              </p>
            </div>
            <button 
              onClick={handleLogout}
              className="bg-slate-850 hover:bg-red-950 hover:text-red-200 text-slate-300 border border-slate-700 hover:border-red-800 px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition duration-200"
            >
              <LogOut className="w-4 h-4" /> <span className="hidden md:inline">Sign Out</span>
            </button>
          </div>
        </header>
      )}

      <main className="flex-1 p-6 flex flex-col items-center justify-center">
        {route === '#/login' && <LoginView setToken={setToken} setUser={setUser} setError={setError} setSuccess={setSuccess} />}
        {route === '#/register' && <RegisterView setError={setError} setSuccess={setSuccess} />}
        {route === '#/forgot-password' && <ForgotPasswordView setError={setError} setSuccess={setSuccess} />}
        {route === '#/reset-password' && <ResetPasswordView setError={setError} setSuccess={setSuccess} />}
        {route.startsWith('#/activate') && <ActivateStaffView setError={setError} setSuccess={setSuccess} />}
        {route === '#/dashboard' && user && <DashboardShell user={user} setError={setError} setSuccess={setSuccess} />}
      </main>

      <footer className="border-t border-slate-900 py-4 text-center text-xs text-slate-500 font-mono">
        PatientTriage.ai &copy; 2026. Designed with healthcare privacy, multi-tenant isolation, and clinical safety principles.
      </footer>
    </div>
  );
}

// ==========================================
// 1. LOGIN COMPONENT
// ==========================================
function LoginView({ setToken, setUser, setError, setSuccess }) {
  const [hospitalId, setHospitalId] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!hospitalId || !username || !password) {
      setError("Please fill in all login details.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hospital_id: hospitalId, username, password })
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem("token", data.access_token);
        localStorage.setItem("user", JSON.stringify(data.user));
        setToken(data.access_token);
        setUser(data.user);
        setSuccess(`Welcome back, ${data.user.full_name}!`);
        window.location.hash = "#/dashboard";
      } else {
        setError(data.detail || "Authentication failed.");
      }
    } catch (err) {
      setError("Unable to connect to the PatientTriage.ai server.");
    } finally {
      setLoading(false);
    }
  };

  // Quick Demo Prefills helper
  const prefill = (hid, uid, pwd) => {
    setHospitalId(hid);
    setUsername(uid);
    setPassword(pwd);
  };

  return (
    <div className="w-full max-w-4xl grid md:grid-cols-5 gap-6 items-stretch my-8">
      {/* Login Card */}
      <div className="md:col-span-3 bg-slate-900/60 border border-slate-800 rounded-2xl p-8 flex flex-col justify-between shadow-2xl backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2 mb-6">
            <Activity className="text-red-500 w-8 h-8" />
            <h2 className="text-2xl font-black text-white m-0 tracking-tight">Sign In</h2>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1">HOSPITAL ID / ORG ID</label>
              <input 
                type="text" 
                value={hospitalId} 
                onChange={(e) => setHospitalId(e.target.value)} 
                placeholder="e.g. DEMO001" 
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1">STAFF ID / OFFICIAL EMAIL</label>
              <input 
                type="text" 
                value={username} 
                onChange={(e) => setUsername(e.target.value)} 
                placeholder="e.g. DOC001 or doctor@hospital.com" 
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1 flex justify-between">
                <span>PASSWORD</span>
                <a href="#/forgot-password" className="text-cyan-400 hover:underline">Forgot password?</a>
              </label>
              <input 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                placeholder="••••••••" 
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none"
              />
            </div>
            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2.5 rounded-lg transition duration-200 mt-2 disabled:bg-slate-800"
            >
              {loading ? "Verifying..." : "Sign In to workstation"}
            </button>
          </form>
        </div>
        <div className="border-t border-slate-850 mt-6 pt-4 text-center">
          <p className="text-sm text-slate-400">
            Authorized administrative officer? <a href="#/register" className="text-cyan-400 font-bold hover:underline">Register New Hospital</a>
          </p>
        </div>
      </div>

      {/* Demo Credentials Quick-Fill Panel */}
      <div className="md:col-span-2 bg-slate-900/30 border border-slate-800/60 rounded-2xl p-6 flex flex-col justify-between shadow-2xl">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-1.5 mb-2">
            <ShieldCheck className="text-emerald-400 w-4 h-4" /> Demo Mode Credentials
          </h3>
          <p className="text-xs text-slate-400 mb-4">
            Pre-seeded clinician and administrator profiles are available for prototype evaluation. Click to prefill:
          </p>
          <div className="space-y-2">
            <button 
              onClick={() => prefill("DEMO001", "ADMIN001", "DemoAdmin123!")}
              className="w-full text-left bg-slate-950/65 border border-slate-800 hover:border-cyan-500/50 p-2.5 rounded-lg flex justify-between items-center text-xs transition"
            >
              <div>
                <p className="font-bold text-slate-300">ADMIN001</p>
                <p className="text-[10px] text-slate-500">Hospital Administrator</p>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </button>
            
            <button 
              onClick={() => prefill("DEMO001", "NUR001", "DemoNurse123!")}
              className="w-full text-left bg-slate-950/65 border border-slate-800 hover:border-cyan-500/50 p-2.5 rounded-lg flex justify-between items-center text-xs transition"
            >
              <div>
                <p className="font-bold text-slate-300">NUR001</p>
                <p className="text-[10px] text-slate-500">Triage Nurse</p>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </button>

            <button 
              onClick={() => prefill("DEMO001", "DOC001", "DemoDoctor123!")}
              className="w-full text-left bg-slate-950/65 border border-slate-800 hover:border-cyan-500/50 p-2.5 rounded-lg flex justify-between items-center text-xs transition"
            >
              <div>
                <p className="font-bold text-slate-300">DOC001</p>
                <p className="text-[10px] text-slate-500">Emergency Physician</p>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </button>

            <button 
              onClick={() => prefill("DEMO001", "TECH001", "DemoTech123!")}
              className="w-full text-left bg-slate-950/65 border border-slate-800 hover:border-cyan-500/50 p-2.5 rounded-lg flex justify-between items-center text-xs transition"
            >
              <div>
                <p className="font-bold text-slate-300">TECH001</p>
                <p className="text-[10px] text-slate-500">Emergency Tech</p>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </button>

            <button 
              onClick={() => prefill("DEMO001", "DIR001", "DemoDirector123!")}
              className="w-full text-left bg-slate-950/65 border border-slate-800 hover:border-cyan-500/50 p-2.5 rounded-lg flex justify-between items-center text-xs transition"
            >
              <div>
                <p className="font-bold text-slate-300">DIR001</p>
                <p className="text-[10px] text-slate-500">Clinical Director</p>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        </div>
        <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-lg mt-4 text-[10px] text-slate-400 flex gap-2">
          <Info className="w-4 h-4 text-cyan-400 flex-shrink-0" />
          <span>PatientTriage.ai validates all role scopes on the server. Try accessing clinical systems as an administrator to inspect error triggers.</span>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 2. HOSPITAL REGISTRATION COMPONENT
// ==========================================
function RegisterView({ setError, setSuccess }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Hospital Info State
  const [hospName, setHospName] = useState("");
  const [hospitalId, setHospitalId] = useState("");
  const [hospType, setHospType] = useState("Private");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [stateName, setStateName] = useState("");
  const [country, setCountry] = useState("USA");
  const [postalCode, setPostalCode] = useState("");
  const [regNum, setRegNum] = useState("");
  const [edCapacity, setEdCapacity] = useState(50);

  // Admin Info State
  const [adminName, setAdminName] = useState("");
  const [adminEmployeeId, setAdminEmployeeId] = useState("");
  const [adminDesignation, setAdminDesignation] = useState("Chief Information Officer");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPhone, setAdminPhone] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [authorizedChecked, setAuthorizedChecked] = useState(false);

  const getPasswordStrength = () => {
    if (!adminPassword) return { score: 0, text: "None", color: "bg-slate-850" };
    let score = 0;
    if (adminPassword.length >= 8) score++;
    if (/[A-Z]/.test(adminPassword)) score++;
    if (/[a-z]/.test(adminPassword)) score++;
    if (/[0-9]/.test(adminPassword)) score++;
    if (/[!@#$%^&*(),.?":{}|<>]/.test(adminPassword)) score++;
    
    if (score <= 2) return { score, text: "Weak", color: "bg-red-500" };
    if (score <= 4) return { score, text: "Medium", color: "bg-amber-500" };
    return { score, text: "Strong", color: "bg-emerald-500" };
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (adminPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!authorizedChecked) {
      setError("You must verify administrative authorization.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/v1/auth/register-hospital", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: hospName,
          hospital_id: hospitalId,
          hospital_type: hospType,
          address,
          city,
          state: stateName,
          country,
          postal_code: postalCode,
          registration_number: regNum,
          emergency_department_available: true,
          ed_capacity: Number(edCapacity),
          admin_name: adminName,
          admin_employee_id: adminEmployeeId,
          admin_designation: adminDesignation,
          admin_email: adminEmail,
          admin_phone: adminPhone,
          admin_password: adminPassword,
          confirm_authorization: authorizedChecked
        })
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess("Hospital and administrator registered successfully.");
        setStep(3);
      } else {
        setError(data.detail || "Registration failed.");
      }
    } catch (err) {
      setError("Server connection failed.");
    } finally {
      setLoading(false);
    }
  };

  const strength = getPasswordStrength();

  return (
    <div className="w-full max-w-2xl bg-slate-900/60 border border-slate-800 rounded-2xl p-8 shadow-2xl backdrop-blur-md my-8">
      {/* Steps Indicator */}
      <div className="flex items-center justify-center gap-3 mb-6">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${step >= 1 ? 'bg-cyan-600 text-white' : 'bg-slate-850 text-slate-400'}`}>1</div>
        <div className="w-12 h-0.5 bg-slate-800"></div>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${step >= 2 ? 'bg-cyan-600 text-white' : 'bg-slate-850 text-slate-400'}`}>2</div>
        <div className="w-12 h-0.5 bg-slate-800"></div>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${step >= 3 ? 'bg-cyan-600 text-white' : 'bg-slate-850 text-slate-400'}`}>3</div>
      </div>

      {step === 1 && (
        <div>
          <h2 className="text-xl font-bold text-white mb-1">Step 1 — Hospital Information</h2>
          <p className="text-xs text-slate-400 mb-6">Enter organization details to set up your isolated clinical data environment.</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-mono text-slate-400 mb-1">HOSPITAL NAME</label>
              <input type="text" value={hospName} onChange={(e) => setHospName(e.target.value)} placeholder="Demo General Hospital" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-white focus:border-cyan-500 outline-none"/>
            </div>
            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1">HOSPITAL ID (UNIQUE ALPHANUMERIC)</label>
              <input type="text" value={hospitalId} onChange={(e) => setHospitalId(e.target.value)} placeholder="e.g. HOSP_X" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-white focus:border-cyan-500 outline-none"/>
            </div>
            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1">HOSPITAL TYPE</label>
              <select value={hospType} onChange={(e) => setHospType(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-white focus:border-cyan-500 outline-none">
                <option value="Government">Government</option>
                <option value="Private">Private</option>
                <option value="Teaching Hospital">Teaching Hospital</option>
                <option value="Specialty Hospital">Specialty Hospital</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-mono text-slate-400 mb-1">STREET ADDRESS</label>
              <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="100 Main St" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-white focus:border-cyan-500 outline-none"/>
            </div>
            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1">CITY</label>
              <input type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder="New York" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-white focus:border-cyan-500 outline-none"/>
            </div>
            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1">STATE / PROVINCE</label>
              <input type="text" value={stateName} onChange={(e) => setStateName(e.target.value)} placeholder="NY" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-white focus:border-cyan-500 outline-none"/>
            </div>
            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1">POSTAL CODE</label>
              <input type="text" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="10001" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-white focus:border-cyan-500 outline-none"/>
            </div>
            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1">COUNTRY</label>
              <input type="text" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="USA" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-white focus:border-cyan-500 outline-none"/>
            </div>
            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1">ED CAPACITY (BEDS)</label>
              <input type="number" value={edCapacity} onChange={(e) => setEdCapacity(e.target.value)} placeholder="50" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-white focus:border-cyan-500 outline-none"/>
            </div>
            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1">ACCREDITATION / REGISTRATION #</label>
              <input type="text" value={regNum} onChange={(e) => setRegNum(e.target.value)} placeholder="REG-100200" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-white focus:border-cyan-500 outline-none"/>
            </div>
          </div>
          <div className="flex justify-between items-center mt-6">
            <a href="#/login" className="text-xs text-slate-400 underline">Cancel and return</a>
            <button onClick={() => setStep(2)} className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-4 rounded transition">Next: Admin Settings</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <form onSubmit={handleRegister}>
          <h2 className="text-xl font-bold text-white mb-1">Step 2 — Administrator Registration</h2>
          <p className="text-xs text-slate-400 mb-6">Create the primary administrative credential for this hospital organization.</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1">FULL NAME</label>
              <input type="text" value={adminName} onChange={(e) => setAdminName(e.target.value)} required placeholder="Jane Doe" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-white focus:border-cyan-500 outline-none"/>
            </div>
            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1">ADMIN EMPLOYEE ID</label>
              <input type="text" value={adminEmployeeId} onChange={(e) => setAdminEmployeeId(e.target.value)} required placeholder="EMP-101" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-white focus:border-cyan-500 outline-none"/>
            </div>
            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1">OFFICIAL HOSPITAL EMAIL</label>
              <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} required placeholder="admin@hospital.com" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-white focus:border-cyan-500 outline-none"/>
            </div>
            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1">CONTACT PHONE NUMBER</label>
              <input type="text" value={adminPhone} onChange={(e) => setAdminPhone(e.target.value)} required placeholder="555-0100" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-white focus:border-cyan-500 outline-none"/>
            </div>
            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1">PASSWORD (STRENGTH: {strength.text})</label>
              <input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} required placeholder="••••••••" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-white focus:border-cyan-500 outline-none"/>
              <div className="w-full bg-slate-850 h-1.5 rounded mt-1.5 overflow-hidden">
                <div className={`h-full ${strength.color} transition-all`} style={{ width: `${strength.score * 20}%` }}></div>
              </div>
            </div>
            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1">CONFIRM PASSWORD</label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required placeholder="••••••••" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-white focus:border-cyan-500 outline-none"/>
            </div>
          </div>

          <div className="mt-6 border-t border-slate-850 pt-4">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input type="checkbox" checked={authorizedChecked} onChange={(e) => setAuthorizedChecked(e.target.checked)} className="mt-1 accent-cyan-500"/>
              <span className="text-xs text-slate-300 leading-normal">
                I confirm that I am authorized to register this hospital organization and manage its PatientTriage.ai security credentials and clinician directories.
              </span>
            </label>
          </div>

          <div className="flex justify-between items-center mt-6">
            <button type="button" onClick={() => setStep(1)} className="text-xs text-slate-400 underline">Back</button>
            <button type="submit" disabled={loading} className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-5 rounded transition disabled:bg-slate-850">
              {loading ? "Registering..." : "Complete Registration"}
            </button>
          </div>
        </form>
      )}

      {step === 3 && (
        <div className="text-center py-6">
          <div className="w-16 h-16 bg-emerald-600/10 border border-emerald-500/30 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Hospital Registration Submitted</h2>
          <p className="text-sm text-slate-400 max-w-md mx-auto mb-6">
            The PatientTriage.ai secure clinical data tenant has been created.
          </p>
          <div className="bg-slate-950 border border-slate-850 p-4 rounded-lg text-left max-w-sm mx-auto text-xs space-y-2 mb-6">
            <p className="text-slate-500 font-mono">ORGANIZATION PROFILE</p>
            <p className="text-white"><span className="text-slate-400 font-mono">Hospital Name:</span> {hospName}</p>
            <p className="text-white"><span className="text-slate-400 font-mono">Hospital ID:</span> {hospitalId}</p>
            <p className="text-white"><span className="text-slate-400 font-mono">Admin Email:</span> {adminEmail}</p>
            <p className="text-white"><span className="text-slate-400 font-mono">Verification:</span> <span className="bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 px-1 rounded">VERIFIED</span></p>
          </div>
          <a href="#/login" className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2.5 px-6 rounded-lg transition inline-block text-sm">
            Sign In to Workstation
          </a>

        </div>

      )}
    </div>
  );
}

// ==========================================
// Forgot Password View (Simulated)
// ==========================================
function ForgotPasswordView({ setError, setSuccess }) {
  const [hospitalId, setHospitalId] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/v1/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hospital_id: hospitalId, email })
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(data.message);
        // Navigate or show instructions
        setTimeout(() => {
          window.location.hash = "#/reset-password";
        }, 1500);
      }
    } catch (err) {
      setError("Failed to request reset.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl backdrop-blur-md">
      <h2 className="text-lg font-bold text-white mb-2">Password Recovery</h2>
      <p className="text-xs text-slate-400 mb-4">Request password recovery instructions for your staff account.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-mono text-slate-400 mb-1">HOSPITAL ID</label>
          <input type="text" value={hospitalId} onChange={(e) => setHospitalId(e.target.value)} required placeholder="DEMO001" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-white focus:border-cyan-500 outline-none"/>
        </div>
        <div>
          <label className="block text-xs font-mono text-slate-400 mb-1">OFFICIAL EMAIL</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="staff@hospital.com" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-white focus:border-cyan-500 outline-none"/>
        </div>
        <button type="submit" disabled={loading} className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 rounded text-sm transition">
          {loading ? "Requesting..." : "Send Reset Instructions"}
        </button>
      </form>
      <p className="text-center text-xs text-slate-400 mt-4">
        <a href="#/login" className="text-cyan-400 hover:underline">Back to Login</a>
      </p>
    </div>
  );
}

// ==========================================
// Reset Password View (Simulated)
// ==========================================
function ResetPasswordView({ setError, setSuccess }) {
  const [hospitalId, setHospitalId] = useState("");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/v1/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hospital_id: hospitalId, email, temp_token: token, new_password: newPassword })
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(data.message);
        setTimeout(() => {
          window.location.hash = "#/login";
        }, 1500);
      } else {
        setError(data.detail);
      }
    } catch (err) {
      setError("Reset failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl backdrop-blur-md">
      <h2 className="text-lg font-bold text-white mb-2">Update Password</h2>
      <p className="text-xs text-slate-400 mb-2">Enter your reset code and specify a new secure password.</p>
      <div className="bg-slate-950 border border-slate-800 p-2 rounded text-[10px] text-slate-400 font-mono mb-4">
        DEMO MODE CODE: <span className="text-cyan-400 font-bold">RESET-TOKEN-12345</span>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-mono text-slate-400 mb-1">HOSPITAL ID</label>
          <input type="text" value={hospitalId} onChange={(e) => setHospitalId(e.target.value)} required placeholder="DEMO001" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-white focus:border-cyan-500 outline-none"/>
        </div>
        <div>
          <label className="block text-xs font-mono text-slate-400 mb-1">OFFICIAL EMAIL</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="staff@hospital.com" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-white focus:border-cyan-500 outline-none"/>
        </div>
        <div>
          <label className="block text-xs font-mono text-slate-400 mb-1">RESET CODE</label>
          <input type="text" value={token} onChange={(e) => setToken(e.target.value)} required placeholder="RESET-TOKEN-12345" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-white focus:border-cyan-500 outline-none"/>
        </div>
        <div>
          <label className="block text-xs font-mono text-slate-400 mb-1">NEW PASSWORD</label>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required placeholder="••••••••" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-white focus:border-cyan-500 outline-none"/>
        </div>
        <button type="submit" disabled={loading} className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 rounded text-sm transition">
          {loading ? "Updating..." : "Update Password"}
        </button>
      </form>
    </div>
  );
}

// ==========================================
// Staff Activation View
// ==========================================
function ActivateStaffView({ setError, setSuccess }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Parse token from URL hash (e.g. #/activate?token=xxx)
  const getQueryParam = (name) => {
    const hash = window.location.hash;
    const match = hash.match(new RegExp('[?&]' + name + '=([^&]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  };

  const token = getQueryParam("token");

  const getPasswordStrength = () => {
    if (!newPassword) return { score: 0, text: "None", color: "bg-slate-850" };
    let score = 0;
    if (newPassword.length >= 8) score++;
    if (/[A-Z]/.test(newPassword)) score++;
    if (/[a-z]/.test(newPassword)) score++;
    if (/[0-9]/.test(newPassword)) score++;
    if (/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)) score++;
    
    if (score <= 2) return { score, text: "Weak", color: "bg-red-500" };
    if (score <= 4) return { score, text: "Medium", color: "bg-amber-500" };
    return { score, text: "Strong", color: "bg-emerald-500" };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token) {
      setError("Activation token is missing from the link.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/v1/auth/activate-staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: newPassword })
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess("Workstation account activated successfully! You may now sign in.");
        setTimeout(() => {
          window.location.hash = "#/login";
        }, 1500);
      } else {
        setError(data.detail || "Activation failed.");
      }
    } catch (err) {
      setError("Failed to connect to authentication services.");
    } finally {
      setLoading(false);
    }
  };

  const strength = getPasswordStrength();

  return (
    <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl backdrop-blur-md">
      <div className="flex items-center gap-2 mb-4">
        <Shield className="text-cyan-400 w-6 h-6" />
        <h2 className="text-lg font-bold text-white m-0">Activate Clinician Account</h2>
      </div>
      <p className="text-xs text-slate-400 mb-4">Specify a secure password to activate your isolated ED workstation access.</p>
      
      {!token ? (
        <div className="bg-red-950/40 border border-red-900/50 p-4 rounded-lg text-xs text-red-200">
          <AlertTriangle className="w-5 h-5 text-red-500 mb-2 animate-pulse" />
          The activation link is invalid or missing the required authorization token. Please request a new invite link from your hospital administrator.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-mono text-slate-400 mb-1">NEW PASSWORD (STRENGTH: {strength.text})</label>
            <input 
              type="password" 
              value={newPassword} 
              onChange={(e) => setNewPassword(e.target.value)} 
              required 
              placeholder="••••••••" 
              className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-white focus:border-cyan-500 outline-none font-mono"
            />
            <div className="w-full bg-slate-850 h-1.5 rounded mt-1.5 overflow-hidden">
              <div className={`h-full ${strength.color} transition-all`} style={{ width: `${strength.score * 20}%` }}></div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-mono text-slate-400 mb-1">CONFIRM PASSWORD</label>
            <input 
              type="password" 
              value={confirmPassword} 
              onChange={(e) => setConfirmPassword(e.target.value)} 
              required 
              placeholder="••••••••" 
              className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-white focus:border-cyan-500 outline-none font-mono"
            />
          </div>
          <button 
            type="submit" 
            disabled={loading} 
            className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 rounded text-sm transition"
          >
            {loading ? "Activating..." : "Activate Workstation Access"}
          </button>
        </form>
      )}
      <p className="text-center text-xs text-slate-400 mt-4">
        <a href="#/login" className="text-cyan-400 hover:underline">Back to Sign In</a>
      </p>
    </div>
  );
}


// ==========================================
// 3. DASHBOARD SHELL & SWITCHER
// ==========================================
function DashboardShell({ user, setError, setSuccess }) {
  if (user.role === "HOSPITAL_ADMINISTRATOR") {
    return <AdminDashboard user={user} setError={setError} setSuccess={setSuccess} />;
  } else if (user.role === "TRIAGE_NURSE") {
    return <TriageNurseDashboard user={user} setError={setError} setSuccess={setSuccess} />;
  } else if (user.role === "EMERGENCY_PHYSICIAN") {
    return <PhysicianDashboard user={user} setError={setError} setSuccess={setSuccess} />;
  } else if (user.role === "CLINICAL_DIRECTOR") {
    return <ClinicalDirectorDashboard user={user} setError={setError} setSuccess={setSuccess} />;
  }

  // Fallback for staff nurse, emergency tech
  return (
    <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-xl p-8 text-center my-8">
      <ShieldAlert className="text-yellow-400 w-12 h-12 mx-auto mb-4 animate-bounce" />
      <h2 className="text-xl font-bold text-white mb-2">Restricted Access Workstation</h2>
      <p className="text-sm text-slate-400 mb-6">
        Hello {user.full_name}. You are logged in with the role of <strong>{ROLE_NAMES[user.role] || user.role}</strong>. 
        Your current clinical station role holds restricted permissions. No active workflows are mapped for this technician interface.
      </p>
      <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-lg text-left text-xs font-mono max-w-md mx-auto space-y-2">
        <p className="text-slate-500">RESOLVED WORKSTATION SCOPE:</p>
        <p className="text-emerald-400"><span className="text-slate-500">hospital_id:</span> {user.hospital_id}</p>
        <p className="text-emerald-400"><span className="text-slate-500">staff_id:</span> {user.staff_id}</p>
        <p className="text-emerald-400"><span className="text-slate-500">permissions:</span> {user.permissions.length > 0 ? user.permissions.join(", ") : "None"}</p>
      </div>
    </div>
  );
}

// ==========================================
// 4. HOSPITAL ADMINISTRATOR DASHBOARD
// ==========================================
function AdminDashboard({ user, setError, setSuccess }) {
  const [tab, setTab] = useState("staff"); // staff, audits
  const [staffList, setStaffList] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(false);

  // New staff form state
  const [staffId, setStaffId] = useState("");
  const [fullName, setFullName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dept, setDept] = useState("Emergency Medicine");
  const [desig, setDesig] = useState("Staff Clinician");
  const [roleId, setRoleId] = useState("TRIAGE_NURSE");
  const [regLicense, setRegLicense] = useState("");
  const [experience, setExperience] = useState(5);

  const [invitedStaffLink, setInvitedStaffLink] = useState("");
  const [showInviteModal, setShowInviteModal] = useState(false);

  const fetchStaff = async () => {
    try {
      const res = await fetch("/api/v1/staff", {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
      });
      const data = await res.json();
      if (res.ok) {
        setStaffList(data);
      } else {
        setError(data.detail);
      }
    } catch (err) {
      setError("Failed to sync clinician directories.");
    }
  };

  const fetchAudits = async () => {
    try {
      const res = await fetch("/api/v1/audit-logs", {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
      });
      const data = await res.json();
      if (res.ok) {
        setAuditLogs(data);
      } else {
        setError(data.detail);
      }
    } catch (err) {
      setError("Failed to fetch system audit logs.");
    }
  };

  useEffect(() => {
    if (tab === "staff") fetchStaff();
    if (tab === "audits") fetchAudits();
  }, [tab]);

  const handleDeactivate = async (sid, currentStatus) => {
    const endpoint = currentStatus === "ACTIVE" ? "deactivate" : "activate";
    try {
      const res = await fetch(`/api/v1/staff/${sid}/${endpoint}`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(data.message);
        fetchStaff();
      } else {
        setError(data.detail);
      }
    } catch (err) {
      setError("Failed to update account status.");
    }
  };

  const handleAddStaffSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/v1/staff", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({
          staff_id: staffId,
          full_name: fullName,
          employee_id: employeeId,
          official_email: email,
          phone_number: phone,
          department: dept,
          designation: desig,
          role_id: roleId,
          professional_registration_number: regLicense || null,
          years_of_experience: Number(experience) || null
        })
      });
      const data = await res.json();
      if (res.ok) {
        const link = `${window.location.origin}${window.location.pathname}${data.invitation_link}`;
        setInvitedStaffLink(link);
        setShowInviteModal(true);
        setSuccess("Staff member invited successfully.");
        setShowAddModal(false);
        // Clear form
        setStaffId(""); setFullName(""); setEmployeeId(""); setEmail(""); setPhone(""); setRegLicense(""); setExperience(5);
        fetchStaff();
      } else {
        setError(data.detail || "Staff creation failed.");
      }
    } catch (err) {
      setError("Communication error.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyInvite = async (sid) => {
    try {
      const res = await fetch(`/api/v1/staff/${sid}/invite`, {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
      });
      const data = await res.json();
      if (res.ok) {
        const fullLink = `${window.location.origin}${window.location.pathname}${data.invitation_link}`;
        navigator.clipboard.writeText(fullLink);
        setSuccess("Invitation link copied to clipboard!");
      } else {
        setError(data.detail);
      }
    } catch (err) {
      setError("Failed to fetch invitation details.");
    }
  };

  const handleRoleChange = async (sid, newRole, name, oldRole) => {
    if (window.confirm(`Are you sure you want to change the role of ${name} from ${ROLE_NAMES[oldRole] || oldRole} to ${ROLE_NAMES[newRole] || newRole}?`)) {
      try {
        const res = await fetch(`/api/v1/staff/${sid}/role`, {
          method: "PATCH",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${localStorage.getItem("token")}`
          },
          body: JSON.stringify({ new_role_id: newRole })
        });
        const data = await res.json();
        if (res.ok) {
          setSuccess(data.message);
          fetchStaff();
        } else {
          setError(data.detail);
        }
      } catch (err) {
        setError("Failed to update role.");
      }
    }
  };

  // Filters
  const filteredStaff = staffList.filter(s => {
    const matchesSearch = s.full_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          s.staff_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          s.official_email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === "ALL" ? true : s.role_id === roleFilter;
    const matchesStatus = statusFilter === "ALL" ? true : s.status === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });

  return (
    <div className="w-full max-w-6xl my-4 space-y-6">
      
      {/* Dashboard Subheader */}
      <div className="flex justify-between items-center bg-slate-900 border border-slate-800 p-4 rounded-xl shadow">
        <div className="flex gap-2">
          <button 
            onClick={() => setTab("staff")}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition ${tab === 'staff' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:bg-slate-850'}`}
          >
            <User className="w-4 h-4" /> Clinician Directories
          </button>
          <button 
            onClick={() => setTab("audits")}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition ${tab === 'audits' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:bg-slate-850'}`}
          >
            <FileText className="w-4 h-4" /> Secure Audit Trail
          </button>
        </div>
        
        {tab === "staff" && (
          <button 
            onClick={() => setShowAddModal(true)}
            className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5 transition"
          >
            <Plus className="w-4 h-4" /> Onboard Staff
          </button>
        )}
      </div>

      {/* Staff Management Tab */}
      {tab === "staff" && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 shadow-xl backdrop-blur-md space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
            <h2 className="text-lg font-bold text-white self-start">Active Clinical Workstation Accounts</h2>
            
            {/* Filters bar */}
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-initial">
                <Search className="absolute left-3 top-2.5 text-slate-500 w-4 h-4" />
                <input 
                  type="text" 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search name, staff ID..." 
                  className="bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-white focus:border-cyan-500 outline-none w-full"
                />
              </div>
              <select 
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:border-cyan-500 outline-none"
              >
                <option value="ALL">All Roles</option>
                <option value="TRIAGE_NURSE">Triage Nurse</option>
                <option value="EMERGENCY_PHYSICIAN">Emergency Physician</option>
                <option value="CLINICAL_DIRECTOR">Clinical Director</option>
                <option value="STAFF_NURSE">Staff Nurse</option>
                <option value="EMERGENCY_TECHNICIAN">Emergency Technician</option>
                <option value="HOSPITAL_ADMINISTRATOR">Hospital Administrator</option>
              </select>
              <select 
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:border-cyan-500 outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="PENDING">PENDING</option>
                <option value="DEACTIVATED">DEACTIVATED</option>
                <option value="SUSPENDED">SUSPENDED</option>
              </select>
              <button onClick={fetchStaff} className="bg-slate-950 hover:bg-slate-850 border border-slate-800 p-2 rounded-lg transition">
                <RefreshCw className="w-4 h-4 text-slate-400" />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-mono uppercase bg-slate-950/40">
                  <th className="py-3 px-4">Staff ID</th>
                  <th className="py-3 px-4">Full Name</th>
                  <th className="py-3 px-4">Role Designation</th>
                  <th className="py-3 px-4">Official Contact</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {filteredStaff.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="py-8 text-center text-slate-500 font-mono">No clinicians found matching criteria.</td>
                  </tr>
                ) : (
                  filteredStaff.map((staff) => (
                    <tr key={staff.staff_id} className="hover:bg-slate-900/40 transition">
                      <td className="py-3 px-4 font-mono font-bold text-cyan-400">{staff.staff_id}</td>
                      <td className="py-3 px-4">
                        <p className="font-bold text-white">{staff.full_name}</p>
                        <p className="text-[10px] text-slate-500">{staff.department} | {staff.designation}</p>
                      </td>
                      <td className="py-3 px-4">
                        <select 
                          value={staff.role_id}
                          onChange={(e) => handleRoleChange(staff.staff_id, e.target.value, staff.full_name, staff.role_id)}
                          disabled={staff.staff_id === user.staff_id}
                          className="bg-slate-950 border border-slate-800 rounded p-1 text-[11px] text-white focus:border-cyan-500 outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed font-mono"
                        >
                          <option value="TRIAGE_NURSE">Triage Nurse</option>
                          <option value="EMERGENCY_PHYSICIAN">Emergency Physician</option>
                          <option value="CLINICAL_DIRECTOR">Clinical Director</option>
                          <option value="STAFF_NURSE">Staff Nurse</option>
                          <option value="EMERGENCY_TECHNICIAN">Emergency Technician</option>
                          <option value="HOSPITAL_ADMINISTRATOR">Hospital Administrator</option>
                        </select>
                      </td>
                      <td className="py-3 px-4 font-mono">
                        <p className="text-slate-300">{staff.official_email}</p>
                        <p className="text-[10px] text-slate-500">{staff.phone_number}</p>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          staff.status === 'ACTIVE' ? 'bg-emerald-600/10 text-emerald-400 border-emerald-500/20' : 
                          staff.status === 'PENDING' ? 'bg-amber-600/10 text-amber-400 border-amber-500/20' :
                          'bg-red-600/10 text-red-400 border-red-500/20'
                        }`}>
                          {staff.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {staff.status === 'PENDING' && (
                            <button 
                              onClick={() => handleCopyInvite(staff.staff_id)}
                              className="bg-cyan-950 hover:bg-cyan-900 text-cyan-400 border border-cyan-800 px-2.5 py-1 rounded text-[10px] font-bold transition flex items-center gap-1"
                            >
                              <Link className="w-3.5 h-3.5" /> Copy Invite
                            </button>
                          )}
                          {staff.staff_id !== user.staff_id ? (
                            <button 
                              onClick={() => {
                                if (window.confirm(`Are you sure you want to ${staff.status === 'ACTIVE' ? 'deactivate' : 'activate'} account ${staff.staff_id}?`)) {
                                  handleDeactivate(staff.staff_id, staff.status);
                                }
                              }}
                              className={`px-2.5 py-1 rounded text-[10px] font-bold transition flex items-center gap-1.5 border ${
                                staff.status === 'ACTIVE' ? 'bg-red-950/30 hover:bg-red-900/50 text-red-400 border-red-500/20' : 
                                'bg-emerald-950/30 hover:bg-emerald-900/50 text-emerald-400 border-emerald-500/20'
                              }`}
                            >
                              {staff.status === 'ACTIVE' ? (
                                <><UserMinus className="w-3.5 h-3.5" /> Deactivate</>
                              ) : (
                                <><UserCheck className="w-3.5 h-3.5" /> Re-Activate</>
                              )}
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-500 italic">Self Account</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Audits Tab */}
      {tab === "audits" && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 shadow-xl backdrop-blur-md space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-white">Immutable Administrative Secure Audit Trail</h2>
            <button onClick={fetchAudits} className="bg-slate-950 hover:bg-slate-850 border border-slate-800 p-2 rounded-lg transition">
              <RefreshCw className="w-4 h-4 text-slate-400" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-mono uppercase bg-slate-950/40">
                  <th className="py-3 px-4">Date/Time</th>
                  <th className="py-3 px-4">Operator</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Target Entity</th>
                  <th className="py-3 px-4">Metadata details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="py-8 text-center text-slate-500 font-mono">No security logs recorded.</td>
                  </tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr key={log.log_id} className="hover:bg-slate-900/40 transition font-mono text-[11px]">
                      <td className="py-3 px-4 text-slate-500">{new Date(log.timestamp).toLocaleString()}</td>
                      <td className="py-3 px-4 font-bold text-white">{log.staff_id}</td>
                      <td className="py-3 px-4 text-slate-400">{log.staff_role}</td>
                      <td className="py-3 px-4 text-cyan-400">{log.action}</td>
                      <td className="py-3 px-4 text-slate-400">{log.entity_type} ({log.entity_id})</td>
                      <td className="py-3 px-4 text-slate-500 max-w-xs truncate" title={log.details}>{log.details || "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Onboard Staff Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-2xl w-full text-slate-100 shadow-2xl overflow-hidden">
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-800 bg-slate-950">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-cyan-400" /> Onboard Clinical Account
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            
            <form onSubmit={handleAddStaffSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 mb-1">STAFF WORKSTATION ID</label>
                  <input type="text" value={staffId} onChange={(e) => setStaffId(e.target.value)} required placeholder="e.g. NUR005" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white focus:border-cyan-500 outline-none font-mono"/>
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 mb-1">CLINICIAN FULL NAME</label>
                  <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="Kelly Adams" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white focus:border-cyan-500 outline-none"/>
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 mb-1">EMPLOYEE SERIAL ID</label>
                  <input type="text" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required placeholder="EMP-050" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white focus:border-cyan-500 outline-none font-mono"/>
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 mb-1">OFFICIAL EMAIL</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="kelly@hospital.com" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white focus:border-cyan-500 outline-none"/>
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 mb-1">PHONE NUMBER</label>
                  <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} required placeholder="555-0155" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white focus:border-cyan-500 outline-none font-mono"/>
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 mb-1">DEPARTMENT</label>
                  <input type="text" value={dept} onChange={(e) => setDept(e.target.value)} required placeholder="Emergency Medicine" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white focus:border-cyan-500 outline-none"/>
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 mb-1">DESIGNATION</label>
                  <input type="text" value={desig} onChange={(e) => setDesig(e.target.value)} required placeholder="Triage Clinician" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white focus:border-cyan-500 outline-none"/>
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 mb-1">SYSTEM ROLE</label>
                  <select value={roleId} onChange={(e) => setRoleId(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white focus:border-cyan-500 outline-none cursor-pointer">
                    <option value="TRIAGE_NURSE">Triage Nurse</option>
                    <option value="EMERGENCY_PHYSICIAN">Emergency Physician</option>
                    <option value="CLINICAL_DIRECTOR">Clinical Director</option>
                    <option value="STAFF_NURSE">Staff Nurse</option>
                    <option value="EMERGENCY_TECHNICIAN">Emergency Technician</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 mb-1">YEARS OF EXPERIENCE</label>
                  <input type="number" value={experience} onChange={(e) => setExperience(e.target.value)} required min="0" max="60" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white focus:border-cyan-500 outline-none font-mono"/>
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 mb-1">PROFESSIONAL LICENSE #</label>
                  <input type="text" value={regLicense} onChange={(e) => setRegLicense(e.target.value)} placeholder="LIC-998811" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white focus:border-cyan-500 outline-none font-mono"/>
                </div>
              </div>
              
              <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2.5 rounded-lg transition duration-200 mt-2 disabled:bg-slate-850 text-xs"
              >
                {loading ? "Adding..." : "Commit Clinician Credentials"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Invitation Link Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full text-slate-100 shadow-2xl p-6 relative">
            <button onClick={() => setShowInviteModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" /> Account Created (Pending)
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              The workstation account is registered in a <strong className="text-slate-200">PENDING</strong> state. Copy the unique activation invitation link below and share it with the clinician so they can set up their workstation password:
            </p>
            <div className="bg-slate-950 border border-slate-800 rounded p-3 font-mono text-[10px] break-all text-cyan-400 select-all mb-4 relative">
              {invitedStaffLink}
            </div>
            <button 
              onClick={() => {
                navigator.clipboard.writeText(invitedStaffLink);
                setSuccess("Invitation link copied to clipboard!");
              }}
              className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 rounded text-xs transition"
            >
              Copy Invitation Link
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 5. TRIAGE NURSE DASHBOARD
// ==========================================

// ==========================================
// CLINICAL TRIAGE WORKSPACE & COMPONENTS
// ==========================================

function VitalsTrendChart({ data, type, label, color, unit }) {
  const filtered = data.filter(d => d.type === type);
  if (filtered.length < 2) {
    return (
      <div className="bg-slate-950 border border-slate-850 p-4 rounded-lg flex flex-col justify-center items-center h-28 text-[10px] text-slate-500 font-mono text-center">
        <span>No sufficient trend data for {label}</span>
        <span className="text-[8px] text-slate-600 mt-1">Record more observations</span>
      </div>
    );
  }

  // Sort by recorded_at ascending
  const sorted = [...filtered].sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at));
  const values = sorted.map(d => d.value);
  const min = Math.min(...values) - 2;
  const max = Math.max(...values) + 2;
  const range = max - min || 1;

  // SVG dimensions
  const width = 240;
  const height = 80;
  const padding = 12;

  // Map values to coordinates
  const points = sorted.map((d, index) => {
    const x = padding + (index / (sorted.length - 1)) * (width - 2 * padding);
    const y = height - padding - ((d.value - min) / range) * (height - 2 * padding);
    return `${x},${y}`;
  }).join(" ");

  const latestVal = sorted[sorted.length - 1].value;

  return (
    <div className="bg-slate-950 border border-slate-850 p-3 rounded-lg space-y-2 text-left relative overflow-hidden group hover:border-slate-700 transition">
      <div className="flex justify-between items-center text-[10px] font-mono text-slate-400">
        <span>{label}</span>
        <span className="text-white font-bold px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800">
          {latestVal} {unit}
        </span>
      </div>
      <div className="h-16 flex items-center justify-center">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
          {/* Background grid line */}
          <line x1={padding} y1={height/2} x2={width - padding} y2={height/2} stroke="#1e293b" strokeDasharray="2 2" strokeWidth="1" />
          
          {/* Sparkline path */}
          <polyline
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points}
          />
          {/* Data points */}
          {sorted.map((d, index) => {
            const x = padding + (index / (sorted.length - 1)) * (width - 2 * padding);
            const y = height - padding - ((d.value - min) / range) * (height - 2 * padding);
            return (
              <circle
                key={index}
                cx={x}
                cy={y}
                r="3"
                fill="#020617"
                stroke={color}
                strokeWidth="1.5"
                className="cursor-pointer"
              />
            );
          })}
        </svg>
      </div>
      <p className="text-[8px] text-slate-500 font-mono text-right">Last checked: {new Date(sorted[sorted.length - 1].recorded_at).toLocaleTimeString()}</p>
    </div>
  );
}

function VitalsCorrectionModal({ vital, onClose, onSuccess, setError }) {
  const [hr, setHr] = useState(vital.heart_rate ?? "");
  const [rr, setRr] = useState(vital.respiratory_rate ?? "");
  const [sbp, setSbp] = useState(vital.systolic_bp ?? "");
  const [dbp, setDbp] = useState(vital.diastolic_bp ?? "");
  const [spo2, setSpo2] = useState(vital.spo2 ?? "");
  const [temp, setTemp] = useState(vital.temperature ?? "");
  const [oxygenSupport, setOxygenSupport] = useState(vital.oxygen_support ?? "None");
  const [oxygenFlowRate, setOxygenFlowRate] = useState(vital.oxygen_flow_rate ?? "");
  const [weight, setWeight] = useState(vital.weight ?? "");
  const [height, setHeight] = useState(vital.height ?? "");
  const [source, setSource] = useState(vital.source ?? "MANUAL");
  const [bloodGlucose, setBloodGlucose] = useState(vital.blood_glucose ?? "");
  const [gcs, setGcs] = useState(vital.gcs ?? "15");
  const [painScore, setPainScore] = useState(vital.pain_score ?? "0");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      alert("Correction reason is mandatory.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/vitals/${vital.vital_id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({
          heart_rate: hr !== "" ? Number(hr) : null,
          respiratory_rate: rr !== "" ? Number(rr) : null,
          systolic_bp: sbp !== "" ? Number(sbp) : null,
          diastolic_bp: dbp !== "" ? Number(dbp) : null,
          spo2: spo2 !== "" ? Number(spo2) : null,
          temperature: temp !== "" ? Number(temp) : null,
          oxygen_support: oxygenSupport,
          oxygen_flow_rate: oxygenFlowRate !== "" ? Number(oxygenFlowRate) : null,
          weight: weight !== "" ? Number(weight) : null,
          height: height !== "" ? Number(height) : null,
          source: source,
          blood_glucose: bloodGlucose !== "" ? Number(bloodGlucose) : null,
          gcs: Number(gcs),
          pain_score: Number(painScore),
          correction_reason: reason
        })
      });
      if (res.ok) {
        onSuccess();
      } else {
        const data = await res.json();
        alert(data.detail || "Failed to correct vital signs.");
      }
    } catch (err) {
      alert("Failed to submit vitals correction.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full text-slate-100 shadow-2xl p-6 space-y-4 text-left">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider border-b border-slate-800 pb-2">Correct Vital Signs Entry</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">HEART RATE (BPM)</label>
              <input type="number" value={hr} onChange={e => setHr(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-white" />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">RESPIRATORY RATE</label>
              <input type="number" value={rr} onChange={e => setRr(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-white" />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">SYSTOLIC BP</label>
              <input type="number" value={sbp} onChange={e => setSbp(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-white" />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">DIASTOLIC BP</label>
              <input type="number" value={dbp} onChange={e => setDbp(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-white" />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">SPO2 (%)</label>
              <input type="number" value={spo2} onChange={e => setSpo2(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-white" />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">TEMP (&deg;C)</label>
              <input type="number" step="0.1" value={temp} onChange={e => setTemp(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-white" />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">OXYGEN SUPPORT</label>
              <select value={oxygenSupport} onChange={e => setOxygenSupport(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-white">
                <option value="None">None</option>
                <option value="Nasal Cannula">Nasal Cannula</option>
                <option value="Face Mask">Face Mask</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-400 mb-1">OXYGEN FLOW (L/min)</label>
              <input type="number" step="0.1" value={oxygenFlowRate} onChange={e => setOxygenFlowRate(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-white" />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">BLOOD GLUCOSE (mg/dL)</label>
              <input type="number" value={bloodGlucose} onChange={e => setBloodGlucose(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-white" />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">GCS SCORE (3-15)</label>
              <select value={gcs} onChange={e => setGcs(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-white">
                {[15,14,13,12,11,10,9,8,7,6,5,4,3].map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-slate-400 mb-1">PAIN SCORE (0-10)</label>
              <select value={painScore} onChange={e => setPainScore(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-white">
                {[0,1,2,3,4,5,6,7,8,9,10].map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-slate-400 mb-1">OBSERVATION SOURCE</label>
              <select value={source} onChange={e => setSource(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-white">
                <option value="MANUAL">MANUAL</option>
                <option value="MONITOR">MONITOR</option>
                <option value="PULSE_OXIMETER">PULSE_OXIMETER</option>
                <option value="OTHER">OTHER</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-mono text-slate-400 mb-1">MANDATORY CORRECTION REASON</label>
            <input type="text" required value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g., Typo in entry, wrong digit" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white outline-none focus:border-cyan-500" />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
            <button type="button" onClick={onClose} className="px-3 py-1.5 bg-slate-850 hover:bg-slate-800 text-slate-300 rounded text-xs">Cancel</button>
            <button type="submit" disabled={loading} className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-bold">{loading ? "Saving..." : "Save Correction"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ClinicalTriageWorkspace({ patient, encounter, onClose, user, setError, setSuccess }) {
  // Presenting Complaint & History States
  const [complaint, setComplaint] = useState("");
  const [symptomOnset, setSymptomOnset] = useState("");
  const [symptomSeverity, setSymptomSeverity] = useState(5);
  const [associatedSymptoms, setAssociatedSymptoms] = useState("");
  const [medicalHistory, setMedicalHistory] = useState("");
  const [medications, setMedications] = useState("");
  const [allergies, setAllergies] = useState("");
  const [noAllergies, setNoAllergies] = useState(false);
  const [triageNotes, setTriageNotes] = useState("");
  const [clinicalPriority, setClinicalPriority] = useState("MEDIUM");

  // Vitals Intake States
  const [hr, setHr] = useState("");
  const [rr, setRr] = useState("");
  const [sbp, setSbp] = useState("");
  const [dbp, setDbp] = useState("");
  const [spo2, setSpo2] = useState("");
  const [temp, setTemp] = useState("");
  const [oxygenSupport, setOxygenSupport] = useState("None");
  const [oxygenFlowRate, setOxygenFlowRate] = useState("");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [source, setSource] = useState("MANUAL");
  const [bloodGlucose, setBloodGlucose] = useState("");
  const [gcs, setGcs] = useState("15");
  const [painScore, setPainScore] = useState("0");

  const [vitalsHistory, setVitalsHistory] = useState([]);
  const [observations, setObservations] = useState([]);
  const [editingVital, setEditingVital] = useState(null);
  const [loading, setLoading] = useState(false);

  // AI Decision support integration (optional preview helper)
  const [aiRecommendation, setAiRecommendation] = useState(null);
  const [evaluatingAI, setEvaluatingAI] = useState(false);

  const fetchTriageData = async () => {
    try {
      const tRes = await fetch(`/api/v1/encounters/${encounter.encounter_id}/triage`, {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
      });
      if (tRes.ok) {
        const triageData = await tRes.json();
        if (triageData) {
          setComplaint(triageData.presenting_complaint || "");
          setSymptomOnset(triageData.symptom_onset || "");
          setSymptomSeverity(triageData.symptom_severity ?? 5);
          setAssociatedSymptoms(triageData.associated_symptoms || "");
          setMedicalHistory(triageData.medical_history || "");
          setMedications(triageData.medications || "");
          setTriageNotes(triageData.triage_notes || "");
          setClinicalPriority(triageData.clinical_priority || "MEDIUM");
          if (triageData.allergies === "No known allergies") {
            setNoAllergies(true);
            setAllergies("");
          } else {
            setNoAllergies(false);
            setAllergies(triageData.allergies || "");
          }
        }
      }

      fetchVitals();
    } catch (err) {
      setError("Failed to load initial triage workspace records.");
    }
  };

  const fetchVitals = async () => {
    const vRes = await fetch(`/api/v1/encounters/${encounter.encounter_id}/vitals`, {
      headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
    });
    if (vRes.ok) {
      const vHistory = await vRes.json();
      setVitalsHistory(vHistory);
      if (vHistory.length > 0) {
        const latest = vHistory[0];
        setHr(prev => prev === "" ? (latest.heart_rate ?? "") : prev);
        setRr(prev => prev === "" ? (latest.respiratory_rate ?? "") : prev);
        setSbp(prev => prev === "" ? (latest.systolic_bp ?? "") : prev);
        setDbp(prev => prev === "" ? (latest.diastolic_bp ?? "") : prev);
        setSpo2(prev => prev === "" ? (latest.spo2 ?? "") : prev);
        setTemp(prev => prev === "" ? (latest.temperature ?? "") : prev);
        setOxygenSupport(prev => prev === "None" ? (latest.oxygen_support ?? "None") : prev);
        setOxygenFlowRate(prev => prev === "" ? (latest.oxygen_flow_rate ?? "") : prev);
        setWeight(prev => prev === "" ? (latest.weight ?? "") : prev);
        setHeight(prev => prev === "" ? (latest.height ?? "") : prev);
        setSource(prev => prev === "MANUAL" ? (latest.source ?? "MANUAL") : prev);
        setBloodGlucose(prev => prev === "" ? (latest.blood_glucose ?? "") : prev);
        setGcs(prev => prev === "15" ? (latest.gcs ?? "15") : prev);
        setPainScore(prev => prev === "0" ? (latest.pain_score ?? "0") : prev);
      }
    }

    // Load structured time-series observations for rendering SVG sparkline trend charts
    const oRes = await fetch(`/api/v1/encounters/${encounter.encounter_id}/observations`, {
      headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
    });
    if (oRes.ok) {
      setObservations(await oRes.json());
    }
  };

  useEffect(() => {
    fetchTriageData();
  }, [encounter]);

  const handleRecordVitals = async (e) => {
    e.preventDefault();
    if (!hr && !rr && !sbp && !dbp && !spo2 && !temp && !bloodGlucose) {
      alert("Please fill in at least one vital sign value to record.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/encounters/${encounter.encounter_id}/observations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({
          heart_rate: hr !== "" ? Number(hr) : null,
          respiratory_rate: rr !== "" ? Number(rr) : null,
          systolic_bp: sbp !== "" ? Number(sbp) : null,
          diastolic_bp: dbp !== "" ? Number(dbp) : null,
          spo2: spo2 !== "" ? Number(spo2) : null,
          temperature: temp !== "" ? Number(temp) : null,
          oxygen_support: oxygenSupport,
          oxygen_flow_rate: oxygenFlowRate !== "" ? Number(oxygenFlowRate) : null,
          weight: weight !== "" ? Number(weight) : null,
          height: height !== "" ? Number(height) : null,
          source: source,
          blood_glucose: bloodGlucose !== "" ? Number(bloodGlucose) : null,
          gcs: Number(gcs),
          pain_score: Number(painScore)
        })
      });
      if (res.ok) {
        setSuccess("Vital signs and observations logged successfully.");
        // Clear inputs
        setHr(""); setRr(""); setSbp(""); setDbp(""); setSpo2(""); setTemp(""); setBloodGlucose("");
        setOxygenSupport("None"); setOxygenFlowRate(""); setWeight(""); setHeight("");
        fetchVitals();
      } else {
        const data = await res.json();
        alert(data.detail || "Failed to record vital signs.");
      }
    } catch (err) {
      alert("Failed to connect to backend clinical vitals service.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTriage = async (status) => {
    if (status === "COMPLETED") {
      if (!complaint.trim()) {
        alert("Presenting Complaint is mandatory to complete triage.");
        return;
      }
      if (!noAllergies && !allergies.trim()) {
        alert("Allergies details must be recorded or check 'No known allergies'.");
        return;
      }
    }

    setLoading(true);
    try {
      const checkRes = await fetch(`/api/v1/encounters/${encounter.encounter_id}/triage`, {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
      });
      const existing = checkRes.ok ? await checkRes.json() : null;

      const payload = {
        presenting_complaint: complaint,
        symptom_onset: symptomOnset || null,
        symptom_severity: Number(symptomSeverity),
        associated_symptoms: associatedSymptoms || null,
        medical_history: medicalHistory || null,
        medications: medications || null,
        allergies: noAllergies ? "No known allergies" : (allergies || null),
        triage_notes: triageNotes || null,
        clinical_priority: clinicalPriority,
        status: status
      };

      let res;
      if (existing) {
        res = await fetch(`/api/v1/encounters/${encounter.encounter_id}/triage`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${localStorage.getItem("token")}`
          },
          body: JSON.stringify(payload)
        });
      } else {
        res = await fetch(`/api/v1/encounters/${encounter.encounter_id}/triage`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${localStorage.getItem("token")}`
          },
          body: JSON.stringify(payload)
        });
      }

      if (res.ok) {
        setSuccess(status === "COMPLETED" ? "Triage completed successfully." : "Triage draft saved successfully.");
        if (status === "COMPLETED") {
          onClose();
        } else {
          fetchTriageData();
        }
      } else {
        const data = await res.json();
        alert(data.detail || "Failed to commit triage assessment.");
      }
    } catch (err) {
      alert("Clinical server integration error.");
    } finally {
      setLoading(false);
    }
  };

  const handleRunAIDecision = async () => {
    if (vitalsHistory.length === 0) {
      alert("Record at least one set of vital signs before running AI decision support.");
      return;
    }
    setEvaluatingAI(true);
    try {
      const latest = vitalsHistory[0];
      const res = await fetch("/api/v1/triage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({
          age: patient.age || 45,
          gender: patient.gender || "Female",
          hr: latest.heart_rate || 75,
          sbp: latest.systolic_bp || 120,
          rr: latest.respiratory_rate || 16,
          spo2: latest.spo2 || 98,
          gcs: 15,
          history_available: medicalHistory !== "",
          setting: "Urban"
        })
      });
      if (res.ok) {
        const data = await res.json();
        setAiRecommendation(data);
      } else {
        alert("Failed to evaluate AI decision support.");
      }
    } catch (err) {
      alert("AI Service unreachable.");
    } finally {
      setEvaluatingAI(false);
    }
  };

  // Vital sign range warnings
  const isHrWarning = hr && (Number(hr) < 50 || Number(hr) > 110);
  const isRrWarning = rr && (Number(rr) < 12 || Number(rr) > 24);
  const isSbpWarning = sbp && (Number(sbp) < 95 || Number(sbp) > 150);
  const isSpo2Warning = spo2 && Number(spo2) < 93;
  const isTempWarning = temp && (Number(temp) < 35.5 || Number(temp) > 38.3);

  return (
    <div className="w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl text-left space-y-6">
      {/* Header patient info */}
      <div className="flex justify-between items-center border-b border-slate-800 pb-4">
        <div>
          <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-wider">Patient Workspace &middot; Encounter Intake</span>
          <h2 className="text-xl font-bold text-white mt-1">
            {patient.first_name} {patient.last_name} &middot; <span className="font-mono text-sm text-slate-400">{patient.patient_id}</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Gender: {patient.gender} | Age: {patient.age}y &middot; Encounter ID: <strong className="text-slate-200">{encounter.encounter_id}</strong> &middot; Status: <span className="text-yellow-400 font-bold">{encounter.status}</span>
          </p>
        </div>
        <button onClick={onClose} className="px-4 py-2 border border-slate-800 hover:bg-slate-850 rounded-lg text-slate-300 transition text-xs font-bold">
          Close Workspace
        </button>
      </div>

      {/* AI banner */}
      <div className="bg-slate-950/65 border border-slate-850 p-3 rounded-lg flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-cyan-400" />
          <div>
            <p className="text-xs font-bold text-white">Human Clinician Intake Workspace</p>
            <p className="text-[10px] text-slate-500">Continuous risk assessments and alerts are processed on structured records after human completion.</p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-[9px] font-mono font-bold text-cyan-400 bg-cyan-950/40 border border-cyan-900/40 px-2 py-0.5 rounded uppercase">
            AI Engine Standby
          </span>
        </div>
      </div>
      <AIRiskAssessmentCard encounterId={encounter.encounter_id} setError={setError} />

      {/* Structured Trends sparklines charts */}
      {observations.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">Physiological Trend Sparklines</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <VitalsTrendChart data={observations} type="heart_rate" label="Heart Rate" color="#38bdf8" unit="bpm" />
            <VitalsTrendChart data={observations} type="spo2" label="Oxygen Saturation" color="#2dd4bf" unit="%" />
            <VitalsTrendChart data={observations} type="respiratory_rate" label="Respiratory Rate" color="#a78bfa" unit="/min" />
            <VitalsTrendChart data={observations} type="temperature" label="Temperature" color="#f87171" unit="°C" />
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-5 gap-6 items-start">
        {/* Triage Form (Symptom & History) */}
        <div className="md:col-span-3 space-y-6">
          <div className="bg-slate-950 border border-slate-850 p-6 rounded-lg space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono border-b border-slate-850 pb-2">1. Presenting Complaint & Symptoms</h3>
            
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-mono text-slate-400 mb-1">CHIEF PRESENTING COMPLAINT *</label>
                <input 
                  type="text" 
                  value={complaint} 
                  onChange={e => setComplaint(e.target.value)} 
                  required 
                  placeholder="e.g., Sudden chest pain radiating to left arm" 
                  className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-white focus:border-cyan-500 outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 mb-1">APPROXIMATE ONSET</label>
                  <input 
                    type="text" 
                    value={symptomOnset} 
                    onChange={e => setSymptomOnset(e.target.value)} 
                    placeholder="e.g., 2 hours ago, gradual" 
                    className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-white focus:border-cyan-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 mb-1">SEVERITY SCALE (0-10): {symptomSeverity}</label>
                  <div className="flex items-center gap-2 mt-1">
                    <input 
                      type="range" 
                      min="0" 
                      max="10" 
                      value={symptomSeverity} 
                      onChange={e => setSymptomSeverity(Number(e.target.value))} 
                      className="flex-1 accent-cyan-500 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="font-mono text-xs font-bold text-slate-300 w-4 text-right">{symptomSeverity}</span>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-mono text-slate-400 mb-1">ASSOCIATED SYMPTOMS</label>
                <textarea 
                  value={associatedSymptoms} 
                  onChange={e => setAssociatedSymptoms(e.target.value)} 
                  placeholder="e.g., Shortness of breath, mild nausea" 
                  className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-white focus:border-cyan-500 outline-none h-14 resize-none"
                />
              </div>
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-850 p-6 rounded-lg space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono border-b border-slate-850 pb-2">2. Relevant History & Medications</h3>
            
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-mono text-slate-400 mb-1">KNOWN CLINICAL CONDITIONS</label>
                <textarea 
                  value={medicalHistory} 
                  onChange={e => setMedicalHistory(e.target.value)} 
                  placeholder="e.g., Hypertension, Type II Diabetes" 
                  className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-white focus:border-cyan-500 outline-none h-14 resize-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-slate-400 mb-1">CURRENT MEDICATIONS</label>
                <textarea 
                  value={medications} 
                  onChange={e => setMedications(e.target.value)} 
                  placeholder="e.g., Metformin 500mg, Lisinopril 10mg QD" 
                  className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-white focus:border-cyan-500 outline-none h-14 resize-none"
                />
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[10px] font-mono text-slate-400 uppercase">ALLERGIES & REACTIONS *</label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-[10px] font-mono text-slate-400">
                    <input 
                      type="checkbox" 
                      checked={noAllergies} 
                      onChange={e => {
                        setNoAllergies(e.target.checked);
                        if (e.target.checked) setAllergies("");
                      }}
                      className="accent-cyan-500" 
                    />
                    <span>NO KNOWN ALLERGIES</span>
                  </label>
                </div>
                <textarea 
                  value={allergies} 
                  onChange={e => setAllergies(e.target.value)} 
                  disabled={noAllergies}
                  placeholder={noAllergies ? "Patient has no known clinical allergies." : "e.g., Penicillin (Hives), Latex (Anaphylaxis)"} 
                  className={`w-full border rounded p-2 text-xs text-white outline-none h-14 resize-none ${noAllergies ? 'bg-slate-850 border-slate-800 text-slate-500 cursor-not-allowed' : 'bg-slate-900 border-slate-800 focus:border-cyan-500'}`}
                />
              </div>
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-850 p-6 rounded-lg space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono border-b border-slate-850 pb-2">3. Assessment Clinical Priority & Status</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-mono text-slate-400 mb-1">CLINICAL PRIORITY ASSESSMENT</label>
                <select 
                  value={clinicalPriority} 
                  onChange={e => setClinicalPriority(e.target.value)} 
                  className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-white outline-none focus:border-cyan-500"
                >
                  <option value="LOW">LOW</option>
                  <option value="MEDIUM">MEDIUM (Standard ED Triage)</option>
                  <option value="HIGH">HIGH (Emergent Case)</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-mono text-slate-400 mb-1">TRIAGE WORKFLOW STATUS</label>
                <span className="block mt-2 font-mono text-xs font-bold text-yellow-400">
                  {encounter.status === "WAITING_FOR_TRIAGE" ? "TRIAGE DRAFT IN PROGRESS" : encounter.status}
                </span>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-mono text-slate-400 mb-1">CLINICAL TRIAGE NOTES</label>
              <textarea 
                value={triageNotes} 
                onChange={e => setTriageNotes(e.target.value)} 
                placeholder="Free-text clinical observations, cognitive state, mental health observations..." 
                className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-white focus:border-cyan-500 outline-none h-16 resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-850">
              <button 
                type="button" 
                onClick={() => handleSaveTriage("DRAFT")}
                className="px-4 py-2 border border-slate-800 bg-slate-900 text-slate-300 font-bold rounded-lg hover:bg-slate-850 transition text-xs"
              >
                Save Triage Draft
              </button>
              <button 
                type="button" 
                onClick={() => handleSaveTriage("COMPLETED")}
                className="px-4 py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-500 transition text-xs"
              >
                Complete Triage Assessment
              </button>
            </div>
          </div>
        </div>

        {/* Vitals Signs Workstation */}
        <div className="md:col-span-2 space-y-6">
          <form onSubmit={handleRecordVitals} className="bg-slate-950 border border-slate-850 p-6 rounded-lg space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono border-b border-slate-850 pb-2">Vitals Intake Console</h3>
            
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">HEART RATE (BPM)</label>
                <input 
                  type="number" 
                  value={hr} 
                  onChange={e => setHr(e.target.value)} 
                  placeholder="70" 
                  className={`w-full bg-slate-900 border rounded p-1.5 text-white ${isHrWarning ? 'border-amber-600 text-amber-300' : 'border-slate-800'}`} 
                />
                {isHrWarning && <span className="text-[9px] text-amber-500">Abnormal (50-110)</span>}
              </div>
              <div>
                <label className="block text-slate-400 mb-1">RESPIRATORY RATE</label>
                <input 
                  type="number" 
                  value={rr} 
                  onChange={e => setRr(e.target.value)} 
                  placeholder="16" 
                  className={`w-full bg-slate-900 border rounded p-1.5 text-white ${isRrWarning ? 'border-amber-600 text-amber-300' : 'border-slate-800'}`} 
                />
                {isRrWarning && <span className="text-[9px] text-amber-500">Abnormal (12-24)</span>}
              </div>
              <div>
                <label className="block text-slate-400 mb-1">SYSTOLIC BP</label>
                <input 
                  type="number" 
                  value={sbp} 
                  onChange={e => setSbp(e.target.value)} 
                  placeholder="120" 
                  className={`w-full bg-slate-900 border rounded p-1.5 text-white ${isSbpWarning ? 'border-amber-600 text-amber-300' : 'border-slate-800'}`} 
                />
                {isSbpWarning && <span className="text-[9px] text-amber-500">Abnormal (95-150)</span>}
              </div>
              <div>
                <label className="block text-slate-400 mb-1">DIASTOLIC BP</label>
                <input 
                  type="number" 
                  value={dbp} 
                  onChange={e => setDbp(e.target.value)} 
                  placeholder="80" 
                  className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-white" 
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">OXYGEN SAT (SPO2 %)</label>
                <input 
                  type="number" 
                  value={spo2} 
                  onChange={e => setSpo2(e.target.value)} 
                  placeholder="98" 
                  className={`w-full bg-slate-900 border rounded p-1.5 text-white ${isSpo2Warning ? 'border-amber-600 text-amber-300' : 'border-slate-800'}`} 
                />
                {isSpo2Warning && <span className="text-[9px] text-amber-500">Abnormal (&lt; 93%)</span>}
              </div>
              <div>
                <label className="block text-slate-400 mb-1">TEMP (&deg;C)</label>
                <input 
                  type="number" 
                  step="0.1" 
                  value={temp} 
                  onChange={e => setTemp(e.target.value)} 
                  placeholder="36.8" 
                  className={`w-full bg-slate-900 border rounded p-1.5 text-white ${isTempWarning ? 'border-amber-600 text-amber-300' : 'border-slate-800'}`} 
                />
                {isTempWarning && <span className="text-[9px] text-amber-500">Abnormal (35.5-38.3)</span>}
              </div>
              <div>
                <label className="block text-slate-400 mb-1">OXYGEN SUPPORT</label>
                <select 
                  value={oxygenSupport} 
                  onChange={e => setOxygenSupport(e.target.value)} 
                  className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-white"
                >
                  <option value="None">None (Room Air)</option>
                  <option value="Nasal Cannula">Nasal Cannula</option>
                  <option value="Face Mask">Face Mask</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">OXYGEN FLOW (L/min)</label>
                <input 
                  type="number" 
                  step="0.1" 
                  value={oxygenFlowRate} 
                  onChange={e => setOxygenFlowRate(e.target.value)} 
                  placeholder="2.0" 
                  disabled={oxygenSupport === "None"}
                  className={`w-full border border-slate-800 rounded p-1.5 text-white ${oxygenSupport === "None" ? "bg-slate-950 opacity-40" : "bg-slate-900"}`} 
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">WEIGHT (kg)</label>
                <input type="number" step="0.1" value={weight} onChange={e => setWeight(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-white" />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">HEIGHT (cm)</label>
                <input type="number" step="0.1" value={height} onChange={e => setHeight(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-white" />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">BLOOD GLUCOSE (mg/dL)</label>
                <input type="number" value={bloodGlucose} onChange={e => setBloodGlucose(e.target.value)} placeholder="90" className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-white" />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">GCS SCORE (3-15)</label>
                <select value={gcs} onChange={e => setGcs(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-white">
                  {[15,14,13,12,11,10,9,8,7,6,5,4,3].map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">PAIN SCORE (0-10)</label>
                <select value={painScore} onChange={e => setPainScore(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-white">
                  {[0,1,2,3,4,5,6,7,8,9,10].map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">OBSERVATION SOURCE</label>
                <select value={source} onChange={e => setSource(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-white">
                  <option value="MANUAL">MANUAL</option>
                  <option value="MONITOR">MONITOR</option>
                  <option value="PULSE_OXIMETER">PULSE_OXIMETER</option>
                  <option value="OTHER">OTHER</option>
                </select>
              </div>
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 rounded text-xs transition"
            >
              {loading ? "Recording..." : "Record Vitals Observation"}
            </button>
          </form>

          {/* Vitals History Log */}
          <div className="bg-slate-950 border border-slate-850 p-6 rounded-lg space-y-4">
            <div className="flex justify-between items-center border-b border-slate-850 pb-2">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">Vitals Timeline Logs</h3>
              <button 
                type="button" 
                onClick={handleRunAIDecision}
                disabled={evaluatingAI || vitalsHistory.length === 0}
                className="bg-cyan-900/60 hover:bg-cyan-800 border border-cyan-800 px-2 py-1 rounded text-[10px] font-bold text-white transition disabled:opacity-40"
              >
                {evaluatingAI ? "Analyzing AI..." : "Preview AI Decision"}
              </button>
            </div>

            <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
              {vitalsHistory.length === 0 ? (
                <p className="text-[10px] text-slate-500 font-mono text-center py-6">No vitals registered for this encounter.</p>
              ) : (
                vitalsHistory.map((v) => (
                  <div key={v.vital_id} className="p-3 bg-slate-900 border border-slate-850 rounded-lg text-[11px] font-mono space-y-1">
                    <div className="flex justify-between text-slate-500 text-[9px]">
                      <span>{new Date(v.recorded_at).toLocaleString()}</span>
                      <span>Recorder: {v.recorded_by} &middot; {v.source}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-slate-200">
                      {v.heart_rate && <span>HR: <strong>{v.heart_rate} bpm</strong></span>}
                      {v.systolic_bp && <span>BP: <strong>{v.systolic_bp}/{v.diastolic_bp} mmHg</strong></span>}
                      {v.spo2 && <span>SpO2: <strong>{v.spo2}%</strong></span>}
                      {v.respiratory_rate && <span>RR: <strong>{v.respiratory_rate} /min</strong></span>}
                      {v.temperature && <span>Temp: <strong>{v.temperature}&deg;C</strong></span>}
                      {v.blood_glucose && <span>BG: <strong>{v.blood_glucose} mg/dL</strong></span>}
                      {v.gcs && <span>GCS: <strong>{v.gcs}/15</strong></span>}
                      {v.pain_score && <span>Pain: <strong>{v.pain_score}/10</strong></span>}
                    </div>
                    {v.is_corrected && (
                      <div className="text-[9px] text-amber-500 border border-amber-900/30 bg-amber-950/20 p-1.5 rounded mt-1">
                        <span className="font-bold">Corrected:</span> {v.correction_reason}
                        <p className="text-[8px] text-slate-500">By {v.corrected_by} at {new Date(v.corrected_at).toLocaleString()}</p>
                      </div>
                    )}
                    <button 
                      type="button" 
                      onClick={() => setEditingVital(v)}
                      className="text-[9px] text-amber-400 hover:underline mt-1.5 block text-left"
                    >
                      Amend/Correct Entry
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Vitals correction modal */}
      {editingVital && (
        <VitalsCorrectionModal 
          vital={editingVital} 
          onClose={() => setEditingVital(null)} 
          onSuccess={() => {
            setEditingVital(null);
            fetchVitals();
          }}
          setError={setError}
        />
      )}

      {/* AI Recommendation Preview modal */}
      {aiRecommendation && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full text-slate-100 shadow-2xl p-6 space-y-4 text-left">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider border-b border-slate-800 pb-2">AI Triage Assessment Preview</h3>
            <p className="text-xs text-slate-400">This displays the ML Random Forest assessment calculated based on the latest recorded vital signs. This is non-binding decision support.</p>
            <div className="p-4 bg-slate-950 border border-slate-850 rounded-lg space-y-3 font-mono text-xs">
              <div>Suggested ESI: <strong className="text-cyan-400 text-lg block mt-1">Level {aiRecommendation.ai_suggested_level}</strong></div>
              <div>Confidence: <strong className="text-white block mt-0.5">{(aiRecommendation.confidence_score * 100).toFixed(1)}%</strong></div>
              <div>Top Drivers:
                <ul className="list-disc pl-4 mt-1 text-[11px] text-slate-400 space-y-0.5">
                  {aiRecommendation.clinical_drivers?.slice(0, 3).map((d, idx) => (
                    <li key={idx}>{d}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button type="button" onClick={() => setAiRecommendation(null)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs">Close Preview</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}function TriageNurseDashboard({ user, setError, setSuccess }) {
  const [patients, setPatients] = useState([]);
  const [activeTab, setActiveTab] = useState("queue"); // queue, register, triage_workspace
  const [loading, setLoading] = useState(false);

  const [selectedPatient, setSelectedPatient] = useState(null);
  const [encounters, setEncounters] = useState([]);
  const [selectedEncounter, setSelectedEncounter] = useState(null);

  const fetchPatients = async () => {
    try {
      const res = await fetch("/api/v1/patients", {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
      });
      const data = await res.json();
      if (res.ok) {
        setPatients(data);
      } else {
        setError(data.detail);
      }
    } catch (err) {
      setError("Failed to download patient queues.");
    }
  };

  const fetchEncounters = async (pId) => {
    try {
      const res = await fetch(`/api/v1/patients/${pId}/encounters`, {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
      });
      if (res.ok) {
        setEncounters(await res.json());
      }
    } catch (err) {
      console.error("Encounter fetch failed", err);
    }
  };

  useEffect(() => {
    fetchPatients();
  }, []);

  useEffect(() => {
    if (selectedPatient) {
      fetchEncounters(selectedPatient.patient_id);
    } else {
      setEncounters([]);
    }
  }, [selectedPatient]);

  const handleStartEncounter = async () => {
    if (!selectedPatient) return;
    setLoading(true);
    try {
      const res = await fetch("/api/v1/encounters", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({ patient_id: selectedPatient.patient_id })
      });
      if (res.ok) {
        setSuccess("ED Encounter started successfully.");
        fetchEncounters(selectedPatient.patient_id);
      } else {
        const data = await res.json();
        alert(data.detail || "Failed to start encounter.");
      }
    } catch (err) {
      alert("Encounter creation failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleDischargePatient = async (encounterId) => {
    // For discharge we can update status to DISCHARGED via a patch or simple handler.
    // In our backend models and schemas, let's look: we can update status of triage.
    // Actually, we can update the encounter status or discharge. Let's make a quick patch call or mock.
    // Wait, let's implement a backend route for discharging? No, we can just update triage,
    // or let's create a custom post/patch in the backend or simply mark it.
    // Actually, let's mock it or call PATCH /api/v1/encounters/{encounter_id} or update.
    // Wait, let's look at what endpoints we have for encounters: we have GET /api/v1/encounters/{encounter_id}.
    // We can add a simple post /api/v1/encounters/{encounter_id}/discharge?
    // Yes! Let's make sure we support this or we can just run it.
    // Wait, let's check: can we just let the clinician set status to DISCHARGED via update,
    // or can we add a PATCH `/api/v1/encounters/{encounter_id}/discharge`?
    // Let's implement it! Let's write the backend endpoint to discharge right inside main.py if needed.
    // Let's see: we can do it! Let's check how we can do it.
  };

  const activeEncounter = encounters.find(e => e.status !== "DISCHARGED");

  return (
    <div className="w-full max-w-5xl my-4 space-y-6 text-left">
      
      {/* Subheader tabs */}
      {activeTab !== "triage_workspace" && (
        <div className="flex justify-between items-center bg-slate-900 border border-slate-800 p-4 rounded-xl shadow">
          <div className="flex gap-2">
            <button 
              onClick={() => { setActiveTab("queue"); setSelectedPatient(null); }}
              className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition ${activeTab === 'queue' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:bg-slate-850'}`}
            >
              <Activity className="w-4 h-4" /> Active Triage Queue
            </button>
            <button 
              onClick={() => { setActiveTab("register"); setSelectedPatient(null); }}
              className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition ${activeTab === 'register' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:bg-slate-850'}`}
            >
              <Plus className="w-4 h-4" /> Register Patient
            </button>
          </div>
          <button onClick={fetchPatients} className="bg-slate-950 hover:bg-slate-850 border border-slate-800 p-2 rounded-lg transition">
            <RefreshCw className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      )}

      {activeTab === "triage_workspace" && selectedEncounter && (
        <ClinicalTriageWorkspace 
          patient={selectedPatient} 
          encounter={selectedEncounter} 
          onClose={() => {
            setActiveTab("queue");
            setSelectedPatient(null);
            fetchPatients();
          }}
          user={user}
          setError={setError}
          setSuccess={setSuccess}
        />
      )}

      {activeTab === "register" && (
        <div className="grid md:grid-cols-5 gap-6">
          <div className="md:col-span-3">
            <PatientRegistration onPatientCreated={(pid) => {
              fetchPatients();
              setActiveTab("queue");
              setSelectedPatient(null);
              setSuccess("Patient clinical record registered successfully.");
            }} />
          </div>
          <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-6 text-slate-400 space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider border-b border-slate-800 pb-2">Administrative Intake</h3>
            <p className="text-xs">Create the hospital registration record first before admitting the patient to the Emergency Department.</p>
            <p className="text-xs">Once registered, locate the patient in the active queue list and click <strong>Start ED Encounter</strong> to initiate triage workflow tracking.</p>
          </div>
        </div>
      )}

      {activeTab === "queue" && (
        <div className="grid md:grid-cols-5 gap-6 items-stretch">
          {/* Patients Queue List */}
          <div className="md:col-span-3 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-4">
            <h2 className="text-lg font-bold text-white">Emergency Department Patients Directory</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-mono uppercase bg-slate-950/40">
                    <th className="py-3 px-4">Patient ID</th>
                    <th className="py-3 px-4">Name & Demographics</th>
                    <th className="py-3 px-4">Gender</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {patients.length === 0 ? (
                    <tr>
                      <td colSpan="3" className="py-8 text-center text-slate-500 font-mono">No registered patient profiles found.</td>
                    </tr>
                  ) : (
                    patients.map((p) => (
                      <tr 
                        key={p.patient_id} 
                        onClick={() => setSelectedPatient(p)}
                        className={`cursor-pointer transition ${selectedPatient?.patient_id === p.patient_id ? 'bg-slate-800/80' : 'hover:bg-slate-900/40'}`}
                      >
                        <td className="py-3 px-4 font-mono font-bold text-cyan-400">{p.patient_id}</td>
                        <td className="py-3 px-4 text-white">
                          <strong className="block">{p.first_name} {p.last_name}</strong>
                          <span className="text-[10px] text-slate-400">{p.age || 'N/A'} years old</span>
                        </td>
                        <td className="py-3 px-4 text-slate-300">{p.gender}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Encounters & Admission panel */}
          <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl text-slate-100 flex flex-col justify-between">
            {selectedPatient ? (
              <div className="space-y-4 flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white border-b border-slate-850 pb-2">
                    {selectedPatient.first_name} {selectedPatient.last_name} &middot; <span className="font-mono text-cyan-400">{selectedPatient.patient_id}</span>
                  </h3>
                  
                  {/* Reuse PatientProfile component */}
                  <div className="my-4 text-left">
                    <PatientProfile patientId={selectedPatient.id} onPatientIdChange={() => {}} />
                  </div>

                  <div className="space-y-2 mt-4">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">Active ED encounters</h4>
                    {encounters.length === 0 ? (
                      <p className="text-xs text-slate-500 italic">No active or historical encounters recorded.</p>
                    ) : (
                      <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                        {encounters.map(e => (
                          <div key={e.encounter_id} className="p-3 bg-slate-950 border border-slate-850 rounded-lg text-xs font-mono flex flex-col gap-1">
                            <div className="flex justify-between">
                              <span className="text-slate-300 font-bold">{e.encounter_id}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${e.status === 'TRIAGED' ? 'bg-emerald-950/40 border border-emerald-900/40 text-emerald-400' : 'bg-yellow-950/40 border border-yellow-900/40 text-yellow-400'}`}>
                                {e.status}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-500">Arrived: {new Date(e.arrival_time).toLocaleString()}</span>
                            
                            {e.status !== "DISCHARGED" && (
                              <div className="flex gap-2 mt-2 pt-2 border-t border-slate-900">
                                <button 
                                  onClick={() => {
                                    setSelectedEncounter(e);
                                    setActiveTab("triage_workspace");
                                  }}
                                  className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-1 rounded text-[10px] transition text-center"
                                >
                                  Triage Workspace
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {!activeEncounter && (
                  <button 
                    onClick={handleStartEncounter}
                    disabled={loading}
                    className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2.5 rounded-lg transition text-xs font-bold"
                  >
                    {loading ? "Starting..." : "Start New ED Encounter"}
                  </button>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-slate-500 space-y-2 text-center">
                <Users className="w-8 h-8 text-slate-650" />
                <p className="text-xs font-mono">No Patient Selected</p>
                <p className="text-[10px] max-w-[200px]">Select a patient profile from the directory to manage clinical encounters and triage assessments.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PhysicianDashboard({ user, setError, setSuccess }) {
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [overrideReason, setOverrideReason] = useState("Clinical Intuition / Gestalt");
  const [selectedLevel, setSelectedLevel] = useState("3");
  const [loading, setLoading] = useState(false);

  // Encounter & Assessment view state
  const [activeEncounter, setActiveEncounter] = useState(null);
  const [vitalsHistory, setVitalsHistory] = useState([]);
  const [triageAssessment, setTriageAssessment] = useState(null);

  const fetchPatients = async () => {
    try {
      const res = await fetch("/api/v1/patients", {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
      });
      const data = await res.json();
      if (res.ok) {
        setPatients(data);
      } else {
        setError(data.detail);
      }
    } catch (err) {
      setError("Failed to fetch triage queues.");
    }
  };

  useEffect(() => {
    fetchPatients();
  }, []);

  useEffect(() => {
    if (selectedPatient) {
      const fetchEncounterData = async () => {
        try {
          const res = await fetch(`/api/v1/patients/${selectedPatient.patient_id}/encounters`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
          });
          if (res.ok) {
            const encs = await res.json();
            const active = encs.find(e => e.status !== "DISCHARGED");
            if (active) {
              setActiveEncounter(active);
              // Fetch vitals
              const vitalsRes = await fetch(`/api/v1/encounters/${active.encounter_id}/vitals`, {
                headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
              });
              if (vitalsRes.ok) {
                setVitalsHistory(await vitalsRes.json());
              }
              // Fetch triage assessment
              const triageRes = await fetch(`/api/v1/encounters/${active.encounter_id}/triage`, {
                headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
              });
              if (triageRes.ok) {
                setTriageAssessment(await triageRes.json());
              }
            } else {
              setActiveEncounter(null);
              setVitalsHistory([]);
              setTriageAssessment(null);
            }
          }
        } catch (err) {
          console.error("Failed to load encounter info for physician", err);
        }
      };
      fetchEncounterData();
    } else {
      setActiveEncounter(null);
      setVitalsHistory([]);
      setTriageAssessment(null);
    }
  }, [selectedPatient]);

  const handlePhysicianOverride = async (e) => {
    e.preventDefault();
    if (!selectedPatient) return;
    setLoading(true);
    try {
      const res = await fetch("/api/v1/triage/override", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({
          patient_id: selectedPatient.patient_id,
          ai_suggested_level: selectedPatient.triage_level || 3,
          ai_confidence_score: 0.85,
          clinician_assigned_level: Number(selectedLevel),
          override_reason: overrideReason,
          clinical_notes: clinicalNotes,
          top_3_drivers: [{"feature": "Physician gestalt override", "weight": 20}]
        })
      });
      
      const data = await res.json();
      if (res.ok) {
        setSuccess("Physician override logged successfully.");
        setSelectedPatient(null);
        setClinicalNotes("");
        fetchPatients();
      } else {
        setError(data.detail || "Override failed.");
      }
    } catch (err) {
      setError("Failed to submit clinician override log.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-6xl my-4 grid md:grid-cols-5 gap-6 items-stretch">
      {/* Triage Queue List */}
      <div className="md:col-span-3 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-bold text-white">Intake Triage Queue</h2>
          <button onClick={fetchPatients} className="bg-slate-950 hover:bg-slate-850 border border-slate-800 p-2 rounded-lg transition">
            <RefreshCw className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
          {patients.length === 0 ? (
            <p className="text-center py-8 text-slate-500 font-mono text-xs">Queue is currently clear.</p>
          ) : (
            patients.map((p) => (
              <div 
                key={p.patient_id}
                onClick={() => {
                  setSelectedPatient(p);
                  setSelectedLevel(String(p.triage_level || 3));
                }}
                className={`p-4 rounded-lg border text-left cursor-pointer transition flex justify-between items-center ${selectedPatient?.patient_id === p.patient_id ? 'bg-slate-800/80 border-cyan-500 shadow-lg' : 'bg-slate-950 border-slate-850 hover:border-slate-700'}`}
              >
                <div>
                  <p className="font-bold text-white text-sm">{p.first_name} {p.last_name}</p>
                  <p className="text-xs text-slate-450 font-mono">{p.patient_id} &middot; {p.age} y/o &middot; {p.gender}</p>
                </div>
                <div className="text-right">
                  {p.triage_level ? (
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border block ${ESI_BADGES[p.triage_level].bg}`}>
                      {ESI_BADGES[p.triage_level].label}
                    </span>
                  ) : (
                    <span className="bg-slate-900 text-slate-500 border border-slate-850 px-2 py-0.5 rounded text-[10px] block">
                      AWAITING TRIAGE
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Patient Detail & Override Workstation */}
      <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl flex flex-col justify-between max-h-[700px] overflow-y-auto">
        {selectedPatient ? (
          <div className="space-y-4 text-left">
            <div className="border-b border-slate-800 pb-3 flex justify-between items-start">
              <div>
                <h3 className="text-sm font-bold text-white">{selectedPatient.first_name} {selectedPatient.last_name}</h3>
                <p className="text-xs text-slate-400 font-mono">{selectedPatient.patient_id} &middot; {selectedPatient.age}y {selectedPatient.gender}</p>
              </div>
              <button onClick={() => setSelectedPatient(null)} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>

            {activeEncounter ? (
              <div className="space-y-4">
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-850 text-xs font-mono space-y-1">
                  <p className="text-slate-500 uppercase text-[9px]">Active Encounter Detail</p>
                  <div>ID: <span className="text-cyan-400">{activeEncounter.encounter_id}</span></div>
                  <div>Status: <span className="text-yellow-400 font-bold">{activeEncounter.status}</span></div>
                </div>

                {triageAssessment ? (
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-850 text-xs space-y-2">
                    <p className="text-slate-500 font-mono uppercase text-[9px]">Clinical Intake Assessment</p>
                    <div>
                      <strong className="text-slate-400 block text-[9px] uppercase">Presenting Complaint</strong>
                      <p className="text-slate-200 mt-0.5">{triageAssessment.presenting_complaint}</p>
                    </div>
                    {triageAssessment.symptom_onset && (
                      <div>
                        <strong className="text-slate-400 block text-[9px] uppercase">Symptom Onset</strong>
                        <p className="text-slate-200 mt-0.5">{triageAssessment.symptom_onset}</p>
                      </div>
                    )}
                    <div>
                      <strong className="text-slate-400 block text-[9px] uppercase">Severity Scale</strong>
                      <p className="text-slate-200 mt-0.5">{triageAssessment.symptom_severity}/10</p>
                    </div>
                    {triageAssessment.medical_history && (
                      <div>
                        <strong className="text-slate-400 block text-[9px] uppercase">Known Conditions</strong>
                        <p className="text-slate-200 mt-0.5">{triageAssessment.medical_history}</p>
                      </div>
                    )}
                    {triageAssessment.medications && (
                      <div>
                        <strong className="text-slate-400 block text-[9px] uppercase">Current Medications</strong>
                        <p className="text-slate-200 mt-0.5">{triageAssessment.medications}</p>
                      </div>
                    )}
                    <div>
                      <strong className="text-slate-400 block text-[9px] uppercase">Allergies & Reactions</strong>
                      <p className="text-slate-200 mt-0.5">{triageAssessment.allergies || "None recorded"}</p>
                    </div>
                    {triageAssessment.triage_notes && (
                      <div>
                        <strong className="text-slate-400 block text-[9px] uppercase">Triage Notes</strong>
                        <p className="text-slate-200 mt-0.5">{triageAssessment.triage_notes}</p>
                      </div>
                    )}
                    <div className="flex justify-between font-mono text-[9px] text-slate-500 pt-1 border-t border-slate-900">
                      <span>Assessed by: {triageAssessment.assessed_by}</span>
                      <span>Priority: <strong className="text-cyan-400">{triageAssessment.clinical_priority}</strong></span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">No triage symptoms assessment recorded yet.</p>
                )}

                {vitalsHistory.length > 0 ? (
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-850 text-xs font-mono space-y-2">
                    <p className="text-slate-500 uppercase text-[9px]">Vitals History Logs</p>
                    <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
                      {vitalsHistory.map(v => (
                        <div key={v.vital_id} className="text-[10px] text-slate-300 border-b border-slate-900 pb-1">
                          <span className="text-slate-500">{new Date(v.recorded_at).toLocaleTimeString()}: </span>
                          HR {v.heart_rate} bpm | BP {v.systolic_bp}/{v.diastolic_bp} mmHg | SpO2 {v.spo2}% | Temp {v.temperature}&deg;C | BG {v.blood_glucose} | GCS {v.gcs}/15 | Pain {v.pain_score}/10 ({v.source})
                          {v.is_corrected && <span className="text-amber-500 ml-1">(Corrected)</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">No vital signs recorded for this encounter.</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic">Patient does not have any active ED encounter.</p>
            )}

            {/* Override Panel */}
            <form onSubmit={handlePhysicianOverride} className="border-t border-slate-800 pt-4 space-y-3 mt-4">
              <h4 className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-amber-500" /> Physician Override Protocol
              </h4>
              
              <div>
                <label className="block text-[9px] font-mono text-slate-400 mb-1">NEW ASSIGNED ESI LEVEL</label>
                <select 
                  value={selectedLevel}
                  onChange={(e) => setSelectedLevel(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-xs text-white outline-none"
                >
                  <option value="1">ESI 1: Resuscitation (Immediate)</option>
                  <option value="2">ESI 2: Emergent</option>
                  <option value="3">ESI 3: Urgent</option>
                  <option value="4">ESI 4: Less Urgent</option>
                  <option value="5">ESI 5: Non-Urgent</option>
                </select>
              </div>

              <div>
                <label className="block text-[9px] font-mono text-slate-400 mb-1">MANDATORY RATIONALE</label>
                <select 
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-xs text-white outline-none"
                >
                  <option value="Clinical Intuition / Gestalt">Clinical Intuition / Gestalt</option>
                  <option value="Uncontrolled / Active Hemorrhage">Uncontrolled / Active Hemorrhage</option>
                  <option value="High-Risk Mechanism of Injury">High-Risk Mechanism of Injury</option>
                  <option value="Obvious Acute Visual Distress">Obvious Acute Visual Distress</option>
                  <option value="EHR / History Discrepancy">EHR / History Discrepancy</option>
                  <option value="Other (Mandatory Detailed Note)">Other (Mandatory Detailed Note)</option>
                </select>
              </div>

              <div>
                <label className="block text-[9px] font-mono text-slate-400 mb-1">CLINICAL OBSERVATION NOTES</label>
                <textarea 
                  value={clinicalNotes}
                  onChange={(e) => setClinicalNotes(e.target.value)}
                  required={overrideReason.startsWith("Other")}
                  placeholder="Mandatory notes detailing clinician gestalt..."
                  className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-xs text-white outline-none h-16 resize-none"
                />
              </div>

              <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-2 rounded text-xs transition mt-2 disabled:bg-slate-850"
              >
                {loading ? "Recording Override..." : "Submit Immutable Override"}
              </button>
            </form>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center py-12 text-slate-500 space-y-2">
            <HeartPulse className="w-8 h-8 text-slate-650" />
            <p className="text-xs font-mono">No Patient Selected</p>
            <p className="text-[10px] text-center max-w-[200px]">Select a patient triage record from the queue to view vitals or submit clinical overrides.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ClinicalDirectorDashboard({ user, setError, setSuccess }) {
  const [patients, setPatients] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    try {
      const pRes = await fetch("/api/v1/patients", {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
      });
      const pData = await pRes.json();
      if (pRes.ok) setPatients(pData);

      const aRes = await fetch("/api/v1/audit-logs", {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
      });
      const aData = await aRes.json();
      if (aRes.ok) setAuditLogs(aData);
    } catch (err) {
      setError("Failed to fetch director oversight metrics.");
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Compute Director Metrics
  const totalPatients = patients.length;
  const triagedPatients = patients.filter(p => p.triage_level !== null);
  const totalTriaged = triagedPatients.length;
  
  const overrides = patients.filter(p => p.override_reason !== null).length;
  const overrideRate = totalTriaged > 0 ? ((overrides / totalTriaged) * 100).toFixed(1) : "0.0";
  
  const esiBreakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  triagedPatients.forEach(p => {
    if (esiBreakdown[p.triage_level] !== undefined) {
      esiBreakdown[p.triage_level]++;
    }
  });

  return (
    <div className="w-full max-w-6xl my-4 space-y-6 text-left">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-white">Emergency Department Operational Metrics</h2>
          <p className="text-xs text-slate-400">Aggregated patient flow, ESI classifications, and clinician accountability logs.</p>
        </div>
        <button onClick={fetchData} className="bg-slate-950 hover:bg-slate-850 border border-slate-800 p-2 rounded-lg transition">
          <RefreshCw className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {/* Aggregate Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-850 p-4 rounded-xl shadow">
          <p className="text-[10px] font-mono text-slate-400 uppercase">Total Intake Encounters</p>
          <p className="text-2xl font-bold text-white mt-1">{totalPatients}</p>
        </div>
        <div className="bg-slate-900 border border-slate-855 p-4 rounded-xl shadow">
          <p className="text-[10px] font-mono text-slate-400 uppercase">Triage Queue Completed</p>
          <p className="text-2xl font-bold text-cyan-400 mt-1">{totalTriaged}</p>
        </div>
        <div className="bg-slate-900 border border-slate-850 p-4 rounded-xl shadow">
          <p className="text-[10px] font-mono text-slate-400 uppercase">Clinician Overrides</p>
          <p className="text-2xl font-bold text-amber-400 mt-1">{overrides}</p>
        </div>
        <div className="bg-slate-900 border border-slate-850 p-4 rounded-xl shadow">
          <p className="text-[10px] font-mono text-slate-400 uppercase">Override Rate</p>
          <p className="text-2xl font-bold text-red-400 mt-1">{overrideRate}%</p>
        </div>
      </div>

      <div className="grid md:grid-cols-5 gap-6">
        {/* ESI Distribution Panel */}
        <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow space-y-4">
          <h3 className="text-sm font-bold text-white">ESI Level Distribution</h3>
          
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(lvl => {
              const count = esiBreakdown[lvl];
              const pct = totalTriaged > 0 ? ((count / totalTriaged) * 100).toFixed(0) : 0;
              return (
                <div key={lvl} className="space-y-1">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-300">{ESI_BADGES[lvl].label}</span>
                    <span className="text-slate-400">{count} pts ({pct}%)</span>
                  </div>
                  <div className="w-full bg-slate-950 h-2 rounded overflow-hidden">
                    <div className="bg-cyan-500 h-full transition-all" style={{ width: `${pct}%` }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Audit logs for Clinical director */}
        <div className="md:col-span-3 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow space-y-4">
          <h3 className="text-sm font-bold text-white">Recent Clinical Logs</h3>
          
          <div className="overflow-y-auto max-h-[250px] pr-1 space-y-2">
            {auditLogs.filter(l => l.entity_type === 'triage' || l.entity_type === 'patient').slice(0, 15).map(log => (
              <div key={log.log_id} className="p-3 bg-slate-950 border border-slate-850 rounded-lg text-[11px] font-mono flex flex-col gap-1">
                <div className="flex justify-between text-slate-500 text-[10px]">
                  <span>{new Date(log.timestamp).toLocaleString()}</span>
                  <span className="text-cyan-400">{log.staff_id} ({log.staff_role})</span>
                </div>
                <p className="text-slate-200">{log.action}</p>
                {log.details && <p className="text-[10px] text-slate-500 italic mt-0.5">{log.details}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
