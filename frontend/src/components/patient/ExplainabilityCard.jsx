import React from 'react';
import { FileText } from 'lucide-react';

export const ExplainabilityCard = ({ aiExplanation }) => {
  if (!aiExplanation) return null;

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
      <div className="flex items-center gap-2">
        <FileText className="w-5 h-5 text-indigo-400" />
        <h3 className="text-sm font-bold text-white">Why This Prediction? (SHAP Drivers)</h3>
      </div>

      <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/80 p-3 rounded-xl border border-slate-800">
        {aiExplanation.summary}
      </p>

      {aiExplanation.top_features && (
        <div className="space-y-2">
          <div className="text-[10px] uppercase font-bold text-slate-400">Key Feature Influence Factors</div>
          {aiExplanation.top_features.map((feat, idx) => (
            <div key={idx} className="flex items-center justify-between text-xs bg-slate-950/60 p-2 rounded-lg border border-slate-800">
              <span className="font-semibold text-slate-300">{feat.feature} ({feat.value})</span>
              <span className="font-mono font-bold text-rose-400">{feat.impact}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
