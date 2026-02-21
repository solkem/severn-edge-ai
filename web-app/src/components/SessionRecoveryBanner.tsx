import { useMemo } from 'react';
import { useSessionStore } from '../state/sessionStore';

function formatRelative(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function SessionRecoveryBanner() {
  const {
    recoverySessions,
    recoverSession,
    startFresh,
    clearAllDataAndRestart,
    isLoading,
  } = useSessionStore();

  const hasRecovery = useMemo(
    () => recoverySessions.length > 0,
    [recoverySessions],
  );

  if (isLoading || !hasRecovery) return null;

  return (
    <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 p-4">
      <h3 className="font-bold text-blue-900 mb-2">Found Previous Work</h3>
      <p className="text-blue-800 text-sm mb-3">
        Choose a session to continue or start fresh.
      </p>
      <div className="space-y-2 mb-3">
        {recoverySessions.slice(0, 3).map((s) => (
          <div
            key={s.id}
            className="bg-white border border-blue-100 rounded-xl p-3 flex items-center justify-between gap-3"
          >
            <div>
              <p className="font-semibold text-slate-800 text-sm">
                {s.projectBrief?.name || 'Untitled Project'}
              </p>
              <p className="text-xs text-slate-500">
                {s.gestures.length} gestures, updated {formatRelative(s.updatedAt)}
              </p>
            </div>
            <button
              onClick={() => void recoverSession(s.id)}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700"
            >
              Continue
            </button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => void startFresh()}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-blue-200 text-blue-700 hover:bg-blue-100"
        >
          Start Fresh
        </button>
        <button
          onClick={() => void clearAllDataAndRestart()}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-rose-200 text-rose-700 hover:bg-rose-50"
        >
          Clear Device Data
        </button>
      </div>
    </div>
  );
}

