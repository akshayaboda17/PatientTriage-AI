import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserPlus, Activity, Heart, X, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';

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
    arrival_mode: 'Ambulance',
    bed_number: 'Bay-03',
    triage_level: 2,
    acuity_category: 'Emergent',
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

      // Step 2: Create ED Encounter
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
        throw new Error(err.detail || "Failed to initiate ED encounter.");
      }

      const encData = await encRes.json();
      const encounterId = encData.encounter.encounter_id;

      // Step 3: Record Triage
      await fetch(`/api/encounters/${encounterId}/triage`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          triage_level: parseInt(formData.triage_level) || 3,
          acuity_category: formData.acuity_category,
          chief_complaint: formData.chief_complaint.trim(),
          pain_score: parseInt(formData.pain_score) || 0,
          mobility: formData.arrival_mode === 'Ambulance' ? 'Stretcher' : 'Ambulatory'
        })
      });

      // Step 4: Record Initial Baseline Vitals
      await fetch(`/api/encounters/${encounterId}/vitals`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hr: parseInt(formData.hr) || 80,
          sbp: parseInt(formData.sbp) || 120,
          dbp: parseInt(formData.dbp) || 80,
          rr: parseInt(formData.rr) || 16,
          spo2: parseInt(formData.spo2) || 98,
          temp: parseFloat(formData.temp) || 37.0,
          pain_score: parseInt(formData.pain_score) || 0,
          notes: 'Initial triage baseline vital signs'
        })
      });

      addToast(`Patient ${formData.first_name} ${formData.last_name} enrolled into ED queue successfully.`, "success");
      onClose();
      if (onPatientRegistered) onPatientRegistered(encounterId);
    } catch (err) {
      addToast(err.message || "Encounter creation failed.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 my-8">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-cyan-400 font-bold text-sm">
            <UserPlus className="w-5 h-5" />
            <span>Emergency Department Patient Registration & Clinical Intake</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          
          {/* Section 1: Demographics */}
          <div className="space-y-2">
            <h4 className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider">1. Patient Demographics</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">First Name *</label>
                <input
                  type="text"
                  required
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Last Name *</label>
                <input
                  type="text"
                  required
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Medical Record # (MRN)</label>
                <input
                  type="text"
                  value={formData.mrn}
                  onChange={(e) => setFormData({ ...formData, mrn: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 font-mono text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Age (Years) *</label>
                <input
                  type="number"
                  min="0"
                  max="125"
                  value={formData.age}
                  onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Gender *</label>
                <select
                  value={formData.gender}
                  onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Phone Contact</label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Clinical Intake & Triage */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <h4 className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider">2. ED Intake & Triage Assessment</h4>
            
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Chief Complaint / Primary Concern *</label>
              <input
                type="text"
                required
                placeholder="e.g. Acute severe chest pain radiating to left shoulder"
                value={formData.chief_complaint}
                onChange={(e) => setFormData({ ...formData, chief_complaint: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Arrival Mode</label>
                <select
                  value={formData.arrival_mode}
                  onChange={(e) => setFormData({ ...formData, arrival_mode: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="Walk-in">Walk-in</option>
                  <option value="Ambulance">Ambulance</option>
                  <option value="Wheelchair">Wheelchair</option>
                  <option value="Helicopter">Helicopter</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Assigned Bed</label>
                <input
                  type="text"
                  placeholder="e.g. Bay-04, Resus-1"
                  value={formData.bed_number}
                  onChange={(e) => setFormData({ ...formData, bed_number: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">ESI Acuity Level</label>
                <select
                  value={formData.triage_level}
                  onChange={(e) => {
                    const lvl = parseInt(e.target.value);
                    const cats = { 1: 'Resuscitation', 2: 'Emergent', 3: 'Urgent', 4: 'Less Urgent', 5: 'Non-Urgent' };
                    setFormData({ ...formData, triage_level: lvl, acuity_category: cats[lvl] });
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-500 font-bold"
                >
                  <option value={1}>ESI 1 - Resuscitation</option>
                  <option value={2}>ESI 2 - Emergent</option>
                  <option value={3}>ESI 3 - Urgent</option>
                  <option value={4}>ESI 4 - Less Urgent</option>
                  <option value={5}>ESI 5 - Non-Urgent</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Pain Score (0-10)</label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={formData.pain_score}
                  onChange={(e) => setFormData({ ...formData, pain_score: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Baseline Vitals */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <h4 className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider">3. Initial Baseline Vital Signs</h4>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              <div>
                <label className="block text-slate-400 mb-0.5">HR (bpm)</label>
                <input
                  type="number"
                  value={formData.hr}
                  onChange={(e) => setFormData({ ...formData, hr: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 font-mono text-white text-center"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-0.5">SpO₂ (%)</label>
                <input
                  type="number"
                  value={formData.spo2}
                  onChange={(e) => setFormData({ ...formData, spo2: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 font-mono text-white text-center"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-0.5">RR (/min)</label>
                <input
                  type="number"
                  value={formData.rr}
                  onChange={(e) => setFormData({ ...formData, rr: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 font-mono text-white text-center"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-0.5">SBP (mmHg)</label>
                <input
                  type="number"
                  value={formData.sbp}
                  onChange={(e) => setFormData({ ...formData, sbp: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 font-mono text-white text-center"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-0.5">DBP (mmHg)</label>
                <input
                  type="number"
                  value={formData.dbp}
                  onChange={(e) => setFormData({ ...formData, dbp: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 font-mono text-white text-center"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-0.5">Temp (°C)</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.temp}
                  onChange={(e) => setFormData({ ...formData, temp: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 font-mono text-white text-center"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-md shadow-cyan-900/30 transition-all disabled:opacity-50"
            >
              {submitting ? 'Registering & Enrolling...' : 'Register & Enroll in ED Queue'}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
