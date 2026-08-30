import React, { useState } from 'react';
import { useAuth, DEMO_USERS } from '../context/AuthContext';
import { Activity, Lock, Building2, User, Key, X, CheckCircle2, Shield, AlertCircle } from 'lucide-react';

export const LoginModal = ({ isOpen, onClose }) => {
  const { currentStaff, switchStaff, switchHospital, addToast } = useAuth();
  const [selectedStaffId, setSelectedStaffId] = useState(currentStaff.staff_id);
  const [selectedHospital, setSelectedHospital] = useState(currentStaff.hospital_id);

  if (!isOpen) return null;

  const handleSelectPreset = (user) => {
    setSelectedStaffId(user.staff_id);
    setSelectedHospital(user.hospital_id);
  };

  const handleApplyLogin = () => {
    switchHospital(selectedHospital);
    switchStaff(selectedStaffId);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center text-white shadow-md">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">PatientTriage.ai Staff Authentication</h2>
              <p className="text-xs text-slate-400">Emergency Department Clinical Access Gateway</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Clinical Role Quick-Switch Presets */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300">Select Clinician Demo Persona</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {DEMO_USERS.map((u) => {
              const isSelected = selectedStaffId === u.staff_id;
              return (
                <button
                  key={u.staff_id}
                  type="button"
                  onClick={() => handleSelectPreset(u)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    isSelected
                      ? 'bg-cyan-950/60 border-cyan-500 text-white shadow-md shadow-cyan-950/40'
                      : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="font-bold text-xs">{u.name}</div>
                  <div className="text-[11px] text-cyan-400 mt-0.5">{u.role_label}</div>
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">ID: {u.staff_id} • {u.hospital_id}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Credentials Detail */}
        <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
          <div className="flex items-center justify-between text-slate-300">
            <span>Hospital Tenant:</span>
            <strong className="font-mono text-cyan-400">{selectedHospital}</strong>
          </div>
          <div className="flex items-center justify-between text-slate-300">
            <span>Staff Account ID:</span>
            <strong className="font-mono text-white">{selectedStaffId}</strong>
          </div>
          <div className="flex items-center justify-between text-slate-300">
            <span>Authentication Type:</span>
            <span className="text-emerald-400 font-semibold">PBKDF2-HMAC Tokenized</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApplyLogin}
            className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-md shadow-cyan-900/30 transition-all"
          >
            Sign In with Selected Persona
          </button>
        </div>

      </div>
    </div>
  );
};
