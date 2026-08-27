import { useState } from 'react'
import { Activity, AlertTriangle, ShieldCheck } from 'lucide-react'

function App() {
  const [result, setResult] = useState(null)

  const handleTriage = async () => {
    // Sending the Ambiguous Cardiac benchmark case
    const patientData = {
      age: 48, gender: "Female", hr: 75, sbp: 120, rr: 16, spo2: 98, gcs: 15, history_available: false
    }

    const response = await fetch('/api/triage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patientData)
    })
    const data = await response.json()
    setResult(data.result)
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-10 font-sans">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-3">
        <Activity className="text-red-500" /> PatientTriage.ai
      </h1>
      
      <button onClick={handleTriage} className="bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-lg font-semibold transition">
        Run AI Triage (Benchmark Case #3)
      </button>

      {result && (
        <div className="mt-8 bg-gray-800 p-6 rounded-xl border border-gray-700 max-w-md">
          <h2 className="text-xl font-bold text-yellow-400 mb-2">Recommended Level: {result.triage_level}</h2>
          <p className="text-gray-300 mb-4">AI Confidence: {result.confidence_score}%</p>
          
          {result.auto_escalated && (
            <div className="bg-red-900/50 text-red-200 p-3 rounded mb-4 flex items-start gap-2">
              <AlertTriangle size={20} />
              <p className="text-sm">Fail-Safe Activated: Patient severity auto-escalated due to low confidence or missing history.</p>
            </div>
          )}

          <h3 className="font-semibold text-gray-400 mb-2 flex items-center gap-2">
            <ShieldCheck size={18}/> Top Clinical Drivers (SHAP)
          </h3>
          <ul className="list-disc pl-5 text-sm text-gray-300">
            {result.clinical_drivers.map((driver, idx) => (
              <li key={idx}>{driver}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default App