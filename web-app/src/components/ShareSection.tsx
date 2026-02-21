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

  const emailFamily = () => {
    const subject = encodeURIComponent(
      `Look what I built: ${session.projectBrief?.name || 'My Edge AI Project'}`,
    );
    const body = encodeURIComponent(
      [
        'Hi!',
        '',
        'Today I trained an AI model that runs on an Arduino.',
        '',
        `Project: ${session.projectBrief?.name || 'Gesture AI'}`,
        `Gestures: ${session.gestures.map((g) => g.name).join(', ') || 'N/A'}`,
        session.trainingAccuracy !== null
          ? `Training accuracy: ${Math.round(session.trainingAccuracy * 100)}%`
          : '',
        '',
        'I attached/downloaded my portfolio HTML to share.',
      ]
        .filter(Boolean)
        .join('\n'),
    );
    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
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
        <button
          onClick={emailFamily}
          className="px-4 py-2 rounded-lg border border-slate-300 font-semibold text-slate-700 hover:bg-slate-50"
        >
          Email Family
        </button>
      </div>
    </div>
  );
}

