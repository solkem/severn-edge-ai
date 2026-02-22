/**
 * Test Page - Live Inference Testing
 * Uses Arduino-side inference (model runs on device!)
 */

import { useEffect, useMemo, useState } from 'react';
import type { GestureLabel } from '../types';
import { TrainingService } from '../services/trainingService';
import type { InferenceResult } from '../types/ble';
import { getBLEService } from '../services/bleService';
import { EdgeAIFactsPanel } from '../components/EdgeAIFactsPanel';
import { useSessionStore } from '../state/sessionStore';

const CHALLENGE_MIN_ATTEMPTS = 10;
const CHALLENGE_TARGET_SUCCESS_RATE = 0.8;
const CHALLENGE_MIN_CONFIDENCE = 0.7;
const CHALLENGE_REQUIRED_SUCCESSES = Math.ceil(
  CHALLENGE_MIN_ATTEMPTS * CHALLENGE_TARGET_SUCCESS_RATE,
);

interface ChallengeStats {
  attempts: number;
  successes: number;
}

function createInitialChallengeStats(
  labels: GestureLabel[],
): Record<string, ChallengeStats> {
  return labels.reduce<Record<string, ChallengeStats>>((acc, label) => {
    acc[label.id] = { attempts: 0, successes: 0 };
    return acc;
  }, {});
}

function getSuccessRate(stats: ChallengeStats): number {
  if (stats.attempts === 0) return 0;
  return stats.successes / stats.attempts;
}

