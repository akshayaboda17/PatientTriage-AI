import React from 'react';
import { User, Bed, Ambulance, Clock } from 'lucide-react';

const statusColors = {
  'WAITING':      'bg-amber-950/80 text-amber-300 border-amber-700',
  'IN_TRIAGE':    'bg-cyan-950/80 text-cyan-300 border-cyan-700',
  'IN_TREATMENT': 'bg-indigo-950/80 text-indigo-300 border-indigo-700',
  'DISCHARGED':   'bg-emerald-950/80 text-emerald-300 border-emerald-700',
  'ADMITTED':     'bg-purple-950/80 text-purple-300 border-purple-700',
};

const ageGroupBadge = (ageGroup, age) => {
  if (ageGroup === 'PEDIATRIC') {
    return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-pink-950/80 text-pink-300 border border-pink-800/60">Pediatric ({age}y)</span>;
  }
  if (ageGroup === 'GERIATRIC') {
    return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-950/80 text-purple-300 border border-purple-800/60">Geriatric ({age}y)</span>;
  }
  return null;
};

export const PatientDemographicsCard = ({ patient, encounter, triage }) => {
  if (!patient || !encounter) return null;
  const statusCls = statusColors[encounter.status] || 'bg-slate-800 text-slate-300 border-slate-700';
  const initials = `${(patient.first_name || '?')[0]}${(patient.last_name || '?')[0]}`;
  const fullName = patient.full_name || `${patient.first_name} ${patient.last_name}`;

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        {/* Avatar + Identity */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-900 to-slate-800 border border-cyan-800/40 flex items-center justify-center text-cyan-300 font-black text-lg shrink-0 shadow-md">
            {initials}
          </div>
          <div>
            <div className="flex items-center flex-wrap gap-2 mb-0.5">
              <h2 className="text-xl font-black text-white tracking-tight">{fullName}</h2>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${statusCls}`}>
                {encounter.status?.replace('_', ' ')}
              </span>
              {triage && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800">
                  ESI {triage.triage_level} · {triage.acuity_category}
                </span>
              )}
              {ageGroupBadge(patient.age_group, patient.age)}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 mt-1.5">
              <span className="font-mono">
                PID: <strong className="text-slate-200">{patient.patient_id}</strong>
              </span>
              {patient.mrn && (
                <span className="font-mono">
                  MRN: <strong className="text-slate-200">{patient.mrn}</strong>
                </span>
              )}
              <span className="font-mono">
                ENC: <strong className="text-slate-200">{encounter.encounter_id}</strong>
              </span>
              <span>
                <strong className="text-slate-200">{patient.age}y</strong> {patient.gender}
              </span>
              {encounter.bed_number && (
                <span className="flex items-center gap-1">
                  <Bed className="w-3 h-3 text-slate-500" />
                  <strong className="text-slate-200">{encounter.bed_number}</strong>
                </span>
              )}
              {encounter.arrival_mode && (
                <span className="flex items-center gap-1">
                  <Ambulance className="w-3 h-3 text-slate-500" />
                  <span>{encounter.arrival_mode}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Chief Complaint */}
        <div className="bg-slate-950/80 px-4 py-3 rounded-xl border border-slate-800/80 max-w-sm w-full shrink-0">
          <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-1">Chief Complaint</div>
          <div className="text-sm font-semibold text-slate-100 leading-snug">{encounter.chief_complaint || '—'}</div>
        </div>
      </div>
    </div>
  );
};
