import { ShareSection } from '../components/ShareSection';
import { useSessionStore } from '../state/sessionStore';
import { JournalPrompt } from '../components/JournalPrompt';

interface PortfolioPageProps {
  onBackToTest: () => void;
  onStartOver: () => void;
}

export function PortfolioPage({ onBackToTest, onStartOver }: PortfolioPageProps) {
  const { session, samples } = useSessionStore();

  if (!session) return null;

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-6">
      <div className="card bg-gradient-to-br from-white to-slate-50">
        <h1 className="heading-md mb-2">Portfolio & Showcase</h1>
        <p className="text-slate-600">
          Review your project and export a shareable artifact.
        </p>
      </div>

      <div className="card">
        <h2 className="text-lg font-bold text-slate-800 mb-3">Project Summary</h2>
        <div className="space-y-1 text-sm text-slate-700">
          <p>
            <strong>Project:</strong> {session.projectBrief?.name || 'Untitled'}
          </p>
          <p>
            <strong>Student:</strong> {session.projectBrief?.studentName || 'N/A'}
          </p>
          <p>
            <strong>Gestures:</strong>{' '}
            {session.gestures.map((g) => g.name).join(', ') || 'None'}
          </p>
          <p>
            <strong>Total Samples:</strong> {samples.length}
          </p>
          <p>
            <strong>Training Accuracy:</strong>{' '}
            {session.trainingAccuracy !== null
              ? `${Math.round(session.trainingAccuracy * 100)}%`
              : 'Not recorded'}
          </p>
        </div>
      </div>

      <JournalPrompt
        prompt="after-test"
        title="Final Reflection"
        placeholder="What did you learn from building and testing your model?"
      />

      <ShareSection />

      <div className="flex flex-wrap gap-2">
        <button
          onClick={onBackToTest}
          className="px-4 py-2 rounded-lg border border-slate-300 font-semibold text-slate-700 hover:bg-slate-50"
        >
          Back to Test
        </button>
        <button onClick={onStartOver} className="btn-primary">
          Start New Project
        </button>
      </div>
    </div>
  );
}

