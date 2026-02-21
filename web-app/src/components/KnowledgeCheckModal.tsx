import { useEffect, useState } from 'react';
import type { KnowledgeCheck } from '../data/knowledgeChecks';
import { useSessionStore } from '../state/sessionStore';

interface KnowledgeCheckModalProps {
  check: KnowledgeCheck;
  onPass: () => void;
}

export function KnowledgeCheckModal({ check, onPass }: KnowledgeCheckModalProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [showTeacherUnlock, setShowTeacherUnlock] = useState(false);

  const { addBadge, passCheckpoint, logTeacherOverride } = useSessionStore();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'u') {
        setShowTeacherUnlock(true);
        setTimeout(() => setShowTeacherUnlock(false), 10000);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const isCorrect = selected !== null && check.options[selected].correct;

  const submit = () => {
    if (selected === null) return;
    setShowResult(true);

    if (check.options[selected].correct) {
      passCheckpoint(check.id);
      if (check.badgeOnPass) {
        addBadge(check.badgeOnPass);
      }
    } else {
      setAttempts((a) => a + 1);
    }
  };

  const continueOrRetry = () => {
    if (isCorrect) {
      onPass();
      return;
    }
    setShowResult(false);
    setSelected(null);
  };

  const unlockForTeacher = () => {
    logTeacherOverride(check.id);
    onPass();
  };

  return (
    <div className="fixed inset-0 z-[999] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg">
        <h2 className="text-xl font-bold text-slate-800 mb-2">Quick Check</h2>
        <p className="text-slate-700 mb-5">{check.question}</p>

        <div className="space-y-3 mb-4">
          {check.options.map((option, i) => (
            <button
              key={option.text}
              onClick={() => !showResult && setSelected(i)}
              disabled={showResult}
              className={`w-full text-left rounded-xl p-3 border-2 transition ${
                showResult
                  ? option.correct
                    ? 'border-emerald-500 bg-emerald-50'
                    : selected === i
                    ? 'border-rose-400 bg-rose-50'
                    : 'border-slate-200'
                  : selected === i
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              {option.text}
            </button>
          ))}
        </div>

        {showResult && (
          <div
            className={`rounded-xl p-3 mb-4 text-sm ${
              isCorrect ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
            }`}
          >
            <p className="font-semibold mb-1">{isCorrect ? 'Correct' : 'Not quite yet'}</p>
            <p>{check.explanation}</p>
          </div>
        )}

        {!showResult && attempts >= 2 && (
          <p className="text-xs text-slate-500 mb-3">
            Hint: compare live sensor patterns and think about what the model actually sees.
          </p>
        )}

        {!showResult ? (
          <button
            onClick={submit}
            disabled={selected === null}
            className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Check Answer
          </button>
        ) : (
          <button onClick={continueOrRetry} className="btn-primary w-full">
            {isCorrect ? 'Continue' : 'Try Again'}
          </button>
        )}

        {showTeacherUnlock && (
          <button
            onClick={unlockForTeacher}
            className="mt-3 w-full py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:underline"
          >
            Unlock for Student (Teacher)
          </button>
        )}
      </div>
    </div>
  );
}

