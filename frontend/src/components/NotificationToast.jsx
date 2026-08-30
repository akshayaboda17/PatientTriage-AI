import React from 'react';
import { useAuth } from '../context/AuthContext';
import { CheckCircle2, AlertTriangle, AlertOctagon, Info, X } from 'lucide-react';

export const NotificationToast = () => {
  const { toasts, removeToast } = useAuth();

  if (!toasts || toasts.length === 0) return null;

  const getToastIcon = (type) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />;
      case 'error':
        return <AlertOctagon className="w-5 h-5 text-rose-400 shrink-0" />;
      default:
        return <Info className="w-5 h-5 text-sky-400 shrink-0" />;
    }
  };

  const getBorderColor = (type) => {
    switch (type) {
      case 'success':
        return 'border-emerald-500/50 bg-emerald-950/80 text-emerald-100';
      case 'warning':
        return 'border-amber-500/50 bg-amber-950/80 text-amber-100';
      case 'error':
        return 'border-rose-500/50 bg-rose-950/80 text-rose-100';
      default:
        return 'border-sky-500/50 bg-slate-900/90 text-sky-100';
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
          className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl border shadow-2xl backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-bottom-5 ${getBorderColor(
            toast.type
          )}`}
          role="alert"
        >
          {getToastIcon(toast.type)}
          
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium leading-snug">{toast.message}</p>
            <div className="flex items-center gap-2 mt-1.5 text-xs opacity-70">
              <span>Auto-dismisses in 10s</span>
              <span>•</span>
              <span>Temporary Toast (Persistent alerts stored in database)</span>
            </div>
          </div>

          <button
            onClick={() => removeToast(toast.id)}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
};
