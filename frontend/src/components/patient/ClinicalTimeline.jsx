import React from 'react';
import { Clock, Activity, AlertTriangle, Brain, Stethoscope, Heart, Cpu, ShieldAlert, User } from 'lucide-react';

const timelineTypeConfig = {
  'ALERT': { color: 'bg-rose-500 animate-pulse', icon: ShieldAlert, label: 'Clinical Alert', accent: 'border-rose-800/60 bg-rose-950/40' },
  'AI_RISK': { color: 'bg-indigo-500', icon: Cpu, label: 'AI Assessment', accent: 'border-indigo-800/60 bg-indigo-950/30' },
  'TRIAGE': { color: 'bg-amber-500', icon: Stethoscope, label: 'Triage', accent: 'border-amber-800/60 bg-amber-950/30' },
  'VITALS': { color: 'bg-cyan-500', icon: Heart, label: 'Vital Signs', accent: 'border-cyan-800/60 bg-cyan-950/30' },
  'PHYSICIAN_REVIEW': { color: 'bg-purple-500', icon: Brain, label: 'Physician Review', accent: 'border-purple-800/60 bg-purple-950/30' },
  'default': { color: 'bg-slate-500', icon: Activity, label: 'Event', accent: 'border-slate-700/80 bg-slate-950/60' },
};

const getConfig = (type) => {
  for (const key of Object.keys(timelineTypeConfig)) {
    if (type && type.includes(key)) return timelineTypeConfig[key];
  }
  return timelineTypeConfig.default;
};

export const ClinicalTimeline = ({ timeline }) => {
  if (!timeline || timeline.length === 0) return null;

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-bold text-white">Clinical Timeline</h3>
        </div>
        <span className="text-[10px] text-slate-500 font-mono">{timeline.length} events</span>
      </div>

      <div className="relative pl-6 space-y-3 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800/80">
        {timeline.map((item, idx) => {
          const cfg = getConfig(item.type);
          const Icon = cfg.icon;
          return (
            <div key={idx} className="relative group">
              <div className={`absolute -left-[23px] top-1.5 w-3 h-3 rounded-full border-2 border-slate-900 ${cfg.color} shrink-0`} />
              <div className={`border rounded-xl p-3 space-y-1 transition-colors hover:border-slate-700 ${cfg.accent}`}>
                <div className="flex items-center justify-between text-xs gap-2">
                  <div className="flex items-center gap-1.5">
                    <Icon className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="font-bold text-slate-200">{item.title}</span>
                  </div>
                  <span className="text-slate-500 font-mono text-[10px] shrink-0">
                    {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    <span className="ml-1 text-slate-600">
                      {new Date(item.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  </span>
                </div>
                {item.description && (
                  <p className="text-[11px] text-slate-400 leading-relaxed pl-0.5">{item.description}</p>
                )}
                {item.actor && (
                  <div className="flex items-center gap-1 text-[10px] text-slate-500 font-mono">
                    <User className="w-2.5 h-2.5" />
                    <span>{item.actor}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
