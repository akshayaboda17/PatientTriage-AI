import { useEffect, useMemo, useState } from 'react';
import { ClipboardPlus, RefreshCw, Search, Stethoscope, UsersRound } from 'lucide-react';

const STATUS_LABELS = {
  WAITING_FOR_TRIAGE: 'Waiting for triage', TRIAGE_IN_PROGRESS: 'Triage in progress', TRIAGED: 'Triaged',
  WAITING_FOR_DOCTOR: 'Waiting for doctor', WITH_DOCTOR: 'With doctor', TREATMENT: 'Treatment', DISPOSITION: 'Disposition',
};
const NEXT_STATUS = {
  WAITING_FOR_TRIAGE: 'TRIAGE_IN_PROGRESS', TRIAGE_IN_PROGRESS: 'TRIAGED', TRIAGED: 'WAITING_FOR_DOCTOR',
  WAITING_FOR_DOCTOR: 'WITH_DOCTOR', WITH_DOCTOR: 'TREATMENT', TREATMENT: 'DISPOSITION',
};
const ARRIVAL_METHODS = ['WALK_IN', 'AMBULANCE', 'REFERRAL', 'TRANSFER', 'OTHER'];
const PRIORITY_STYLE = { HIGH: 'border-red-500/60 bg-red-950/40', MEDIUM: 'border-amber-500/60 bg-amber-950/40', LOW: 'border-emerald-500/60 bg-emerald-950/40' };

function headers() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' };
}

