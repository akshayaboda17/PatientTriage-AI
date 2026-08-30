import React from 'react';
import { Sparkles, Stethoscope } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const AiRiskCard = ({ aiRisk, onGenerateAi, generatingAi, onOpenReview }) => {
  const { hasPermission } = useAuth();

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-cyan-400" />
          <h3 className="text-sm font-bold text-white">AI Risk Assessment (Decision Support)</h3>
        </div>
        <span className="text-[10px] text-slate-400 font-mono">Risk Model v1.2</span>
      </div>

      {aiRisk ? (
        <>
          <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400">Predicted Risk Score</div>
              <div className="text-2xl font-black text-cyan-300 mt-0.5">{aiRisk.risk_score}%</div>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${
              aiRisk.risk_category === 'HIGH' || aiRisk.risk_category === 'CRITICAL'
                ? 'bg-rose-950 text-rose-300 border border-rose-700'
                : aiRisk.risk_category === 'MODERATE'
                ? 'bg-amber-950 text-amber-300 border border-amber-700'
                : 'bg-emerald-950 text-emerald-300 border border-emerald-700'
            }`}>
              {aiRisk.risk_category} RISK
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
              <div className="text-slate-400 text-[10px]">Predicted ESI</div>
              <div className="font-bold text-sm text-cyan-300">Level {aiRisk.predicted_triage_level || '2'}</div>
            </div>
            <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
              <div className="text-slate-400 text-[10px]">Confidence</div>
              <div className="font-bold text-sm text-slate-200">{aiRisk.confidence_score || '85'}%</div>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-[10px] text-slate-400 space-y-1">
            <div className="text-amber-400 font-bold">Notice: Clinical Decision Support</div>
            <p>AI provides advisory risk estimations. Clinical review and final decision are required.</p>
          </div>
        </>
      ) : (
        <div className="text-center py-4 space-y-3">
          <p className="text-xs text-slate-400">No AI risk assessment has been generated yet for this encounter.</p>
          <button
            onClick={onGenerateAi}
            disabled={generatingAi}
            className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-md shadow-cyan-900/30 transition-all disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{generatingAi ? 'Generating AI Assessment...' : 'Generate AI Risk Assessment'}</span>
          </button>
        </div>
      )}

      {onOpenReview && hasPermission('clinical_decision:create') && (
        <button
          onClick={onOpenReview}
          className="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow transition-colors flex items-center justify-center gap-1.5 mt-2"
        >
          <Stethoscope className="w-3.5 h-3.5" />
          <span>Open Physician Review Console</span>
        </button>
      )}
    </div>
  );
};
