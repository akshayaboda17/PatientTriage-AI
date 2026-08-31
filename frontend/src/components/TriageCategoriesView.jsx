import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  AlertOctagon, AlertTriangle, AlertCircle, CheckCircle2, Heart, 
  Stethoscope, Clock, User, ShieldAlert, Sparkles, ChevronRight, 
  Search, RefreshCw, X, TrendingUp, TrendingDown, ArrowRight,
  Bed, ShieldCheck, Activity, Brain, UserCheck, MapPin
} from 'lucide-react';
import { LoadingSkeleton, EmptyState, ErrorState, AcuityBadge, SafetyStatusBadge, ConfidenceBadge, AgeGroupBadge } from './common/StateViews';

export const TriageCategoriesView = ({ onSelectPatient, onReviewPatient, onOpenRegister }) => {
  const { authHeaders, hasPermission, addToast, hospital } = useAuth();
  const [encounters, setEncounters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPatientForModal, setSelectedPatientForModal] = useState(null);
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
        throw new Error(`Failed to load patient triage categories (HTTP ${res.status})`);
      }
      const data = await res.json();
      setEncounters(data.queue || []);
    } catch (err) {
      console.error('Triage categories fetch error:', err);
      setError('Unable to load patient categorization list.');
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
      console.error('Error fetching patient full dossier:', err);
      setPatientDetailData(null);
    } finally {
      setLoadingModalDetail(false);
    }
  };

  // Helper for Doctor & Care Routing recommendation based on presentation & acuity
  const getDoctorCareRouting = (enc, details) => {
    const level = enc.triage_level || 3;
    const complaint = (enc.chief_complaint || '').toLowerCase();
    const isPediatric = enc.age_group === 'PEDIATRIC' || (enc.age && enc.age < 18);
    const isGeriatric = enc.age_group === 'GERIATRIC' || (enc.age && enc.age >= 65);

    if (level === 1) {
      return {
        specialist_role: "Attending Emergency Physician & Trauma / Resuscitation Team",
        recommended_doctor: "Dr. Gregory House, MD (Lead Emergency Physician)",
        zone: "Resuscitation Trauma Bay (RESUS-01 / RESUS-02)",
        urgency_instruction: "Immediate Bedside Resuscitation (0 min delay permissible)",
        badge_cls: "bg-rose-950 text-rose-300 border-rose-600 animate-pulse"
      };
    } else if (level === 2) {
      if (complaint.includes('chest') || complaint.includes('heart') || complaint.includes('cardiac')) {
        return {
          specialist_role: "Emergency Physician & On-Call Cardiologist",
          recommended_doctor: "Dr. Allison Cameron, MD (Emergency Cardiology Fellow)",
          zone: "Acute Monitoring Bed 01 / Chest Pain Rapid Unit",
          urgency_instruction: "Evaluate within 10 minutes, STAT ECG & Troponin I",
          badge_cls: "bg-amber-950 text-amber-300 border-amber-600"
        };
      } else if (complaint.includes('breath') || complaint.includes('dyspnea') || complaint.includes('resp') || complaint.includes('asthma') || complaint.includes('copd')) {
        return {
          specialist_role: "Emergency Physician & Respiratory Therapist",
          recommended_doctor: "Dr. James Wilson, MD (Critical Care & Emergency)",
          zone: "Acute Bed 03 (High-Flow O₂ Supported)",
          urgency_instruction: "Evaluate within 10 minutes, Continuous Pulse Oximetry & Blood Gas",
          badge_cls: "bg-amber-950 text-amber-300 border-amber-600"
        };
      } else if (isPediatric) {
        return {
          specialist_role: "Pediatric Emergency Specialist",
          recommended_doctor: "Dr. Robert Chase, MD (Pediatric Emergency Care)",
          zone: "Pediatric Acute Bay 01",
          urgency_instruction: "Immediate age-adjusted weight-based dosing & clinician review",
          badge_cls: "bg-pink-950 text-pink-300 border-pink-600"
        };
      } else {
        return {
          specialist_role: "Senior Emergency Physician",
          recommended_doctor: "Dr. Gregory House, MD / Dr. Allison Cameron, MD",
          zone: "Acute Care Bed (BED-01 to BED-05)",
          urgency_instruction: "Bedside clinician evaluation within 15 minutes",
          badge_cls: "bg-amber-950 text-amber-300 border-amber-600"
        };
      }
    } else if (level === 3) {
      return {
        specialist_role: "Emergency Physician & Primary Care Clinician",
        recommended_doctor: "Dr. Allison Cameron, MD (Emergency Physician)",
        zone: "General Acute Emergency Beds (BED-06 to BED-12)",
        urgency_instruction: "Initial medical screening & lab diagnostics within 30-45 mins",
        badge_cls: "bg-yellow-950 text-yellow-300 border-yellow-600"
      };
    } else if (level === 4) {
      return {
        specialist_role: "Advanced Practice Provider / Triage Nurse Practitioner",
        recommended_doctor: "Jackie Peyton, RN (Nurse Practitioner / Triage Lead)",
        zone: "Fast Track Observation Bay (FT-01 to FT-04)",
        urgency_instruction: "Evaluation within 60-90 minutes, minor injury/illness protocol",
        badge_cls: "bg-emerald-950 text-emerald-300 border-emerald-600"
      };
    } else {
      return {
        specialist_role: "Triage Clinical Nurse / Outpatient Coordinator",
        recommended_doctor: "Triage Nursing Staff",
        zone: "Ambulatory Clinic / Fast Track Waiting Area",
        urgency_instruction: "Routine evaluation within 120 minutes or outpatient referral",
        badge_cls: "bg-blue-950 text-blue-300 border-blue-600"
      };
    }
  };

  // Group patients into the 5 ESI Urgency categories
  const categories = [
    {
      level: 1,
      name: "Immediate Resuscitation (ESI 1)",
      subtitle: "Life-threatening emergency requiring immediate clinical intervention",
      color: "border-rose-500 bg-rose-950/20 text-rose-300",
      badge: "bg-rose-600 text-white animate-pulse",
      icon: AlertOctagon,
      patients: encounters.filter(e => e.triage_level === 1)
    },
    {
      level: 2,
      name: "Emergent High Urgency (ESI 2)",
      subtitle: "High risk of rapid deterioration, severe pain, or acute confusion",
      color: "border-amber-500 bg-amber-950/20 text-amber-300",
      badge: "bg-amber-500 text-slate-950",
      icon: AlertTriangle,
      patients: encounters.filter(e => e.triage_level === 2)
    },
    {
      level: 3,
      name: "Urgent Care (ESI 3)",
      subtitle: "Moderate urgency requiring multiple diagnostic resources and stable vitals",
      color: "border-yellow-500 bg-yellow-950/20 text-yellow-300",
      badge: "bg-yellow-500 text-slate-950",
      icon: AlertCircle,
      patients: encounters.filter(e => e.triage_level === 3)
    },
    {
      level: 4,
      name: "Less Urgent (ESI 4)",
      subtitle: "Low complexity illness requiring a single diagnostic or treatment resource",
      color: "border-emerald-500 bg-emerald-950/20 text-emerald-300",
      badge: "bg-emerald-600 text-white",
      icon: CheckCircle2,
      patients: encounters.filter(e => e.triage_level === 4)
    },
    {
      level: 5,
      name: "Non-Urgent Fast Track (ESI 5)",
      subtitle: "Routine symptoms requiring medication refill, suture removal, or exam only",
      color: "border-blue-500 bg-blue-950/20 text-blue-300",
      badge: "bg-blue-600 text-white",
      icon: Heart,
      patients: encounters.filter(e => e.triage_level === 5)
    }
  ];

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
              <h1 className="text-xl font-bold text-white tracking-tight">Patient Triage Acuity Categories</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">
                5-Level ESI System
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Patients categorized by clinical emergency tier. Click any patient to view initial intake vitals, reasoning drivers, and doctor routing.
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
            All Categories ({encounters.length})
          </button>
          {[1, 2, 3, 4, 5].map(lvl => {
            const count = encounters.filter(e => e.triage_level === lvl).length;
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
                ESI {lvl} ({count})
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search patient, complaint, ID..."
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
                    <div className={`p-2 rounded-xl border ${cat.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-black text-white tracking-tight">{cat.name}</h2>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${cat.badge}`}>
                          {cat.patients.length} {cat.patients.length === 1 ? 'Patient' : 'Patients'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{cat.subtitle}</p>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-500 font-mono">
                    Safe Wait Limit: <strong>{cat.level === 1 ? '0m (Immediate)' : cat.level === 2 ? '10-15m' : cat.level === 3 ? '30-45m' : cat.level === 4 ? '60-90m' : '120m'}</strong>
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
                                  <div className="text-[9px] text-slate-500 uppercase">AI Decompensation</div>
                                </div>
                              ) : (
                                <span className="text-[10px] text-slate-500">Triage Assigned</span>
                              )}
                            </div>
                          </div>

                          {/* Chief Complaint Presentation */}
                          <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800 text-xs">
                            <span className="text-[10px] uppercase font-bold text-slate-500 block mb-0.5">Intake Chief Complaint:</span>
                            <p className="text-slate-200 font-medium leading-snug">{patient.chief_complaint}</p>
                          </div>

                          {/* Doctor Assignment Recommendation Row */}
                          <div className="p-2.5 rounded-xl bg-indigo-950/40 border border-indigo-900/60 text-xs space-y-1">
                            <div className="flex items-center gap-1.5 text-indigo-300 font-bold text-[11px]">
                              <Stethoscope className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                              <span>Recommended Care Routing:</span>
                            </div>
                            <div className="text-slate-300 text-[11px]">
                              <strong>{routing.recommended_doctor}</strong> ({routing.specialist_role})
                            </div>
                            <div className="text-slate-400 text-[10px] flex items-center gap-1 font-mono">
                              <MapPin className="w-2.5 h-2.5 text-slate-500" />
                              <span>Take to: {routing.zone}</span>
                            </div>
                          </div>

                          {/* Bottom Meta Strip */}
                          <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-[10px] text-slate-500 font-mono">
                            <div className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-500" />
                              <span>Wait: <strong>{patient.wait_time_mins || 0} mins</strong></span>
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

      {/* Interactive Patient Triage Dossier Modal */}
      {selectedPatientForModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/90">
              <div className="flex items-center gap-3">
                <AcuityBadge level={selectedPatientForModal.triage_level} />
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">
                    {selectedPatientForModal.patient_name} — Clinical Triage Dossier
                  </h3>
                  <p className="text-[11px] text-slate-400 font-mono">
                    ID: {selectedPatientForModal.patient_id} · Encounter: #{selectedPatientForModal.encounter_id}
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
                  {/* SECTION 1: Intake Information Collected at Start */}
                  <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 space-y-3">
                    <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs uppercase tracking-wider">
                      <Activity className="w-4 h-4" />
                      <span>1. Intake Information Collected at Arrival</span>
                    </div>

                    <div className="space-y-2">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-500">Chief Complaint &amp; Presentation:</span>
                        <p className="text-slate-100 text-sm font-semibold mt-0.5">{selectedPatientForModal.chief_complaint}</p>
                      </div>

                      {/* Vital Signs Grid */}
                      {patientDetailData?.observations && patientDetailData.observations.length > 0 ? (
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1.5">Intake Vital Signs Parameters:</span>
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
                                    <div className="text-[10px] text-slate-400">SpO₂ Oxygen</div>
                                    <div className={`font-bold text-sm mt-0.5 ${obs.spo2 < 92 ? 'text-rose-400 font-black' : 'text-emerald-400'}`}>{obs.spo2}%</div>
                                  </div>
                                  <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                                    <div className="text-[10px] text-slate-400">Resp Rate</div>
                                    <div className={`font-bold text-sm mt-0.5 ${obs.rr >= 24 ? 'text-rose-400' : 'text-slate-200'}`}>{obs.rr} /min</div>
                                  </div>
                                  <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                                    <div className="text-[10px] text-slate-400">Temperature</div>
                                    <div className="font-bold text-sm mt-0.5 text-slate-200">{obs.temp}°C</div>
                                  </div>
                                  <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                                    <div className="text-[10px] text-slate-400">GCS Scale</div>
                                    <div className="font-bold text-sm mt-0.5 text-slate-200">{obs.gcs} / 15</div>
                                  </div>
                                  <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                                    <div className="text-[10px] text-slate-400">Pain Score</div>
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

                  {/* SECTION 2: Why the Patient is in this Emergency Category */}
                  <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 space-y-3">
                    <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-wider">
                      <Sparkles className="w-4 h-4" />
                      <span>2. Clinical &amp; AI Reasoning for Triage Category</span>
                    </div>

                    <div className="space-y-3">
                      <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 flex items-center justify-between">
                        <div>
                          <div className="text-[10px] text-slate-400 uppercase font-bold">Assigned Emergency Tier</div>
                          <div className="text-sm font-black text-white mt-0.5">
                            Level {selectedPatientForModal.triage_level} — {selectedPatientForModal.acuity_category || 'Assigned Urgency'}
                          </div>
                        </div>
                        {selectedPatientForModal.ai_risk && (
                          <div className="text-right font-mono">
                            <div className="text-[10px] text-slate-400 uppercase">AI Decompensation Risk</div>
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
                          <span className="text-[10px] uppercase font-bold text-slate-500 block">Top Observed Variables Determining Risk:</span>
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
                            ? "Patient presents with abnormal vital sign biomarkers and severe acute symptoms requiring immediate priority care."
                            : "Patient vital signs remain physiologically compensated with stable baseline parameters."}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* SECTION 3: Doctor & Care Routing Recommendation */}
                  {(() => {
                    const routing = getDoctorCareRouting(selectedPatientForModal, patientDetailData);
                    return (
                      <div className="bg-slate-950/80 p-4 rounded-2xl border border-indigo-800/60 space-y-3">
                        <div className="flex items-center gap-2 text-indigo-300 font-bold text-xs uppercase tracking-wider">
                          <Stethoscope className="w-4 h-4" />
                          <span>3. Recommended Doctor Assignment &amp; Department Routing</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
                            <span className="text-[10px] uppercase font-bold text-slate-400">Assigned / Recommended Doctor</span>
                            <div className="font-bold text-slate-100 text-sm">{routing.recommended_doctor}</div>
                            <div className="text-[11px] text-indigo-300">{routing.specialist_role}</div>
                          </div>

                          <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
                            <span className="text-[10px] uppercase font-bold text-slate-400">Target Clinical Bay / Station</span>
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
                Close Dossier
              </button>

              <div className="flex items-center gap-2">
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
                    <span>Open Physician Review</span>
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
                  <span>Full Patient Chart</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
