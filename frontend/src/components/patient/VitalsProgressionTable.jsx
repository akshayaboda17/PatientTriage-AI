import React from 'react';
import { Heart, Edit2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const VitalsProgressionTable = ({ observations, onSelectObsForCorrection }) => {
  const { hasPermission } = useAuth();

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Heart className="w-5 h-5 text-rose-400" />
          <h3 className="text-base font-bold text-white">Longitudinal Vital Signs Progression</h3>
        </div>
        <span className="text-xs text-slate-400 font-mono">{observations.length} readings recorded</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
            <tr>
              <th className="px-3 py-2.5">Time</th>
              <th className="px-3 py-2.5">SpO₂ (%)</th>
              <th className="px-3 py-2.5">HR (bpm)</th>
              <th className="px-3 py-2.5">RR (/min)</th>
              <th className="px-3 py-2.5">BP (mmHg)</th>
              <th className="px-3 py-2.5">Temp (°C)</th>
              <th className="px-3 py-2.5">GCS</th>
              <th className="px-3 py-2.5">Clinician</th>
              <th className="px-3 py-2.5 text-right">Edit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono">
            {observations.map((obs, idx) => {
              const prev = idx > 0 ? observations[idx - 1] : null;
              const spo2Delta = prev ? obs.spo2 - prev.spo2 : 0;
              const hrDelta = prev ? obs.hr - prev.hr : 0;
              const rrDelta = prev ? obs.rr - prev.rr : 0;

              return (
                <tr key={obs.id || idx} className="hover:bg-slate-800/30">
                  <td className="px-3 py-3 text-slate-400">
                    {new Date(obs.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {obs.is_corrected && (
                      <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-950 text-purple-300 border border-purple-800">
                        CORRECTED
                      </span>
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

                  <td className="px-3 py-3 text-slate-200">
                    {obs.sbp != null ? `${obs.sbp}${obs.dbp != null ? `/${obs.dbp}` : ''}` : (obs.dbp != null ? `—/${obs.dbp}` : '—')}
                  </td>
                  <td className="px-3 py-3 text-slate-300">
                    {obs.temp != null ? `${obs.temp}°C` : '—'}
                  </td>
                  <td className="px-3 py-3 text-slate-300">
                    {obs.gcs != null ? obs.gcs : '—'}
                  </td>
                  <td className="px-3 py-3 text-slate-400 text-[11px] font-sans">
                    {obs.recorded_by || '—'}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {hasPermission('vitals:update') && onSelectObsForCorrection && (
                      <button
                        onClick={() => onSelectObsForCorrection(obs)}
                        className="p-1 text-slate-400 hover:text-purple-400 hover:bg-slate-800 rounded transition-colors"
                        title="Correct observation (with audit trail)"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
