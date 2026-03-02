/**
 * Test Page — Simple Live Testing with Correct/Incorrect Scoring
 *
 * Students start live inference, perform gestures, and tap ✅ or ❌
 * to record whether the AI recognized them correctly. Each gesture
 * shows a running tally of correct / total attempts.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GestureLabel } from '../types';
import { TrainingService } from '../services/trainingService';
import type { InferenceResult } from '../types/ble';
import { getBLEService } from '../services/bleService';
import { EdgeAIFactsPanel } from '../components/EdgeAIFactsPanel';
import {
  applyMotionHeuristic,
  normalizeConfidence,
} from '../services/inferenceUtils';

// Session auto-ends after 2 minutes to prevent stuck streams.
const LIVE_SESSION_MAX_MS = 2 * 60 * 1000;
const LIVE_IDLE_CONFIDENCE_THRESHOLD = 0.55;

interface GestureScore {
  correct: number;
  total: number;
}

function formatPercent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

interface TestPageProps {
  labels: GestureLabel[];
  trainingService: TrainingService;
  onStartOver?: () => void;
  onOpenPortfolio?: () => void;
}

export function TestPage({
  labels,
  trainingService,
  onStartOver,
  onOpenPortfolio,
}: TestPageProps) {
  // Live inference state
  const [isRunning, setIsRunning] = useState(false);
  const [currentPrediction, setCurrentPrediction] = useState<number | null>(null);
  const [confidence, setConfidence] = useState(0);
  const [sessionMsRemaining, setSessionMsRemaining] = useState(LIVE_SESSION_MAX_MS);
  const [useArduinoInference, setUseArduinoInference] = useState(true);
  const [liveError, setLiveError] = useState<string | null>(null);

  // Scoring state — per-gesture correct / total
  const [scores, setScores] = useState<Record<string, GestureScore>>(() =>
    Object.fromEntries(labels.map((l) => [l.id, { correct: 0, total: 0 }])),
  );
  // Which gesture the student is currently testing
  const [activeGestureId, setActiveGestureId] = useState<string | null>(
    labels.length > 0 ? labels[0].id : null,
  );

  const liveSessionStopTimerRef = useRef<number | null>(null);
  const liveSessionStartedAtRef = useRef<number | null>(null);

  // ---------- Cleanup ----------
  useEffect(() => {
    return () => {
      if (liveSessionStopTimerRef.current !== null) {
        window.clearTimeout(liveSessionStopTimerRef.current);
      }
      const ble = getBLEService();
      void Promise.allSettled([ble.stopInference(), ble.stopSensorStream()]);
    };
  }, []);

  // Keep gesture scores in sync with labels
  useEffect(() => {
    setScores((prev) => {
      const next: Record<string, GestureScore> = {};
      for (const label of labels) {
        next[label.id] = prev[label.id] ?? { correct: 0, total: 0 };
      }
      return next;
    });
    if (activeGestureId && !labels.find((l) => l.id === activeGestureId)) {
      setActiveGestureId(labels.length > 0 ? labels[0].id : null);
    }
  }, [labels, activeGestureId]);

  // ---------- Session timer display ----------
  useEffect(() => {
    if (!isRunning || liveSessionStartedAtRef.current === null) {
      setSessionMsRemaining(LIVE_SESSION_MAX_MS);
      return;
    }

    const tick = () => {
      if (liveSessionStartedAtRef.current === null) return;
      const elapsed = Date.now() - liveSessionStartedAtRef.current;
      setSessionMsRemaining(Math.max(0, LIVE_SESSION_MAX_MS - elapsed));
    };

    tick();
    const timer = window.setInterval(tick, 200);
    return () => window.clearInterval(timer);
  }, [isRunning]);

  // ---------- Start / Stop ----------
  const stopTestingInternal = useCallback(async () => {
    const ble = getBLEService();
    try {
      await Promise.allSettled([ble.stopInference(), ble.stopSensorStream()]);
    } catch (err) {
      console.error('Stop testing failed:', err);
    } finally {
      setIsRunning(false);
      if (liveSessionStopTimerRef.current !== null) {
        window.clearTimeout(liveSessionStopTimerRef.current);
        liveSessionStopTimerRef.current = null;
      }
      liveSessionStartedAtRef.current = null;
      setSessionMsRemaining(LIVE_SESSION_MAX_MS);
    }
  }, []);

  const startTesting = async () => {
    const ble = getBLEService();
    setLiveError(null);
    setCurrentPrediction(null);
    setConfidence(0);
    liveSessionStartedAtRef.current = Date.now();
    setSessionMsRemaining(LIVE_SESSION_MAX_MS);

    liveSessionStopTimerRef.current = window.setTimeout(() => {
      void stopTestingInternal();
    }, LIVE_SESSION_MAX_MS);

    setIsRunning(true);

    try {
      if (useArduinoInference) {
        await ble.startInference((result: InferenceResult) => {
          if (result.noModel) {
            setCurrentPrediction(null);
            setConfidence(0);
            setLiveError('No model on device. Train and upload a model before live testing.');
            return;
          }
          setLiveError(null);
          setCurrentPrediction(result.prediction);
          setConfidence(normalizeConfidence(result.confidence, 'arduino'));
        });
      } else {
        const { MODEL_CONFIG } = await import('../config/constants');
        const sampleBuffer: number[][] = [];

        await ble.startSensorStream((packet) => {
          sampleBuffer.push([
            packet.ax, packet.ay, packet.az,
            packet.gx, packet.gy, packet.gz,
          ]);

          if (sampleBuffer.length >= MODEL_CONFIG.WINDOW_SIZE) {
            const rawResult = trainingService.predict(
              sampleBuffer.slice(-MODEL_CONFIG.WINDOW_SIZE),
            );

            const idleClassIndexFromLabels = labels.findIndex(
              (label) => label.name.trim().toLowerCase() === 'idle',
            );
            const modelOutputClasses = trainingService.getModel()?.outputShape?.[1];
            const hasExtraClass =
              typeof modelOutputClasses === 'number' && modelOutputClasses > labels.length;
            const idleClassIndex = idleClassIndexFromLabels >= 0
              ? idleClassIndexFromLabels
              : hasExtraClass
                ? labels.length
                : -1;

            const adjusted = idleClassIndex >= 0
              ? applyMotionHeuristic(
                sampleBuffer.slice(-MODEL_CONFIG.WINDOW_SIZE),
                rawResult,
                idleClassIndex,
              )
              : rawResult;

            setCurrentPrediction(adjusted.prediction);
            setConfidence(normalizeConfidence(adjusted.confidence, 'browser'));
            sampleBuffer.splice(0, sampleBuffer.length - MODEL_CONFIG.WINDOW_STRIDE);
          }
        });
      }
    } catch (err) {
      setIsRunning(false);
      if (liveSessionStopTimerRef.current !== null) {
        window.clearTimeout(liveSessionStopTimerRef.current);
        liveSessionStopTimerRef.current = null;
      }
      liveSessionStartedAtRef.current = null;
      console.error('Start testing failed:', err);
      setLiveError(
        err instanceof Error
          ? err.message
          : 'Failed to start testing. Reconnect and try again.',
      );
    }
  };

  const stopTesting = () => void stopTestingInternal();

  // ---------- Scoring ----------
  const recordResult = (gestureId: string, wasCorrect: boolean) => {
    setScores((prev) => {
      const existing = prev[gestureId] ?? { correct: 0, total: 0 };
      return {
        ...prev,
        [gestureId]: {
          correct: existing.correct + (wasCorrect ? 1 : 0),
          total: existing.total + 1,
        },
      };
    });
  };

  const resetScores = () => {
    setScores(
      Object.fromEntries(labels.map((l) => [l.id, { correct: 0, total: 0 }])),
    );
  };

  // ---------- Computed ----------
  const livePredictionView = useMemo(() => {
    if (currentPrediction === null) {
      return { label: null as string | null, isIdle: false };
    }

    if (currentPrediction >= 0 && currentPrediction < labels.length) {
      if (confidence < LIVE_IDLE_CONFIDENCE_THRESHOLD) {
        return { label: 'Idle', isIdle: true };
      }
      return { label: labels[currentPrediction].name, isIdle: false };
    }

    if (currentPrediction === labels.length) {
      return { label: 'Idle', isIdle: true };
    }

    return { label: `Class ${currentPrediction}`, isIdle: false };
  }, [confidence, currentPrediction, labels]);

  const totalCorrect = Object.values(scores).reduce((sum, s) => sum + s.correct, 0);
  const totalAttempts = Object.values(scores).reduce((sum, s) => sum + s.total, 0);
  const overallAccuracy = totalAttempts > 0 ? totalCorrect / totalAttempts : 0;

  // ---------- Render ----------
  return (
    <div className="p-4 max-w-5xl mx-auto space-y-6">
      {/* Live Inference Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card bg-gradient-to-br from-white to-slate-50">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="heading-md mb-2">🧪 Test Your AI</h1>
                <p className="text-slate-600">
                  Perform each gesture and mark whether the AI got it right.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={useArduinoInference}
                    onChange={(e) => setUseArduinoInference(e.target.checked)}
                    disabled={isRunning}
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
                  <span className="ml-2 text-sm font-medium text-gray-700">
                    {useArduinoInference ? 'On Device' : 'Browser'}
                  </span>
                </label>
              </div>
            </div>

            {/* Big prediction display */}
            <div className="bg-slate-900 rounded-2xl p-8 text-center relative overflow-hidden min-h-[300px] flex flex-col items-center justify-center">
              <div
                className="absolute inset-0 opacity-10"
                style={{
                  backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)',
                  backgroundSize: '20px 20px',
                }}
              />

              {isRunning ? (
                livePredictionView.label ? (
                  <div className="relative z-10 animate-in fade-in zoom-in duration-300">
                    <div className="text-slate-400 text-sm uppercase tracking-widest mb-4 font-bold">
                      {livePredictionView.isIdle
                        ? 'No Gesture (Idle)'
                        : useArduinoInference
                          ? 'Arduino Says...'
                          : 'Detected Gesture'}
                    </div>
                    <div className="text-6xl md:text-7xl font-bold text-white mb-4 tracking-tight">
                      {livePredictionView.label}
                    </div>

                    <div className="inline-flex items-center gap-2 bg-slate-800/50 rounded-full px-4 py-2 backdrop-blur-sm border border-slate-700">
                      <div
                        className={`w-3 h-3 rounded-full ${
                          livePredictionView.isIdle
                            ? 'bg-sky-400'
                            : confidence > 0.7
                            ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]'
                            : confidence > 0.4
                              ? 'bg-amber-500'
                              : 'bg-rose-500'
                        }`}
                      />
                      <span className="text-slate-300 font-mono">
                        {formatPercent(confidence)}% Confident
                      </span>
                    </div>

                    <div className="mt-8 w-64 mx-auto bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          livePredictionView.isIdle
                            ? 'bg-sky-400'
                            : confidence > 0.7
                            ? 'bg-emerald-500'
                            : confidence > 0.4
                              ? 'bg-amber-500'
                              : 'bg-rose-500'
                        }`}
                        style={{ width: `${confidence * 100}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-500 animate-pulse">
                    <p>Watching for movement...</p>
                  </div>
                )
              ) : (
                <div className="text-slate-500">
                  <p className="text-lg">Ready to start?</p>
                </div>
              )}
            </div>

            {/* Start / Stop button */}
            <div className="mt-6 flex justify-center">
              {!isRunning ? (
                <button
                  onClick={startTesting}
                  className="btn-primary text-xl px-12 py-4 shadow-xl shadow-primary-200"
                >
                  Start Testing
                </button>
              ) : (
                <button
                  onClick={stopTesting}
                  className="btn-danger text-xl px-12 py-4 shadow-xl shadow-rose-200"
                >
                  Stop Testing
                </button>
              )}
            </div>

            <div className="mt-3 text-center text-sm text-slate-600">
              {isRunning
                ? `Session auto-ends in ${formatClock(sessionMsRemaining)}`
                : `Each live testing session runs up to ${formatClock(LIVE_SESSION_MAX_MS)}.`}
            </div>

            {liveError && (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                {liveError}
              </div>
            )}

            <div className="mt-6">
              <EdgeAIFactsPanel />
            </div>
          </div>
        </div>

        {/* Right column: Scoring panel */}
        <div className="space-y-6">
          {/* Overall accuracy */}
          <div className="card bg-gradient-to-br from-emerald-50 to-white border border-emerald-200">
            <div className="text-center">
              <div className="text-xs uppercase tracking-wider text-emerald-600 font-bold mb-1">
                Overall Accuracy
              </div>
              <div className="text-4xl font-bold text-emerald-800">
                {totalAttempts > 0 ? formatPercent(overallAccuracy) : '—'}
              </div>
              <div className="text-sm text-emerald-600 mt-1">
                {totalCorrect} / {totalAttempts} correct
              </div>
            </div>
          </div>

          {/* Per-gesture scoring */}
          <div className="card">
            <h3 className="font-bold text-slate-800 mb-1">Score Each Gesture</h3>
            <p className="text-xs text-slate-500 mb-4">
              Perform a gesture, then tap ✅ if the AI was right or ❌ if it was wrong.
            </p>

            <div className="space-y-3">
              {labels.map((label) => {
                const score = scores[label.id] ?? { correct: 0, total: 0 };
                const accuracy = score.total > 0 ? score.correct / score.total : 0;
                const isActive = activeGestureId === label.id;

                return (
                  <div
                    key={label.id}
                    className={`rounded-xl border-2 p-3 transition-all cursor-pointer ${
                      isActive
                        ? 'border-primary-400 bg-primary-50 shadow-md'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                    onClick={() => setActiveGestureId(label.id)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-slate-800">{label.name}</span>
                      <span className={`text-sm font-bold ${
                        score.total === 0
                          ? 'text-slate-400'
                          : accuracy >= 0.8
                          ? 'text-emerald-600'
                          : accuracy >= 0.5
                            ? 'text-amber-600'
                            : 'text-rose-600'
                      }`}>
                        {score.correct}/{score.total}
                      </span>
                    </div>

                    {/* Progress bar */}
                    {score.total > 0 && (
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-2">
                        <div
                          className={`h-full transition-all duration-300 rounded-full ${
                            accuracy >= 0.8
                              ? 'bg-emerald-500'
                              : accuracy >= 0.5
                              ? 'bg-amber-500'
                              : 'bg-rose-500'
                          }`}
                          style={{ width: `${accuracy * 100}%` }}
                        />
                      </div>
                    )}

                    {/* Score buttons — only show for active gesture */}
                    {isActive && (
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            recordResult(label.id, true);
                          }}
                          className="flex-1 py-2 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-700 font-bold text-sm transition-colors active:scale-95 border border-emerald-200"
                        >
                          ✅ Correct
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            recordResult(label.id, false);
                          }}
                          className="flex-1 py-2 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold text-sm transition-colors active:scale-95 border border-rose-200"
                        >
                          ❌ Wrong
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              onClick={resetScores}
              className="w-full mt-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-colors"
            >
              Reset All Scores
            </button>
          </div>

          {/* Navigation */}
          {!isRunning && (
            <div className="space-y-2">
              {onOpenPortfolio && (
                <button
                  onClick={onOpenPortfolio}
                  className="w-full bg-primary-50 hover:bg-primary-100 text-primary-700 font-bold py-3 px-6 rounded-xl transition-colors border border-primary-200"
                >
                  Open Portfolio
                </button>
              )}
              {onStartOver && (
                <button
                  onClick={onStartOver}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-6 rounded-xl transition-colors border border-slate-200 flex items-center justify-center gap-2"
                >
                  <span>🏠</span>
                  <span>Start Over</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
