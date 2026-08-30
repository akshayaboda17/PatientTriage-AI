import React from 'react';
import { useAuth } from '../context/AuthContext';
import { CheckCircle2, AlertTriangle, AlertOctagon, Info, X } from 'lucide-react';

export const NotificationToast = () => {
  const { toasts, removeToast } = useAuth();

  if (!toasts || toasts.length === 0) return null;

  const getToastIcon = (type) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />;
      case 'error':
        return <AlertOctagon className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />;
      default:
        return <Info className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />;
    }
  };

  const getBorderColor = (type) => {
    switch (type) {
      case 'success':
        return 'border-emerald-500/60 bg-emerald-950/90 text-emerald-100 shadow-emerald-950/50';
      case 'warning':
        return 'border-amber-500/60 bg-amber-950/90 text-amber-100 shadow-amber-950/50';
      case 'error':
        return 'border-rose-500/60 bg-rose-950/90 text-rose-100 shadow-rose-950/50';
      default:
        return 'border-sky-500/60 bg-slate-900/95 text-sky-100 shadow-slate-950/50';
    }
  };

  const getProgressBarColor = (type) => {
    switch (type) {
      case 'success':
        return 'bg-emerald-400';
      case 'warning':
        return 'bg-amber-400';
      case 'error':
        return 'bg-rose-400';
      default:
        return 'bg-sky-400';
    }
  };

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-md w-full pointer-events-none"
      role="region"
      aria-label="Temporary System Notifications"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto relative overflow-hidden flex items-start gap-3 p-4 rounded-2xl border shadow-2xl backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-bottom-5 ${getBorderColor(
            toast.type
          )}`}
          role="alert"
        >
          {getToastIcon(toast.type)}
          
          <div className="flex-1 min-w-0 pr-2">
            <p className="text-xs font-semibold leading-snug">{toast.message}</p>
            <div className="flex items-center gap-1.5 mt-1.5 text-[10px] opacity-75 font-mono">
              <span>Auto-dismisses in 10s</span>
              <span>•</span>
              <span>Transient Notice</span>
            </div>
          </div>

          <button
            onClick={() => removeToast(toast.id)}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>

          {/* 10-Second Countdown Progress Bar */}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30">
            <div 
              className={`h-full ${getProgressBarColor(toast.type)}`}
              style={{
                animation: `toast-progress ${toast.durationMs || 10000}ms linear forwards`
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};
