import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { ArrowLeft, Stethoscope, Activity, Heart, ShieldAlert, Sparkles, FileText, CheckCircle2 } from 'lucide-react';
import { PatientDemographicsCard } from './patient/PatientDemographicsCard';
import { VitalsProgressionTable } from './patient/VitalsProgressionTable';
import { AiRiskCard } from './patient/AiRiskCard';
import { ExplainabilityCard } from './patient/ExplainabilityCard';
import { ClinicalDecisionForm } from './physician/ClinicalDecisionForm';
import { PhysicianAssessmentHistory } from './physician/PhysicianAssessmentHistory';

export const PhysicianReviewWorkspace = ({ encounterId, onBack, onDecisionSaved }) => {
  const { authHeaders, hasPermission, addToast, currentStaff } = useAuth();
  
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Form State
  const [aiAgreement, setAiAgreement] = useState('AGREED');
  const [clinicianAssignedRisk, setClinicianAssignedRisk] = useState('MODERATE');
  const [overrideReason, setOverrideReason] = useState('Clinical context not represented in model input');
  const [clinicalAssessment, setClinicalAssessment] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [clinicalDecision, setClinicalDecision] = useState('CONTINUE_EVALUATION');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchReviewData();
  }, [encounterId, authHeaders['X-Hospital-Id']]);

  const fetchReviewData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/encounters/${encounterId}/clinical-review`, {
        headers: authHeaders
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
        if (json.ai_risk) {
          setClinicianAssignedRisk(json.ai_risk.risk_category);
        }
      } else if (res.status === 403) {
        addToast("Cross-hospital access forbidden.", "error");
        onBack();
      } else {
        addToast("Failed to load clinical review workspace.", "error");
      }
    } catch (err) {
      addToast("Network error loading clinical review.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDecision = async (e) => {
    e.preventDefault();

    if (!hasPermission('clinical_decision:create')) {
      addToast("Access Denied: Your role does not have 'clinical_decision:create' permission.", "error");
      return;
    }

    if (aiAgreement === 'OVERRIDDEN') {
      if (!hasPermission('ai:override')) {
        addToast("Access Denied: Your role cannot override AI assessments.", "error");
        return;
      }
      if (!overrideReason.trim()) {
        addToast("Structured override reason is mandatory when overriding AI assessment.", "warning");
        return;
      }
    }

    if (!clinicalDecision) {
      addToast("Clinical decision / next step is required.", "warning");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        clinical_assessment: clinicalAssessment.trim() || undefined,
        ai_agreement: aiAgreement,
        clinician_assigned_risk: aiAgreement === 'OVERRIDDEN' ? clinicianAssignedRisk : (data?.ai_risk?.risk_category || 'HIGH'),
        override_reason: aiAgreement === 'OVERRIDDEN' ? overrideReason : undefined,
        clinical_notes: clinicalNotes.trim() || undefined,
        clinical_decision: clinicalDecision
      };

      const res = await fetch(`/api/encounters/${encounterId}/clinical-decision`, {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        addToast(
          aiAgreement === 'OVERRIDDEN'
            ? "AI Override & Clinical Decision saved successfully."
            : "Physician Clinical Decision recorded successfully.",
          "success",
          10000
        );
        fetchReviewData();
        if (onDecisionSaved) onDecisionSaved();
      } else {
        const err = await res.json();
        addToast(err.detail || "Failed to save clinical decision.", "error");
      }
    } catch (err) {
      addToast("Network error saving decision.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-400 space-y-3">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="text-sm font-medium">Consolidating patient chart & AI decision-support data...</p>
      </div>
    );
  }

  if (!data || !data.encounter) {
    return (
      <div className="p-12 text-center text-slate-400 text-sm">
        <p>Encounter not found or inaccessible.</p>
        <button onClick={onBack} className="mt-4 px-4 py-2 bg-slate-800 text-slate-200 rounded-xl text-xs">
          Return to ED Queue
        </button>
      </div>
    );
  }

  const { encounter, patient, observations, triage, ai_risk, ai_explanation, alerts, physician_assessments } = data;

  return (
    <div className="space-y-6">
      
      {/* Top Nav Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to ED Queue</span>
        </button>

        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-950 text-indigo-300 border border-indigo-800 flex items-center gap-1.5">
            <Stethoscope className="w-3.5 h-3.5" />
            Physician Review Console
          </span>
        </div>
      </div>

      {/* Patient Demographic Banner */}
      <PatientDemographicsCard patient={patient} encounter={encounter} triage={triage} />

      {/* 2-Column Clinical Review Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Vitals Progression (Span 2) */}
        <div className="lg:col-span-2 space-y-6">
          <VitalsProgressionTable observations={observations} />
          
          {/* Clinical Decision & AI Override Form */}
          <ClinicalDecisionForm
            aiRisk={ai_risk}
            aiAgreement={aiAgreement}
            setAiAgreement={setAiAgreement}
            clinicianAssignedRisk={clinicianAssignedRisk}
            setClinicianAssignedRisk={setClinicianAssignedRisk}
            overrideReason={overrideReason}
            setOverrideReason={setOverrideReason}
            clinicalAssessment={clinicalAssessment}
            setClinicalAssessment={setClinicalAssessment}
            clinicalNotes={clinicalNotes}
            setClinicalNotes={setClinicalNotes}
            clinicalDecision={clinicalDecision}
            setClinicalDecision={setClinicalDecision}
            submitting={submitting}
            onSubmit={handleSaveDecision}
          />
        </div>

        {/* Right Column: AI Risk & Explainability */}
        <div className="space-y-6">
          {/* Active Deterioration Alerts if any */}
          {alerts && alerts.length > 0 && (
            <div className="bg-rose-950/40 border border-rose-600/70 p-4 rounded-2xl shadow-xl space-y-2">
              <div className="flex items-center gap-2 text-rose-300 font-bold text-xs">
                <ShieldAlert className="w-4 h-4 text-rose-400 animate-pulse" />
                <span>Active Longitudinal Deterioration Alerts ({alerts.length})</span>
              </div>
              {alerts.map((alt) => (
                <div key={alt.alert_id} className="bg-rose-950/60 p-2.5 rounded-xl border border-rose-800/60 text-xs text-rose-200">
                  <div className="font-semibold text-white">{alt.summary}</div>
                  <div className="text-[10px] text-rose-300/80 mt-0.5">Status: {alt.status} • Severity: {alt.severity}</div>
                </div>
              ))}
            </div>
          )}

          <AiRiskCard aiRisk={ai_risk} />
          <ExplainabilityCard aiExplanation={ai_explanation} />
          <PhysicianAssessmentHistory assessments={physician_assessments} />
        </div>

      </div>

    </div>
  );
};
