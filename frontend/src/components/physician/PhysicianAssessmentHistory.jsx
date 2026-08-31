import React from 'react';
import { History, UserCheck, Stethoscope } from 'lucide-react';
import { ROLE_LABELS } from '../../utils/terminology';

export const PhysicianAssessmentHistory = ({ assessments }) => {
  if (!assessments || assessments.length === 0) return null;

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
      <div className="flex items-center gap-2">
        <History className="w-5 h-5 text-indigo-400" />
        <h3 className="text-base font-bold text-white tracking-tight">Physician Review History</h3>
      </div>

      <div className="space-y-3">
        {assessments.map((a, idx) => (
          <div key={a.id || idx} className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                  a.ai_agreement === 'OVERRIDDEN'
                    ? 'bg-purple-950 text-purple-300 border border-purple-800'
                    : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                }`}>
                  {a.ai_agreement === 'OVERRIDDEN' ? 'AI Assessment Overridden' : 'Agreed with AI'}
                </span>
                <span className="font-bold text-slate-200">{a.physician_name} ({ROLE_LABELS[a.physician_role] || a.physician_role})</span>
              </div>
              <span className="text-slate-400 font-mono text-[11px]">
                {new Date(a.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
              </span>
            </div>

            <div className="text-xs text-slate-300">
              <strong>Clinical Disposition:</strong> <span className="font-mono text-cyan-300">{a.clinical_decision?.replace(/_/g, ' ')}</span>
            </div>

            {a.override_reason && (
              <div className="text-xs text-amber-300 bg-amber-950/30 p-2.5 rounded-lg border border-amber-800/40">
                <strong>Override Reason:</strong> {a.override_reason}
              </div>
            )}

            {a.clinical_assessment && (
              <div className="text-xs text-slate-400 italic">
                "{a.clinical_assessment}"
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
