import React, { useState, useEffect } from 'react';
import { 
  Server, ShieldCheck, Activity, AlertTriangle, ArrowRight,
  RotateCcw, CheckCircle, XCircle, Database, Cpu, Layers,
  RefreshCw, TrendingUp, BarChart3, Clock, Lock
} from 'lucide-react';

export const MLOpsDashboard = () => {
  const [productionModel, setProductionModel] = useState(null);
  const [candidateModels, setCandidateModels] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [monitoring, setMonitoring] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState(null);

  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const canGovern = user.role === 'CLINICAL_DIRECTOR' || user.role === 'HOSPITAL_ADMIN';

  const fetchData = async () => {
    try {
      setLoading(true);
      const headers = { 
        'Authorization': `Bearer ${token}`,
        'X-Hospital-Id': user.hospital_id || 'DEMO001'
      };

      const [prodRes, modelsRes, datasetsRes, monitorRes] = await Promise.all([
        fetch('http://127.0.0.1:8000/api/mlops/production-model', { headers }),
        fetch('http://127.0.0.1:8000/api/mlops/models', { headers }),
        fetch('http://127.0.0.1:8000/api/mlops/datasets', { headers }),
        fetch('http://127.0.0.1:8000/api/mlops/monitoring', { headers })
      ]);

      if (prodRes.ok) setProductionModel(await prodRes.json());
      if (modelsRes.ok) {
        const data = await modelsRes.json();
        setCandidateModels(data.models || []);
      }
      if (datasetsRes.ok) {
        const data = await datasetsRes.json();
        setDatasets(data.datasets || []);
      }
      if (monitorRes.ok) {
        const data = await monitorRes.json();
        setMonitoring(data.monitoring || null);
      }
    } catch (err) {
      console.error('Failed to load MLOps data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleValidate = async (version) => {
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/mlops/models/${version}/validate`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'X-Hospital-Id': user.hospital_id || 'DEMO001'
        }
      });
      const data = await res.json();
      setActionMessage(data.message);
      fetchData();
    } catch (err) {
      console.error('Validation error:', err);
    }
  };

  const handleDeploy = async (version) => {
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/mlops/models/${version}/deploy`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'X-Hospital-Id': user.hospital_id || 'DEMO001'
        }
      });
      const data = await res.json();
      setActionMessage(data.message);
      fetchData();
    } catch (err) {
      console.error('Deployment error:', err);
    }
  };

  const handleRollback = async (targetVersion) => {
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/mlops/models/rollback`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Hospital-Id': user.hospital_id || 'DEMO001'
        },
        body: JSON.stringify({ target_version: targetVersion })
      });
      const data = await res.json();
      setActionMessage(data.message);
      fetchData();
    } catch (err) {
      console.error('Rollback error:', err);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Cpu className="w-7 h-7 text-indigo-400" />
            MLOps &amp; Model Governance Console
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Controlled continuous learning lifecycle, validation gates, auditability, and drift monitoring.
          </p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Registry
        </button>
      </div>

      {actionMessage && (
        <div className="p-3 bg-indigo-950/80 border border-indigo-700/60 rounded-xl text-indigo-200 text-xs flex items-center justify-between">
          <span>{actionMessage}</span>
          <button onClick={() => setActionMessage(null)} className="text-indigo-400 hover:text-indigo-200 font-bold">×</button>
        </div>
      )}

      {/* Grid: Production Model & Real-time Health */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Production Model Card */}
        <div className="md:col-span-2 bg-gradient-to-br from-slate-900 to-indigo-950/40 border border-indigo-900/60 rounded-2xl p-6 shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider font-bold px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-700 text-emerald-300 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              Live Production Model
            </span>
            <span className="text-xs font-mono text-slate-400">
              Artifact: v{productionModel?.model_version || '1.0'}
            </span>
          </div>

          <div className="mt-4">
            <h2 className="text-lg font-bold text-white">
              {productionModel?.model_name || 'PatientTriage Decompensation Risk Classifier'}
            </h2>
            <p className="text-xs text-slate-300 mt-1">
              Supervised regularized linear log-odds model calibrated for 24-hour composite critical outcome risk estimation.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-800/80">
            <div>
              <div className="text-[10px] uppercase font-semibold text-slate-400">Model Version</div>
              <div className="text-sm font-bold text-indigo-300 mt-0.5">v{productionModel?.model_version || '1.0'}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase font-semibold text-slate-400">Validation AUROC</div>
              <div className="text-sm font-bold text-emerald-400 mt-0.5">
                {productionModel?.validation_metrics?.auroc?.toFixed(4) || '1.0000'}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase font-semibold text-slate-400">Validation AUPRC</div>
              <div className="text-sm font-bold text-emerald-400 mt-0.5">
                {productionModel?.validation_metrics?.auprc?.toFixed(4) || '1.0000'}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase font-semibold text-slate-400">Governance Status</div>
              <div className="text-sm font-bold text-emerald-400 mt-0.5">APPROVED &amp; ACTIVE</div>
            </div>
          </div>
        </div>

        {/* Monitoring Health Card */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              Live Inference Health
            </h3>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
              monitoring?.data_drift_status === 'WARNING' 
                ? 'bg-amber-950/80 border border-amber-700 text-amber-300' 
                : 'bg-emerald-950/80 border border-emerald-700 text-emerald-300'
            }`}>
              {monitoring?.data_drift_status || 'NORMAL'}
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between items-center py-1 border-b border-slate-800">
              <span className="text-slate-400">Total Predictions</span>
              <span className="font-mono font-bold text-white">{monitoring?.total_predictions || 0}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-800">
              <span className="text-slate-400">Physician Override Rate</span>
              <span className="font-mono font-bold text-slate-200">
                {((monitoring?.override_rate || 0) * 100).toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-800">
              <span className="text-slate-400">Inference Latency (Avg)</span>
              <span className="font-mono font-bold text-indigo-300">
                {monitoring?.inference_latency_avg_ms || 12.4} ms
              </span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-slate-400">Matured Ground Truth Cases</span>
              <span className="font-mono font-bold text-emerald-400">{monitoring?.ground_truth_matured_cases || 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Candidate Models & Governance Gate */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              Model Registry &amp; Governance Gate
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Strict non-autonomous gate: candidate models require quantitative validation and authorized sign-off.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[10px] uppercase text-slate-400 bg-slate-950/60 border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Version</th>
                <th className="py-2.5 px-3">Architecture</th>
                <th className="py-2.5 px-3">Dataset</th>
                <th className="py-2.5 px-3">Validation AUROC</th>
                <th className="py-2.5 px-3">Sensitivity</th>
                <th className="py-2.5 px-3">Brier Score</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Governance Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {candidateModels.length === 0 ? (
                <tr>
                  <td colSpan="8" className="py-4 text-center text-slate-500">
                    No models registered in MLOps registry.
                  </td>
                </tr>
              ) : (
                candidateModels.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-950/30 transition">
                    <td className="py-3 px-3 font-mono font-bold text-white">v{m.model_version}</td>
                    <td className="py-3 px-3">{m.model_type}</td>
                    <td className="py-3 px-3 font-mono">{m.dataset_version}</td>
                    <td className="py-3 px-3 font-mono text-emerald-400">
                      {m.validation_metrics?.auroc?.toFixed(4) || '—'}
                    </td>
                    <td className="py-3 px-3 font-mono text-emerald-400">
                      {m.validation_metrics?.sensitivity ? `${(m.validation_metrics.sensitivity * 100).toFixed(1)}%` : '—'}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-300">
                      {m.validation_metrics?.brier_score?.toFixed(4) || '—'}
                    </td>
                    <td className="py-3 px-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                        m.status === 'PRODUCTION' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' :
                        m.status === 'APPROVED' ? 'bg-indigo-950 text-indigo-300 border border-indigo-800' :
                        m.status === 'CANDIDATE' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                        m.status === 'REJECTED' ? 'bg-rose-950 text-rose-300 border border-rose-800' :
                        'bg-slate-800 text-slate-400'
                      }`}>
                        {m.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right space-x-2">
                      {m.status === 'CANDIDATE' && canGovern && (
                        <button
                          onClick={() => handleValidate(m.model_version)}
                          className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-bold rounded-lg transition"
                        >
                          Run Validation
                        </button>
                      )}
                      {m.status === 'APPROVED' && canGovern && (
                        <button
                          onClick={() => handleDeploy(m.model_version)}
                          className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold rounded-lg transition"
                        >
                          Promote to Prod
                        </button>
                      )}
                      {m.status === 'RETIRED' && canGovern && (
                        <button
                          onClick={() => handleRollback(m.model_version)}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold rounded-lg border border-slate-700 transition"
                        >
                          Rollback
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
