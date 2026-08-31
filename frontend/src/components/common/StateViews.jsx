import React from 'react';
import { 
  AlertTriangle, RefreshCw, FolderSearch, ShieldAlert, 
  AlertOctagon, CheckCircle2, Activity, Sparkles, ShieldCheck, 
  Info, AlertCircle
} from 'lucide-react';

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
 * Clean Empty State View
 */
export const EmptyState = ({ 
  icon: Icon = FolderSearch, 
  title = "No records found", 
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
  title = "Unable to load data", 
  message = "A network or authorization error occurred while fetching information from the clinical server.", 
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
 * Consistent Clinical Badges
 */
export const AcuityBadge = ({ level, category }) => {
  switch (Number(level)) {
    case 1:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black bg-rose-500/20 text-rose-300 border border-rose-500/40 shrink-0">
          <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
          ESI 1 • Resuscitation
        </span>
      );
    case 2:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          ESI 2 • Emergent
        </span>
      );
    case 3:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 shrink-0">
          ESI 3 • Urgent
        </span>
      );
    case 4:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shrink-0">
          ESI 4 • Less Urgent
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40 shrink-0">
          ESI 5 • Non-Urgent
        </span>
      );
  }
};

export const SafetyStatusBadge = ({ status }) => {
  switch (status) {
    case 'ESCALATE':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-rose-600 text-white shadow-md shadow-rose-950 animate-pulse shrink-0">
          <ShieldAlert className="w-3 h-3" />
          ESCALATE
        </span>
      );
    case 'REASSESS':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-500 text-slate-950 shadow shrink-0">
          <AlertTriangle className="w-3 h-3" />
          REASSESS
        </span>
      );
    case 'MONITOR':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-700 shrink-0">
          <Activity className="w-3 h-3" />
          MONITOR
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 shrink-0">
          <ShieldCheck className="w-3 h-3" />
          STABLE
        </span>
      );
  }
};

export const ConfidenceBadge = ({ confidence }) => {
  switch (confidence) {
    case 'HIGH':
      return <span className="text-[9px] font-bold text-emerald-400 bg-emerald-950/70 px-2 py-0.5 rounded border border-emerald-800/60 shrink-0">Confidence: HIGH</span>;
    case 'MODERATE':
      return <span className="text-[9px] font-bold text-amber-300 bg-amber-950/70 px-2 py-0.5 rounded border border-amber-800/60 shrink-0">Confidence: MOD</span>;
    default:
      return <span className="text-[9px] font-black text-rose-300 bg-rose-950 px-2 py-0.5 rounded border border-rose-600 animate-pulse shrink-0">Confidence: LOW ⚠️</span>;
  }
};

export const AgeGroupBadge = ({ ageGroup, age }) => {
  if (ageGroup === 'PEDIATRIC') {
    return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-pink-950/80 text-pink-300 border border-pink-800/60 shrink-0">Pediatric ({age}y)</span>;
  }
  if (ageGroup === 'GERIATRIC') {
    return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-950/80 text-purple-300 border border-purple-800/60 shrink-0">Geriatric ({age}y)</span>;
  }
  if (ageGroup === 'UNKNOWN') {
    return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700 shrink-0">Age Unknown</span>;
  }
  return <span className="text-[10px] text-slate-400 font-mono shrink-0">{age ? `${age}y Adult` : 'Adult'}</span>;
};
