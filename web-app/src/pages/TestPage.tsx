/**
 * Test Page - Live Inference + Objective Model Testing
 *
 * Live Challenge:
 * - Student-facing, immediate feedback while moving the board.
 *
 * Model Testing:
 * - Edge-Impulse-style "classify all test samples" with confusion matrix
 *   and per-class metrics.
 */

import { useEffect, useMemo, useState } from 'react';
import type { GestureLabel, Sample } from '../types';
import { TrainingService } from '../services/trainingService';
import type { InferenceResult } from '../types/ble';
import { getBLEService } from '../services/bleService';
import { EdgeAIFactsPanel } from '../components/EdgeAIFactsPanel';
import { useSessionStore } from '../state/sessionStore';
import {
  createRecommendedTestSplit,
  evaluateModelOnSamples,
  splitSamplesByDataset,
  type ModelTestingReport,
} from '../services/modelTestingService';

const CHALLENGE_MIN_ATTEMPTS = 10;
const CHALLENGE_TARGET_SUCCESS_RATE = 0.8;
const CHALLENGE_MIN_CONFIDENCE = 0.7;
const CHALLENGE_REQUIRED_SUCCESSES = Math.ceil(
  CHALLENGE_MIN_ATTEMPTS * CHALLENGE_TARGET_SUCCESS_RATE,
);

type TestingMode = 'live' | 'model-testing';

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

function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