function hasPassedGestureChallenge(stats: ChallengeStats): boolean {
  return (
    stats.attempts >= CHALLENGE_MIN_ATTEMPTS &&
    getSuccessRate(stats) >= CHALLENGE_TARGET_SUCCESS_RATE
  );
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
  const [isRunning, setIsRunning] = useState(false);
  const [currentPrediction, setCurrentPrediction] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<number>(0);
  const [predictionHistory, setPredictionHistory] = useState<number[]>([]);
  const [useArduinoInference, setUseArduinoInference] = useState(true);
  const [highConfidenceCount, setHighConfidenceCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showDistribution, setShowDistribution] = useState(false);
  const [targetGestureIndex, setTargetGestureIndex] = useState(0);
  const [challengeNote, setChallengeNote] = useState<string | null>(null);
  const [challengeStats, setChallengeStats] = useState<Record<string, ChallengeStats>>(
    () => createInitialChallengeStats(labels),
  );
  const { addBadge } = useSessionStore();

  useEffect(() => {
    return () => {
      // Cleanup on unmount: stop both stream types to avoid stale closure issues.
      const ble = getBLEService();
      void Promise.allSettled([ble.stopInference(), ble.stopSensorStream()]);
    };
  }, []);

  useEffect(() => {
    setChallengeStats((prev) => {
      const next = createInitialChallengeStats(labels);
      for (const label of labels) {
        if (prev[label.id]) {
          next[label.id] = prev[label.id];
        }
      }
      return next;
    });

    setTargetGestureIndex((current) => {
      if (labels.length === 0) return 0;
      return Math.min(current, labels.length - 1);
    });
  }, [labels]);

  const startTesting = async () => {
    const ble = getBLEService();
    setError(null);
    setChallengeNote(null);
    setCurrentPrediction(null);
    setConfidence(0);
    setIsRunning(true);

    try {
      if (useArduinoInference) {
        // Use inference running ON the Arduino.
        await ble.startInference((result: InferenceResult) => {
          setCurrentPrediction(result.prediction);
          setConfidence(result.confidence / 100); // Convert 0-100 to 0-1.
          if (result.confidence >= 80) {
            setHighConfidenceCount((c) => {
              const next = c + 1;
              if (next === 10) {
                addBadge('sharp-shooter');
              }
              return next;
            });
          }
          // Keep a fixed-size history for distribution diagnostics.
          setPredictionHistory((prev) => [...prev.slice(-99), result.prediction]);
        });
      } else {
        // Fallback: browser-side inference (requires model not disposed).
        const { MODEL_CONFIG } = await import('../config/constants');
        const sampleBuffer: number[][] = [];

        await ble.startSensorStream((packet) => {
          sampleBuffer.push([
            packet.ax, packet.ay, packet.az,
            packet.gx, packet.gy, packet.gz,
          ]);

          if (sampleBuffer.length >= MODEL_CONFIG.WINDOW_SIZE) {
            const predictionResult = trainingService.predict(
              sampleBuffer.slice(-MODEL_CONFIG.WINDOW_SIZE),
            );
            setCurrentPrediction(predictionResult.prediction);
            setConfidence(predictionResult.confidence);
            setPredictionHistory((prev) => [
              ...prev.slice(-99),
              predictionResult.prediction,
            ]);
            sampleBuffer.splice(0, sampleBuffer.length - MODEL_CONFIG.WINDOW_STRIDE);
          }
        });
      }
    } catch (err) {
      setIsRunning(false);
      console.error('Start testing failed:', err);
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to start testing. Reconnect and try again.',
      );
    }
  };

  const stopTesting = async () => {
    const ble = getBLEService();
    try {
      if (useArduinoInference) {
        await ble.stopInference();
      } else {
        await ble.stopSensorStream();
      }
    } catch (err) {
      console.error('Stop testing failed:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to stop testing cleanly.',
      );
    } finally {
      setIsRunning(false);
    }
  };

  const resetChallenge = () => {
    setChallengeStats(createInitialChallengeStats(labels));
    setChallengeNote(null);
  };

  const scoreCurrentAttempt = () => {
    const target = labels[targetGestureIndex];
    if (!target) return;

    if (!isRunning) {
      setChallengeNote('Press Start Testing, perform the gesture, then tap Score Attempt.');
      return;
    }

    if (
      currentPrediction === null ||
      currentPrediction < 0 ||
      currentPrediction >= labels.length
    ) {
      setChallengeNote('No clear gesture yet. Move the board and wait for a prediction first.');
      return;
    }

    const predictedLabel = labels[currentPrediction];
    const isCorrectGesture = currentPrediction === targetGestureIndex;
    const isConfident = confidence >= CHALLENGE_MIN_CONFIDENCE;
    const isSuccess = isCorrectGesture && isConfident;

    setChallengeStats((prev) => {
      const existing = prev[target.id] ?? { attempts: 0, successes: 0 };
      return {
        ...prev,
        [target.id]: {
          attempts: existing.attempts + 1,
          successes: existing.successes + (isSuccess ? 1 : 0),
        },
      };
    });

    if (isSuccess) {
      setChallengeNote(
        `Nice! "${target.name}" detected at ${(confidence * 100).toFixed(0)}% confidence.`,
      );
      return;
    }

    if (!isCorrectGesture) {
      setChallengeNote(
        `Not yet. AI predicted "${predictedLabel.name}". Repeat "${target.name}" like your training samples.`,
      );
      return;
    }

    setChallengeNote(
      `Close. Correct gesture, but confidence ${(confidence * 100).toFixed(0)}% is below ${(CHALLENGE_MIN_CONFIDENCE * 100).toFixed(0)}%.`,
    );
  };

  const predictionCounts = useMemo(() => {
    const counts = new Array(labels.length).fill(0);
    for (const pred of predictionHistory) {
      if (pred >= 0 && pred < counts.length) {
        counts[pred]++;
      }
    }
    return counts;
  }, [predictionHistory, labels.length]);

  const challengeRows = useMemo(() => {
    return labels.map((label, idx) => {
      const stats = challengeStats[label.id] ?? { attempts: 0, successes: 0 };
      const successRate = getSuccessRate(stats);
      return {
        label,
        index: idx,
        attempts: stats.attempts,
        successes: stats.successes,
        successRate,
        passed: hasPassedGestureChallenge(stats),
      };
    });
  }, [challengeStats, labels]);

  const passedCount = challengeRows.filter((row) => row.passed).length;
  const challengeComplete = labels.length > 0 && passedCount === labels.length;
  const activeTarget = labels[targetGestureIndex] ?? null;

  const challengeCoachText = useMemo(() => {
    if (challengeComplete) {
      return 'Challenge complete. Your model is consistent enough for demo time.';
    }

    const weakGestures = challengeRows
      .filter((row) => row.attempts >= CHALLENGE_MIN_ATTEMPTS && !row.passed)
      .map((row) => row.label.name);

    if (weakGestures.length > 0) {
      return `Retrain or recollect cleaner examples for: ${weakGestures.join(', ')}.`;
    }

    const inProgress = challengeRows
      .filter((row) => row.attempts > 0 && row.attempts < CHALLENGE_MIN_ATTEMPTS)
      .map((row) => row.label.name);

    if (inProgress.length > 0) {
      return `Keep scoring attempts for: ${inProgress.join(', ')}.`;
    }

    return 'Pick a gesture target and start scoring attempts.';
  }, [challengeComplete, challengeRows]);

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Controls & Live View */}
        <div className="lg:col-span-2 space-y-6">
          <div className="card bg-gradient-to-br from-white to-slate-50">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="heading-md mb-2">🧪 Test Your Model</h1>
                <p className="text-slate-600">
                  {useArduinoInference
                    ? 'AI runs on Arduino. Perform gestures and score challenge attempts.'
                    : 'Perform gestures and watch the AI recognize them.'}
                </p>
              </div>

              {/* Mode Toggle */}
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

            {/* Live Prediction Display */}
            <div className="bg-slate-900 rounded-2xl p-8 text-center relative overflow-hidden min-h-[300px] flex flex-col items-center justify-center">
              {/* Background Grid */}
              <div
                className="absolute inset-0 opacity-10"
                style={{
                  backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)',
                  backgroundSize: '20px 20px',
                }}
              />

              {isRunning ? (
                currentPrediction !== null && currentPrediction < labels.length ? (
                  <div className="relative z-10 animate-in fade-in zoom-in duration-300">
                    <div className="text-slate-400 text-sm uppercase tracking-widest mb-4 font-bold">
                      {useArduinoInference ? 'Arduino Says...' : 'Detected Gesture'}
                    </div>
                    <div className="text-6xl md:text-7xl font-bold text-white mb-4 tracking-tight">
                      {labels[currentPrediction].name}
                    </div>

                    <div className="inline-flex items-center gap-2 bg-slate-800/50 rounded-full px-4 py-2 backdrop-blur-sm border border-slate-700">
                      <div
                        className={`w-3 h-3 rounded-full ${
                          confidence > 0.7
                            ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]'
                            : confidence > 0.4
                              ? 'bg-amber-500'
                              : 'bg-rose-500'
                        }`}
                      />
                      <span className="text-slate-300 font-mono">
                        {(confidence * 100).toFixed(1)}% Confident
                      </span>
                    </div>

                    {/* Confidence Bar */}
                    <div className="mt-8 w-64 mx-auto bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          confidence > 0.7
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

            {error && (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                {error}
              </div>
            )}

            <div className="mt-6">
              <EdgeAIFactsPanel />
            </div>
          </div>
        </div>

        {/* Right Column: Challenge-first Testing */}
        <div className="space-y-6">
          {/* Student Challenge */}
          <div className="card bg-gradient-to-br from-amber-50 to-white border border-amber-200">
            <h3 className="font-bold text-amber-900 mb-2 flex items-center gap-2">
              <span className="text-xl">🏁</span> Student Challenge
            </h3>
            <p className="text-sm text-amber-800">
              For each gesture, reach at least {CHALLENGE_REQUIRED_SUCCESSES} successful
              attempts out of {CHALLENGE_MIN_ATTEMPTS} scored attempts.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
                {CHALLENGE_MIN_ATTEMPTS} attempts / gesture
              </span>
              <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
                {Math.round(CHALLENGE_TARGET_SUCCESS_RATE * 100)}% success target
              </span>
              <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
                {(CHALLENGE_MIN_CONFIDENCE * 100).toFixed(0)}%+ confidence required
              </span>
            </div>

            <div className="mt-4 rounded-xl border border-amber-200 bg-white p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-700">Progress</span>
                <span className="font-bold text-slate-900">
                  {passedCount}/{labels.length} gestures passed
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-amber-100">
                <div
                  className="h-full bg-amber-500 transition-all duration-300"
                  style={{
                    width: `${labels.length > 0 ? (passedCount / labels.length) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Choose gesture to score now
              </div>
              <div className="flex flex-wrap gap-2">
                {labels.map((label, idx) => (
                  <button
                    key={label.id}
                    onClick={() => setTargetGestureIndex(idx)}
                    className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
                      targetGestureIndex === idx
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {label.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <button
                onClick={scoreCurrentAttempt}
                className="w-full rounded-xl bg-primary-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={!activeTarget}
              >
                Score Attempt{activeTarget ? ` for "${activeTarget.name}"` : ''}
              </button>
              <button
                onClick={resetChallenge}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                Reset Challenge Progress
              </button>
            </div>

            {challengeNote && (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                {challengeNote}
              </div>
            )}

            {challengeComplete && (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                Challenge complete. Your AI is ready for showcase testing.
              </div>
            )}
          </div>

          {/* Challenge Breakdown */}
          <div className="card">
            <h3 className="font-bold text-slate-800 mb-3">Per-Gesture Scoreboard</h3>
            <div className="space-y-3">
              {challengeRows.map((row) => {
                const attemptProgress = Math.min(
                  100,
                  (row.attempts / CHALLENGE_MIN_ATTEMPTS) * 100,
                );
                const successProgress = row.attempts > 0 ? row.successRate * 100 : 0;
                return (
                  <div
                    key={row.label.id}
                    className={`rounded-xl border p-3 ${
                      row.passed
                        ? 'border-emerald-200 bg-emerald-50'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-slate-800">{row.label.name}</div>
                      <div
                        className={`text-xs font-bold ${
                          row.passed ? 'text-emerald-700' : 'text-slate-500'
                        }`}
                      >
                        {row.passed ? 'PASSED' : 'IN PROGRESS'}
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
                      <span>
                        Attempts: {Math.min(row.attempts, CHALLENGE_MIN_ATTEMPTS)}/
                        {CHALLENGE_MIN_ATTEMPTS}
                      </span>
                      <span>
                        Successes: {row.successes}/{CHALLENGE_REQUIRED_SUCCESSES} target
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full bg-slate-400 transition-all duration-300"
                        style={{ width: `${attemptProgress}%` }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
                      <span>Success rate</span>
                      <span>{successProgress.toFixed(0)}%</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full transition-all duration-300 ${
                          successProgress >= CHALLENGE_TARGET_SUCCESS_RATE * 100
                            ? 'bg-emerald-500'
                            : 'bg-amber-500'
                        }`}
                        style={{ width: `${Math.min(100, successProgress)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Coaching */}
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
            <h3 className="font-bold text-blue-900 mb-2 flex items-center gap-2">
              <span className="text-xl">🧭</span> Coach
            </h3>
            <p className="text-sm text-blue-800 mb-3">{challengeCoachText}</p>
            <ul className="space-y-2 text-sm text-blue-800">
              <li>Hold the Arduino the same way you did during training.</li>
              <li>Use consistent speed and range for each gesture.</li>
              <li>Green confidence bar usually means cleaner class separation.</li>
              {useArduinoInference && (
                <li className="font-medium text-emerald-700">Model runs ON the Arduino.</li>
              )}
              <li>High-confidence count: {highConfidenceCount}/10</li>
            </ul>
          </div>

          {/* Distribution (advanced/teacher view) */}
          <div className="card h-full">
            <button
              onClick={() => setShowDistribution((open) => !open)}
              className="w-full flex items-center justify-between text-left"
            >
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <span className="text-xl">📈</span> Advanced Distribution
              </h3>
              <span className="text-sm font-medium text-slate-500">
                {showDistribution ? 'Hide' : 'Show'}
              </span>
            </button>

            {showDistribution && (
              predictionHistory.length > 0 ? (
                <div className="space-y-4 mt-4">
                  {labels.map((label, idx) => {
                    const count = predictionCounts[idx];
                    const total = predictionHistory.length;
                    const percentage = total > 0 ? (count / total) * 100 : 0;

                    return (
                      <div key={label.id}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-bold text-slate-700">{label.name}</span>
                          <span className="text-slate-500 text-xs">
                            {count} ({percentage.toFixed(1)}%)
                          </span>
                        </div>
                        <div className="bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-primary-500 h-full transition-all duration-500"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  <div className="pt-4 mt-4 border-t border-slate-100 text-center text-xs text-slate-400">
                    Based on last {predictionHistory.length} predictions.
                  </div>
                </div>
              ) : (
                <div className="text-center text-slate-400 py-8 text-sm">
                  No predictions yet.
                  <br />
                  Start testing to populate this view.
                </div>
              )
            )}
          </div>

          {/* Start Over Button */}
          {!isRunning && (
            <div className="space-y-2">
              {onOpenPortfolio && (
                <button
                  onClick={onOpenPortfolio}
                  className="w-full bg-primary-50 hover:bg-primary-100 text-primary-700 font-bold py-3 px-6 rounded-xl transition-colors border border-primary-200"
                >
                  {challengeComplete ? 'Open Portfolio' : 'Skip to Portfolio'}
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
