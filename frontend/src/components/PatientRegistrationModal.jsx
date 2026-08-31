import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  UserPlus, Activity, Heart, X, CheckCircle2, AlertTriangle, 
  Clock, Stethoscope, Sparkles, Shield, ArrowRight, UserCheck, Eye
} from 'lucide-react';
import { PRIORITY_LEVELS, getPriorityMeta, getConfidenceMeta, getRiskCategoryMeta } from '../utils/terminology';

const INITIAL_FORM_STATE = {
  first_name: '',
  last_name: '',
  age: '',
  gender: '',
  phone: '',
  allergies: '',
  medical_history: '',
  chief_complaint: '',
  arrival_mode: '',
  bed_number: '',
  pain_score: '',
  hr: '',
  sbp: '',
  dbp: '',
  rr: '',
  spo2: '',
  temp: ''
};

export const PatientRegistrationModal = ({ isOpen, onClose, onPatientRegistered, onViewPatient }) => {
  const { authHeaders, addToast } = useAuth();
  
  const [formData, setFormData] = useState(INITIAL_FORM_STATE);
  const [validationErrors, setValidationErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [assessmentResult, setAssessmentResult] = useState(null);

  // Clean reset every time the modal is opened
  useEffect(() => {
    if (isOpen) {
      setFormData(INITIAL_FORM_STATE);
      setValidationErrors({});
      setSubmitting(false);
      setAssessmentResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // ─────────────────────────────────────────────
  // Input Validation (Strict clinical safety)
  // ─────────────────────────────────────────────

  const validate = () => {
    const errors = {};

    // 1. Patient Info
    if (!formData.first_name.trim()) {
      errors.first_name = "First name is required.";
    }

    if (!formData.last_name.trim()) {
      errors.last_name = "Last name is required.";
    }

    // Age validation (Whole numbers 0-125, reject negative/letters/decimals)
    if (!formData.age.trim()) {
      errors.age = "Please enter a valid age in years.";
    } else {
      const ageNum = Number(formData.age);
      if (isNaN(ageNum) || !Number.isInteger(ageNum) || ageNum < 0 || ageNum > 125) {
        errors.age = "Please enter a valid age in years.";
      }
    }

    if (!formData.gender) {
      errors.gender = "Please select biological sex.";
    }

    // 2. Clinical Presentation
    if (!formData.chief_complaint.trim()) {
      errors.chief_complaint = "Chief complaint and presenting symptoms are required.";
    }

    if (!formData.arrival_mode) {
      errors.arrival_mode = "Please select arrival mode.";
    }

    // 3. Bedside Vitals validation
    if (!formData.hr.trim()) {
      errors.hr = "Heart rate is required.";
    } else {
      const hrNum = Number(formData.hr);
      if (isNaN(hrNum) || hrNum <= 0 || hrNum > 300) {
        errors.hr = "Please enter a valid heart rate (bpm).";
      }
    }

    if (!formData.sbp.trim()) {
      errors.sbp = "Systolic blood pressure is required.";
    } else {
      const sbpNum = Number(formData.sbp);
      if (isNaN(sbpNum) || sbpNum <= 0 || sbpNum > 300) {
        errors.sbp = "Please enter a valid systolic blood pressure (mmHg).";
      }
    }

    if (formData.dbp.trim()) {
      const dbpNum = Number(formData.dbp);
      if (isNaN(dbpNum) || dbpNum <= 0 || dbpNum > 200) {
        errors.dbp = "Please enter a valid diastolic blood pressure (mmHg).";
      }
    }

    if (!formData.spo2.trim()) {
      errors.spo2 = "Oxygen saturation (SpO₂) is required.";
    } else {
      const spo2Num = Number(formData.spo2);
      if (isNaN(spo2Num) || spo2Num < 40 || spo2Num > 100) {
        errors.spo2 = "Please enter a valid SpO₂ percentage (40–100%).";
      }
    }

    if (!formData.rr.trim()) {
      errors.rr = "Respiratory rate is required.";
    } else {
      const rrNum = Number(formData.rr);
      if (isNaN(rrNum) || rrNum <= 0 || rrNum > 80) {
        errors.rr = "Please enter a valid respiratory rate (/min).";
      }
    }

    if (formData.pain_score.trim()) {
      const painNum = Number(formData.pain_score);
      if (isNaN(painNum) || painNum < 0 || painNum > 10) {
        errors.pain_score = "Pain level must be between 0 and 10.";
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ─────────────────────────────────────────────
  // Submission & ML Inference Flow
  // ─────────────────────────────────────────────

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) {
      addToast("Please complete all required fields with valid clinical values.", "warning");
      return;
    }

    setSubmitting(true);
    try {
      // Step 1: Register Patient (MRN automatically assigned server-side)
      const ptRes = await fetch('/api/patients', {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: formData.first_name.trim(),
          last_name: formData.last_name.trim(),
          age: parseInt(formData.age, 10),
          gender: formData.gender,
          phone: formData.phone.trim() || undefined,
          allergies: formData.allergies.trim() || undefined,
          medical_history: formData.medical_history.trim() || undefined
        })
      });

      if (!ptRes.ok) {
        throw new Error("Unable to register patient. Please check the information and try again.");
      }

      const ptData = await ptRes.json();
      const patient = ptData.patient;
      const patientId = patient.patient_id;

      // Step 2: Create Visit Encounter
      const encRes = await fetch('/api/encounters', {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: patientId,
          chief_complaint: formData.chief_complaint.trim(),
          arrival_mode: formData.arrival_mode,
          bed_number: formData.bed_number.trim() || 'Waiting Area'
        })
      });

      if (!encRes.ok) {
        throw new Error("Unable to create patient visit. Please try again.");
      }

      const encData = await encRes.json();
      const encounter = encData.encounter;
      const encounterId = encounter.encounter_id;

      // Step 3: Record Bedside Vital Signs
      const vitalsRes = await fetch(`/api/encounters/${encounterId}/vitals`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hr: parseFloat(formData.hr),
          sbp: parseFloat(formData.sbp),
          dbp: formData.dbp.trim() ? parseFloat(formData.dbp) : undefined,
          rr: parseFloat(formData.rr),
          spo2: parseFloat(formData.spo2),
          temp: formData.temp.trim() ? parseFloat(formData.temp) : 37.0,
          gcs: 15,
          pain_score: formData.pain_score.trim() ? parseInt(formData.pain_score, 10) : 0,
          notes: 'Bedside vital signs recorded during intake.'
        })
      });

      if (!vitalsRes.ok) {
        throw new Error("Unable to record bedside vital signs.");
      }

      // Step 4: Run Supervised ML Clinical Risk & Priority Assessment
      let aiAssessment = null;
      let aiExplanation = null;
      let predictedLevel = 3;
      let aiAvailable = true;

      try {
        const aiRes = await fetch(`/api/encounters/${encounterId}/ai-assessment`, {
          method: 'POST',
          headers: authHeaders
        });

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          aiAssessment = aiData.assessment;
          aiExplanation = aiData.explanation;
          predictedLevel = aiAssessment.predicted_triage_level || 3;
        } else {
          aiAvailable = false;
        }
      } catch (aiErr) {
        aiAvailable = false;
      }

      const priorityMeta = getPriorityMeta(predictedLevel);

      // Step 5: Record Initial Triage with the ML-Recommended Priority
      await fetch(`/api/encounters/${encounterId}/triage`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          triage_level: predictedLevel,
          acuity_category: priorityMeta.primary,
          chief_complaint: formData.chief_complaint.trim(),
          pain_score: formData.pain_score.trim() ? parseInt(formData.pain_score, 10) : 0,
          mobility: formData.arrival_mode?.includes('Ambulance') ? 'Stretcher' : 'Ambulatory',
          notes: aiAvailable 
            ? 'AI-supported initial triage assessment based on presenting symptoms and baseline vitals.'
            : 'Initial clinical triage assessment (AI service offline).'
        })
      });

      addToast(`Patient ${patient.first_name} ${patient.last_name} registered successfully.`, "success");
      
      // Transition modal to Success & Assessment View
      setAssessmentResult({
        patient,
        encounter,
        aiAssessment,
        aiExplanation,
        aiAvailable,
        predictedLevel,
        priorityMeta,
        assessmentTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      });

      if (onPatientRegistered) {
        onPatientRegistered(encounterId);
      }
    } catch (err) {
      console.error('Registration error:', err);
      addToast(err.message || "Unable to register patient. Please check the information and try again.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const resetFormForNextPatient = () => {
    setFormData(INITIAL_FORM_STATE);
    setValidationErrors({});
    setAssessmentResult(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                {assessmentResult ? 'AI-Supported Triage Assessment' : 'Register Patient & Clinical Intake'}
              </h3>
              <p className="text-[11px] text-slate-400">
                {assessmentResult 
                  ? 'ML model evaluated clinical presentation, vitals, and determined care priority'
                  : 'Record patient demographics and bedside vitals for ML care priority evaluation'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ============================================================ */}
        {/* VIEW 1: REGISTRATION & INTAKE FORM (COMPLETELY BLANK BY DEFAULT) */}
        {/* ============================================================ */}
        {!assessmentResult ? (
          <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-5 text-xs">
            
            {/* SECTION 1: PATIENT INFORMATION */}
            <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-cyan-400 tracking-wider">
                  SECTION 1: PATIENT INFORMATION
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  MRN: Automatically assigned after registration
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                
                {/* First Name */}
                <div className="space-y-1">
                  <label className="block text-slate-400 font-bold">First Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. John"
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    className={`w-full bg-slate-900 border ${validationErrors.first_name ? 'border-rose-500' : 'border-slate-800'} rounded-xl p-2 text-slate-200 focus:outline-none focus:border-cyan-500`}
                  />
                  {validationErrors.first_name && (
                    <span className="text-[10px] text-rose-400 font-semibold">{validationErrors.first_name}</span>
                  )}
                </div>

                {/* Last Name */}
                <div className="space-y-1">
                  <label className="block text-slate-400 font-bold">Last Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Smith"
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    className={`w-full bg-slate-900 border ${validationErrors.last_name ? 'border-rose-500' : 'border-slate-800'} rounded-xl p-2 text-slate-200 focus:outline-none focus:border-cyan-500`}
                  />
                  {validationErrors.last_name && (
                    <span className="text-[10px] text-rose-400 font-semibold">{validationErrors.last_name}</span>
                  )}
                </div>

                {/* Age (Fixed: No spinners, no leading 0, whole years only) */}
                <div className="space-y-1">
                  <label className="block text-slate-400 font-bold">Age (Years) *</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    required
                    placeholder="e.g. 45"
                    value={formData.age}
                    onChange={(e) => {
                      const cleanVal = e.target.value.replace(/\D/g, ''); // Disallow letters, decimals, negative signs
                      setFormData({ ...formData, age: cleanVal });
                    }}
                    className={`w-full bg-slate-900 border ${validationErrors.age ? 'border-rose-500' : 'border-slate-800'} rounded-xl p-2 text-slate-200 font-mono focus:outline-none focus:border-cyan-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
                  />
                  {validationErrors.age && (
                    <span className="text-[10px] text-rose-400 font-semibold">{validationErrors.age}</span>
                  )}
                </div>

                {/* Biological Sex */}
                <div className="space-y-1">
                  <label className="block text-slate-400 font-bold">Biological Sex *</label>
                  <select
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                    className={`w-full bg-slate-900 border ${validationErrors.gender ? 'border-rose-500' : 'border-slate-800'} rounded-xl p-2 text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer`}
                  >
                    <option value="">[ Select biological sex... ]</option>
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Other">Other / Non-Binary</option>
                  </select>
                  {validationErrors.gender && (
                    <span className="text-[10px] text-rose-400 font-semibold">{validationErrors.gender}</span>
                  )}
                </div>

                {/* Contact Phone (Starts blank) */}
                <div className="space-y-1 sm:col-span-2">
                  <label className="block text-slate-400 font-bold">Contact Phone (Optional)</label>
                  <input
                    type="tel"
                    placeholder="e.g. (555) 000-0000"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>

              </div>
            </div>

            {/* SECTION 2: CLINICAL PRESENTATION */}
            <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 space-y-3">
              <span className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider block">
                SECTION 2: CLINICAL PRESENTATION
              </span>
              
              <div className="space-y-3">
                {/* Chief Complaint */}
                <div className="space-y-1">
                  <label className="block text-slate-400 font-bold">Chief Complaint &amp; Presenting Symptoms *</label>
                  <textarea
                    required
                    rows={2}
                    placeholder="Describe presenting symptoms (e.g. Sudden severe chest tightness radiating to left arm)..."
                    value={formData.chief_complaint}
                    onChange={(e) => setFormData({ ...formData, chief_complaint: e.target.value })}
                    className={`w-full bg-slate-900 border ${validationErrors.chief_complaint ? 'border-rose-500' : 'border-slate-800'} rounded-xl p-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500`}
                  />
                  {validationErrors.chief_complaint && (
                    <span className="text-[10px] text-rose-400 font-semibold">{validationErrors.chief_complaint}</span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-slate-400 font-bold">Arrival Mode *</label>
                    <select
                      value={formData.arrival_mode}
                      onChange={(e) => setFormData({ ...formData, arrival_mode: e.target.value })}
                      className={`w-full bg-slate-900 border ${validationErrors.arrival_mode ? 'border-rose-500' : 'border-slate-800'} rounded-xl p-2 text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer`}
                    >
                      <option value="">[ Select arrival mode... ]</option>
                      <option value="Walk-in">Walk-in</option>
                      <option value="Ambulance (EMS)">Ambulance (EMS)</option>
                      <option value="Hospital Transfer">Hospital Transfer</option>
                      <option value="Wheelchair Intake">Wheelchair Intake</option>
                    </select>
                    {validationErrors.arrival_mode && (
                      <span className="text-[10px] text-rose-400 font-semibold">{validationErrors.arrival_mode}</span>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="block text-slate-400 font-bold">Assigned Care Bay / Bed (Optional)</label>
                    <input
                      type="text"
                      placeholder="Not yet assigned (or e.g. BED-01)"
                      value={formData.bed_number}
                      onChange={(e) => setFormData({ ...formData, bed_number: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-slate-400 font-bold">Known Medical History (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Hypertension, COPD, Type 2 Diabetes"
                      value={formData.medical_history}
                      onChange={(e) => setFormData({ ...formData, medical_history: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-slate-200 focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-slate-400 font-bold">Known Allergies (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Penicillin, NSAIDs, None Known"
                      value={formData.allergies}
                      onChange={(e) => setFormData({ ...formData, allergies: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-slate-200 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* SECTION 3: BEDSIDE VITAL SIGNS */}
            <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">
                  SECTION 3: BEDSIDE VITAL SIGNS
                </span>
                <span className="text-[10px] text-slate-500">
                  Measured at bedside prior to form completion
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 font-mono">
                
                {/* Heart Rate */}
                <div className="space-y-1">
                  <label className="block text-slate-400 text-[11px] font-sans font-bold">Heart Rate (bpm) *</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    placeholder="e.g. 110"
                    value={formData.hr}
                    onChange={(e) => setFormData({ ...formData, hr: e.target.value.replace(/\D/g, '') })}
                    className={`w-full bg-slate-900 border ${validationErrors.hr ? 'border-rose-500' : 'border-slate-800'} rounded-xl p-2 text-slate-200 focus:outline-none focus:border-cyan-500`}
                  />
                  {validationErrors.hr && <span className="text-[9px] text-rose-400 font-sans">{validationErrors.hr}</span>}
                </div>

                {/* Systolic BP */}
                <div className="space-y-1">
                  <label className="block text-slate-400 text-[11px] font-sans font-bold">Systolic BP (mmHg) *</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    placeholder="e.g. 140"
                    value={formData.sbp}
                    onChange={(e) => setFormData({ ...formData, sbp: e.target.value.replace(/\D/g, '') })}
                    className={`w-full bg-slate-900 border ${validationErrors.sbp ? 'border-rose-500' : 'border-slate-800'} rounded-xl p-2 text-slate-200 focus:outline-none focus:border-cyan-500`}
                  />
                  {validationErrors.sbp && <span className="text-[9px] text-rose-400 font-sans">{validationErrors.sbp}</span>}
                </div>

                {/* Diastolic BP */}
                <div className="space-y-1">
                  <label className="block text-slate-400 text-[11px] font-sans font-bold">Diastolic BP (mmHg)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="e.g. 90"
                    value={formData.dbp}
                    onChange={(e) => setFormData({ ...formData, dbp: e.target.value.replace(/\D/g, '') })}
                    className={`w-full bg-slate-900 border ${validationErrors.dbp ? 'border-rose-500' : 'border-slate-800'} rounded-xl p-2 text-slate-200 focus:outline-none focus:border-cyan-500`}
                  />
                  {validationErrors.dbp && <span className="text-[9px] text-rose-400 font-sans">{validationErrors.dbp}</span>}
                </div>

                {/* SpO2 */}
                <div className="space-y-1">
                  <label className="block text-slate-400 text-[11px] font-sans font-bold">SpO₂ (%) *</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    placeholder="e.g. 92"
                    value={formData.spo2}
                    onChange={(e) => setFormData({ ...formData, spo2: e.target.value.replace(/\D/g, '') })}
                    className={`w-full bg-slate-900 border ${validationErrors.spo2 ? 'border-rose-500' : 'border-slate-800'} rounded-xl p-2 text-slate-200 focus:outline-none focus:border-cyan-500`}
                  />
                  {validationErrors.spo2 && <span className="text-[9px] text-rose-400 font-sans">{validationErrors.spo2}</span>}
                </div>

                {/* Resp Rate */}
                <div className="space-y-1">
                  <label className="block text-slate-400 text-[11px] font-sans font-bold">Respiratory Rate (/min) *</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    placeholder="e.g. 24"
                    value={formData.rr}
                    onChange={(e) => setFormData({ ...formData, rr: e.target.value.replace(/\D/g, '') })}
                    className={`w-full bg-slate-900 border ${validationErrors.rr ? 'border-rose-500' : 'border-slate-800'} rounded-xl p-2 text-slate-200 focus:outline-none focus:border-cyan-500`}
                  />
                  {validationErrors.rr && <span className="text-[9px] text-rose-400 font-sans">{validationErrors.rr}</span>}
                </div>

                {/* Pain Level */}
                <div className="space-y-1">
                  <label className="block text-slate-400 text-[11px] font-sans font-bold">Pain Level (0–10)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="e.g. 6"
                    value={formData.pain_score}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      if (val === '' || (Number(val) >= 0 && Number(val) <= 10)) {
                        setFormData({ ...formData, pain_score: val });
                      }
                    }}
                    className={`w-full bg-slate-900 border ${validationErrors.pain_score ? 'border-rose-500' : 'border-slate-800'} rounded-xl p-2 text-slate-200 focus:outline-none focus:border-cyan-500`}
                  />
                  {validationErrors.pain_score && <span className="text-[9px] text-rose-400 font-sans">{validationErrors.pain_score}</span>}
                </div>

              </div>
            </div>

            {/* SECTION 4: ASSESSMENT NOTICE */}
            <div className="p-3.5 rounded-2xl bg-indigo-950/40 border border-indigo-900/60 flex items-start gap-2.5 text-xs text-indigo-300">
              <Sparkles className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block text-white text-[11px]">SECTION 4: ML CARE PRIORITY EVALUATION</span>
                <span>The care priority is determined automatically by the ML assessment model after clinical intake submission. No manual pre-selection is required.</span>
              </div>
            </div>

            {/* Form Action Buttons */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold shadow-lg shadow-cyan-900/40 transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{submitting ? 'Evaluating Clinical Intake...' : 'Complete Registration & Assess Patient'}</span>
              </button>
            </div>

          </form>
        ) : (
          /* ============================================================ */
          /* VIEW 2: SUCCESS STATE & ML TRIAGE RECOMMENDATION RESULT     */
          /* ============================================================ */
          <div className="p-6 space-y-5 overflow-y-auto">
            
            {/* Success Banner */}
            <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-800/80 flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-950 text-emerald-400 border border-emerald-700">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Patient Registered Successfully</h4>
                <p className="text-xs text-emerald-300/80">
                  {assessmentResult.patient.first_name} {assessmentResult.patient.last_name} ({assessmentResult.patient.age}y {assessmentResult.patient.gender}) intake recorded.
                </p>
              </div>
            </div>

            {/* Patient Identifiers */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 font-mono text-xs">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase font-sans font-bold block">Patient Name</span>
                <span className="font-bold text-white font-sans">{assessmentResult.patient.first_name} {assessmentResult.patient.last_name}</span>
              </div>
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase font-sans font-bold block">Automatically Assigned MRN</span>
                <span className="font-bold text-cyan-400">{assessmentResult.patient.mrn}</span>
              </div>
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 col-span-2 sm:col-span-1">
                <span className="text-[10px] text-slate-500 uppercase font-sans font-bold block">Visit Encounter</span>
                <span className="font-bold text-indigo-300">#{assessmentResult.encounter.encounter_id}</span>
              </div>
            </div>

            {/* AI-SUPPORTED TRIAGE ASSESSMENT CARD */}
            <div className="p-5 rounded-3xl bg-slate-950 border border-indigo-900/60 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-indigo-400" />
                  <span className="text-xs uppercase font-bold text-indigo-300 tracking-wider">
                    AI-SUPPORTED TRIAGE ASSESSMENT
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-800 font-mono">
                    Model v1.0
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {assessmentResult.assessmentTime}
                  </span>
                </div>
              </div>

              {/* Recommended Priority */}
              <div className="space-y-1">
                <div className="text-[10px] text-slate-400 uppercase font-bold">Recommended Care Priority</div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-black text-white">
                    {assessmentResult.priorityMeta.primary}
                  </span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${assessmentResult.priorityMeta.badgeCls}`}>
                    {assessmentResult.priorityMeta.secondary}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">{assessmentResult.priorityMeta.desc}</p>
              </div>

              {/* AI Risk & Confidence Strip */}
              {assessmentResult.aiAssessment ? (
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">AI Risk</span>
                    <div className="text-base font-black text-cyan-300 font-mono">
                      {(assessmentResult.aiAssessment.risk_probability * 100).toFixed(1)}%
                    </div>
                    <span className="text-[10px] text-slate-400 block font-sans">
                      Category: <strong>{assessmentResult.aiAssessment.risk_category}</strong>
                    </span>
                  </div>

                  <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">AI Confidence</span>
                    <div className="text-base font-black text-emerald-400 font-mono">
                      {assessmentResult.aiAssessment.confidence_score >= 80 ? 'HIGH' : assessmentResult.aiAssessment.confidence_score >= 60 ? 'MODERATE' : 'LOW'}
                    </div>
                    <span className="text-[10px] text-slate-400 block font-sans">
                      Confidence Score: <strong>{assessmentResult.aiAssessment.confidence_score}%</strong>
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-xs text-amber-300">
                  AI assessment is currently unavailable.
                </div>
              )}

              {/* Top Influencing Features (SHAP) */}
              {assessmentResult.aiExplanation?.top_features && assessmentResult.aiExplanation.top_features.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                    Factors Influencing AI Assessment (SHAP)
                  </span>
                  <div className="space-y-1.5">
                    {assessmentResult.aiExplanation.top_features.slice(0, 3).map((f, i) => (
                      <div key={i} className="p-2 bg-slate-900 rounded-lg flex items-center justify-between text-xs">
                        <span className="text-slate-300 font-semibold">{f.feature_name || f.feature}: {f.value}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono ${
                          (f.contribution || f.shap_value) > 0 ? 'bg-rose-950 text-rose-300' : 'bg-emerald-950 text-emerald-300'
                        }`}>
                          {(f.contribution || f.shap_value) > 0 ? `+${((f.contribution || f.shap_value) * 100).toFixed(0)}% Risk` : `${((f.contribution || f.shap_value) * 100).toFixed(0)}% Risk`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
                <Shield className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Clinical Note:</strong> ML priority is an AI clinical recommendation. Authorized clinicians can change or override priority in the patient queue/workspace with documented reason.
                </span>
              </div>
            </div>

            {/* Success Actions */}
            <div className="pt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={resetFormForNextPatient}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition cursor-pointer"
              >
                + Register Another Patient
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-lg transition flex items-center gap-1.5 cursor-pointer"
                >
                  <span>View in Live ED Queue</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
};
