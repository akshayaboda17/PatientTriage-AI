import React from 'react';
import { Sparkles, Stethoscope, ShieldAlert, Cpu, Activity, Info, AlertTriangle, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ConfidenceBadge } from '../common/StateViews';
import { getRiskCategoryMeta } from '../../utils/terminology';

export const AiRiskCard = ({ aiRisk, onGenerateAi, generatingAi, onOpenReview }) => {
  const { hasPermission } = useAuth();

  const riskMeta = getRiskCategoryMeta(aiRisk?.risk_category);

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-cyan-950/80 border border-cyan-800 text-cyan-400">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">AI Risk Assessment</h3>
            <p className="text-[10px] text-slate-400">Early Clinical Decompensation Risk Estimator</p>
          </div>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
          AI Model v{aiRisk?.model_version || '1.0'}
        </span>
      </div>

      {aiRisk ? (
        <>
          {/* Main Risk Score & Category Banner */}
          <div className="bg-slate-950/90 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Estimated Risk</div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-3xl font-black font-mono text-cyan-300">
                  {aiRisk.risk_probability !== undefined && aiRisk.risk_probability !== null
                    ? `${(aiRisk.risk_probability * 100).toFixed(1)}%`
                    : `${aiRisk.risk_score}%`}
                </span>
                <span className="text-xs text-slate-400 font-mono">probability</span>
              </div>
            </div>
            
            <div className="flex flex-col items-end gap-1.5">
              <span className={`px-3 py-1.5 rounded-xl text-xs font-black tracking-wide border shadow-sm ${riskMeta.cls}`}>
                {riskMeta.label}
              </span>
              <ConfidenceBadge confidence={aiRisk.confidence || 'HIGH'} />
            </div>
          </div>

          {/* Safety Escalation Alert (if low confidence or safety escalation required) */}
          {(aiRisk.confidence === 'LOW' || aiRisk.safety_status === 'ESCALATE') && (
            <div className="p-3 bg-rose-950/70 border border-rose-600/80 rounded-xl text-rose-200 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-rose-300">
                <ShieldAlert className="w-4 h-4 text-rose-400 animate-pulse" />
                <span>Immediate Attention Recommended</span>
              </div>
              <p className="text-[11px] text-rose-200/90">
                AI confidence is low due to atypical vital parameters. Attending clinician review is recommended.
              </p>
            </div>
          )}

          {/* Discordance Notice (if symptoms & vitals conflict) */}
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

          {/* Key Clinical Biomarkers & Predicted ESI Grid */}
          <div className="grid grid-cols-3 gap-2 text-xs font-mono">
            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 text-center">
              <div className="text-slate-400 text-[10px] uppercase">Recommended Care Priority</div>
              <div className="font-bold text-sm text-cyan-300 mt-0.5">Level {aiRisk.predicted_triage_level || '2'}</div>
            </div>
            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 text-center">
              <div className="text-slate-400 text-[10px] uppercase">Shock Index</div>
              <div className={`font-bold text-sm mt-0.5 ${aiRisk.shock_index >= 0.9 ? 'text-rose-400' : 'text-slate-200'}`}>
                {aiRisk.shock_index || '—'}
              </div>
            </div>
            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 text-center">
              <div className="text-slate-400 text-[10px] uppercase">qSOFA Sepsis</div>
              <div className={`font-bold text-sm mt-0.5 ${aiRisk.qsofa_score >= 2 ? 'text-rose-400' : 'text-slate-200'}`}>
                {aiRisk.qsofa_score !== undefined ? `${aiRisk.qsofa_score}/3` : '0/3'}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="p-6 bg-slate-950/80 rounded-xl border border-slate-800 text-center space-y-3">
          <Sparkles className="w-8 h-8 text-cyan-400 mx-auto" />
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-200">No AI Risk Assessment Generated</p>
            <p className="text-[11px] text-slate-400">Generate an AI risk evaluation based on the latest recorded vital signs.</p>
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
            <span>{generatingAi ? 'Calculating Risk...' : 'Update AI Risk Assessment'}</span>
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
