import { useState } from 'react';
import { UserPlus } from 'lucide-react';

const INITIAL_FORM = {
  first_name: '',
  last_name: '',
  date_of_birth: '',
  age: '',
  gender: '',
  contact_info: '',
  emergency_contact: '',
  known_allergies: '',
};

const fieldClass = 'mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2.5 text-sm text-gray-100 outline-none transition placeholder:text-gray-500 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20';

export default function PatientRegistration({ onPatientCreated }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError('First and last name are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = Object.fromEntries(
        Object.entries(form).map(([key, value]) => [key, value.trim() || null]),
      );
      if (payload.age !== null) payload.age = Number(payload.age);
      const response = await fetch('/api/patients/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Unable to register patient.');
      }

      setSuccess(`${data.first_name} ${data.last_name} registered as ${data.patient_id}.`);
      setForm(INITIAL_FORM);
      onPatientCreated?.(data.id);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="rounded-2xl border border-gray-700 bg-gray-800 p-6 shadow-xl shadow-black/10">
      <div className="mb-6 flex items-center gap-3">
        <div className="rounded-lg bg-cyan-500/10 p-2 text-cyan-400"><UserPlus size={22} /></div>
        <div>
          <h2 className="text-xl font-bold text-white">Register patient</h2>
          <p className="text-sm text-gray-400">Create a clinical profile before triage.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-gray-300">First name *
            <input className={fieldClass} name="first_name" value={form.first_name} onChange={updateField} required />
          </label>
          <label className="text-sm font-medium text-gray-300">Last name *
            <input className={fieldClass} name="last_name" value={form.last_name} onChange={updateField} required />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-gray-300">Date of birth
            <input className={fieldClass} type="date" name="date_of_birth" value={form.date_of_birth} onChange={updateField} />
          </label>
          <label className="text-sm font-medium text-gray-300">Age (if DOB is unavailable)
            <input className={fieldClass} type="number" min="0" max="130" step="0.1" name="age" value={form.age} onChange={updateField} placeholder="Years" />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-gray-300">Gender
            <select className={fieldClass} name="gender" value={form.gender} onChange={updateField}>
              <option value="">Select gender</option><option>Female</option><option>Male</option><option>Non-binary</option><option>Prefer not to say</option>
            </select>
          </label>
        </div>
        <label className="block text-sm font-medium text-gray-300">Contact information
          <input className={fieldClass} name="contact_info" value={form.contact_info} onChange={updateField} placeholder="Phone number or email" />
        </label>
        <label className="block text-sm font-medium text-gray-300">Emergency contact
          <input className={fieldClass} name="emergency_contact" value={form.emergency_contact} onChange={updateField} placeholder="Name and phone number" />
        </label>
        <label className="block text-sm font-medium text-gray-300">Known allergies
          <textarea className={fieldClass} name="known_allergies" value={form.known_allergies} onChange={updateField} rows="3" placeholder="e.g., Penicillin, latex, none known" />
        </label>
        {error && <p role="alert" className="rounded-lg border border-red-800 bg-red-950/60 px-3 py-2 text-sm text-red-300">{error}</p>}
        {success && <p className="rounded-lg border border-emerald-800 bg-emerald-950/60 px-3 py-2 text-sm text-emerald-300">{success}</p>}
        <button type="submit" disabled={isSubmitting} className="w-full rounded-lg bg-cyan-600 px-4 py-3 font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:bg-gray-600">
          {isSubmitting ? 'Registering…' : 'Register patient'}
        </button>
      </form>
    </section>
  );
}
