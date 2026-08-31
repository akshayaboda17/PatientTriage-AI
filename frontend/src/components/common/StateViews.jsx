import React from 'react';
import { 
  AlertTriangle, RefreshCw, FolderSearch, ShieldAlert, 
  AlertOctagon, CheckCircle2, Activity, Sparkles, ShieldCheck, 
  Info, AlertCircle, Clock
} from 'lucide-react';
import { 
  getPriorityMeta, 
  getPatientStatusMeta, 
  getConfidenceMeta,
  getVisitStatusMeta 
} from '../../utils/terminology';

/**
 * Reusable Loading Skeleton for Cards & Tables
 */
export const LoadingSkeleton = ({ type = "table", rows = 5 }) => {
  if (type === "cards") {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-slate-900 border border-slate-800 p-4 space-y-3">
            <div className="h-4 bg-slate-800 rounded w-1/2"></div>
            <div className="h-8 bg-slate-800/60 rounded w-3/4"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3 p-6 animate-pulse">
      <div className="h-6 bg-slate-800/80 rounded w-1/4 mb-4"></div>
      {[...Array(rows)].map((_, i) => (
        <div key={i} className="h-12 bg-slate-900/90 border border-slate-800/60 rounded-xl flex items-center px-4 gap-4">
          <div className="w-16 h-5 bg-slate-800 rounded"></div>
          <div className="w-40 h-5 bg-slate-800 rounded"></div>
          <div className="flex-1 h-5 bg-slate-800/60 rounded"></div>
          <div className="w-24 h-5 bg-slate-800 rounded"></div>
        </div>
      ))}
    </div>
  );
};

/**
 * Clean Empty State View with Natural Language
 */
export const EmptyState = ({ 
  icon: Icon = FolderSearch, 
  title = "No Records Found", 
  description = "There are currently no items matching your criteria.",
  actionText,
  onAction
}) => {
  return (
    <div className="py-16 px-6 text-center space-y-3.5 max-w-md mx-auto">
      <div className="w-12 h-12 rounded-2xl bg-slate-800/60 border border-slate-700/60 text-slate-400 flex items-center justify-center mx-auto shadow-inner">
        <Icon className="w-6 h-6" />
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-bold text-slate-200">{title}</h3>
        <p className="text-xs text-slate-400 leading-relaxed">{description}</p>
      </div>
      {actionText && onAction && (
        <button
          onClick={onAction}
          className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-md shadow-cyan-900/30 transition-all cursor-pointer"
        >
          {actionText}
        </button>
      )}
    </div>
  );
};

/**
 * Meaningful Recoverable Error State View
 */
export const ErrorState = ({ 
  title = "Unable to Load Information", 
  message = "A network or authorization error occurred while retrieving clinical information. Please try again.", 
  onRetry,
  retryText = "Try Again"
}) => {
  return (
    <div className="py-12 px-6 text-center space-y-4 max-w-lg mx-auto">
      <div className="w-14 h-14 rounded-2xl bg-rose-950/70 border border-rose-800/80 text-rose-400 flex items-center justify-center mx-auto shadow-lg shadow-rose-950/50 animate-bounce">
        <AlertTriangle className="w-7 h-7" />
      </div>
      <div className="space-y-1.5">
        <h3 className="text-sm font-bold text-rose-200">{title}</h3>
        <p className="text-xs text-slate-400 leading-relaxed max-w-sm mx-auto">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-bold border border-slate-700 shadow-md transition-all cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>{retryText}</span>
        </button>
      )}
    </div>
  );
};

/**
 * Care Priority Badge with Primary/Secondary Visual Hierarchy
 */
export const AcuityBadge = ({ level, showSecondary = true, compact = false }) => {
  const meta = getPriorityMeta(level);
  
  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold border shrink-0 ${meta.bgLight}`}>
        {level === 1 && <AlertOctagon className="w-3 h-3 text-rose-400" />}
        {level === 2 && <AlertTriangle className="w-3 h-3 text-amber-400" />}
        {level === 3 && <AlertCircle className="w-3 h-3 text-yellow-400" />}
        {level === 4 && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
        {level === 5 && <CheckCircle2 className="w-3 h-3 text-blue-400" />}
        <span>{meta.primary}</span>
      </span>
    );
  }

  return (
    <div className="inline-flex flex-col gap-0.5 shrink-0">
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold border ${meta.bgLight}`}>
        {level === 1 && <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />}
        {level === 2 && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
        {level === 3 && <AlertCircle className="w-3.5 h-3.5 text-yellow-400" />}
        {level === 4 && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
        {level === 5 && <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />}
        <span>{meta.primary}</span>
      </span>
      {showSecondary && (
        <span className="text-[10px] text-slate-500 font-mono pl-1">
          {meta.secondary}
        </span>
      )}
    </div>
  );
};

export const PriorityBadge = AcuityBadge;

/**
 * Patient Care Status Badge
 */
export const SafetyStatusBadge = ({ status }) => {
  const meta = getPatientStatusMeta(status);
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${meta.badgeCls}`}>
      {status === 'ESCALATE' && <ShieldAlert className="w-3 h-3" />}
      {status === 'REASSESS' && <AlertTriangle className="w-3 h-3" />}
      {status === 'MONITOR' && <Activity className="w-3 h-3" />}
      {status === 'STABLE' && <ShieldCheck className="w-3 h-3" />}
      <span>{meta.label}</span>
    </span>
  );
};

/**
 * AI Confidence Tier Badge
 */
export const ConfidenceBadge = ({ confidence }) => {
  const meta = getConfidenceMeta(confidence);
  return (
    <span className={`text-[9px] font-bold px-2 py-0.5 rounded border shrink-0 ${meta.badgeCls}`} title={meta.helpText}>
      {meta.label}
    </span>
  );
};

/**
 * Patient Age Group Badge
 */
export const AgeGroupBadge = ({ ageGroup, age }) => {
  if (ageGroup === 'PEDIATRIC' || (age && age < 18)) {
    return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-pink-950/80 text-pink-300 border border-pink-800/60 shrink-0">Pediatric ({age || 'Child'}y)</span>;
  }
  if (ageGroup === 'GERIATRIC' || (age && age >= 65)) {
    return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-950/80 text-purple-300 border border-purple-800/60 shrink-0">Geriatric ({age || 'Senior'}y)</span>;
  }
  if (ageGroup === 'UNKNOWN' && !age) {
    return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700 shrink-0">Age Unknown</span>;
  }
  return <span className="text-[10px] text-slate-400 font-mono shrink-0">{age ? `${age}y Adult` : 'Adult'}</span>;
};

/**
 * Visit Status Badge
 */
export const VisitStatusBadge = ({ status }) => {
  const meta = getVisitStatusMeta(status);
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${meta.cls}`}>
      {meta.label}
    </span>
  );
};
