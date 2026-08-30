import { useEffect, useState } from 'react';
import { AlertCircle, CalendarDays, HeartPulse, Search, UserRound } from 'lucide-react';

function getAge(dateOfBirth, recordedAge) {
  if (recordedAge !== null && recordedAge !== undefined) return `${recordedAge} years`;
  if (!dateOfBirth) return 'Not recorded';
  const birthDate = new Date(`${dateOfBirth}T00:00:00`);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const beforeBirthday = today < new Date(today.getFullYear(), birthDate.getMonth(), birthDate.getDate());
  if (beforeBirthday) age -= 1;
  return `${age} years`;
}

export default function PatientProfile({ patientId, onPatientIdChange }) {
  const [lookupId, setLookupId] = useState(patientId?.toString() || '');
  const [patient, setPatient] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const fetchPatient = async (id) => {
    if (!id) return;
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/patients/${id}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Unable to load patient profile.');
      setPatient(data);
    } catch (requestError) {
      setPatient(null);
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!patientId) return undefined;
    const timer = window.setTimeout(() => fetchPatient(patientId), 0);
    return () => window.clearTimeout(timer);
  }, [patientId]);

  const handleLookup = (event) => {
    event.preventDefault();
    const id = Number(lookupId);
    if (!Number.isInteger(id) || id < 1) {
      setError('Enter a valid numeric patient ID.');
      return;
    }
    onPatientIdChange?.(id);
    fetchPatient(id);
  };

  return (
    <section className="rounded-2xl border border-gray-700 bg-gray-800 p-6 shadow-xl shadow-black/10">
      <div className="mb-5 flex items-center gap-3">
        <div className="rounded-lg bg-violet-500/10 p-2 text-violet-400"><UserRound size={22} /></div>
        <div><h2 className="text-xl font-bold text-white">Patient profile</h2><p className="text-sm text-gray-400">Retrieve registration and allergy details.</p></div>
      </div>
      <form onSubmit={handleLookup} className="mb-5 flex gap-2">
        <input className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-violet-500" value={lookupId} onChange={(event) => setLookupId(event.target.value)} inputMode="numeric" placeholder="Patient database ID" aria-label="Patient database ID" />
        <button type="submit" disabled={isLoading} className="rounded-lg border border-gray-600 bg-gray-700 px-3 text-gray-100 transition hover:bg-gray-600 disabled:opacity-60"><Search size={19} /></button>
      </form>
      {error && <p role="alert" className="mb-4 rounded-lg border border-red-800 bg-red-950/60 px-3 py-2 text-sm text-red-300">{error}</p>}
      {!patient && !isLoading && !error && <p className="rounded-lg border border-dashed border-gray-700 bg-gray-900/40 p-5 text-sm text-gray-400">Register a patient or enter an ID to view their profile.</p>}
      {isLoading && <p className="text-sm text-gray-400">Loading patient profile…</p>}
      {patient && !isLoading && (
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-700 bg-gray-900 p-4">
            <p className="text-xs font-semibold tracking-wider text-cyan-400">{patient.patient_id} · DATABASE ID {patient.id}</p>
            <h3 className="mt-1 text-2xl font-bold text-white">{patient.first_name} {patient.last_name}</h3>
            <p className="mt-2 flex items-center gap-2 text-sm text-gray-300"><CalendarDays size={16} className="text-gray-500" /> {patient.date_of_birth || 'DOB not recorded'} · {getAge(patient.date_of_birth, patient.age)}</p>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-lg bg-gray-900/70 p-3"><dt className="text-xs uppercase tracking-wide text-gray-500">Gender</dt><dd className="mt-1 font-medium text-gray-200">{patient.gender || 'Not recorded'}</dd></div>
            <div className="rounded-lg bg-gray-900/70 p-3"><dt className="text-xs uppercase tracking-wide text-gray-500">Contact</dt><dd className="mt-1 break-words font-medium text-gray-200">{patient.contact_info || 'Not recorded'}</dd></div>
            <div className="rounded-lg bg-gray-900/70 p-3 sm:col-span-2"><dt className="text-xs uppercase tracking-wide text-gray-500">Emergency contact</dt><dd className="mt-1 break-words font-medium text-gray-200">{patient.emergency_contact || 'Not recorded'}</dd></div>
          </dl>
          <div className="rounded-lg border border-amber-900/60 bg-amber-950/20 p-3"><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-400"><AlertCircle size={15} /> Known allergies</p><p className="mt-2 text-sm text-gray-200">{patient.known_allergies || 'No allergies recorded'}</p></div>
          <p className="flex items-center gap-2 text-xs text-gray-500"><HeartPulse size={14} /> Ready for clinical triage</p>
        </div>
      )}
    </section>
  );
}
