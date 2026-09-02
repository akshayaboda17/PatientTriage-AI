import React from 'react';
import { AlertOctagon, RefreshCw, LogOut } from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  handleSignOut = () => {
    localStorage.clear();
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col items-center justify-center p-6 selection:bg-cyan-500 selection:text-white">
          <div className="max-w-lg w-full bg-slate-900/90 border border-rose-800/60 rounded-3xl p-8 shadow-2xl space-y-6 text-center backdrop-blur-xl">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-rose-950/80 border border-rose-700/60 text-rose-400 shadow-xl mx-auto">
              <AlertOctagon className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold text-white tracking-tight">Clinical Application Error</h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                An unexpected interface error prevented this view from rendering. Your clinical patient data in the backend remains safe.
              </p>
            </div>

            {this.state.error && (
              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl text-left overflow-auto max-h-36">
                <p className="text-xs font-mono text-rose-400 font-semibold">{this.state.error.toString()}</p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={this.handleReset}
                className="flex-1 py-3 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg shadow-cyan-900/40 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reload Page</span>
              </button>

              <button
                onClick={this.handleSignOut}
                className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs border border-slate-700 transition-all flex items-center justify-center gap-2 cursor-pointer"
                title="Clear local session cache and sign in again"
              >
                <LogOut className="w-4 h-4 text-rose-400" />
                <span>Reset Session</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
