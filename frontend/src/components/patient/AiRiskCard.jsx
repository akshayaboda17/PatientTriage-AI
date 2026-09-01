import React from 'react';
import { Sparkles, Stethoscope, ShieldAlert, Cpu, Activity, Info, AlertTriangle, AlertCircle, BarChart2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ConfidenceBadge } from '../common/StateViews';
import { getRiskCategoryMeta, getPriorityMeta } from '../../utils/terminology';

export const AiRiskCard = ({ aiRisk, onGenerateAi, generatingAi, onOpenReview }) => {
  const { hasPermission } = useAuth();

  const riskMeta = getRiskCategoryMeta(aiRisk?.risk_category);
  const priorityLevel = aiRisk?.predicted_triage_level || aiRisk?.recommended_priority || 3;
  const priorityMeta = getPriorityMeta(priorityLevel);

  const probabilities = aiRisk?.probabilities || {
    "1": 0.0, "2": 0.0, "3": 1.0, "4": 0.0, "5": 0.0
  };

  const esiLabels = {
    "1": "ESI 1 (Resuscitation)",
    "2": "ESI 2 (Emergent)",
    "3": "ESI 3 (Urgent)",
    "4": "ESI 4 (Less Urgent)",
    "5": "ESI 5 (Non-Urgent)"
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-cyan-950/80 border border-cyan-800 text-cyan-400">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">AI Clinical Triage &amp; Risk Assessment</h3>
            <p className="text-[10px] text-slate-400">Dedicated Arrival ML Model (v1.0) &amp; 24h Decompensation Risk</p>
          </div>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
          Arrival ML v{aiRisk?.arrival_model_version || aiRisk?.model_version || '1.0'}
        </span>
      </div>

      {aiRisk ? (
        <>
          {/* PRIMARY ARRIVAL TRIAGE ML RECOMMENDATION BANNER */}
          <div className="bg-slate-950/90 p-4 rounded-xl border border-indigo-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-indigo-400">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>ML Recommended Care Priority (ESI)</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-white">
                  {priorityMeta.primary}
                </span>
                <span className={`px-2 py-0.5 rounded-lg text-xs font-bold border ${priorityMeta.badgeCls}`}>
                  {priorityMeta.secondary}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">{priorityMeta.desc}</p>
            </div>
            
            <div className="flex flex-col sm:items-end gap-1.5 shrink-0">
              <ConfidenceBadge confidence={aiRisk.confidence_tier || aiRisk.confidence || 'HIGH'} />
              <div className="text-[11px] font-mono text-slate-400">
                Confidence: <strong className="text-emerald-300">{aiRisk.confidence_score ? `${aiRisk.confidence_score}%` : '85%'}</strong>
              </div>
              {aiRisk.uncertainty_score !== undefined && (
                <div className="text-[10px] font-mono text-slate-500">
                  Entropy Uncertainty: {(aiRisk.uncertainty_score * 100).toFixed(0)}%
                </div>
              )}
            </div>
          </div>

          {/* 5-CLASS ESI PROBABILITY DISTRIBUTION BREAKDOWN */}
          <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800/80 space-y-2.5">
            <div className="flex items-center justify-between text-[10px] uppercase font-bold tracking-wider text-slate-400">
              <div className="flex items-center gap-1.5">
                <BarChart2 className="w-3.5 h-3.5 text-cyan-400" />
                <span>5-Level ESI Probability Distribution</span>
              </div>
              <span className="font-mono text-slate-500">&Sigma; = 100%</span>
            </div>

            <div className="grid grid-cols-5 gap-1.5 text-center">
              {["1", "2", "3", "4", "5"].map((esiKey) => {
                const pVal = Number(probabilities[esiKey] || 0.0);
                const pPct = (pVal * 100).toFixed(1);
                const isSelected = String(priorityLevel) === esiKey;

                return (
                  <div
                    key={esiKey}
                    className={`p-2 rounded-lg border transition-all ${
                      isSelected
                        ? 'bg-cyan-950/80 border-cyan-500 shadow-md shadow-cyan-950/50'
                        : 'bg-slate-900/60 border-slate-800/80'
                    }`}
                  >
                    <div className={`text-[10px] font-bold ${isSelected ? 'text-cyan-300' : 'text-slate-400'}`}>
                      ESI {esiKey}
                    </div>
                    <div className="h-1.5 w-full bg-slate-800 rounded-full my-1.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          esiKey === "1" ? 'bg-rose-500' :
                          esiKey === "2" ? 'bg-amber-500' :
                          esiKey === "3" ? 'bg-cyan-500' :
                          esiKey === "4" ? 'bg-blue-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.max(pVal * 100, 3)}%` }}
                      />
                    </div>
                    <div className={`text-[11px] font-mono font-bold ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                      {pPct}%
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 24-HOUR DECOMPENSATION RISK & CLINICAL METRICS */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-mono">
            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 flex flex-col justify-between">
              <div className="text-slate-400 text-[10px] uppercase font-sans">24h Decompensation Risk</div>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-xl font-bold text-cyan-300">
                  {aiRisk.risk_probability !== undefined && aiRisk.risk_probability !== null
                    ? `${(aiRisk.risk_probability * 100).toFixed(1)}%`
                    : `${aiRisk.risk_score}%`}
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-sans font-bold uppercase border ${riskMeta.cls}`}>
                  {riskMeta.label}
                </span>
              </div>
            </div>

            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 text-center">
              <div className="text-slate-400 text-[10px] uppercase font-sans">Shock Index</div>
              <div className={`font-bold text-lg mt-1 ${aiRisk.shock_index >= 0.9 ? 'text-rose-400' : 'text-slate-200'}`}>
                {aiRisk.shock_index || '—'}
              </div>
            </div>

            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 text-center">
              <div className="text-slate-400 text-[10px] uppercase font-sans">qSOFA Sepsis</div>
              <div className={`font-bold text-lg mt-1 ${aiRisk.qsofa_score >= 2 || aiRisk.qsofa >= 2 ? 'text-rose-400' : 'text-slate-200'}`}>
                {aiRisk.qsofa_score !== undefined ? `${aiRisk.qsofa_score}/3` : (aiRisk.qsofa !== undefined ? `${aiRisk.qsofa}/3` : '0/3')}
              </div>
            </div>
          </div>

          {/* Safety Escalation Alert (if low confidence or safety escalation required) */}
          {(aiRisk.confidence === 'LOW' || aiRisk.confidence_tier === 'LOW' || aiRisk.safety_status === 'ESCALATE' || aiRisk.safety_escalation_required) && (
            <div className="p-3 bg-rose-950/70 border border-rose-600/80 rounded-xl text-rose-200 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-rose-300">
                <ShieldAlert className="w-4 h-4 text-rose-400 animate-pulse" />
                <span>Immediate Clinical Attention Recommended</span>
              </div>
              <p className="text-[11px] text-rose-200/90">
                AI confidence is reduced due to borderline multi-class probability spread. Attending clinician review is recommended.
              </p>
            </div>
          )}

          {/* Discordance Notice */}
          {aiRisk.discordance_info?.is_discordant && (
            <div className="p-2.5 bg-yellow-950/60 border border-yellow-800/60 rounded-xl text-yellow-200 text-[11px] space-y-0.5">
              <div className="flex items-center gap-1 font-bold text-yellow-300">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Clinical Presentation Requires Verification</span>
              </div>
              <p className="text-yellow-200/80 text-[10px]">
                {aiRisk.discordance_info.explanation}
              </p>
            </div>
          )}
        </>
      ) : (
        <div className="p-6 bg-slate-950/80 rounded-xl border border-slate-800 text-center space-y-3">
          <Sparkles className="w-8 h-8 text-cyan-400 mx-auto" />
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-200">No AI Triage Assessment Generated</p>
            <p className="text-[11px] text-slate-400">Generate an AI evaluation based on presenting symptoms and bedside vital signs.</p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-slate-800/80">
        {hasPermission('triage:ai_infer') && (
          <button
            onClick={onGenerateAi}
            disabled={generatingAi}
            className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-md shadow-cyan-900/30 transition-all disabled:opacity-50 cursor-pointer"
          >
            <Sparkles className={`w-3.5 h-3.5 ${generatingAi ? 'animate-spin' : ''}`} />
            <span>{generatingAi ? 'Running Arrival ML Model...' : 'Re-Run AI Triage Assessment'}</span>
          </button>
        )}

        {hasPermission('physician:review') && onOpenReview && (
          <button
            onClick={onOpenReview}
            className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/40 text-xs font-bold transition-all cursor-pointer"
          >
            <Stethoscope className="w-3.5 h-3.5" />
            <span>Physician Review &amp; Sign Decision</span>
          </button>
        )}
      </div>
    </div>
  );
};
