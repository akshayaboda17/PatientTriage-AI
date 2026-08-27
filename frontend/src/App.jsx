import { useState, useEffect } from 'react'
import { Activity, ShieldCheck, CheckCircle, XCircle, Users, Clock, RefreshCw } from 'lucide-react'

function App() {
  const [result, setResult] = useState(null)
  const [isOverridden, setIsOverridden] = useState(false)
  const [overrideReason, setOverrideReason] = useState("")
  const [auditSaved, setAuditSaved] = useState(false)
  
  // Phase 4: Queue State
  const [queue, setQueue] = useState([])
  const [isRefreshing, setIsRefreshing] = useState(false)

  // 1. Define the function first
  const fetchQueue = async () => {
    setIsRefreshing(true)
    try {
      const response = await fetch('/api/queue')
      const data = await response.json()
      setQueue(data.queue)
    } catch (error) {
      console.error("Failed to fetch queue", error)
    }
    setTimeout(() => setIsRefreshing(false), 500) 
  }

  // 2. Then call it in useEffect
 useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchQueue()
  }, [])


  const handleTriage = async () => {
    const patientData = { age: 48, gender: "Female", hr: 75, sbp: 120, rr: 16, spo2: 98, gcs: 15, history_available: false }
    const response = await fetch('/api/triage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patientData)
    })
    const data = await response.json()
    setResult(data.result)
    setAuditSaved(false)
    setIsOverridden(false)
  }

  const handleAudit = async (actionType, newLevel = null) => {
    const auditPayload = {
      patient_id: "TEMP-4587", staff_id: "NURSE-992", ai_suggested_level: result.triage_level,
      ai_confidence_score: result.confidence_score, clinician_assigned_level: newLevel || result.triage_level,
      action_type: actionType, override_reason: overrideReason || "N/A", top_3_drivers: result.clinical_drivers
    }
    await fetch('/api/override', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(auditPayload)
    })
    setAuditSaved(true)
  }

  // Helper to color-code patients based on severity
  const getLevelColor = (level) => {
    switch(level) {
      case 1: return 'bg-red-900/40 border-red-500 text-red-200'
      case 2: return 'bg-orange-900/40 border-orange-500 text-orange-200'
      case 3: return 'bg-yellow-900/40 border-yellow-500 text-yellow-200'
      case 4: return 'bg-green-900/40 border-green-500 text-green-200'
      default: return 'bg-blue-900/40 border-blue-500 text-blue-200'
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8 font-sans flex flex-col md:flex-row gap-8">
      
      {/* Left Column: The AI Triage Tool (Phase 2 & 3) */}
      <div className="flex-1">
        <h1 className="text-3xl font-bold mb-6 flex items-center gap-3">
          <Activity className="text-red-500" /> PatientTriage.ai
        </h1>
        
        <button onClick={handleTriage} className="bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-lg font-semibold transition w-full md:w-auto">
          Run AI Triage (Benchmark Case #3)
        </button>

        {result && (
          <div className="mt-8 bg-gray-800 p-6 rounded-xl border border-gray-700 max-w-md">
            <h2 className="text-xl font-bold text-yellow-400 mb-2">Recommended Level: {result.triage_level}</h2>
            <p className="text-gray-300 mb-4">AI Confidence: {result.confidence_score}%</p>
            
            <h3 className="font-semibold text-gray-400 mb-2 flex items-center gap-2">
              <ShieldCheck size={18}/> Top Clinical Drivers
            </h3>
            <ul className="list-disc pl-5 text-sm text-gray-300 mb-6">
              {result.clinical_drivers.map((driver, idx) => <li key={idx}>{driver}</li>)}
            </ul>

            {!auditSaved ? (
              <div className="space-y-4 border-t border-gray-700 pt-4">
                <p className="font-semibold text-gray-300">Clinician Action Required:</p>
                <div className="flex gap-4">
                  <button onClick={() => handleAudit("ACCEPTED")} className="flex-1 bg-green-700 hover:bg-green-600 py-2 rounded font-semibold flex items-center justify-center gap-2">
                    <CheckCircle size={18} /> Accept
                  </button>
                  <button onClick={() => setIsOverridden(true)} className="flex-1 bg-red-700 hover:bg-red-600 py-2 rounded font-semibold flex items-center justify-center gap-2">
                    <XCircle size={18} /> Override
                  </button>
                </div>

                {isOverridden && (
                  <div className="mt-4 p-4 bg-gray-900 rounded border border-gray-600">
                    <label className="block text-sm mb-2">Select Override Reason:</label>
                    <select 
                      className="w-full bg-gray-800 border border-gray-600 rounded p-2 mb-4"
                      onChange={(e) => setOverrideReason(e.target.value)}
                    >
                      <option value="">-- Select Rationale --</option>
                      <option value="Clinical Intuition / Gestalt">Clinical Intuition / Gestalt</option>
                      <option value="Uncontrolled / Active Hemorrhage">Uncontrolled / Active Hemorrhage</option>
                      <option value="High-Risk Mechanism of Injury">High-Risk Mechanism of Injury</option>
                    </select>
                    <button 
                      onClick={() => handleAudit("OVERRIDDEN", Math.max(1, result.triage_level - 1))}
                      disabled={!overrideReason}
                      className="w-full bg-blue-600 disabled:bg-gray-600 py-2 rounded font-semibold"
                    >
                      Confirm Override (Escalate to Level {Math.max(1, result.triage_level - 1)})
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-4 bg-green-900/50 text-green-200 p-3 rounded flex items-center gap-2">
                <CheckCircle size={20} />
                <p className="font-semibold">Decision securely logged to Audit Trail.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right Column: Phase 4 Dynamic ER Queue */}
      <div className="flex-1 bg-gray-800 p-6 rounded-xl border border-gray-700">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold flex items-center gap-2 text-white">
            <Users className="text-blue-400" /> ER Waiting Room
          </h2>
          <button onClick={fetchQueue} className="text-gray-400 hover:text-white transition">
            <RefreshCw className={isRefreshing ? "animate-spin" : ""} />
          </button>
        </div>

        <div className="space-y-3">
          {queue.length === 0 ? (
            <p className="text-gray-400">Loading queue...</p>
          ) : (
            queue.map((patient, index) => (
              <div key={index} className={`p-4 rounded-lg border flex justify-between items-center ${getLevelColor(patient.triage_level)}`}>
                <div>
                  <h3 className="font-bold text-lg">{patient.patient_id}</h3>
                  <p className="text-sm opacity-80">{patient.age}y {patient.gender} • Status: {patient.status}</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black mb-1">L{patient.triage_level}</div>
                  <div className="text-sm flex items-center gap-1 justify-end opacity-80">
                    <Clock size={14} /> {patient.wait_time_mins}m waiting
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  )
}

export default App