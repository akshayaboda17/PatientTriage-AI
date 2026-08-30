import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { NotificationToast } from './components/NotificationToast';
import { LoginPage } from './components/LoginPage';
import { DashboardView } from './components/DashboardView';
import { EDQueueView } from './components/EDQueueView';
import { AlertsDashboard } from './components/AlertsDashboard';
import { PatientDetailView } from './components/PatientDetailView';
import { PhysicianReviewWorkspace } from './components/PhysicianReviewWorkspace';
import { AuditLogView } from './components/AuditLogView';
import { StaffManagementView } from './components/StaffManagementView';
import { AnalyticsView } from './components/AnalyticsView';
import { MLOpsDashboard } from './components/mlops/MLOpsDashboard';
import { PatientRegistrationModal } from './components/PatientRegistrationModal';

const MainAppContent = () => {
  const { isAuthenticated, authHeaders } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard', 'queue', 'alerts', 'audit', 'staff', 'analytics', 'mlops', 'patient-detail', 'physician-review'
  const [selectedEncounterId, setSelectedEncounterId] = useState(null);
  const [unacknowledgedCount, setUnacknowledgedCount] = useState(0);

  // Modals
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);

  const fetchAlertCount = async () => {
    if (!isAuthenticated) return;
    try {
      const res = await fetch('/api/alerts?status=UNACKNOWLEDGED', { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setUnacknowledgedCount(data.alerts ? data.alerts.length : 0);
      }
    } catch (err) {
      console.error('Failed to fetch unacknowledged alert count:', err);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchAlertCount();
      const interval = setInterval(fetchAlertCount, 15000); // 15s refresh
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, authHeaders['X-Hospital-Id']]);

  const handleSelectPatient = (encounterId) => {
    setSelectedEncounterId(encounterId);
    setActiveTab('patient-detail');
  };

  const handleReviewPatient = (encounterId) => {
    setSelectedEncounterId(encounterId);
    setActiveTab('physician-review');
  };

  const handleAlertStateChanged = () => {
    fetchAlertCount();
  };

  const handlePatientRegistered = (newEncounterId) => {
    fetchAlertCount();
    if (newEncounterId) {
      handleSelectPatient(newEncounterId);
    } else {
      setActiveTab('queue');
    }
  };

  // If unauthenticated, show the real enterprise Login Page
  if (!isAuthenticated) {
    return (
      <>
        <LoginPage />
        <NotificationToast />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-cyan-500 selection:text-white">
      {/* Top Navigation */}
      <Navbar
        activeTab={['patient-detail', 'physician-review'].includes(activeTab) ? 'queue' : activeTab}
        setActiveTab={(tab) => {
          setSelectedEncounterId(null);
          setActiveTab(tab);
        }}
        unacknowledgedAlertCount={unacknowledgedCount}
        onOpenRegister={() => setIsRegisterOpen(true)}
      />

      {/* Main Clinical Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        
        {/* Executive Dashboard */}
        {activeTab === 'dashboard' && (
          <DashboardView
            onSelectPatient={handleSelectPatient}
            onReviewPatient={handleReviewPatient}
            onOpenRegister={() => setIsRegisterOpen(true)}
            onNavigateTab={(tab) => {
              setSelectedEncounterId(null);
              setActiveTab(tab);
            }}
          />
        )}

        {/* ED Queue */}
        {activeTab === 'queue' && (
          <EDQueueView
            onSelectPatient={handleSelectPatient}
            onReviewPatient={handleReviewPatient}
            onOpenRegister={() => setIsRegisterOpen(true)}
            onAlertStateChanged={handleAlertStateChanged}
          />
        )}

        {/* Clinical Alerts */}
        {activeTab === 'alerts' && (
          <AlertsDashboard
            onSelectPatient={handleSelectPatient}
            onAlertStateChanged={handleAlertStateChanged}
          />
        )}

        {/* Patient Detail Chart */}
        {activeTab === 'patient-detail' && selectedEncounterId && (
          <PatientDetailView
            encounterId={selectedEncounterId}
            onBack={() => setActiveTab('queue')}
            onOpenReview={() => setActiveTab('physician-review')}
            onAlertStateChanged={handleAlertStateChanged}
          />
        )}

        {/* Physician Review Console */}
        {activeTab === 'physician-review' && selectedEncounterId && (
          <PhysicianReviewWorkspace
            encounterId={selectedEncounterId}
            onBack={() => setActiveTab('queue')}
            onDecisionSaved={() => {
              fetchAlertCount();
            }}
          />
        )}

        {/* Clinical Audit Trail */}
        {activeTab === 'audit' && <AuditLogView />}

        {/* Staff Management & RBAC */}
        {activeTab === 'staff' && <StaffManagementView />}

        {/* Clinical Analytics */}
        {activeTab === 'analytics' && <AnalyticsView />}

        {/* MLOps & Model Governance */}
        {activeTab === 'mlops' && <MLOpsDashboard />}

      </main>

      {/* Patient Registration Modal */}
      <PatientRegistrationModal
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
        onPatientRegistered={handlePatientRegistered}
      />

      {/* Global Toast Notification Container */}
      <NotificationToast />
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <MainAppContent />
    </AuthProvider>
  );
}
