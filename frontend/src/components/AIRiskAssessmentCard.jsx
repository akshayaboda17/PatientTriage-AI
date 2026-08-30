import { useEffect, useState } from 'react';
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import { Bot, History } from 'lucide-react';

export default function AIRiskAssessmentCard({ encounterId, setError }) {
  const [latest, setLatest] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
  const load = async () => {
    try { const res = await fetch(`/api/v1/encounters/${encounterId}/ai/risk-assessments`, { headers }); const data = await res.json(); if (!res.ok) throw new Error(data.detail); setHistory(data); setLatest(data[0] || null); } catch (err) { setError(err.message || 'Unable to load AI assessment history.'); }
  };
  useEffect(() => { load(); }, [encounterId]);
  const generate = async () => {
    setLoading(true);
    try { const res = await fetch(`/api/v1/encounters/${encounterId}/ai/risk-assessments`, { method: 'POST', headers }); const data = await res.json(); if (!res.ok) throw new Error(data.detail); await load(); } catch (err) { setError(err.message || 'AI assessment is unavailable.'); } finally { setLoading(false); }
  };
  const color = latest?.risk_category === 'HIGH' ? 'text-red-400' : latest?.risk_category === 'MODERATE' ? 'text-amber-400' : 'text-emerald-400';
  return <section className="rounded-xl border border-violet-900/70 bg-violet-950/15 p-4"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Bot className="text-violet-400" size={20}/><div><h3 className="text-sm font-bold text-white">AI Risk Assessment</h3><p className="text-[10px] text-slate-400">Decision support only — does not replace clinician judgement.</p></div></div><button onClick={generate} disabled={loading} className="rounded bg-violet-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-500 disabled:bg-slate-700">{loading ? 'Generating…' : 'Generate'}</button></div>{!latest ? <p className="mt-4 text-xs text-slate-400">No assessment generated for this encounter.</p> : latest.status !== 'PENDING_CLINICIAN_REVIEW' ? <div className="mt-4 rounded bg-slate-950 p-3 text-xs text-slate-300">AI assessment unavailable. Complete required encounter vitals before retrying. Standard clinical assessment can continue.</div> : <div className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><p className="text-slate-500">Risk level</p><p className={`mt-1 text-xl font-black ${color}`}>{latest.risk_category}</p></div><div><p className="text-slate-500">Risk score</p><p className="mt-1 text-xl font-black text-white">{Math.round(latest.risk_score * 100)}%</p></div><div><p className="text-slate-500">Model</p><p className="mt-1 text-slate-200">{latest.model_name} · {latest.model_version}</p></div><div><p className="text-slate-500">Status</p><p className="mt-1 text-amber-300">Pending clinician review</p></div></div>}<button onClick={() => setShowHistory(!showHistory)} className="mt-4 inline-flex items-center gap-1 text-xs text-violet-300 hover:text-violet-200"><History size={14}/> {showHistory ? 'Hide' : 'View'} history ({history.length})</button>{showHistory && <div className="mt-2 space-y-1">{history.map(item => <p key={item.assessment_id} className="rounded bg-slate-950 px-2 py-1 text-[10px] text-slate-400">{new Date(item.generated_at).toLocaleString()} · {item.risk_category || item.status} · {item.model_version}</p>)}</div>}</section>;
}
