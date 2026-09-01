import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  AlertOctagon, AlertTriangle, AlertCircle, CheckCircle2, Heart, 
  Stethoscope, Clock, User, ShieldAlert, Sparkles, ChevronRight, 
  Search, RefreshCw, X, TrendingUp, TrendingDown, ArrowRight,
  Bed, ShieldCheck, Activity, Brain, UserCheck, MapPin
} from 'lucide-react';
import { LoadingSkeleton, EmptyState, ErrorState, AcuityBadge, SafetyStatusBadge, ConfidenceBadge, AgeGroupBadge } from './common/StateViews';
import { PRIORITY_LEVELS } from '../utils/terminology';
import { PriorityOverrideModal } from './common/PriorityOverrideModal';

export const TriageCategoriesView = ({ onSelectPatient, onReviewPatient, onOpenRegister }) => {
  const { authHeaders, hasPermission, addToast, hospital } = useAuth();
  const [encounters, setEncounters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPatientForModal, setSelectedPatientForModal] = useState(null);
  const [overrideModalEncounter, setOverrideModalEncounter] = useState(null);
  const [loadingModalDetail, setLoadingModalDetail] = useState(false);
  const [patientDetailData, setPatientDetailData] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategoryTab, setActiveCategoryTab] = useState('ALL'); // 'ALL', 1, 2, 3, 4, 5

  useEffect(() => {
    fetchEncounters();
  }, [authHeaders['X-Hospital-Id']]);

  const fetchEncounters = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/encounters', { headers: authHeaders });
      if (!res.ok) {
        throw new Error(`Failed to load patient care categories (HTTP ${res.status})`);
      }
      const data = await res.json();
      setEncounters(data.queue || []);
    } catch (err) {
      console.error('Care categories fetch error:', err);
      setError('Unable to load patient care priority list.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenPatientModal = async (encounter) => {
    setSelectedPatientForModal(encounter);
    setLoadingModalDetail(true);
    try {
      const res = await fetch(`/api/encounters/${encounter.encounter_id}`, { headers: authHeaders });
      if (res.ok) {
        const json = await res.json();
        setPatientDetailData(json);
      } else {
        setPatientDetailData(null);
      }
    } catch (err) {
      console.error('Error fetching patient clinical dossier:', err);
      setPatientDetailData(null);
    } finally {
      setLoadingModalDetail(false);
    }
  };

  // Helper for Care Routing recommendation based on presentation & priority
  const getDoctorCareRouting = (enc) => {
    const level = enc.triage_level || 3;
    const service = enc.recommended_care_service || (level <= 2 ? "Emergency Medicine (Resuscitation)" : "Emergency Medicine");
    const assignedDoc = enc.assigned_doctor_name || enc.assigned_doctor_id || null;
    const recommendedDoctor = assignedDoc ? assignedDoc : "Care destination not assigned";

    let zone = "Acute Care Area";
    if (level === 1) zone = "Resuscitation / Trauma Bay";
    else if (level === 2) zone = "Acute Emergency Bay";
    else if (level === 3) zone = "Rapid Assessment & Treatment";
    else zone = "Ambulatory / Observation Area";

    return {
      recommended_service: service,
      specialist_role: service,
      recommended_doctor: recommendedDoctor,
      zone: zone,
      urgency_instruction: level === 1 ? "Immediate Bedside Resuscitation (0 min wait)" : (level === 2 ? "Immediate Bedside Assessment (≤15 min wait)" : "Prompt Evaluation")
    };
  };

  // Group patients into the 5 Urgency tiers using terminology
  const categories = [1, 2, 3, 4, 5].map(lvl => {
    const meta = PRIORITY_LEVELS[lvl];
    const icons = { 1: AlertOctagon, 2: AlertTriangle, 3: AlertCircle, 4: CheckCircle2, 5: Heart };
    return {
      level: lvl,
      name: meta.primary,
      secondary: meta.secondary,
      subtitle: meta.description,
      color: meta.borderCls,
      badge: meta.badgeCls,
      icon: icons[lvl],
      patients: encounters.filter(e => e.triage_level === lvl)
    };
  });

  const filteredCategories = categories.map(cat => {
    let filteredPatients = cat.patients;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filteredPatients = filteredPatients.filter(p => 
        (p.patient_name || '').toLowerCase().includes(q) ||
        (p.chief_complaint || '').toLowerCase().includes(q) ||
        (p.encounter_id || '').toLowerCase().includes(q) ||
        (p.patient_id || '').toLowerCase().includes(q)
      );
    }
    return { ...cat, patients: filteredPatients };
  }).filter(cat => activeCategoryTab === 'ALL' || Number(activeCategoryTab) === cat.level);

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white tracking-tight">Patient Care Priority Categories</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">
                5-Level Clinical Triage System
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Patients grouped by clinical urgency. Click any patient to view initial intake vital signs, reasons for priority assignment, and recommended doctor routing.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchEncounters}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-lg flex flex-col sm:flex-row items-center justify-between gap-3">
        
        {/* Category Selector Tabs */}
        <div className="flex flex-wrap items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveCategoryTab('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeCategoryTab === 'ALL' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All Care Priorities ({encounters.length})
          </button>
          {[1, 2, 3, 4, 5].map(lvl => {
            const count = encounters.filter(e => e.triage_level === lvl).length;
            const meta = PRIORITY_LEVELS[lvl];
            return (
              <button
                key={lvl}
                onClick={() => setActiveCategoryTab(lvl)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeCategoryTab === lvl
                    ? 'bg-slate-800 text-cyan-300 border border-cyan-500/50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {meta.primary.split('—')[0].trim()} ({count})
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search patient, symptoms, ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-sans"
          />
        </div>
      </div>

      {/* Main Categories Section */}
      {loading ? (
        <LoadingSkeleton type="table" rows={8} />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchEncounters} />
      ) : (
        <div className="space-y-6">
          {filteredCategories.map((cat) => {
            const Icon = cat.icon;
            return (
              <div key={cat.level} className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
                
                {/* Category Header Strip */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                      <Icon className="w-5 h-5 text-slate-300" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-black text-white tracking-tight">{cat.name}</h2>
                        <span className="text-xs text-slate-400 font-mono">({cat.secondary})</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${cat.badge}`}>
                          {cat.patients.length} {cat.patients.length === 1 ? 'Patient' : 'Patients'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{cat.subtitle}</p>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-500 font-mono">
                    Safe Wait Time: <strong>{cat.level === 1 ? 'Immediate (0 mins)' : cat.level === 2 ? '≤ 10-15 mins' : cat.level === 3 ? '≤ 30-45 mins' : cat.level === 4 ? '≤ 60-90 mins' : '≤ 120 mins'}</strong>
                  </div>
                </div>

                {/* Patients List in this Category */}
                {cat.patients.length === 0 ? (
                  <div className="py-6 text-center text-slate-500 text-xs font-medium">
                    No patients currently assigned to {cat.name}.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {cat.patients.map((patient) => {
                      const routing = getDoctorCareRouting(patient);
                      return (
                        <div
                          key={patient.encounter_id}
                          onClick={() => handleOpenPatientModal(patient)}
                          className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800/80 hover:border-cyan-500/60 hover:bg-slate-950 transition-all cursor-pointer space-y-3 group shadow-md"
                        >
                          {/* Top Row: Name, Demographics, and AI Risk */}
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-bold text-white text-sm group-hover:text-cyan-300 transition-colors flex items-center gap-1.5">
                                <span>{patient.patient_name}</span>
                                <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 transition-transform group-hover:translate-x-0.5" />
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400 font-mono">
                                <AgeGroupBadge ageGroup={patient.age_group} age={patient.age} />
                                <span>{patient.gender}</span>
                                <span>· ID: {patient.patient_id}</span>
                              </div>
                            </div>

                            <div className="text-right font-mono">
                              {patient.ai_risk ? (
                                <div>
                                  <span className={`text-sm font-black ${
                                    patient.ai_risk.risk_category === 'HIGH' || patient.ai_risk.risk_category === 'CRITICAL'
                                      ? 'text-rose-400'
                                      : patient.ai_risk.risk_category === 'MODERATE'
                                      ? 'text-amber-400'
                                      : 'text-emerald-400'
                                  }`}>
                                    {patient.ai_risk.risk_probability !== undefined
                                      ? `${(patient.ai_risk.risk_probability * 100).toFixed(0)}%`
                                      : `${patient.ai_risk.risk_score}%`}
                                  </span>
                                  <div className="text-[9px] text-slate-500 uppercase">Estimated Risk</div>
                                </div>
                              ) : (
                                <span className="text-[10px] text-slate-500">Triage Assigned</span>
                              )}
                            </div>
                          </div>

                          {/* Chief Complaint Presentation */}
                          <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800 text-xs">
                            <span className="text-[10px] uppercase font-bold text-slate-500 block mb-0.5">Reported Symptoms &amp; Chief Complaint:</span>
                            <p className="text-slate-200 font-medium leading-snug">{patient.chief_complaint}</p>
                          </div>

                          {/* Care Service Routing Row (Requirement 24) */}
                          <div className="p-2.5 rounded-xl bg-indigo-950/40 border border-indigo-900/60 text-xs space-y-1">
                            <div className="flex items-center gap-1.5 text-indigo-300 font-bold text-[11px]">
                              <Stethoscope className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                              <span>Recommended Care Service:</span>
                            </div>
                            <div className="text-slate-200 text-[11px]">
                              <strong>{routing.recommended_service}</strong>
                            </div>
                            <div className="text-slate-400 text-[10px] flex items-center justify-between font-mono">
                              <span className="flex items-center gap-1">
                                <MapPin className="w-2.5 h-2.5 text-slate-500" />
                                <span>Zone: {routing.zone}</span>
                              </span>
                              <span className="text-slate-400">
                                {routing.recommended_doctor === 'Care destination not assigned' ? 'Care destination not assigned' : `Assigned: ${routing.recommended_doctor}`}
                              </span>
                            </div>
                          </div>

                          {/* Bottom Meta Strip */}
                          <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-[10px] text-slate-500 font-mono">
                            <div className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-500" />
                              <span>Time Waiting: <strong>{patient.wait_time_mins || 0} mins</strong></span>
                            </div>
                            <SafetyStatusBadge status={patient.safety_status} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Interactive Patient Clinical Dossier Modal */}
      {selectedPatientForModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/90">
              <div className="flex items-center gap-3">
                <AcuityBadge level={selectedPatientForModal.triage_level} />
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">
                    {selectedPatientForModal.patient_name} — Initial Assessment &amp; Care Details
                  </h3>
                  <p className="text-[11px] text-slate-400 font-mono">
                    Patient ID: {selectedPatientForModal.patient_id} · Visit #{selectedPatientForModal.encounter_id}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedPatientForModal(null);
                  setPatientDetailData(null);
                }}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-6 overflow-y-auto space-y-5 text-xs">
              
              {loadingModalDetail ? (
                <LoadingSkeleton type="cards" />
              ) : (
                <>
                  {/* SECTION 1: Initial Information Collected at Arrival */}
                  <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 space-y-3">
                    <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs uppercase tracking-wider">
                      <Activity className="w-4 h-4" />
                      <span>1. Initial Patient Assessment &amp; Vital Signs</span>
                    </div>

                    <div className="space-y-2">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-500">Chief Complaint &amp; Reported Symptoms:</span>
                        <p className="text-slate-100 text-sm font-semibold mt-0.5">{selectedPatientForModal.chief_complaint}</p>
                      </div>

                      {/* Vital Signs Grid */}
                      {patientDetailData?.observations && patientDetailData.observations.length > 0 ? (
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1.5">Intake Vital Signs:</span>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-center">
                            {(() => {
                              const obs = patientDetailData.observations[0];
                              return (
                                <>
                                  <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                                    <div className="text-[10px] text-slate-400">Heart Rate</div>
                                    <div className={`font-bold text-sm mt-0.5 ${obs.hr >= 110 ? 'text-amber-400' : 'text-slate-200'}`}>{obs.hr} bpm</div>
                                  </div>
                                  <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                                    <div className="text-[10px] text-slate-400">Blood Pressure</div>
                                    <div className="font-bold text-sm mt-0.5 text-slate-200">{obs.sbp}/{obs.dbp || '-'} mmHg</div>
                                  </div>
                                  <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                                    <div className="text-[10px] text-slate-400">Oxygen (SpO₂)</div>
                                    <div className={`font-bold text-sm mt-0.5 ${obs.spo2 < 92 ? 'text-rose-400 font-black' : 'text-emerald-400'}`}>{obs.spo2}%</div>
                                  </div>
                                  <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                                    <div className="text-[10px] text-slate-400">Respiratory Rate</div>
                                    <div className={`font-bold text-sm mt-0.5 ${obs.rr >= 24 ? 'text-rose-400' : 'text-slate-200'}`}>{obs.rr} /min</div>
                                  </div>
                                  <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                                    <div className="text-[10px] text-slate-400">Temperature</div>
                                    <div className="font-bold text-sm mt-0.5 text-slate-200">{obs.temp}°C</div>
                                  </div>
                                  <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                                    <div className="text-[10px] text-slate-400">GCS Consciousness</div>
                                    <div className="font-bold text-sm mt-0.5 text-slate-200">{obs.gcs} / 15</div>
                                  </div>
                                  <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                                    <div className="text-[10px] text-slate-400">Pain Level</div>
                                    <div className="font-bold text-sm mt-0.5 text-slate-200">{obs.pain_score || 0} / 10</div>
                                  </div>
                                  <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                                    <div className="text-[10px] text-slate-400">Shock Index</div>
                                    <div className="font-bold text-sm mt-0.5 text-indigo-300">{selectedPatientForModal.ai_risk?.shock_index || ((obs.hr / obs.sbp).toFixed(2))}</div>
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      ) : (
                        <p className="text-slate-500 text-xs">Standard intake vitals recorded.</p>
                      )}

                      {/* Medical History */}
                      {patientDetailData?.patient?.medical_history && (
                        <div className="pt-1">
                          <span className="text-[10px] uppercase font-bold text-slate-500">Known Medical History:</span>
                          <p className="text-slate-300 text-xs mt-0.5">{patientDetailData.patient.medical_history}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* SECTION 2: Why the AI Made This Assessment */}
                  <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 space-y-3">
                    <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-wider">
                      <Sparkles className="w-4 h-4" />
                      <span>2. Why the AI Assigned This Care Priority</span>
                    </div>

                    <div className="space-y-3">
                      <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 flex items-center justify-between">
                        <div>
                          <div className="text-[10px] text-slate-400 uppercase font-bold">Assigned Care Priority</div>
                          <div className="text-sm font-black text-white mt-0.5">
                            {PRIORITY_LEVELS[selectedPatientForModal.triage_level]?.primary}
                          </div>
                        </div>
                        {selectedPatientForModal.ai_risk && (
                          <div className="text-right font-mono">
                            <div className="text-[10px] text-slate-400 uppercase">Estimated Risk</div>
                            <span className="text-base font-black text-cyan-300">
                              {selectedPatientForModal.ai_risk.risk_probability !== undefined
                                ? `${(selectedPatientForModal.ai_risk.risk_probability * 100).toFixed(1)}%`
                                : `${selectedPatientForModal.ai_risk.risk_score}%`}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* SHAP / Feature Explanation */}
                      {patientDetailData?.ai_explanation?.top_features && patientDetailData.ai_explanation.top_features.length > 0 ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] uppercase font-bold text-slate-500">Factors Influencing the AI Assessment:</span>
                            <span className="text-[10px] text-slate-600 font-mono">AI Explanation (SHAP)</span>
                          </div>
                          <div className="space-y-1.5">
                            {patientDetailData.ai_explanation.top_features.map((feat, idx) => {
                              const isElevating = feat.direction === 'elevating risk' || (feat.impact && feat.impact.startsWith('+'));
                              return (
                                <div key={idx} className="p-2 bg-slate-900/80 rounded-lg border border-slate-800 flex items-center justify-between text-xs">
                                  <div className="flex items-center gap-2">
                                    {isElevating ? <TrendingUp className="w-3.5 h-3.5 text-rose-400" /> : <TrendingDown className="w-3.5 h-3.5 text-emerald-400" />}
                                    <span className="text-slate-200 font-semibold">{feat.feature} [{feat.value}]</span>
                                  </div>
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${isElevating ? 'bg-rose-950 text-rose-300' : 'bg-emerald-950 text-emerald-300'}`}>
                                    {isElevating ? `+${feat.impact || 'Elevated Risk'}` : `-${feat.impact || 'Reduced Risk'}`}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 bg-slate-900 rounded-xl text-slate-400 text-xs">
                          {selectedPatientForModal.triage_level <= 2 
                            ? "Patient presents with abnormal vital signs and urgent symptoms requiring immediate physician review."
                            : "Patient vital signs remain within safe baseline limits."}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* SECTION 3: Doctor & Care Routing Recommendation */}
                  {(() => {
                    const routing = getDoctorCareRouting(selectedPatientForModal);
                    return (
                      <div className="bg-slate-950/80 p-4 rounded-2xl border border-indigo-800/60 space-y-3">
                        <div className="flex items-center gap-2 text-indigo-300 font-bold text-xs uppercase tracking-wider">
                          <Stethoscope className="w-4 h-4" />
                          <span>3. Care Routing &amp; Recommended Clinical Team</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
                            <span className="text-[10px] uppercase font-bold text-slate-400">Recommended Doctor / Clinician</span>
                            <div className="font-bold text-slate-100 text-sm">{routing.recommended_doctor}</div>
                            <div className="text-[11px] text-indigo-300">{routing.specialist_role}</div>
                          </div>

                          <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
                            <span className="text-[10px] uppercase font-bold text-slate-400">Target Clinical Bed / Area</span>
                            <div className="font-bold text-cyan-300 text-sm">{routing.zone}</div>
                            <div className="text-[11px] text-slate-400">{routing.urgency_instruction}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}
            </div>

            {/* Modal Actions Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/90 flex items-center justify-between">
              <button
                onClick={() => {
                  setSelectedPatientForModal(null);
                  setPatientDetailData(null);
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors cursor-pointer"
              >
                Close Details
              </button>

              <div className="flex items-center gap-2">
                {hasPermission('triage:update') && (
                  <button
                    onClick={() => {
                      setOverrideModalEncounter(selectedPatientForModal);
                    }}
                    className="px-3 py-2 rounded-xl bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-800 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Stethoscope className="w-3.5 h-3.5" />
                    <span>Adjust Care Priority</span>
                  </button>
                )}

                {hasPermission('physician:review') && onReviewPatient && (
                  <button
                    onClick={() => {
                      const encId = selectedPatientForModal.encounter_id;
                      setSelectedPatientForModal(null);
                      onReviewPatient(encId);
                    }}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-950/40 transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Stethoscope className="w-3.5 h-3.5" />
                    <span>Physician Review</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    const encId = selectedPatientForModal.encounter_id;
                    setSelectedPatientForModal(null);
                    onSelectPatient && onSelectPatient(encId);
                  }}
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-md shadow-cyan-950/40 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>Full Patient Record</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Priority Override Modal */}
      {overrideModalEncounter && (
        <PriorityOverrideModal
          isOpen={!!overrideModalEncounter}
          encounter={overrideModalEncounter}
          patient={overrideModalEncounter.patient}
          onClose={() => setOverrideModalEncounter(null)}
          onPriorityChanged={() => {
            fetchEncounters();
            setSelectedPatientForModal(null);
          }}
        />
      )}

    </div>
  );
};
