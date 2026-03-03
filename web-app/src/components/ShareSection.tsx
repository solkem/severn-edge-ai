import { useSessionStore } from '../state/sessionStore';
import { downloadPortfolio } from '../services/portfolioExportService';

export function ShareSection() {
  const { session, samples, journal } = useSessionStore();

  if (!session) return null;

  const download = () => {
    downloadPortfolio(session, samples, journal, false);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <h3 className="text-lg font-bold text-slate-800 mb-2">Share Your Work</h3>
      <p className="text-sm text-slate-600 mb-4">
        Download a self-contained portfolio file and share it with family.
      </p>

      <div className="flex flex-wrap gap-2">
        <button onClick={download} className="btn-primary">
          Download Portfolio
        </button>
      </div>
    </div>
  );
}
