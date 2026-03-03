import { useState } from 'react';
import { useSessionStore } from '../state/sessionStore';
import { downloadPortfolio } from '../services/portfolioExportService';

export function ShareSection() {
  const { session, samples, journal } = useSessionStore();
  const [anonymized, setAnonymized] = useState(false);

  if (!session) return null;

  const download = () => {
    downloadPortfolio(session, samples, journal, anonymized);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <h3 className="text-lg font-bold text-slate-800 mb-2">Share Your Work</h3>
      <p className="text-sm text-slate-600 mb-4">
        Download a self-contained portfolio file and share it with family.
      </p>

      <label className="flex items-center gap-2 text-sm text-slate-700 mb-3">
        <input
          type="checkbox"
          checked={anonymized}
          onChange={(e) => setAnonymized(e.target.checked)}
        />
        Anonymize student name in export
      </label>

      <div className="flex flex-wrap gap-2">
        <button onClick={download} className="btn-primary">
          Download Portfolio
        </button>
      </div>
    </div>
  );
}
