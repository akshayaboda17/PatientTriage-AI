import PatientProfile from './components/PatientProfile';
import PatientRegistration from './components/PatientRegistration';
import React, { useState, useEffect } from 'react';
import { 
  Activity, AlertTriangle, ShieldCheck, LogOut, Plus, Search, Filter, 
  RefreshCw, Key, Shield, User, Building, Heart, Check, X, ShieldAlert,
  UserMinus, UserCheck, AlertOctagon, Info, FileText, ChevronRight, CheckCircle,
  Link
} from 'lucide-react';
import TriageDecisionModal from './components/TriageModal';

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

        <div className="space-y-3">
          {queue.length === 0 ? (
            <p className="text-gray-400">Loading queue...</p>
          ) : (
            queue.map((patient, index) => (
              <div key={index} className={`p-4 rounded-lg border flex justify-between items-center ${getLevelColor(patient.triage_level)}`}>
                <div>
                  <h3 className="font-bold text-lg">{patient.patient_id}</h3>
                  <p className="text-sm opacity-80">{patient.age}y {patient.gender} • Status: {patient.status}</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black mb-1">L{patient.triage_level}</div>
                  <div className="text-sm flex items-center gap-1 justify-end opacity-80">
                    <Clock size={14} /> {patient.wait_time_mins}m waiting
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-2">
        <PatientRegistration onPatientCreated={setActivePatientId} />
        <PatientProfile key={activePatientId ?? 'empty-profile'} patientId={activePatientId} onPatientIdChange={setActivePatientId} />
      </div>

    </div>
  );
}

<<<<<<< HEAD
export default App
=======
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
function TriageNurseDashboard({ user, setError, setSuccess }) {
  const [patients, setPatients] = useState([]);
  const [activeTab, setActiveTab] = useState("list"); // list, intake
  const [loading, setLoading] = useState(false);

  // Triage Modal evaluation state
  const [modalRecommendation, setModalRecommendation] = useState(null);

  // Intake Form fields
  const [patientId, setPatientId] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("Female");
  const [arrivalMode, setArrivalMode] = useState("Ambulance");
  const [hr, setHr] = useState("");
  const [sbp, setSbp] = useState("");
  const [dbp, setDbp] = useState("");
  const [rr, setRr] = useState("");
  const [spo2, setSpo2] = useState("");
  const [temp, setTemp] = useState("");
  const [gcs, setGcs] = useState("15");
  const [painScore, setPainScore] = useState("0");
  const [hasHistory, setHasHistory] = useState(false);

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

  useEffect(() => {
    fetchPatients();
  }, []);

  const handleIntakeSubmit = async (e) => {
    e.preventDefault();
    if (!patientId || !age || !hr || !sbp || !dbp || !rr || !spo2 || !temp) {
      setError("Please fill all required diagnostic vitals.");
      return;
    }
    setLoading(true);
    setError("");

    try {
      // 1. Register patient record
      const regRes = await fetch("/api/v1/patients", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({
          patient_id: patientId,
          age: Number(age),
          gender,
          arrival_mode: arrivalMode,
          hr: Number(hr),
          sbp: Number(sbp),
          dbp: Number(dbp),
          rr: Number(rr),
          spo2: Number(spo2),
          temp: Number(temp),
          gcs: Number(gcs),
          pain_score: Number(painScore),
          history_available: hasHistory
        })
      });
      
      const regData = await regRes.json();
      if (!regRes.ok) {
        setError(regData.detail || "Patient registration failed.");
        setLoading(false);
        return;
      }

      // 2. Evaluate triage
      const triageRes = await fetch("/api/v1/triage", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({
          age: Number(age),
          gender,
          hr: Number(hr),
          sbp: Number(sbp),
          rr: Number(rr),
          spo2: Number(spo2),
          gcs: Number(gcs),
          history_available: hasHistory,
          setting: "Urban",
          facility_tier: 2,
          transit_time_mins: 30
        })
      });
      
      const triageData = await triageRes.json();
      if (triageRes.ok) {
        setModalRecommendation({
          patient_id: patientId,
          ai_suggested_level: triageData.ai_suggested_level,
          confidence_score: triageData.confidence_score,
          top_3_drivers: triageData.top_3_drivers
        });
      } else {
        setError(triageData.detail || "AI evaluation failed.");
      }
    } catch (err) {
      setError("Clinical server interface failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleTriageSuccess = () => {
    setModalRecommendation(null);
    setSuccess("Patient registered and AI triage validation committed successfully.");
    // Reset form
    setPatientId(""); setAge(""); setHr(""); setSbp(""); setDbp(""); setRr(""); setSpo2(""); setTemp(""); setGcs("15"); setPainScore("0"); setHasHistory(false);
    setActiveTab("list");
    fetchPatients();
  };

  return (
    <div className="w-full max-w-5xl my-4 space-y-6">
      
      {/* Subheader tabs */}
      <div className="flex justify-between items-center bg-slate-900 border border-slate-800 p-4 rounded-xl shadow">
        <div className="flex gap-2">
          <button 
            onClick={() => setActiveTab("list")}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition ${activeTab === 'list' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:bg-slate-850'}`}
          >
            <Activity className="w-4 h-4" /> Active Triage Queue
          </button>
          <button 
            onClick={() => setActiveTab("intake")}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition ${activeTab === 'intake' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:bg-slate-850'}`}
          >
            <Plus className="w-4 h-4" /> Patient Intake & Vitals
          </button>
        </div>
        <button onClick={fetchPatients} className="bg-slate-950 hover:bg-slate-850 border border-slate-800 p-2 rounded-lg transition">
          <RefreshCw className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {activeTab === "list" && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 shadow-xl backdrop-blur-md space-y-4">
          <h2 className="text-lg font-bold text-white">Emergency Department Triage Queue</h2>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-mono uppercase bg-slate-950/40">
                  <th className="py-3 px-4">Patient ID</th>
                  <th className="py-3 px-4">Demographics</th>
                  <th className="py-3 px-4">Vitals Summary</th>
                  <th className="py-3 px-4">ESI Triage Status</th>
                  <th className="py-3 px-4">Created At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {patients.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="py-8 text-center text-slate-500 font-mono">No patients currently waiting in triage queue.</td>
                  </tr>
                ) : (
                  patients.map((p) => (
                    <tr key={p.patient_id} className="hover:bg-slate-900/40 transition">
                      <td className="py-3 px-4 font-mono font-bold text-cyan-400">{p.patient_id}</td>
                      <td className="py-3 px-4 text-white">
                        {p.age} y/o | {p.gender}
                        <p className="text-[10px] text-slate-500">Mode: {p.arrival_mode}</p>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-300">
                        <div className="grid grid-cols-3 gap-x-2 gap-y-0.5 text-[10px]">
                          <span>HR: <strong className="text-white">{p.hr}</strong></span>
                          <span>BP: <strong className="text-white">{p.sbp}/{p.dbp}</strong></span>
                          <span>SpO2: <strong className={p.spo2 < 95 ? "text-red-400" : "text-white"}>{p.spo2}%</strong></span>
                          <span>RR: <strong className="text-white">{p.rr}</strong></span>
                          <span>T: <strong className="text-white">{p.temp}°C</strong></span>
                          <span>GCS: <strong className="text-white">{p.gcs}</strong></span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {p.triage_level ? (
                          <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold border ${ESI_BADGES[p.triage_level].bg}`}>
                            {ESI_BADGES[p.triage_level].label}
                          </span>
                        ) : (
                          <span className="bg-slate-950 text-slate-500 border border-slate-850 px-2 py-0.5 rounded text-[10px]">
                            UNASSIGNED (Awaiting MD)
                          </span>
                        )}
                        {p.override_reason && (
                          <p className="text-[9px] text-amber-400 mt-1">Clinician Override: {p.override_reason}</p>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-500 font-mono text-[10px]">
                        {new Date(p.created_at).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "intake" && (
        <form onSubmit={handleIntakeSubmit} className="bg-slate-900/60 border border-slate-800 rounded-xl p-8 shadow-xl backdrop-blur-md space-y-6">
          <div className="border-b border-slate-850 pb-4">
            <h2 className="text-lg font-bold text-white">Patient Diagnostics & Intake</h2>
            <p className="text-xs text-slate-400">Log patient vitals and trigger the clinical decision support ML model.</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {/* Demographics */}
            <div className="col-span-2 sm:col-span-2">
              <label className="block text-[10px] font-mono text-slate-400 mb-1">PATIENT IDENTIFIER (SYS CODE / GOVT ID)</label>
              <input type="text" value={patientId} onChange={(e) => setPatientId(e.target.value)} required placeholder="e.g. PT-2026-90" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white focus:border-cyan-500 outline-none"/>
            </div>
            <div>
              <label className="block text-[10px] font-mono text-slate-400 mb-1">AGE (YEARS)</label>
              <input type="number" step="0.1" value={age} onChange={(e) => setAge(e.target.value)} required placeholder="48" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white focus:border-cyan-500 outline-none"/>
            </div>
            <div>
              <label className="block text-[10px] font-mono text-slate-400 mb-1">GENDER</label>
              <select value={gender} onChange={(e) => setGender(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white focus:border-cyan-500 outline-none">
                <option value="Female">Female</option>
                <option value="Male">Male</option>
                <option value="Other">Other / Unknown</option>
              </select>
            </div>

            {/* Vitals */}
            <div>
              <label className="block text-[10px] font-mono text-slate-400 mb-1">HEART RATE (BPM)</label>
              <input type="number" value={hr} onChange={(e) => setHr(e.target.value)} required placeholder="75" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white focus:border-cyan-500 outline-none"/>
            </div>
            <div>
              <label className="block text-[10px] font-mono text-slate-400 mb-1">SYSTOLIC BP (mmHg)</label>
              <input type="number" value={sbp} onChange={(e) => setSbp(e.target.value)} required placeholder="120" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white focus:border-cyan-500 outline-none"/>
            </div>
            <div>
              <label className="block text-[10px] font-mono text-slate-400 mb-1">DIASTOLIC BP (mmHg)</label>
              <input type="number" value={dbp} onChange={(e) => setDbp(e.target.value)} required placeholder="80" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white focus:border-cyan-500 outline-none"/>
            </div>
            <div>
              <label className="block text-[10px] font-mono text-slate-400 mb-1">RESPIRATORY RATE</label>
              <input type="number" value={rr} onChange={(e) => setRr(e.target.value)} required placeholder="16" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white focus:border-cyan-500 outline-none"/>
            </div>
            <div>
              <label className="block text-[10px] font-mono text-slate-400 mb-1">SPO2 (%)</label>
              <input type="number" value={spo2} onChange={(e) => setSpo2(e.target.value)} required placeholder="98" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white focus:border-cyan-500 outline-none"/>
            </div>
            <div>
              <label className="block text-[10px] font-mono text-slate-400 mb-1">TEMPERATURE (&deg;C)</label>
              <input type="number" step="0.1" value={temp} onChange={(e) => setTemp(e.target.value)} required placeholder="36.8" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white focus:border-cyan-500 outline-none"/>
            </div>
            <div>
              <label className="block text-[10px] font-mono text-slate-400 mb-1">GLASGOW COMA SCORE</label>
              <select value={gcs} onChange={(e) => setGcs(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white focus:border-cyan-500 outline-none">
                {[15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3].map((val) => (
                  <option key={val} value={val}>{val} {val <= 8 ? "(Critical)" : ""}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-mono text-slate-400 mb-1">PAIN SCORE (0-10)</label>
              <select value={painScore} onChange={(e) => setPainScore(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white focus:border-cyan-500 outline-none">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((val) => (
                  <option key={val} value={val}>{val}</option>
                ))}
              </select>
            </div>

            {/* Other */}
            <div className="col-span-2">
              <label className="block text-[10px] font-mono text-slate-400 mb-1">ARRIVAL MODE</label>
              <select value={arrivalMode} onChange={(e) => setArrivalMode(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white focus:border-cyan-500 outline-none">
                <option value="Ambulance">Ambulance</option>
                <option value="Walk-in">Walk-in</option>
                <option value="Helicopter">Helicopter / Air Transport</option>
                <option value="Public Safety / Police">Public Safety / Police</option>
              </select>
            </div>

            <div className="col-span-2 flex items-center pt-5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={hasHistory} onChange={(e) => setHasHistory(e.target.checked)} className="accent-cyan-500"/>
                <span className="text-xs text-slate-300">Prior EHR Medical History Available</span>
              </label>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2.5 px-6 rounded-lg transition self-end flex items-center gap-2 disabled:bg-slate-850 text-xs"
          >
            <Activity className="w-4 h-4" /> {loading ? "Registering..." : "Register & Run AI Triage Recommendation"}
          </button>
        </form>
      )}

      {/* Triage Decision Modal */}
      {modalRecommendation && (
        <TriageDecisionModal 
          recommendation={modalRecommendation}
          staffId={user.staff_id}
          onClose={() => setModalRecommendation(null)}
          onSuccess={handleTriageSuccess}
        />
      )}
    </div>
  );
}

// ==========================================
// 6. EMERGENCY PHYSICIAN DASHBOARD
// ==========================================
function PhysicianDashboard({ user, setError, setSuccess }) {
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [overrideReason, setOverrideReason] = useState("Clinical Intuition / Gestalt");
  const [selectedLevel, setSelectedLevel] = useState("3");
  const [loading, setLoading] = useState(false);

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
          ai_suggested_level: selectedPatient.triage_level || 3, // Fallback if null
          ai_confidence_score: 0.85, // Mocked original AI score for override request
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

        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
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
                  <p className="font-bold text-white text-sm">{p.patient_id}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{p.age} y/o | {p.gender} | Pain: {p.pain_score}</p>
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
                  {p.override_reason && (
                    <span className="text-[9px] text-amber-400 font-mono mt-1 block">Overridden</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Patient Detail & Override Workstation */}
      <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl flex flex-col justify-between">
        {selectedPatient ? (
          <div className="space-y-6 flex-1 flex flex-col justify-between">
            <div>
              <div className="border-b border-slate-800 pb-3 flex justify-between items-start">
                <div>
                  <h3 className="text-sm font-mono text-cyan-400 font-bold">{selectedPatient.patient_id}</h3>
                  <p className="text-xs text-slate-400">{selectedPatient.age} y/o {selectedPatient.gender} | Mode: {selectedPatient.arrival_mode}</p>
                </div>
                <button onClick={() => setSelectedPatient(null)} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
              </div>

              {/* Vitals breakdown */}
              <div className="mt-4 grid grid-cols-3 gap-2 bg-slate-950 p-3 rounded-lg border border-slate-850 font-mono text-[10px] text-slate-300">
                <div>HR: <strong className="text-white block text-xs mt-0.5">{selectedPatient.hr} bpm</strong></div>
                <div>BP: <strong className="text-white block text-xs mt-0.5">{selectedPatient.sbp}/{selectedPatient.dbp}</strong></div>
                <div>SpO2: <strong className="text-white block text-xs mt-0.5">{selectedPatient.spo2}%</strong></div>
                <div className="mt-2">RR: <strong className="text-white block text-xs mt-0.5">{selectedPatient.rr} /min</strong></div>
                <div className="mt-2">Temp: <strong className="text-white block text-xs mt-0.5">{selectedPatient.temp}°C</strong></div>
                <div className="mt-2">GCS: <strong className="text-white block text-xs mt-0.5">{selectedPatient.gcs}/15</strong></div>
              </div>

              {/* Triage Info */}
              <div className="mt-4 p-3 bg-slate-950/40 border border-slate-850 rounded-lg text-xs space-y-1.5">
                <p className="text-slate-400 font-mono text-[10px] uppercase">Active Triage Assignment</p>
                <div className="flex justify-between items-center">
                  <span className="text-slate-300">Recommended ESI:</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${selectedPatient.triage_level ? ESI_BADGES[selectedPatient.triage_level].bg : 'bg-slate-900 text-slate-500'}`}>
                    {selectedPatient.triage_level ? ESI_BADGES[selectedPatient.triage_level].label : 'None'}
                  </span>
                </div>
                {selectedPatient.override_reason && (
                  <p className="text-amber-400 text-[10px] font-mono bg-amber-950/20 border border-amber-900/30 p-2 rounded mt-2">
                    <span className="font-bold">Override rationale:</span> {selectedPatient.override_reason}
                  </p>
                )}
              </div>
            </div>

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
            <Heart className="w-8 h-8 text-slate-650" />
            <p className="text-xs font-mono">No Patient Selected</p>
            <p className="text-[10px] text-center max-w-[200px]">Select a patient triage record from the queue to view vitals or submit clinical overrides.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// 7. CLINICAL DIRECTOR DASHBOARD
// ==========================================
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
>>>>>>> a86ffa9 (Implement core engine changes)