function buildCountsByLabel(
  samples: Sample[],
  labels: GestureLabel[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const label of labels) {
    counts.set(label.id, 0);
  }
  for (const sample of samples) {
    counts.set(sample.label, (counts.get(sample.label) ?? 0) + 1);
  }
  return counts;
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
  const [mode, setMode] = useState<TestingMode>('live');

  // Live Challenge state
  const [isRunning, setIsRunning] = useState(false);
  const [currentPrediction, setCurrentPrediction] = useState<number | null>(null);
  const [confidence, setConfidence] = useState(0);
  const [predictionHistory, setPredictionHistory] = useState<number[]>([]);
  const [useArduinoInference, setUseArduinoInference] = useState(true);
  const [highConfidenceCount, setHighConfidenceCount] = useState(0);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [showDistribution, setShowDistribution] = useState(false);
  const [targetGestureIndex, setTargetGestureIndex] = useState(0);
  const [challengeNote, setChallengeNote] = useState<string | null>(null);
  const [challengeStats, setChallengeStats] = useState<Record<string, ChallengeStats>>(
    () => createInitialChallengeStats(labels),
  );

  // Model Testing state
  const [isApplyingSplit, setIsApplyingSplit] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [testingError, setTestingError] = useState<string | null>(null);
  const [testingInfo, setTestingInfo] = useState<string | null>(null);
  const [report, setReport] = useState<ModelTestingReport | null>(null);

  const sessionSamples = useSessionStore((state) => state.samples);
  const setSessionSamples = useSessionStore((state) => state.setSamples);
  const addBadge = useSessionStore((state) => state.addBadge);

  const { trainingSamples, testingSamples } = useMemo(
    () => splitSamplesByDataset(sessionSamples),
    [sessionSamples],
  );
  const trainingCountsByLabel = useMemo(
    () => buildCountsByLabel(trainingSamples, labels),
    [labels, trainingSamples],
  );
  const testingCountsByLabel = useMemo(
    () => buildCountsByLabel(testingSamples, labels),
    [labels, testingSamples],
  );

  useEffect(() => {
    return () => {
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

  useEffect(() => {
    setReport(null);
  }, [sessionSamples, labels]);

  useEffect(() => {
    if (mode !== 'model-testing' || !isRunning) {
      return;
    }

    const ble = getBLEService();
    void Promise.allSettled([ble.stopInference(), ble.stopSensorStream()]);
    setIsRunning(false);
  }, [isRunning, mode]);

  const startTesting = async () => {
    const ble = getBLEService();
    setLiveError(null);
    setChallengeNote(null);
    setCurrentPrediction(null);
    setConfidence(0);
    setIsRunning(true);

    try {
      if (useArduinoInference) {
        await ble.startInference((result: InferenceResult) => {
          setCurrentPrediction(result.prediction);
          setConfidence(result.confidence / 100);
          if (result.confidence >= 80) {
            setHighConfidenceCount((prev) => {
              const next = prev + 1;
              if (next === 10) {
                addBadge('sharp-shooter');
              }
              return next;
            });
          }
          setPredictionHistory((prev) => [...prev.slice(-99), result.prediction]);
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
            const result = trainingService.predict(
              sampleBuffer.slice(-MODEL_CONFIG.WINDOW_SIZE),
            );
            setCurrentPrediction(result.prediction);
            setConfidence(result.confidence);
            setPredictionHistory((prev) => [...prev.slice(-99), result.prediction]);
            sampleBuffer.splice(0, sampleBuffer.length - MODEL_CONFIG.WINDOW_STRIDE);
          }
        });
      }
    } catch (err) {
      setIsRunning(false);
      console.error('Start testing failed:', err);
      setLiveError(
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
      setLiveError(
        err instanceof Error ? err.message : 'Failed to stop testing cleanly.',
      );
    } finally {
      setIsRunning(false);
    }
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
        `Nice! "${target.name}" detected at ${formatPercent(confidence, 0)} confidence.`,
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
      `Close. Correct gesture, but confidence ${formatPercent(confidence, 0)} is below ${formatPercent(CHALLENGE_MIN_CONFIDENCE, 0)}.`,
    );
  };

  const resetChallenge = () => {
    setChallengeStats(createInitialChallengeStats(labels));
    setChallengeNote(null);
  };

  const predictionCounts = useMemo(() => {
    const counts = new Array(labels.length).fill(0);
    for (const pred of predictionHistory) {
      if (pred >= 0 && pred < counts.length) {
        counts[pred] += 1;
      }
    }
    return counts;
  }, [labels.length, predictionHistory]);

  const challengeRows = useMemo(() => {
    return labels.map((label, idx) => {
      const stats = challengeStats[label.id] ?? { attempts: 0, successes: 0 };
      return {
        label,
        index: idx,
        attempts: stats.attempts,
        successes: stats.successes,
        successRate: getSuccessRate(stats),
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

  const applyRecommendedSplit = async () => {
    setTestingError(null);
    setTestingInfo(null);
    setIsApplyingSplit(true);
    try {
      const updated = createRecommendedTestSplit(sessionSamples, labels, 0.2);
      await setSessionSamples(updated);
      const { testingSamples: nextTesting } = splitSamplesByDataset(updated);
      setTestingInfo(
        `Created recommended split with ${nextTesting.length} held-out test samples. Retrain before trusting the score.`,
      );
    } catch (err) {
      console.error('Failed to apply split:', err);
      setTestingError(
        err instanceof Error ? err.message : 'Failed to create test split.',
      );
    } finally {
      setIsApplyingSplit(false);
    }
  };

  const evaluateAllTestSamples = () => {
    setTestingError(null);
    setTestingInfo(null);
    if (testingSamples.length === 0) {
      setTestingError(
        'No test samples found. Create a test split first, then run model testing.',
      );
      return;
    }

    setIsEvaluating(true);
    try {
      const nextReport = evaluateModelOnSamples(
        testingSamples,
        labels,
        (sampleData) => trainingService.predict(sampleData),
      );
      setReport(nextReport);
      setTestingInfo(
        `Classified ${nextReport.totalSamples} test samples. Accuracy: ${formatPercent(nextReport.accuracy)}.`,
      );
    } catch (err) {
      console.error('Model testing failed:', err);
      setTestingError(
        err instanceof Error ? err.message : 'Failed to classify test samples.',
      );
      setReport(null);
    } finally {
      setIsEvaluating(false);
    }
  };

  const moveSampleToTraining = async (sampleId: string) => {
    setTestingError(null);
    setTestingInfo(null);
    try {
      const updated = sessionSamples.map((sample) =>
        sample.id === sampleId ? { ...sample, split: 'train' as const } : sample,
      );
      await setSessionSamples(updated);
      setTestingInfo('Moved sample back to training set.');
    } catch (err) {
      console.error('Failed to move sample:', err);
      setTestingError(
        err instanceof Error ? err.message : 'Failed to move sample.',
      );
    }
  };

  const moveFailedSamplesToTraining = async () => {
    if (!report) return;

    const failedIds = new Set(
      report.sampleResults.filter((result) => !result.correct).map((result) => result.sampleId),
    );
    if (failedIds.size === 0) {
      setTestingInfo('No failed samples to move.');
      return;
    }

    setTestingError(null);
    setTestingInfo(null);
    try {
      const updated = sessionSamples.map((sample) =>
        failedIds.has(sample.id) ? { ...sample, split: 'train' as const } : sample,
      );
      await setSessionSamples(updated);
      setTestingInfo(`Moved ${failedIds.size} failed samples back to training set.`);
    } catch (err) {
      console.error('Failed to move failed samples:', err);
      setTestingError(
        err instanceof Error ? err.message : 'Failed to move failed samples.',
      );
    }
  };

  const renderLiveChallenge = () => {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card bg-gradient-to-br from-white to-slate-50">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="heading-md mb-2">🧪 Live Challenge</h1>
                <p className="text-slate-600">
                  {useArduinoInference
                    ? 'AI runs on Arduino. Perform gestures and score challenge attempts.'
                    : 'Perform gestures and watch the AI recognize them.'}
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

            <div className="bg-slate-900 rounded-2xl p-8 text-center relative overflow-hidden min-h-[300px] flex flex-col items-center justify-center">
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
                        {formatPercent(confidence)} Confident
                      </span>
                    </div>

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

        <div className="space-y-6">
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
                {formatPercent(CHALLENGE_TARGET_SUCCESS_RATE, 0)} success target
              </span>
              <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
                {formatPercent(CHALLENGE_MIN_CONFIDENCE, 0)}+ confidence required
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
    );
  };

  const renderModelTesting = () => {
    return (
      <div className="space-y-6">
        <div className="card bg-gradient-to-br from-white to-slate-50">
          <h2 className="heading-md mb-2">📊 Model Testing</h2>
          <p className="text-slate-600">
            Objective evaluation on held-out samples. This is where you verify if your
            model really generalizes.
          </p>
        </div>

        <div className="card">
          <h3 className="font-bold text-slate-800 mb-3">Dataset Split</h3>
          <p className="text-sm text-slate-600 mb-4">
            Training uses <code>train</code> samples. Model testing classifies only
            <code> test</code> samples.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">Train samples</div>
              <div className="text-2xl font-bold text-slate-800">{trainingSamples.length}</div>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <div className="text-xs uppercase tracking-wide text-amber-700">Test samples</div>
              <div className="text-2xl font-bold text-amber-800">{testingSamples.length}</div>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
              <div className="text-xs uppercase tracking-wide text-blue-700">Gestures</div>
              <div className="text-2xl font-bold text-blue-800">{labels.length}</div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-4">Gesture</th>
                  <th className="py-2 pr-4">Train</th>
                  <th className="py-2 pr-4">Test</th>
                </tr>
              </thead>
              <tbody>
                {labels.map((label) => (
                  <tr key={label.id} className="border-b border-slate-100 text-slate-700">
                    <td className="py-2 pr-4 font-medium">{label.name}</td>
                    <td className="py-2 pr-4">{trainingCountsByLabel.get(label.id) ?? 0}</td>
                    <td className="py-2 pr-4">{testingCountsByLabel.get(label.id) ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={applyRecommendedSplit}
              disabled={isApplyingSplit}
              className="btn-secondary bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300"
            >
              {isApplyingSplit ? 'Applying...' : 'Create Recommended Test Split (20%)'}
            </button>
            <button
              onClick={evaluateAllTestSamples}
              disabled={isEvaluating || testingSamples.length === 0}
              className="btn-primary disabled:opacity-50"
            >
              {isEvaluating ? 'Classifying...' : 'Classify All Test Samples'}
            </button>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            After changing the split, retrain the model before trusting this score.
          </p>

          {testingError && (
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {testingError}
            </div>
          )}
          {testingInfo && (
            <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
              {testingInfo}
            </div>
          )}
        </div>

        {report && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="text-xs uppercase tracking-wide text-emerald-700">Accuracy</div>
                <div className="text-3xl font-bold text-emerald-800">
                  {formatPercent(report.accuracy)}
                </div>
              </div>
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                <div className="text-xs uppercase tracking-wide text-blue-700">Macro F1</div>
                <div className="text-3xl font-bold text-blue-800">
                  {formatPercent(report.macroF1)}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">Samples</div>
                <div className="text-3xl font-bold text-slate-700">
                  {report.correctSamples}/{report.totalSamples}
                </div>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <div className="text-xs uppercase tracking-wide text-amber-700">Mean confidence</div>
                <div className="text-3xl font-bold text-amber-800">
                  {formatPercent(report.meanConfidence)}
                </div>
              </div>
            </div>

            <div className="card">
              <h3 className="font-bold text-slate-800 mb-3">Confusion Matrix</h3>
              <p className="text-sm text-slate-500 mb-4">
                Rows are expected labels. Columns are predicted labels.
              </p>
              <div className="overflow-x-auto">
                <table className="min-w-full border border-slate-200 text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600">
                      <th className="p-2 border border-slate-200 text-left">Expected ↓ / Predicted →</th>
                      {labels.map((label) => (
                        <th key={label.id} className="p-2 border border-slate-200">
                          {label.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {labels.map((label, rowIdx) => (
                      <tr key={label.id}>
                        <td className="p-2 border border-slate-200 font-medium text-slate-700 bg-slate-50">
                          {label.name}
                        </td>
                        {labels.map((predicted, colIdx) => {
                          const value = report.confusionMatrix[rowIdx][colIdx];
                          const isDiagonal = rowIdx === colIdx;
                          return (
                            <td
                              key={predicted.id}
                              className={`p-2 border border-slate-200 text-center font-semibold ${
                                isDiagonal ? 'text-emerald-700' : 'text-slate-700'
                              }`}
                            >
                              {value}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <h3 className="font-bold text-slate-800 mb-3">Per-Class Metrics</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-200">
                      <th className="py-2 pr-4">Class</th>
                      <th className="py-2 pr-4">Support</th>
                      <th className="py-2 pr-4">Precision</th>
                      <th className="py-2 pr-4">Recall</th>
                      <th className="py-2 pr-4">F1</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.labelMetrics.map((metric) => (
                      <tr key={metric.labelId} className="border-b border-slate-100">
                        <td className="py-2 pr-4 font-medium text-slate-700">{metric.labelName}</td>
                        <td className="py-2 pr-4 text-slate-600">{metric.support}</td>
                        <td className="py-2 pr-4 text-slate-600">{formatPercent(metric.precision)}</td>
                        <td className="py-2 pr-4 text-slate-600">{formatPercent(metric.recall)}</td>
                        <td className="py-2 pr-4 text-slate-600">{formatPercent(metric.f1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h3 className="font-bold text-slate-800">Per-Sample Results</h3>
                <button
                  onClick={moveFailedSamplesToTraining}
                  className="btn-secondary bg-amber-100 hover:bg-amber-200 border-amber-300 text-amber-900"
                >
                  Move Failed Samples to Training
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-200">
                      <th className="py-2 pr-4">Sample</th>
                      <th className="py-2 pr-4">Expected</th>
                      <th className="py-2 pr-4">Predicted</th>
                      <th className="py-2 pr-4">Confidence</th>
                      <th className="py-2 pr-4">Result</th>
                      <th className="py-2 pr-4">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.sampleResults.map((result) => (
                      <tr key={result.sampleId} className="border-b border-slate-100">
                        <td className="py-2 pr-4 text-slate-500 font-mono">{result.sampleId.slice(0, 8)}</td>
                        <td className="py-2 pr-4 text-slate-700">{result.expectedLabelName}</td>
                        <td className="py-2 pr-4 text-slate-700">{result.predictedLabelName}</td>
                        <td className="py-2 pr-4 text-slate-600">{formatPercent(result.confidence)}</td>
                        <td className="py-2 pr-4">
                          <span
                            className={`inline-flex rounded-full px-2 py-1 text-xs font-bold ${
                              result.correct
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-rose-100 text-rose-700'
                            }`}
                          >
                            {result.correct ? 'Correct' : 'Incorrect'}
                          </span>
                        </td>
                        <td className="py-2 pr-4">
                          <button
                            onClick={() => {
                              void moveSampleToTraining(result.sampleId);
                            }}
                            className="text-xs font-semibold text-primary-700 hover:text-primary-800"
                          >
                            Move to train
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-6">
      <div className="card bg-white border border-slate-200">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setMode('live')}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
              mode === 'live'
                ? 'bg-primary-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Live Challenge
          </button>
          <button
            onClick={() => setMode('model-testing')}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
              mode === 'model-testing'
                ? 'bg-primary-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Model Testing
          </button>
        </div>
      </div>

      {mode === 'live' ? renderLiveChallenge() : renderModelTesting()}
    </div>
  );
}
