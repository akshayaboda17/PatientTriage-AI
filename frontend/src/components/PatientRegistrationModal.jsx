import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserPlus, Activity, Heart, X, CheckCircle2, AlertTriangle, Clock, Stethoscope } from 'lucide-react';

export const PatientRegistrationModal = ({ isOpen, onClose, onPatientRegistered }) => {
  const { authHeaders, addToast, currentStaff } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    mrn: `MRN-${Math.floor(1000 + Math.random() * 9000)}`,
    age: 45,
    gender: 'Female',
    phone: '555-0144',
    allergies: 'None Known',
    medical_history: 'Hypertension',
    chief_complaint: 'Acute worsening shortness of breath and chest tightness',
    arrival_mode: 'Ambulance (EMS)',
    bed_number: 'BED-01',
    triage_level: 2,
    acuity_category: 'Emergency — Immediate Assessment',
    pain_score: 6,
    // Baseline Vitals
    hr: 110,
    sbp: 140,
    dbp: 90,
    rr: 24,
    spo2: 92,
    temp: 37.2
  });

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.first_name.trim() || !formData.last_name.trim() || !formData.chief_complaint.trim()) {
      addToast("First name, last name, and chief complaint are required.", "warning");
      return;
    }

    setSubmitting(true);
    try {
      // Step 1: Create Patient
      const ptRes = await fetch('/api/patients', {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: formData.first_name.trim(),
          last_name: formData.last_name.trim(),
          mrn: formData.mrn.trim(),
          age: parseFloat(formData.age) || 0,
          gender: formData.gender,
          phone: formData.phone.trim(),
          allergies: formData.allergies.trim(),
          medical_history: formData.medical_history.trim()
        })
      });

      if (!ptRes.ok) {
        const err = await ptRes.json();
        throw new Error(err.detail || "Failed to register patient demographics.");
      }

      const ptData = await ptRes.json();
      const patientId = ptData.patient.patient_id;

      // Step 2: Create ED Visit
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
        const err = await encRes.json();
        throw new Error(err.detail || "Failed to initiate patient visit.");
      }

      const encData = await encRes.json();
      const encounterId = encData.encounter.encounter_id;

      // Step 3: Record Initial Triage
      await fetch(`/api/encounters/${encounterId}/triage`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          triage_level: parseInt(formData.triage_level) || 3,
          acuity_category: formData.acuity_category,
          chief_complaint: formData.chief_complaint.trim(),
          pain_score: parseInt(formData.pain_score) || 0,
          mobility: formData.arrival_mode.includes('Ambulance') ? 'Stretcher' : 'Ambulatory'
        })
      });

      // Step 4: Record Initial Vital Signs
      await fetch(`/api/encounters/${encounterId}/vitals`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hr: parseFloat(formData.hr) || 80,
          sbp: parseFloat(formData.sbp) || 120,
          dbp: parseFloat(formData.dbp) || 80,
          rr: parseFloat(formData.rr) || 16,
          spo2: parseFloat(formData.spo2) || 98,
          temp: parseFloat(formData.temp) || 37.0,
          gcs: 15,
          pain_score: parseInt(formData.pain_score) || 0,
          notes: 'Initial intake baseline vitals recorded.'
        })
      });

      // Step 5: Automatically Trigger AI Risk Assessment
      await fetch(`/api/encounters/${encounterId}/ai-risk`, {
        method: 'POST',
        headers: authHeaders
      });

      addToast(`Patient ${formData.first_name} ${formData.last_name} registered and evaluated.`, "success");
      onClose();
      if (onPatientRegistered) onPatientRegistered(encounterId);
    } catch (err) {
      console.error('Registration error:', err);
      addToast(err.message || "Failed to complete patient intake.", "error");
    } finally {
      setSubmitting(false);
    }
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
              <h3 className="text-base font-bold text-white tracking-tight">Register Patient &amp; Intake Assessment</h3>
              <p className="text-[11px] text-slate-400">Record patient demographics, intake symptoms, and baseline vital signs</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-5 text-xs">
          
          {/* SECTION 1: Patient Demographics */}
          <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 space-y-3">
            <span className="text-[10px] uppercase font-bold text-cyan-400 tracking-wider block">
              1. Patient Demographics &amp; Identification
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="block text-slate-400 font-bold">First Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. John"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-400 font-bold">Last Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Smith"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-400 font-bold">Age (Years) *</label>
                <input
                  type="number"
                  required
                  value={formData.age}
                  onChange={(e) => setFormData({ ...formData, age: Number(e.target.value) })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-400 font-bold">Biological Sex *</label>
                <select
                  value={formData.gender}
                  onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                  <option value="Other">Other / Non-Binary</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-slate-400 font-bold">Medical Record Number (MRN)</label>
                <input
                  type="text"
                  value={formData.mrn}
                  onChange={(e) => setFormData({ ...formData, mrn: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-400 font-bold">Contact Phone</label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          </div>

          {/* SECTION 2: Intake Assessment */}
          <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 space-y-3">
            <span className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider block">
              2. Intake Assessment &amp; Reported Symptoms
            </span>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="block text-slate-400 font-bold">Chief Complaint &amp; Presenting Symptoms *</label>
                <textarea
                  required
                  rows={2}
                  placeholder="Describe reported symptoms (e.g. Acute severe chest tightness radiating to left arm)..."
                  value={formData.chief_complaint}
                  onChange={(e) => setFormData({ ...formData, chief_complaint: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="block text-slate-400 font-bold">Arrival Mode</label>
                  <select
                    value={formData.arrival_mode}
                    onChange={(e) => setFormData({ ...formData, arrival_mode: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-slate-200 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="Walk-in">Walk-in</option>
                    <option value="Ambulance (EMS)">Ambulance (EMS)</option>
                    <option value="Hospital Transfer">Hospital Transfer</option>
                    <option value="Wheelchair Intake">Wheelchair Intake</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-slate-400 font-bold">Assigned Care Bay / Bed</label>
                  <input
                    type="text"
                    placeholder="e.g. BED-02 / RESUS-01"
                    value={formData.bed_number}
                    onChange={(e) => setFormData({ ...formData, bed_number: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-slate-400 font-bold">Care Priority (ESI)</label>
                  <select
                    value={formData.triage_level}
                    onChange={(e) => {
                      const lvl = Number(e.target.value);
                      const categories = {
                        1: 'Critical — Immediate Care',
                        2: 'Emergency — Immediate Assessment',
                        3: 'Urgent — Prompt Assessment',
                        4: 'Less Urgent',
                        5: 'Non-Urgent'
                      };
                      setFormData({ 
                        ...formData, 
                        triage_level: lvl,
                        acuity_category: categories[lvl]
                      });
                    }}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-slate-200 focus:outline-none focus:border-cyan-500 font-bold"
                  >
                    <option value={1}>Level 1 — Critical (Immediate Care)</option>
                    <option value={2}>Level 2 — Emergency (Immediate Assessment)</option>
                    <option value={3}>Level 3 — Urgent (Prompt Assessment)</option>
                    <option value={4}>Level 4 — Less Urgent</option>
                    <option value={5}>Level 5 — Non-Urgent</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-slate-400 font-bold">Known Medical History</label>
                  <input
                    type="text"
                    placeholder="e.g. Hypertension, COPD, Type 2 Diabetes"
                    value={formData.medical_history}
                    onChange={(e) => setFormData({ ...formData, medical_history: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-slate-400 font-bold">Known Allergies</label>
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

          {/* SECTION 3: Baseline Vital Signs */}
          <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 space-y-3">
            <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider block">
              3. Baseline Intake Vital Signs
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 font-mono">
              <div className="space-y-1">
                <label className="block text-slate-400 text-[11px] font-sans font-bold">Heart Rate (bpm) *</label>
                <input
                  type="number"
                  required
                  value={formData.hr}
                  onChange={(e) => setFormData({ ...formData, hr: Number(e.target.value) })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-400 text-[11px] font-sans font-bold">Systolic BP (mmHg) *</label>
                <input
                  type="number"
                  required
                  value={formData.sbp}
                  onChange={(e) => setFormData({ ...formData, sbp: Number(e.target.value) })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-400 text-[11px] font-sans font-bold">Diastolic BP (mmHg)</label>
                <input
                  type="number"
                  value={formData.dbp}
                  onChange={(e) => setFormData({ ...formData, dbp: Number(e.target.value) })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-400 text-[11px] font-sans font-bold">Oxygen SpO₂ (%) *</label>
                <input
                  type="number"
                  required
                  value={formData.spo2}
                  onChange={(e) => setFormData({ ...formData, spo2: Number(e.target.value) })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-400 text-[11px] font-sans font-bold">Resp Rate (/min) *</label>
                <input
                  type="number"
                  required
                  value={formData.rr}
                  onChange={(e) => setFormData({ ...formData, rr: Number(e.target.value) })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-400 text-[11px] font-sans font-bold">Pain Level (0-10)</label>
                <input
                  type="number"
                  value={formData.pain_score}
                  onChange={(e) => setFormData({ ...formData, pain_score: Number(e.target.value) })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
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
              <span>{submitting ? 'Registering Patient...' : 'Complete Registration & Assess Patient'}</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
