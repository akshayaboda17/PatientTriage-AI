import React from 'react';
import { Heart, Activity, Plus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const VitalsProgressionTable = ({ observations = [], onOpenUpdateModal }) => {
  const { hasPermission } = useAuth();

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Heart className="w-5 h-5 text-rose-400" />
          <div>
            <h3 className="text-base font-bold text-white">Bedside Vital Signs Progression</h3>
            <p className="text-[11px] text-slate-400">Historical trend of bedside clinical measurements</p>
          </div>
        </div>
        <span className="text-xs text-slate-400 font-mono">
          {observations.length} {observations.length === 1 ? 'reading' : 'readings'} recorded
        </span>
      </div>

      {observations.length === 0 ? (
        <div className="p-8 text-center bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-3">
          <Activity className="w-8 h-8 text-slate-600 mx-auto" />
          <div>
            <p className="text-xs font-bold text-slate-300">No Bedside Vital Signs Recorded Yet</p>
            <p className="text-[11px] text-slate-500">Record initial or updated vital signs to evaluate patient risk and care priority.</p>
          </div>
          {onOpenUpdateModal && hasPermission('vitals:create') && (
            <button
              onClick={onOpenUpdateModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-md transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Update Condition &amp; Vitals</span>
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800 tracking-wider">
              <tr>
                <th className="px-3 py-2.5">Time</th>
                <th className="px-3 py-2.5">Blood Pressure (mmHg)</th>
                <th className="px-3 py-2.5">Heart Rate (bpm)</th>
                <th className="px-3 py-2.5">Resp Rate (/min)</th>
                <th className="px-3 py-2.5">Oxygen SpO₂ (%)</th>
                <th className="px-3 py-2.5">Temperature</th>
                <th className="px-3 py-2.5">Pain Level</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {observations.map((obs, idx) => {
                const prev = idx > 0 ? observations[idx - 1] : null;
                const spo2Delta = prev && obs.spo2 != null && prev.spo2 != null ? obs.spo2 - prev.spo2 : 0;
                const hrDelta = prev && obs.hr != null && prev.hr != null ? obs.hr - prev.hr : 0;
                const rrDelta = prev && obs.rr != null && prev.rr != null ? obs.rr - prev.rr : 0;

                return (
                  <tr key={obs.id || idx} className="hover:bg-slate-800/30">
                    <td className="px-3 py-3 text-slate-400 whitespace-nowrap">
                      {new Date(obs.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    
                    {/* Blood Pressure */}
                    <td className="px-3 py-3 font-semibold text-slate-200">
                      {obs.sbp != null ? `${obs.sbp}${obs.dbp != null ? `/${obs.dbp}` : ''}` : (obs.dbp != null ? `—/${obs.dbp}` : '—')}
                    </td>

                    {/* HR with delta */}
                    <td className="px-3 py-3">
                      {obs.hr != null ? (
                        <>
                          <span className={`font-bold ${obs.hr >= 110 ? 'text-amber-400' : 'text-slate-200'}`}>
                            {obs.hr}
                          </span>
                          {hrDelta !== 0 && (
                            <span className={`ml-1.5 text-[10px] ${hrDelta > 0 ? 'text-rose-400 font-bold' : 'text-slate-400'}`}>
                              ({hrDelta > 0 ? `+${hrDelta}` : hrDelta})
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>

                    {/* RR with delta */}
                    <td className="px-3 py-3">
                      {obs.rr != null ? (
                        <>
                          <span className={`font-bold ${obs.rr >= 24 ? 'text-rose-400' : 'text-slate-200'}`}>
                            {obs.rr}
                          </span>
                          {rrDelta !== 0 && (
                            <span className={`ml-1.5 text-[10px] ${rrDelta > 0 ? 'text-rose-400 font-bold' : 'text-slate-400'}`}>
                              ({rrDelta > 0 ? `+${rrDelta}` : rrDelta})
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>

                    {/* SpO2 with delta */}
                    <td className="px-3 py-3">
                      {obs.spo2 != null ? (
                        <>
                          <span className={`font-bold ${obs.spo2 < 90 ? 'text-rose-400' : 'text-slate-200'}`}>
                            {obs.spo2}%
                          </span>
                          {spo2Delta !== 0 && (
                            <span className={`ml-1.5 text-[10px] ${spo2Delta < 0 ? 'text-rose-400 font-bold' : 'text-emerald-400'}`}>
                              ({spo2Delta > 0 ? `+${spo2Delta}` : spo2Delta})
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>

                    {/* Temperature */}
                    <td className="px-3 py-3 text-slate-300">
                      {obs.temp != null ? `${obs.temp}°C` : '—'}
                    </td>

                    {/* Pain Level */}
                    <td className="px-3 py-3 text-slate-300">
                      {obs.pain_score != null ? `${obs.pain_score}/10` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