export default function EncounterQueue({ user, setError, setSuccess }) {
  const [queue, setQueue] = useState({ items: [], counts: {} });
  const [patients, setPatients] = useState([]);
  const [nurses, setNurses] = useState([]);
  const [physicians, setPhysicians] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newEncounter, setNewEncounter] = useState({ patient_id: '', arrival_method: 'WALK_IN', chief_complaint: '' });

  const request = async (url, options = {}) => {
    const response = await fetch(url, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Unable to complete the clinical workflow request.');
    return data;
  };

  const loadQueue = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ active: 'true' });
      if (search.trim()) params.set('search', search.trim());
      if (status) params.set('status_filter', status);
      const [queueData, patientData] = await Promise.all([
        request(`/api/v1/encounters?${params}`), request('/api/v1/patients'),
      ]);
      setQueue(queueData); setPatients(patientData);
      if (user.permissions.includes('encounter:assign')) {
        const [nurseData, physicianData] = await Promise.all([
          request('/api/v1/encounters/staff/eligible?assignment_type=nurse'),
          request('/api/v1/encounters/staff/eligible?assignment_type=physician'),
        ]);
        setNurses(nurseData); setPhysicians(physicianData);
      }
    } catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  };

  // The initial load is intentionally one-shot; subsequent refreshes are user-triggered.
  useEffect(() => {
    const timer = window.setTimeout(() => { loadQueue(); }, 0);
    return () => window.clearTimeout(timer);
    // `loadQueue` is intentionally not a dependency: changing a filter should not
    // trigger an automatic request before the clinician applies it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createEncounter = async (event) => {
    event.preventDefault(); setCreating(true);
    try {
      await request('/api/v1/encounters', { method: 'POST', body: JSON.stringify(newEncounter) });
      setNewEncounter({ patient_id: '', arrival_method: 'WALK_IN', chief_complaint: '' });
      setSuccess('ED encounter created and placed in the waiting-for-triage queue.');
      await loadQueue();
    } catch (requestError) { setError(requestError.message); }
    finally { setCreating(false); }
  };

  const update = async (encounter, suffix, payload, message, confirmText = null) => {
    if (confirmText && !window.confirm(confirmText)) return;
    try {
      await request(`/api/v1/encounters/${encounter.encounter_id}${suffix}`, { method: suffix === '/disposition' ? 'POST' : 'PATCH', body: JSON.stringify({ ...payload, expected_version: encounter.version }) });
      setSuccess(message); await loadQueue();
    } catch (requestError) { setError(requestError.message); }
  };

  const grouped = useMemo(() => queue.items.reduce((acc, encounter) => {
    const bucket = encounter.current_status;
    acc[bucket] = [...(acc[bucket] || []), encounter];
    return acc;
  }, {}), [queue.items]);
  const canCreate = user.permissions.includes('encounter:create');
  const canUpdate = user.permissions.includes('encounter:status_update');
  const canAssign = user.permissions.includes('encounter:assign');
  const canPrioritize = user.permissions.includes('encounter:update');
  const canDispose = user.permissions.includes('encounter:disposition');

  return (
    <section className="w-full max-w-7xl rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-2xl">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start"><div><p className="text-xs font-mono uppercase tracking-[0.18em] text-cyan-400">Live clinical workflow</p><h2 className="mt-1 flex items-center gap-2 text-2xl font-black text-white"><Stethoscope className="text-red-400" /> Emergency Department Queue</h2><p className="mt-1 text-sm text-slate-400">Active encounters only. Queue priority is clinician-confirmed, not an AI order.</p></div><div className="flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-slate-950 px-3 py-1.5 text-slate-200">{queue.counts.active || 0} active</span><span className="rounded-full bg-red-950/60 px-3 py-1.5 text-red-200">{queue.counts.high_priority || 0} high priority</span><span className="rounded-full bg-slate-950 px-3 py-1.5 text-slate-300">{queue.counts.WAITING_FOR_TRIAGE || 0} awaiting triage</span></div></div>

      <div className="mt-5 grid gap-3 md:grid-cols-[1fr_190px_auto]"><label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 text-slate-400"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && loadQueue()} placeholder="Search patient, encounter, or complaint" className="w-full bg-transparent py-2.5 text-sm text-white outline-none placeholder:text-slate-600" /></label><select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200 outline-none"><option value="">All active statuses</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button onClick={loadQueue} disabled={loading} className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-slate-100 hover:bg-slate-700 disabled:opacity-60"><RefreshCw size={18} className={loading ? 'animate-spin' : ''} /></button></div>

      {canCreate && <form onSubmit={createEncounter} className="mt-5 grid gap-3 rounded-xl border border-cyan-900/60 bg-cyan-950/20 p-4 lg:grid-cols-[1fr_160px_1.5fr_auto]"><select required value={newEncounter.patient_id} onChange={(event) => setNewEncounter((current) => ({ ...current, patient_id: event.target.value }))} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none"><option value="">Select registered patient</option>{patients.map((patient) => <option key={patient.patient_id} value={patient.patient_id}>{patient.patient_id} — {patient.first_name || 'Patient'} {patient.last_name || ''}</option>)}</select><select value={newEncounter.arrival_method} onChange={(event) => setNewEncounter((current) => ({ ...current, arrival_method: event.target.value }))} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none">{ARRIVAL_METHODS.map((method) => <option key={method} value={method}>{method.replaceAll('_', ' ')}</option>)}</select><input required minLength="2" maxLength="500" value={newEncounter.chief_complaint} onChange={(event) => setNewEncounter((current) => ({ ...current, chief_complaint: event.target.value }))} placeholder="Chief complaint" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600" /><button disabled={creating} className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-cyan-500 disabled:bg-slate-700"><ClipboardPlus size={17} />{creating ? 'Creating…' : 'New encounter'}</button></form>}

      {!loading && queue.items.length === 0 && <div className="mt-5 rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-8 text-center text-sm text-slate-400"><UsersRound className="mx-auto mb-2 text-slate-600" />No active ED encounters match this view.</div>}
      <div className="mt-5 grid gap-5 xl:grid-cols-2">{Object.entries(grouped).map(([groupStatus, encounters]) => <div key={groupStatus}><h3 className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{STATUS_LABELS[groupStatus] || groupStatus} · {encounters.length}</h3><div className="space-y-3">{encounters.map((encounter) => <article key={encounter.encounter_id} className={`rounded-xl border p-4 text-slate-200 ${PRIORITY_STYLE[encounter.priority] || 'border-slate-700 bg-slate-950/60'}`}><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs text-cyan-300">{encounter.encounter_id}</p><h4 className="mt-1 font-bold text-white">{encounter.patient_name} <span className="text-xs font-normal text-slate-400">({encounter.patient_id})</span></h4><p className="mt-1 text-sm">{encounter.chief_complaint}</p></div><span className="rounded-full bg-black/20 px-2 py-1 text-xs font-bold">{encounter.priority || 'UNASSIGNED'}</span></div><div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/10 pt-3 text-xs text-slate-400"><span>Arrived {new Date(encounter.arrival_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><span>{encounter.arrival_method.replaceAll('_', ' ')}</span><span>Nurse: {encounter.assigned_nurse_name || 'Unassigned'}</span><span>Doctor: {encounter.assigned_physician_name || 'Unassigned'}</span></div><div className="mt-3 flex flex-wrap gap-2">{canPrioritize && <select defaultValue={encounter.priority || ''} onChange={(event) => event.target.value && update(encounter, '/priority', { priority: event.target.value }, 'Clinical queue priority updated.')} className="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-200"><option value="">Set priority</option><option>HIGH</option><option>MEDIUM</option><option>LOW</option></select>}{canAssign && <><select defaultValue={encounter.assigned_nurse_id || ''} onChange={(event) => update(encounter, '/assignment', { assigned_nurse_id: event.target.value || null }, 'Nurse assignment updated.')} className="max-w-40 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-200"><option value="">Assign nurse</option>{nurses.map((staff) => <option key={staff.staff_id} value={staff.staff_id}>{staff.full_name}</option>)}</select><select defaultValue={encounter.assigned_physician_id || ''} onChange={(event) => update(encounter, '/assignment', { assigned_physician_id: event.target.value || null }, 'Physician assignment updated.')} className="max-w-40 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-200"><option value="">Assign physician</option>{physicians.map((staff) => <option key={staff.staff_id} value={staff.staff_id}>{staff.full_name}</option>)}</select></>}{canUpdate && NEXT_STATUS[encounter.current_status] && <button onClick={() => update(encounter, '/status', { status: NEXT_STATUS[encounter.current_status] }, `Encounter moved to ${STATUS_LABELS[NEXT_STATUS[encounter.current_status]]}.`)} className="rounded bg-slate-700 px-2 py-1 text-xs font-semibold text-white hover:bg-slate-600">Advance workflow</button>}{canDispose && encounter.current_status === 'DISPOSITION' && <button onClick={() => update(encounter, '/disposition', { disposition: 'DISCHARGED' }, 'Encounter discharged.', 'Confirm discharge? This removes the encounter from the active ED queue.')} className="rounded bg-emerald-700 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-600">Discharge</button>}</div></article>)}</div></div>)}</div>
    </section>
  );
}
