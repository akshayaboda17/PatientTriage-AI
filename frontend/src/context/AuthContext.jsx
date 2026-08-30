import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export const DEMO_USERS = [
  { staff_id: 'DOC001', name: 'Dr. Gregory House, MD', role: 'EMERGENCY_PHYSICIAN', hospital_id: 'DEMO001', role_label: 'Emergency Physician' },
  { staff_id: 'NUR001', name: 'Jackie Peyton, RN', role: 'TRIAGE_NURSE', hospital_id: 'DEMO001', role_label: 'Triage Nurse' },
  { staff_id: 'ADMIN001', name: 'Sarah Connor, MHA', role: 'HOSPITAL_ADMIN', hospital_id: 'DEMO001', role_label: 'Hospital Admin' },
  { staff_id: 'DIR001', name: 'Dr. James Wilson, MD', role: 'CLINICAL_DIRECTOR', hospital_id: 'DEMO001', role_label: 'Clinical Director' },
  { staff_id: 'TECH001', name: 'John Carter, EMT-P', role: 'EMERGENCY_TECHNICIAN', hospital_id: 'DEMO001', role_label: 'Emergency Tech' },
  { staff_id: 'DOC002_METRO', name: 'Dr. Allison Cameron, MD', role: 'EMERGENCY_PHYSICIAN', hospital_id: 'METRO002', role_label: 'Emergency Physician (Metro)' }
];

export const AuthProvider = ({ children }) => {
  const [currentStaff, setCurrentStaff] = useState(DEMO_USERS[0]);
  const [permissions, setPermissions] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [toasts, setToasts] = useState([]);

  // Fetch Hospitals
  useEffect(() => {
    fetchHospitals();
  }, []);

  // Fetch Session Profile on Staff Change
  useEffect(() => {
    loginStaff(currentStaff.staff_id, currentStaff.hospital_id);
  }, [currentStaff.staff_id, currentStaff.hospital_id]);

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

  const loginStaff = async (staffId, hospitalId) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_id: staffId, hospital_id: hospitalId })
      });
      if (res.ok) {
        const data = await res.json();
        setPermissions(data.permissions || []);
      }
    } catch (err) {
      console.error('Login error:', err);
    }
  };

  const switchStaff = (staffId) => {
    const user = DEMO_USERS.find(u => u.staff_id === staffId);
    if (user) {
      setCurrentStaff(user);
      addToast(`Switched active user to ${user.name} (${user.role})`, 'info');
    }
  };

  const switchHospital = (hospitalCode) => {
    const defaultUserForHosp = DEMO_USERS.find(u => u.hospital_id === hospitalCode) || {
      ...currentStaff,
      hospital_id: hospitalCode
    };
    setCurrentStaff(defaultUserForHosp);
    addToast(`Switched hospital tenant to ${hospitalCode}`, 'info');
  };

  const hasPermission = (perm) => {
    return permissions.includes(perm);
  };

  // ==========================================
  // Temporary Toast Notifications
  // Auto-dismisses after 10 seconds (10000ms)
  // Has manual X dismiss button
  // Distinct from persistent DB Clinical Alerts
  // ==========================================
  const addToast = (message, type = 'info', durationMs = 10000) => {
    const id = Date.now() + Math.random();
    const newToast = { id, message, type, createdAt: Date.now(), durationMs };

    setToasts((prev) => [...prev, newToast]);

    // Set 10-second auto dismiss timer
    setTimeout(() => {
      removeToast(id);
    }, durationMs);
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <AuthContext.Provider
      value={{
        currentStaff,
        permissions,
        hospitals,
        switchStaff,
        switchHospital,
        hasPermission,
        toasts,
        addToast,
        removeToast,
        authHeaders: {
          'X-Staff-Id': currentStaff.staff_id,
          'X-Hospital-Id': currentStaff.hospital_id,
          'Authorization': `Bearer TOKEN_${currentStaff.staff_id}_${currentStaff.hospital_id}`
        }
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
