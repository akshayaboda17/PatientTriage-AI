import { Sparkles, Stethoscope, ShieldAlert, Cpu, Activity, Info, AlertTriangle, AlertCircle, BarChart2, CheckCircle2, UserCheck, HeartPulse } from 'lucide-react';
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

  const ageGroup = aiRisk?.age_group || (aiRisk?.patient_age < 18 ? 'PEDIATRIC' : (aiRisk?.patient_age >= 65 ? 'GERIATRIC' : 'ADULT'));
  const completenessScore = aiRisk?.data_completeness_score !== undefined ? aiRisk.data_completeness_score : 1.0;
  const qualityTier = aiRisk?.data_quality_tier || (completenessScore >= 0.85 ? 'HIGH' : (completenessScore >= 0.65 ? 'MODERATE' : 'LIMITED'));
  const limitations = aiRisk?.data_limitations || [];
  const factors = aiRisk?.contributing_factors || [];

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
            <p className="text-[10px] text-slate-400">Age-Aware Arrival ML Model (v1.1) &amp; 24h Decompensation Risk</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Age Group Tag */}
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
            ageGroup === 'PEDIATRIC' ? 'bg-amber-950/80 border-amber-700 text-amber-300' :
            ageGroup === 'GERIATRIC' ? 'bg-purple-950/80 border-purple-700 text-purple-300' :
            'bg-blue-950/80 border-blue-700 text-blue-300'
          }`}>
            {ageGroup}
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
            Arrival ML v{aiRisk?.arrival_model_version || aiRisk?.model_version || '1.1'}
          </span>
        </div>
      </div>

      {aiRisk ? (
        <>
          {/* PRIMARY ARRIVAL TRIAGE ML RECOMMENDATION BANNER (Requirements 1, 7, 8) */}
          <div className="bg-slate-950/90 p-4 rounded-xl border border-indigo-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap text-[10px] uppercase font-bold tracking-wider">
                <span className="flex items-center gap-1 text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800/80">
                  <Sparkles className="w-3 h-3 text-cyan-400" />
                  <span>CLINICAL DECISION SUPPORT · AI-SUPPORTED ASSESSMENT</span>
                </span>
                <span className="text-slate-400 font-normal">
                  Arrival AI: Care Priority Prediction
                </span>
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
              {aiRisk.assessed_at && (
                <div className="text-[10px] font-mono text-slate-500">
                  Assessed at: {new Date(aiRisk.assessed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </div>
              )}
            </div>
            
            <div className="flex flex-col sm:items-end gap-1.5 shrink-0">
              <ConfidenceBadge confidence={aiRisk.confidence_tier || aiRisk.confidence || 'HIGH'} />
              <div className="text-[11px] font-mono text-slate-400">
                AI Confidence: <strong className="text-emerald-300">{aiRisk.confidence_score ? `${aiRisk.confidence_score}%` : '85%'}</strong>
              </div>
              {aiRisk.uncertainty_score !== undefined && (
                <div className="text-[10px] font-mono text-slate-400">
                  Uncertainty Indicator: <span className={aiRisk.uncertainty_score >= 0.4 ? 'text-amber-400 font-bold' : 'text-slate-400'}>{(aiRisk.uncertainty_score * 100).toFixed(0)}%</span>
                </div>
              )}
              <div className="text-[9px] font-mono text-slate-500">
                Model: v{aiRisk?.arrival_model_version || aiRisk?.model_version || '1.1'}
              </div>
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

          {/* DATA QUALITY & COMPLETENESS TIER */}
          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-400" />
              <div>
                <div className="text-slate-400 text-[10px] uppercase font-sans">Data Quality &amp; Intake Completeness</div>
                <div className="text-slate-200 text-xs font-bold font-sans">
                  Tier: <span className={qualityTier === 'HIGH' ? 'text-emerald-400' : qualityTier === 'MODERATE' ? 'text-amber-400' : 'text-rose-400'}>{qualityTier}</span> ({(completenessScore * 100).toFixed(0)}% complete)
                </div>
              </div>
            </div>
            {limitations.length > 0 && (
              <span className="text-[10px] text-amber-300 bg-amber-950/60 border border-amber-800 px-2 py-0.5 rounded">
                {limitations.length} Data Caveat{limitations.length > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Data Limitations Disclaimer */}
          {limitations.length > 0 && (
            <div className="p-2.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1">
              <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                <Info className="w-3 h-3 text-cyan-400" />
                <span>Information Limitations</span>
              </div>
              <ul className="text-[11px] text-slate-300 list-disc list-inside space-y-0.5">
                {limitations.map((lim, idx) => (
                  <li key={idx}>{lim}</li>
                ))}
              </ul>
            </div>
          )}

          {/* DETERIORATION AI: 24-HOUR DECOMPENSATION RISK (Requirement 8) */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-[10px]">
              <span className="font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1">
                <HeartPulse className="w-3.5 h-3.5 text-purple-400" />
                <span>Deterioration AI: Future Deterioration Risk</span>
              </span>
              <span className="text-slate-500 italic text-[10px]">
                *Evaluated independently from arrival care priority
              </span>
            </div>

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
          </div>

          {/* AI ASSESSMENT UNCERTAIN BANNER (Requirement 4) */}
          {(aiRisk.confidence === 'LOW' || aiRisk.confidence_tier === 'LOW' || (aiRisk.uncertainty_score !== undefined && aiRisk.uncertainty_score >= 0.40) || (aiRisk.decision_margin !== undefined && aiRisk.decision_margin < 0.15) || aiRisk.safety_status === 'ESCALATE' || aiRisk.safety_escalation_required) && (
            <div className="p-3.5 bg-amber-950/60 border border-amber-500/80 rounded-xl text-amber-200 text-xs space-y-1.5 shadow-md">
              <div className="flex items-center gap-2 font-bold text-amber-300 text-xs uppercase tracking-wider">
                <ShieldAlert className="w-4 h-4 text-amber-400 animate-pulse shrink-0" />
                <span>AI ASSESSMENT UNCERTAIN · Clinician review required.</span>
              </div>
              <p className="text-[11px] text-amber-200/90 font-normal">
                {aiRisk.safety_escalation_reason || 'Elevated classification entropy or borderline decision margin detected. Attending clinician review is required before final priority decision.'}
              </p>
            </div>
          )}

          {/* Factors Influencing Assessment (Requirement 3) */}
          {factors.length > 0 && (
            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2 text-xs">
              <div className="text-[10px] uppercase font-bold text-slate-300">Factors influencing this AI assessment:</div>
              <ul className="text-[11px] text-slate-300 list-disc list-inside space-y-1">
                {factors.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
              <p className="text-[10px] text-slate-500 italic pt-1 border-t border-slate-800/60">
                *Clinical notice: Factors influencing the AI assessment represent statistical correlations within the mathematical model and do not imply physiological causation.
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
