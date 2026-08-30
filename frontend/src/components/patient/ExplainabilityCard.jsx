import React from 'react';
import { FileText, TrendingUp, TrendingDown, Info, ShieldCheck } from 'lucide-react';

export const ExplainabilityCard = ({ aiExplanation }) => {
  if (!aiExplanation) return null;

  const method = aiExplanation.explanation_method || 'SHAP Feature Attribution';
  const topFeatures = aiExplanation.top_features || [];

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-indigo-400" />
          <h3 className="text-sm font-bold text-white">Explainable AI (SHAP Drivers)</h3>
        </div>
        <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-indigo-950/70 border border-indigo-800/60 text-indigo-300">
          {method}
        </span>
      </div>

      <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/80 p-3 rounded-xl border border-slate-800/80">
        {aiExplanation.summary}
      </p>

      {topFeatures.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10px] uppercase font-bold text-slate-400">
            <span>Observed Clinical Feature</span>
            <span>SHAP Impact</span>
          </div>

          <div className="space-y-1.5">
            {topFeatures.map((feat, idx) => {
              const isElevating = feat.direction === 'elevating risk' || (feat.impact && feat.impact.startsWith('+'));
              return (
                <div
                  key={idx}
                  className="flex items-center justify-between text-xs bg-slate-950/60 p-2.5 rounded-lg border border-slate-800 hover:border-slate-700 transition"
                >
                  <div className="flex items-center gap-2">
                    {isElevating ? (
                      <TrendingUp className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    )}
                    <span className="font-semibold text-slate-200">
                      {feat.feature} <span className="text-slate-400 font-normal">({feat.value})</span>
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                        isElevating
                          ? 'bg-rose-950/70 text-rose-300 border border-rose-800/40'
                          : 'bg-emerald-950/70 text-emerald-300 border border-emerald-800/40'
                      }`}
                    >
                      {isElevating ? 'Elevating' : 'Reducing'}
                    </span>
                    <span
                      className={`font-mono font-bold text-xs ${
                        isElevating ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      {feat.impact}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-start gap-1.5 pt-1 text-[10px] text-slate-400 leading-tight">
        <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
        <span>
          Feature attributions reflect mathematical contributions to the model&apos;s risk score and do not represent independent clinical causality.
        </span>
      </div>
    </div>
  );
};
