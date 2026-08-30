import React from 'react';
import { Clock } from 'lucide-react';

export const ClinicalTimeline = ({ timeline }) => {
  if (!timeline || timeline.length === 0) return null;

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
      <div className="flex items-center gap-2">
        <Clock className="w-5 h-5 text-cyan-400" />
        <h3 className="text-base font-bold text-white">Unified Patient Clinical Timeline</h3>
      </div>

      <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
        {timeline.map((item, idx) => (
          <div key={idx} className="relative group">
            <div className={`absolute -left-6 top-1 w-3.5 h-3.5 rounded-full border-2 border-slate-900 ${
              item.type.includes('ALERT') ? 'bg-rose-500 animate-pulse' :
              item.type === 'AI_RISK' ? 'bg-indigo-500' :
              item.type === 'TRIAGE' ? 'bg-amber-500' : 'bg-cyan-500'
            }`} />
            
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-200">{item.title}</span>
                <span className="text-slate-400 font-mono text-[11px]">
                  {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="text-xs text-slate-400">{item.description}</p>
              <div className="text-[10px] text-slate-400 font-mono">Attributed to: {item.actor}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
