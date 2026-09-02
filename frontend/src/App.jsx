import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { NotificationToast } from './components/NotificationToast';
import { LoginPage } from './components/LoginPage';
import { DashboardView } from './components/DashboardView';
import { TriageCategoriesView } from './components/TriageCategoriesView';
import { HospitalCapacityView } from './components/HospitalCapacityView';
import { AlertsDashboard } from './components/AlertsDashboard';
import { PatientDetailView } from './components/PatientDetailView';
import { PhysicianReviewWorkspace } from './components/PhysicianReviewWorkspace';
import { AuditLogView } from './components/AuditLogView';
import { StaffManagementView } from './components/StaffManagementView';
import { AnalyticsView } from './components/AnalyticsView';
import { MLOpsDashboard } from './components/mlops/MLOpsDashboard';
import { PatientRegistrationModal } from './components/PatientRegistrationModal';
import { ErrorBoundary } from './components/common/ErrorBoundary';

const MainAppContent = () => {
  const { isAuthenticated, authHeaders } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard', 'categories', 'capacity', 'alerts', 'audit', 'staff', 'mlops', 'patient-detail', 'physician-review'
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
      setActiveTab('dashboard');
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
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col selection:bg-cyan-500 selection:text-white">
      
      {/* Top Navigation Bar with Hospital Name & Profile Avatar on every page */}
      <Navbar
        activeTab={['patient-detail', 'physician-review'].includes(activeTab) ? 'dashboard' : activeTab}
        setActiveTab={(tab) => {
          setSelectedEncounterId(null);
          setActiveTab(tab);
        }}
        unacknowledgedAlertCount={unacknowledgedCount}
        onOpenRegister={() => setIsRegisterOpen(true)}
      />

      {/* Main Clinical Viewport */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        
        {/* TAB 1: ED Dashboard & Live Patient Queue with Add Patient Option */}
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

        {/* TAB 2: Patient Triage Acuity Categories & Doctor Routing */}
        {activeTab === 'categories' && (
          <TriageCategoriesView
            onSelectPatient={handleSelectPatient}
            onReviewPatient={handleReviewPatient}
            onOpenRegister={() => setIsRegisterOpen(true)}
          />
        )}

        {/* TAB 3: Hospital Bed Capacity & Available On-Duty Staff */}
        {activeTab === 'capacity' && (
          <HospitalCapacityView
            onSelectPatient={handleSelectPatient}
            onOpenRegister={() => setIsRegisterOpen(true)}
          />
        )}

        {/* TAB 4: Clinical Alerts & Deterioration */}
        {activeTab === 'alerts' && (
          <AlertsDashboard
            onSelectPatient={handleSelectPatient}
            onAlertStateChanged={handleAlertStateChanged}
          />
        )}

        {/* Individual Patient Detail Clinical Chart */}
        {activeTab === 'patient-detail' && selectedEncounterId && (
          <PatientDetailView
            encounterId={selectedEncounterId}
            onBack={() => setActiveTab('dashboard')}
            onOpenReview={() => setActiveTab('physician-review')}
            onAlertStateChanged={handleAlertStateChanged}
          />
        )}

        {/* Physician Review & Override Workspace */}
        {activeTab === 'physician-review' && selectedEncounterId && (
          <PhysicianReviewWorkspace
            encounterId={selectedEncounterId}
            onBack={() => setActiveTab('dashboard')}
            onDecisionSaved={() => {
              fetchAlertCount();
            }}
          />
        )}

        {/* Governance: Clinical Audit Trail */}
        {activeTab === 'audit' && <AuditLogView />}

        {/* Staff Management & RBAC */}
        {activeTab === 'staff' && <StaffManagementView />}

        {/* MLOps & Model Governance */}
        {activeTab === 'mlops' && <MLOpsDashboard />}

        {/* Clinical Analytics */}
        {activeTab === 'analytics' && <AnalyticsView />}

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
    <ErrorBoundary>
      <AuthProvider>
        <MainAppContent />
      </AuthProvider>
    </ErrorBoundary>
  );
}
