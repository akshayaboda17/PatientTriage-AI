import React from 'react';

export const PatientDemographicsCard = ({ patient, encounter, triage }) => {
  if (!patient || !encounter) return null;

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-cyan-400 font-bold text-lg shrink-0">
            {patient.first_name[0]}{patient.last_name[0]}
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-black text-white">{patient.full_name || `${patient.first_name} ${patient.last_name}`}</h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">
                {encounter.status}
              </span>
              {triage && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-950 text-amber-300 border border-amber-800">
                  ESI Level {triage.triage_level} ({triage.acuity_category})
                </span>
              )}
            </div>
            
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 mt-1 font-mono">
              <span>ID: <strong className="text-slate-200">{patient.patient_id}</strong></span>
              <span>MRN: <strong className="text-slate-200">{patient.mrn || 'N/A'}</strong></span>
              <span>Encounter: <strong className="text-slate-200">{encounter.encounter_id}</strong></span>
              <span>Age: <strong className="text-slate-200">{patient.age}y</strong></span>
              <span>Gender: <strong className="text-slate-200">{patient.gender}</strong></span>
              <span>Bed: <strong className="text-slate-200">{encounter.bed_number || 'Waiting Room'}</strong></span>
              <span>Arrival: <strong className="text-slate-200">{encounter.arrival_mode}</strong></span>
            </div>
          </div>
        </div>

        <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800/80 max-w-sm w-full">
          <div className="text-[10px] uppercase font-bold text-slate-400">Chief Complaint</div>
          <div className="text-xs font-semibold text-slate-100 mt-0.5">{encounter.chief_complaint}</div>
        </div>
      </div>
    </div>
  );
};
