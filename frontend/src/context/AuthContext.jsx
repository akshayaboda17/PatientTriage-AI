import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export const DEFAULT_STAFF_ACCOUNTS = [
  { staff_id: 'DOC001', name: 'Dr. Gregory House, MD', role: 'EMERGENCY_PHYSICIAN', hospital_id: 'DEMO001', role_label: 'Emergency Physician', email: 'dr.chen@demogeneral.org' },
  { staff_id: 'NUR001', name: 'Jackie Peyton, RN', role: 'TRIAGE_NURSE', hospital_id: 'DEMO001', role_label: 'Triage Nurse', email: 'nurse.sarah@demogeneral.org' },
  { staff_id: 'DIR001', name: 'Dr. James Wilson, MD', role: 'CLINICAL_DIRECTOR', hospital_id: 'DEMO001', role_label: 'Clinical Director', email: 'director@demogeneral.org' },
  { staff_id: 'ADMIN001', name: 'Sarah Connor, MHA', role: 'HOSPITAL_ADMIN', hospital_id: 'DEMO001', role_label: 'Hospital Admin', email: 'admin@demogeneral.org' },
  { staff_id: 'DOC002_METRO', name: 'Dr. Allison Cameron, MD', role: 'EMERGENCY_PHYSICIAN', hospital_id: 'METRO002', role_label: 'Emergency Physician (Metro)', email: 'cameron@metrohealth.org' }
];

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => localStorage.getItem('pt_access_token') || null);
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('pt_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [hospital, setHospital] = useState(() => {
    const saved = localStorage.getItem('pt_hospital');
    return saved ? JSON.parse(saved) : null;
  });
  const [permissions, setPermissions] = useState(() => {
    const saved = localStorage.getItem('pt_permissions');
    return saved ? JSON.parse(saved) : [];
  });
  const [hospitals, setHospitals] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [loading, setLoading] = useState(false);

  const isAuthenticated = Boolean(token && user);

  // Fetch Hospitals on startup
  useEffect(() => {
    fetchHospitals();
  }, []);

  const fetchHospitals = async () => {
    try {
      const res = await fetch('/api/hospitals');
      if (res.ok) {
        const data = await res.json();
        setHospitals(data.hospitals || []);
      }
    } catch (err) {
      console.error('Failed to load hospitals:', err);
    }
  };

  const login = async (staffId, password = 'password', hospitalId = 'DEMO001') => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_id: staffId.trim(),
          password: password,
          hospital_id: hospitalId
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Login failed. Please check your credentials.');
      }

      const data = await res.json();
      const accessToken = data.access_token;
      const staffUser = data.staff;
      const staffHospital = data.hospital;
      const userPermissions = data.permissions || [];

      setToken(accessToken);
      setUser(staffUser);
      setHospital(staffHospital);
      setPermissions(userPermissions);

      localStorage.setItem('pt_access_token', accessToken);
      localStorage.setItem('pt_user', JSON.stringify(staffUser));
      localStorage.setItem('pt_hospital', JSON.stringify(staffHospital));
      localStorage.setItem('pt_permissions', JSON.stringify(userPermissions));

      addToast(`Welcome back, ${staffUser.name}! Signed in to ${staffHospital?.name || hospitalId}.`, 'success');
      return { success: true };
    } catch (err) {
      addToast(err.message, 'error');
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-Staff-Id': user?.staff_id || '',
            'X-Hospital-Id': user?.hospital_id || ''
          }
        });
      }
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setToken(null);
      setUser(null);
      setHospital(null);
      setPermissions([]);

      localStorage.removeItem('pt_access_token');
      localStorage.removeItem('pt_user');
      localStorage.removeItem('pt_hospital');
      localStorage.removeItem('pt_permissions');

      addToast('Signed out of clinical session.', 'info');
    }
  };

  const hasPermission = (perm) => {
    return permissions.includes(perm);
  };

  const addToast = (message, type = 'info', durationMs = 8000) => {
    const id = Date.now() + Math.random();
    const newToast = { id, message, type, createdAt: Date.now(), durationMs };

    setToasts((prev) => [...prev, newToast]);

    setTimeout(() => {
      removeToast(id);
    }, durationMs);
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Backward compatibility object for components expecting currentStaff
  const currentStaff = user || {
    staff_id: 'GUEST',
    name: 'Guest User',
    role: 'GUEST',
    hospital_id: 'DEMO001'
  };

  const authHeaders = {
    'X-Staff-Id': currentStaff.staff_id,
    'X-Hospital-Id': currentStaff.hospital_id,
    'Authorization': token ? `Bearer ${token}` : `Bearer TOKEN_${currentStaff.staff_id}_${currentStaff.hospital_id}`
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        currentStaff,
        hospital,
        permissions,
        hospitals,
        isAuthenticated,
        loading,
        login,
        logout,
        hasPermission,
        toasts,
        addToast,
        removeToast,
        authHeaders
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
