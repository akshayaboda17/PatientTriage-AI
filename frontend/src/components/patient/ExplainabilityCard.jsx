import React from 'react';
import { FileText, TrendingUp, TrendingDown, Info, Cpu, Sparkles } from 'lucide-react';
import { formatClinicalFeatureName } from '../../utils/terminology';

export const ExplainabilityCard = ({ aiExplanation }) => {
  if (!aiExplanation) return null;

  const method = aiExplanation.explanation_method || 'SHAP Feature Attribution';
  const topFeatures = aiExplanation.top_features || [];

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
      {/* Card Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-indigo-950/80 border border-indigo-800 text-indigo-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">CLINICAL DECISION SUPPORT · AI EXPLAINABILITY</h3>
            <p className="text-[10px] text-slate-400">Model-derived statistical feature attributions (SHAP analysis)</p>
          </div>
        </div>
        <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-indigo-950/80 border border-indigo-800/60 text-indigo-300">
          SHAP v1.1
        </span>
      </div>

      {/* Clinical Narrative Summary */}
      <div className="bg-slate-950/90 p-3.5 rounded-xl border border-slate-800/80">
        <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Clinical Summary of Reasoning</div>
        <p className="text-xs text-slate-300 leading-relaxed">
          {aiExplanation.summary}
        </p>
      </div>

      {/* Top Features Table */}
      {topFeatures.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10px] uppercase font-bold text-slate-400 px-1">
            <span>Factors influencing this AI assessment:</span>
            <span>Impact on Estimated Risk</span>
          </div>

          <div className="space-y-2">
            {topFeatures.map((feat, idx) => {
              const isElevating = feat.direction === 'elevating risk' || (feat.impact && feat.impact.startsWith('+'));
              const impactVal = feat.impact || '+0%';
              return (
                <div
                  key={idx}
                  className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/90 hover:border-slate-700 transition space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      {isElevating ? (
                        <div className="p-1 rounded bg-rose-950/80 text-rose-400 border border-rose-800/50">
                          <TrendingUp className="w-3.5 h-3.5" />
                        </div>
                      ) : (
                        <div className="p-1 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/50">
                          <TrendingDown className="w-3.5 h-3.5" />
                        </div>
                      )}
                      <div>
                        <span className="font-semibold text-slate-200">{formatClinicalFeatureName(feat.feature)}</span>
                        <span className="text-slate-400 font-mono text-[11px] ml-1.5">[{feat.value}]</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          isElevating
                            ? 'bg-rose-950/80 text-rose-300 border border-rose-800/60'
                            : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                        }`}
                      >
                        {isElevating ? 'Elevates Urgency' : 'Stabilizing Factor'}
                      </span>
                      <span
                        className={`font-mono font-bold text-xs ${
                          isElevating ? 'text-rose-400' : 'text-emerald-400'
                        }`}
                      >
                        {impactVal}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Non-Causality Disclosure */}
      <div className="flex items-start gap-2 pt-1 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/60 text-[10px] text-slate-400 leading-relaxed">
        <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
        <span>
          Clinical Note: Factors influencing the AI assessment represent statistical feature associations within the mathematical model and do not indicate clinical causation or replace attending physician judgment.
        </span>
      </div>
    </div>
  );
};
