/**
 * Test Page - Live Inference + Objective Model Testing + Competitive Arena
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GestureLabel, Sample } from '../types';
import { TrainingService } from '../services/trainingService';
import type { InferenceResult } from '../types/ble';
import { getBLEService } from '../services/bleService';
import { EdgeAIFactsPanel } from '../components/EdgeAIFactsPanel';
import { useSessionStore } from '../state/sessionStore';
import {
  createRecommendedTestSplit,
  evaluateModelOnSamples,
  getHoldoutCoverageWarnings,
  MIN_TEST_SAMPLES_PER_CLASS,
  splitSamplesByDataset,
  type ModelTestingReport,
} from '../services/modelTestingService';
import {
  buildArenaBenchmarks,
  createArenaSubmission,
  evaluateArenaBenchmarks,
  mergeArenaSubmissions,
  parseArenaSubmissions,
  rankArenaSubmissions,
  type ArenaSubmission,
  type ArenaRunResult,
} from '../services/modelArenaService';
import {
  evaluateCaptureWindow,
  type InferenceFrame,
} from '../services/captureEvaluationService';
import {
  applyMotionHeuristic,
  normalizeConfidence,
} from '../services/inferenceUtils';

const CHALLENGE_MIN_ATTEMPTS = 10;
const CHALLENGE_TARGET_SUCCESS_RATE = 0.8;
const CHALLENGE_MIN_CONFIDENCE = 0.7;
const CHALLENGE_REQUIRED_SUCCESSES = Math.ceil(
  CHALLENGE_MIN_ATTEMPTS * CHALLENGE_TARGET_SUCCESS_RATE,
);
const LIVE_IDLE_CONFIDENCE_THRESHOLD = 0.55;
const ARENA_LEADERBOARD_STORAGE_KEY = 'severn-edge-ai-arena-v1';
const ARENA_MAX_LEADERBOARD_ROWS = 200;
const LIVE_SESSION_MAX_MS = 2 * 60 * 1000;
// Timed cue before scoring so students can get into position.
const TIMED_CAPTURE_PREP_MS = 1200;
// Fixed capture duration that balances gesture completion and attention span.
const TIMED_CAPTURE_WINDOW_MS = 2000;
// Minimum frames needed for stable vote/support statistics at classroom sample rates.
const TIMED_CAPTURE_MIN_FRAMES = 8;
// Required class support ratio to count a capture as consistent.
const TIMED_CAPTURE_SUPPORT_THRESHOLD = 0.6;
const TIMED_CAPTURE_IDLE_RATIO_FAILURE_THRESHOLD = 0.7;
// Keep enough recent inference history to score delayed timed windows robustly.
const INFERENCE_FRAME_BUFFER_MS = 20000;

type TestingMode = 'live' | 'model-testing' | 'arena';

interface ChallengeStats {
  attempts: number;
  successes: number;
}

interface TestingLockState {
  canEvaluate: boolean;
  message: string;
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

function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
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
  onRecordTestData?: () => void;
}

export function TestPage({
  labels,
  trainingService,
  onStartOver,
  onOpenPortfolio,
  onRecordTestData,
}: TestPageProps) {
  const [mode, setMode] = useState<TestingMode>('live');

  // Live Challenge state
  const [isRunning, setIsRunning] = useState(false);
  const [currentPrediction, setCurrentPrediction] = useState<number | null>(null);
  const [confidence, setConfidence] = useState(0);
  const [sessionMsRemaining, setSessionMsRemaining] = useState(LIVE_SESSION_MAX_MS);
  const [useArduinoInference, setUseArduinoInference] = useState(true);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [targetGestureIndex, setTargetGestureIndex] = useState(0);
  const [challengeNote, setChallengeNote] = useState<string | null>(null);
  const [capturePhase, setCapturePhase] = useState<'idle' | 'prep' | 'capturing'>('idle');
  const [captureMsRemaining, setCaptureMsRemaining] = useState(0);
  const [challengeStats, setChallengeStats] = useState<Record<string, ChallengeStats>>(
    () => createInitialChallengeStats(labels),
  );

  // Model Testing state
  const [isApplyingSplit, setIsApplyingSplit] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [testingError, setTestingError] = useState<string | null>(null);
  const [testingInfo, setTestingInfo] = useState<string | null>(null);
  const [report, setReport] = useState<ModelTestingReport | null>(null);

  // Arena state
  const [isRunningArena, setIsRunningArena] = useState(false);
  const [arenaError, setArenaError] = useState<string | null>(null);
  const [arenaInfo, setArenaInfo] = useState<string | null>(null);
  const [arenaResult, setArenaResult] = useState<ArenaRunResult | null>(null);
  const [arenaSubmissions, setArenaSubmissions] = useState<ArenaSubmission[]>([]);
  const arenaImportRef = useRef<HTMLInputElement | null>(null);
  const highConfidenceCountRef = useRef(0);
  const captureRunIdRef = useRef(0);
  const capturePhaseStartedAtRef = useRef<number | null>(null);
  const captureTargetIndexRef = useRef<number | null>(null);
  const captureWindowStartRef = useRef<number | null>(null);
  const capturePrepTimerRef = useRef<number | null>(null);
  const captureScoreTimerRef = useRef<number | null>(null);
  const liveSessionStopTimerRef = useRef<number | null>(null);
  const liveSessionStartedAtRef = useRef<number | null>(null);
  const inferenceFramesRef = useRef<InferenceFrame[]>([]);

  const session = useSessionStore((state) => state.session);
  const sessionSamples = useSessionStore((state) => state.samples);
  const setSessionSamples = useSessionStore((state) => state.setSamples);
  const addBadge = useSessionStore((state) => state.addBadge);

  const { trainingSamples, testingSamples } = useMemo(
    () => splitSamplesByDataset(sessionSamples),
    [sessionSamples],
  );
  const lockedTestingSnapshot = useMemo(() => {
    const sampleById = new Map(sessionSamples.map((sample) => [sample.id, sample]));
    const lockedSamples: Sample[] = [];
    const missingIds: string[] = [];

    for (const sampleId of session?.lockedTestSampleIds ?? []) {
      const sample = sampleById.get(sampleId);
      if (sample) {
        lockedSamples.push(sample);
      } else {
        missingIds.push(sampleId);
      }
    }

    return {
      lockedSamples,
      missingIds,
    };
  }, [session?.lockedTestSampleIds, sessionSamples]);
  const testingLock = useMemo<TestingLockState>(() => {
    if (!session) {
      return {
        canEvaluate: false,
        message: 'Session not ready. Reconnect and retrain before model testing.',
      };
    }

    if (session.lastTrainedDataRevision === null) {
      return {
        canEvaluate: false,
        message:
          'No locked test set for this model version. Collect held-out test samples, then retrain.',
      };
    }

    if (session.lastTrainedDataRevision !== session.dataRevision) {
      return {
        canEvaluate: false,
        message:
          'Data changed after training. Retrain now so Model Testing and Arena use the latest model/data pair.',
      };
    }

    if (lockedTestingSnapshot.missingIds.length > 0) {
      return {
        canEvaluate: false,
        message:
          'Locked test samples are missing from this session. Retrain to rebuild a valid locked test set.',
      };
    }

    if (lockedTestingSnapshot.lockedSamples.length === 0) {
      return {
        canEvaluate: false,
        message:
          'Locked test set is empty. Collect test samples and retrain before running objective testing.',
      };
    }

    return {
      canEvaluate: true,
      message: `Locked test set ready (${lockedTestingSnapshot.lockedSamples.length} samples).`,
    };
  }, [lockedTestingSnapshot.lockedSamples.length, lockedTestingSnapshot.missingIds.length, session]);
  const objectiveTestingSamples = useMemo(
    () => (testingLock.canEvaluate ? lockedTestingSnapshot.lockedSamples : []),
    [lockedTestingSnapshot.lockedSamples, testingLock.canEvaluate],
  );
  const holdoutCoverageWarnings = useMemo(() => {
    const sourceSamples = testingLock.canEvaluate
      ? lockedTestingSnapshot.lockedSamples
      : testingSamples;
    if (sourceSamples.length === 0) {
      return [];
    }
    return getHoldoutCoverageWarnings(sourceSamples, labels, MIN_TEST_SAMPLES_PER_CLASS);
  }, [labels, lockedTestingSnapshot.lockedSamples, testingLock.canEvaluate, testingSamples]);
  const trainingCountsByLabel = useMemo(
    () => buildCountsByLabel(trainingSamples, labels),
    [labels, trainingSamples],
  );
  const testingCountsByLabel = useMemo(
    () => buildCountsByLabel(testingSamples, labels),
    [labels, testingSamples],
  );
  const lockedTestingCountsByLabel = useMemo(
    () => buildCountsByLabel(lockedTestingSnapshot.lockedSamples, labels),
    [labels, lockedTestingSnapshot.lockedSamples],
  );

  const arenaBenchmarks = useMemo(
    () => buildArenaBenchmarks(labels, trainingSamples, objectiveTestingSamples),
    [labels, objectiveTestingSamples, trainingSamples],
  );
  const arenaBenchmarkSummary = useMemo(() => {
    const summary = {
      holdout: 0,
      generic: 0,
      total: arenaBenchmarks.length,
    };
    for (const benchmark of arenaBenchmarks) {
      if (benchmark.track === 'holdout') {
        summary.holdout += 1;
      } else {
        summary.generic += 1;
      }
    }
    return summary;
  }, [arenaBenchmarks]);
  const rankedArenaSubmissions = useMemo(
    () => rankArenaSubmissions(arenaSubmissions),
    [arenaSubmissions],
  );

  const clearLiveSessionTimers = useCallback((resetRemaining = true) => {
    if (liveSessionStopTimerRef.current !== null) {
      window.clearTimeout(liveSessionStopTimerRef.current);
      liveSessionStopTimerRef.current = null;
    }
    liveSessionStartedAtRef.current = null;
    if (resetRemaining) {
      setSessionMsRemaining(LIVE_SESSION_MAX_MS);
    }
  }, []);

  const clearTimedCaptureTimers = useCallback(() => {
    if (capturePrepTimerRef.current !== null) {
      window.clearTimeout(capturePrepTimerRef.current);
      capturePrepTimerRef.current = null;
    }
    if (captureScoreTimerRef.current !== null) {
      window.clearTimeout(captureScoreTimerRef.current);
      captureScoreTimerRef.current = null;
    }
  }, []);

  const clearTimedCapture = useCallback((invalidateRun = true) => {
    clearTimedCaptureTimers();
    if (invalidateRun) {
      captureRunIdRef.current += 1;
    }
    capturePhaseStartedAtRef.current = null;
    captureTargetIndexRef.current = null;
    captureWindowStartRef.current = null;
    setCapturePhase('idle');
    setCaptureMsRemaining(0);
  }, [clearTimedCaptureTimers]);

  useEffect(() => {
    return () => {
      clearLiveSessionTimers(false);
      clearTimedCaptureTimers();
      const ble = getBLEService();
      void Promise.allSettled([ble.stopInference(), ble.stopSensorStream()]);
    };
  }, [clearLiveSessionTimers, clearTimedCaptureTimers]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ARENA_LEADERBOARD_STORAGE_KEY);
      if (!raw) return;
      const parsed = parseArenaSubmissions(JSON.parse(raw));
      setArenaSubmissions(rankArenaSubmissions(parsed).slice(0, ARENA_MAX_LEADERBOARD_ROWS));
    } catch (err) {
      console.error('Failed to load arena leaderboard:', err);
    }
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
    setArenaResult(null);
  }, [labels, sessionSamples]);

  useEffect(() => {
    if (mode === 'live' || !isRunning) {
      return;
    }

    const ble = getBLEService();
    void Promise.allSettled([ble.stopInference(), ble.stopSensorStream()]);
    setIsRunning(false);
    clearLiveSessionTimers();
    clearTimedCapture();
  }, [clearLiveSessionTimers, clearTimedCapture, isRunning, mode]);

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
    return () => {
      window.clearInterval(timer);
    };
  }, [isRunning]);

  useEffect(() => {
    if (capturePhase === 'idle') {
      setCaptureMsRemaining(0);
      return;
    }

    const totalMs =
      capturePhase === 'prep' ? TIMED_CAPTURE_PREP_MS : TIMED_CAPTURE_WINDOW_MS;

    const tick = () => {
      if (capturePhaseStartedAtRef.current === null) return;
      const elapsed = Date.now() - capturePhaseStartedAtRef.current;
      setCaptureMsRemaining(Math.max(0, totalMs - elapsed));
    };

    tick();
    const timer = window.setInterval(() => {
      tick();
    }, 100);

    return () => {
      window.clearInterval(timer);
    };
  }, [capturePhase]);

  const persistArenaSubmissions = (next: ArenaSubmission[]) => {
    const trimmed = rankArenaSubmissions(next).slice(0, ARENA_MAX_LEADERBOARD_ROWS);
    setArenaSubmissions(trimmed);
    try {
      localStorage.setItem(ARENA_LEADERBOARD_STORAGE_KEY, JSON.stringify(trimmed));
    } catch (err) {
      console.error('Failed to persist arena leaderboard:', err);
    }
  };

  const appendInferenceFrame = (prediction: number, confidenceValue: number) => {
    const frame: InferenceFrame = {
      timestamp: Date.now(),
      prediction,
      confidence: Math.max(0, Math.min(1, confidenceValue)),
    };
    const frames = inferenceFramesRef.current;
    frames.push(frame);
    while (
      frames.length > 0
      && frame.timestamp - frames[0].timestamp > INFERENCE_FRAME_BUFFER_MS
    ) {
      frames.shift();
    }
  };

  const stopTestingInternal = useCallback(
    async (reason?: string) => {
      const ble = getBLEService();
      try {
        await Promise.allSettled([ble.stopInference(), ble.stopSensorStream()]);
      } catch (err) {
        console.error('Stop testing failed:', err);
        setLiveError(
          err instanceof Error ? err.message : 'Failed to stop testing cleanly.',
        );
      } finally {
        setIsRunning(false);
        clearLiveSessionTimers();
        clearTimedCapture();
        if (reason) {
          setChallengeNote(reason);
        }
      }
    },
    [clearLiveSessionTimers, clearTimedCapture],
  );

  const startTesting = async () => {
    const ble = getBLEService();
    setLiveError(null);
    setChallengeNote(null);
    setCurrentPrediction(null);
    setConfidence(0);
    clearLiveSessionTimers();
    clearTimedCapture();
    inferenceFramesRef.current = [];
    highConfidenceCountRef.current = 0;
    liveSessionStartedAtRef.current = Date.now();
    setSessionMsRemaining(LIVE_SESSION_MAX_MS);
    liveSessionStopTimerRef.current = window.setTimeout(() => {
      void stopTestingInternal(
        'Live testing session ended after 2 minutes. Start Testing to run another round.',
      );
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
          const normalizedConfidence = normalizeConfidence(result.confidence, 'arduino');
          setConfidence(normalizedConfidence);
          appendInferenceFrame(result.prediction, normalizedConfidence);
          if (result.confidence >= 80) {
            highConfidenceCountRef.current += 1;
            if (highConfidenceCountRef.current === 10) {
              addBadge('sharp-shooter');
            }
          }
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

            const heuristicallyAdjusted = idleClassIndex >= 0
              ? applyMotionHeuristic(
                sampleBuffer.slice(-MODEL_CONFIG.WINDOW_SIZE),
                rawResult,
                idleClassIndex,
              )
              : rawResult;

            const normalizedConfidence = normalizeConfidence(
              heuristicallyAdjusted.confidence,
              'browser',
            );
            setCurrentPrediction(heuristicallyAdjusted.prediction);
            setConfidence(normalizedConfidence);
            appendInferenceFrame(heuristicallyAdjusted.prediction, normalizedConfidence);
            sampleBuffer.splice(0, sampleBuffer.length - MODEL_CONFIG.WINDOW_STRIDE);
          }
        });
      }
    } catch (err) {
      setIsRunning(false);
      clearLiveSessionTimers();
      clearTimedCapture();
      console.error('Start testing failed:', err);
      setLiveError(
        err instanceof Error
          ? err.message
          : 'Failed to start testing. Reconnect and try again.',
      );
    }
  };

  const stopTesting = () => {
    void stopTestingInternal();
  };

  const scoreTimedCaptureWindow = (
    startedAt: number,
    endedAt: number,
    targetIndex: number,
  ) => {
    const evaluation = evaluateCaptureWindow(
      inferenceFramesRef.current,
      labels,
      targetIndex,
      startedAt,
      endedAt,
      {
        minFrames: TIMED_CAPTURE_MIN_FRAMES,
        idleConfidenceThreshold: LIVE_IDLE_CONFIDENCE_THRESHOLD,
        supportThreshold: TIMED_CAPTURE_SUPPORT_THRESHOLD,
        minConfidence: CHALLENGE_MIN_CONFIDENCE,
        idleRatioFailureThreshold: TIMED_CAPTURE_IDLE_RATIO_FAILURE_THRESHOLD,
      },
    );

    const targetLabelId = evaluation.targetLabelId;
    if (evaluation.countAttempt && targetLabelId) {
      setChallengeStats((prev) => {
        const existing = prev[targetLabelId] ?? { attempts: 0, successes: 0 };
        return {
          ...prev,
          [targetLabelId]: {
            attempts: existing.attempts + 1,
            successes: existing.successes + (evaluation.isSuccess ? 1 : 0),
          },
        };
      });
    }

    if (evaluation.note) {
      setChallengeNote(evaluation.note);
    } else {
      setChallengeNote(null);
    }
  };

  const startTimedCapture = () => {
    const target = labels[targetGestureIndex];
    if (!target) return;

    if (!isRunning) {
      setChallengeNote('Press Start Testing first, then run a timed capture.');
      return;
    }

    if (capturePhase !== 'idle') {
      return;
    }

    const runId = captureRunIdRef.current + 1;
    captureRunIdRef.current = runId;
    captureTargetIndexRef.current = targetGestureIndex;
    captureWindowStartRef.current = null;
    capturePhaseStartedAtRef.current = Date.now();
    setCapturePhase('prep');
    setCaptureMsRemaining(TIMED_CAPTURE_PREP_MS);
    setChallengeNote(`Get ready for "${target.name}"...`);

    clearTimedCaptureTimers();
    capturePrepTimerRef.current = window.setTimeout(() => {
      if (captureRunIdRef.current !== runId) return;

      capturePhaseStartedAtRef.current = Date.now();
      captureWindowStartRef.current = capturePhaseStartedAtRef.current;
      setCapturePhase('capturing');
      setCaptureMsRemaining(TIMED_CAPTURE_WINDOW_MS);
      setChallengeNote(`Perform "${target.name}" now!`);

      captureScoreTimerRef.current = window.setTimeout(() => {
        if (captureRunIdRef.current !== runId) return;

        const windowStart = captureWindowStartRef.current;
        const lockedTargetIndex = captureTargetIndexRef.current ?? targetGestureIndex;
        clearTimedCapture(false);
        if (windowStart === null) return;
        scoreTimedCaptureWindow(windowStart, Date.now(), lockedTargetIndex);
      }, TIMED_CAPTURE_WINDOW_MS);
    }, TIMED_CAPTURE_PREP_MS);
  };

  const cancelTimedCapture = () => {
    if (capturePhase === 'idle') return;
    clearTimedCapture();
    setChallengeNote('Timed capture canceled.');
  };

  const resetChallenge = () => {
    clearTimedCapture();
    setChallengeStats(createInitialChallengeStats(labels));
    setChallengeNote(null);
  };

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

  const livePredictionView = useMemo(() => {
    if (currentPrediction === null) {
      return {
        label: null as string | null,
        isIdle: false,
      };
    }

    if (currentPrediction >= 0 && currentPrediction < labels.length) {
      if (confidence < LIVE_IDLE_CONFIDENCE_THRESHOLD) {
        return {
          label: 'Idle',
          isIdle: true,
        };
      }
      return {
        label: labels[currentPrediction].name,
        isIdle: false,
      };
    }

    // If model has an extra class (commonly Idle), surface it instead of hiding.
    if (currentPrediction === labels.length) {
      return {
        label: 'Idle',
        isIdle: true,
      };
    }

    return {
      label: `Class ${currentPrediction}`,
      isIdle: false,
    };
  }, [confidence, currentPrediction, labels]);

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
    if (!testingLock.canEvaluate) {
      setTestingError(testingLock.message);
      return;
    }
    if (objectiveTestingSamples.length === 0) {
      setTestingError('Locked test set is empty. Collect test samples and retrain.');
      return;
    }

    setIsEvaluating(true);
    try {
      const nextReport = evaluateModelOnSamples(
        objectiveTestingSamples,
        labels,
        (sampleData) => trainingService.predict(sampleData),
      );
      setReport(nextReport);
      setTestingInfo(
        `Classified ${nextReport.totalSamples} locked test samples. Accuracy: ${formatPercent(nextReport.accuracy)}.`,
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

  const runArenaBenchmark = () => {
    setArenaError(null);
    setArenaInfo(null);

    if (!testingLock.canEvaluate) {
      setArenaError(testingLock.message);
      return;
    }

    if (arenaBenchmarks.length === 0) {
      setArenaError(
        'No arena benchmark set available. Collect test data and retrain before running Arena.',
      );
      return;
    }

    setIsRunningArena(true);
    try {
      const result = evaluateArenaBenchmarks(
        arenaBenchmarks,
        labels,
        (sampleData) => trainingService.predict(sampleData),
      );
      setArenaResult(result);
      setArenaInfo(
        `Arena run complete: ${result.correct}/${result.total} correct, score ${formatPercent(result.arenaScore)}.`,
      );
    } catch (err) {
      console.error('Arena benchmark failed:', err);
      setArenaError(
        err instanceof Error ? err.message : 'Failed to run arena benchmark.',
      );
      setArenaResult(null);
    } finally {
      setIsRunningArena(false);
    }
  };

  const submitArenaScore = () => {
    if (!arenaResult) {
      setArenaError('Run arena benchmark first.');
      return;
    }

    const studentName = session?.projectBrief?.studentName?.trim()
      || session?.studentDisplayName?.trim()
      || 'Student';
    const projectName = session?.projectBrief?.name?.trim() || 'Unnamed Project';

    const submission = createArenaSubmission({
      studentName,
      projectName,
      labels,
      result: arenaResult,
    });
    const merged = mergeArenaSubmissions(arenaSubmissions, [submission]);
    persistArenaSubmissions(merged);
    setArenaInfo(
      `Submitted to leaderboard for ${studentName}. Rank updates immediately on this device.`,
    );
  };

  const exportArenaLeaderboard = () => {
    try {
      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        submissions: rankArenaSubmissions(arenaSubmissions),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `severn-edge-ai-arena-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setArenaInfo('Exported leaderboard JSON.');
      setArenaError(null);
    } catch (err) {
      console.error('Export failed:', err);
      setArenaError('Failed to export leaderboard.');
    }
  };

  const triggerArenaImport = () => {
    arenaImportRef.current?.click();
  };

  const importArenaLeaderboard = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = parseArenaSubmissions(JSON.parse(text));
      if (parsed.length === 0) {
        setArenaError('No valid submissions found in selected JSON.');
        setArenaInfo(null);
        return;
      }

      const merged = mergeArenaSubmissions(arenaSubmissions, parsed);
      persistArenaSubmissions(merged);
      setArenaInfo(`Imported ${parsed.length} submissions.`);
      setArenaError(null);
    } catch (err) {
      console.error('Import failed:', err);
      setArenaError('Failed to import leaderboard JSON.');
      setArenaInfo(null);
    } finally {
      event.target.value = '';
    }
  };

  const clearArenaLeaderboard = () => {
    persistArenaSubmissions([]);
    setArenaInfo('Cleared leaderboard on this device.');
    setArenaError(null);
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
                        {formatPercent(confidence)} Confident
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

        <div className="space-y-6">
          <div className="card bg-gradient-to-br from-amber-50 to-white border border-amber-200">
            <h3 className="font-bold text-amber-900 mb-2 flex items-center gap-2">
              <span className="text-xl">🏁</span> Student Challenge
            </h3>
            <p className="text-sm text-amber-800">
              For each gesture, reach at least {CHALLENGE_REQUIRED_SUCCESSES} successful
              attempts out of {CHALLENGE_MIN_ATTEMPTS} timed captures.
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
                Choose gesture to capture now
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
                onClick={startTimedCapture}
                className="w-full rounded-xl bg-primary-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={!activeTarget || !isRunning || capturePhase !== 'idle'}
              >
                {!activeTarget
                  ? 'Choose a Gesture Target'
                  : !isRunning
                  ? 'Start Testing First'
                  : capturePhase === 'prep'
                  ? `Get Ready... ${Math.max(1, Math.ceil(captureMsRemaining / 1000))}s`
                  : capturePhase === 'capturing'
                  ? `Capturing... ${(captureMsRemaining / 1000).toFixed(1)}s`
                  : `Run Timed Capture for "${activeTarget.name}"`}
              </button>
              {capturePhase !== 'idle' && (
                <button
                  onClick={cancelTimedCapture}
                  className="w-full rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-100"
                >
                  Cancel Timed Capture
                </button>
              )}
              <p className="text-xs text-slate-500">
                One tap runs a fixed get-ready + capture sequence, then auto-scores from the
                whole capture window.
              </p>
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
            the locked <code>test</code> set captured at the last training run.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">Train samples</div>
              <div className="text-2xl font-bold text-slate-800">{trainingSamples.length}</div>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <div className="text-xs uppercase tracking-wide text-amber-700">Current test pool</div>
              <div className="text-2xl font-bold text-amber-800">{testingSamples.length}</div>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <div className="text-xs uppercase tracking-wide text-emerald-700">Locked test set</div>
              <div className="text-2xl font-bold text-emerald-800">
                {lockedTestingSnapshot.lockedSamples.length}
              </div>
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
                  <th className="py-2 pr-4">Current Test</th>
                  <th className="py-2 pr-4">Locked Test</th>
                </tr>
              </thead>
              <tbody>
                {labels.map((label) => (
                  <tr key={label.id} className="border-b border-slate-100 text-slate-700">
                    <td className="py-2 pr-4 font-medium">{label.name}</td>
                    <td className="py-2 pr-4">{trainingCountsByLabel.get(label.id) ?? 0}</td>
                    <td className="py-2 pr-4">{testingCountsByLabel.get(label.id) ?? 0}</td>
                    <td className="py-2 pr-4">{lockedTestingCountsByLabel.get(label.id) ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {onRecordTestData && (
              <button
                onClick={onRecordTestData}
                className="btn-secondary bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border-emerald-300"
              >
                Collect Test Data
              </button>
            )}
            <button
              onClick={applyRecommendedSplit}
              disabled={isApplyingSplit}
              className="btn-secondary bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300"
            >
              {isApplyingSplit ? 'Applying...' : 'Create Recommended Test Split (20%)'}
            </button>
            <button
              onClick={evaluateAllTestSamples}
              disabled={isEvaluating || !testingLock.canEvaluate}
              className="btn-primary disabled:opacity-50"
            >
              {isEvaluating ? 'Classifying...' : 'Classify Locked Test Set'}
            </button>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            Any data change invalidates locked results. Retrain to refresh the locked test set.
          </p>

          <div
            className={`mt-3 rounded-xl border p-3 text-sm ${
              testingLock.canEvaluate
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-amber-200 bg-amber-50 text-amber-900'
            }`}
          >
            {testingLock.message}
          </div>

          {holdoutCoverageWarnings.length > 0 && (
            <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">
                Holdout coverage warning ({MIN_TEST_SAMPLES_PER_CLASS}+ per gesture recommended):
              </p>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                {holdoutCoverageWarnings.map((warning) => (
                  <li key={warning.labelId}>{warning.message}</li>
                ))}
              </ul>
            </div>
          )}

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

  const renderArena = () => {
    const waveLabelScore = arenaResult?.labelScores.find((labelScore) =>
      labelScore.labelName.toLowerCase().includes('wave'),
    );

    return (
      <div className="space-y-6">
        <div className="card bg-gradient-to-br from-violet-50 to-white border border-violet-200">
          <h2 className="heading-md mb-2">🏆 Model Arena</h2>
          <p className="text-slate-700">
            Competitive benchmark mode. Everyone is scored using the same hidden holdout
            and generic gesture tests. Higher score means better generalization.
          </p>
        </div>

        <div className="card">
          <h3 className="font-bold text-slate-800 mb-3">Arena Benchmark Pool</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
            <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
              <div className="text-xs uppercase tracking-wide text-violet-700">Total Benchmarks</div>
              <div className="text-2xl font-bold text-violet-800">{arenaBenchmarkSummary.total}</div>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <div className="text-xs uppercase tracking-wide text-emerald-700">Holdout Cases</div>
              <div className="text-2xl font-bold text-emerald-800">{arenaBenchmarkSummary.holdout}</div>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <div className="text-xs uppercase tracking-wide text-amber-700">Generic Cases</div>
              <div className="text-2xl font-bold text-amber-800">{arenaBenchmarkSummary.generic}</div>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
              <div className="text-xs uppercase tracking-wide text-blue-700">Competing Models</div>
              <div className="text-2xl font-bold text-blue-800">{rankedArenaSubmissions.length}</div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-4">Gesture</th>
                  <th className="py-2 pr-4">Train</th>
                  <th className="py-2 pr-4">Locked Test</th>
                  <th className="py-2 pr-4">Generic Benchmarks</th>
                </tr>
              </thead>
              <tbody>
                {labels.map((label) => {
                  const genericCount = arenaBenchmarks.filter(
                    (item) => item.track === 'generic' && item.expectedLabelId === label.id,
                  ).length;
                  return (
                    <tr key={label.id} className="border-b border-slate-100 text-slate-700">
                      <td className="py-2 pr-4 font-medium">{label.name}</td>
                      <td className="py-2 pr-4">{trainingCountsByLabel.get(label.id) ?? 0}</td>
                      <td className="py-2 pr-4">{lockedTestingCountsByLabel.get(label.id) ?? 0}</td>
                      <td className="py-2 pr-4">{genericCount}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {onRecordTestData && (
              <button
                onClick={onRecordTestData}
                className="btn-secondary bg-emerald-100 hover:bg-emerald-200 border-emerald-300 text-emerald-900"
              >
                Collect Test Data
              </button>
            )}
            <button
              onClick={runArenaBenchmark}
              disabled={
                isRunningArena
                || arenaBenchmarkSummary.total === 0
                || !testingLock.canEvaluate
              }
              className="btn-primary disabled:opacity-50"
            >
              {isRunningArena ? 'Running Arena...' : 'Run Arena Benchmark'}
            </button>
            <button
              onClick={submitArenaScore}
              disabled={!arenaResult}
              className="btn-secondary bg-violet-100 hover:bg-violet-200 border-violet-300 text-violet-900 disabled:opacity-50"
            >
              Submit Score to Leaderboard
            </button>
          </div>

          <div
            className={`mt-3 rounded-xl border p-3 text-sm ${
              testingLock.canEvaluate
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-amber-200 bg-amber-50 text-amber-900'
            }`}
          >
            {testingLock.message}
          </div>

          {holdoutCoverageWarnings.length > 0 && (
            <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">
                Holdout coverage warning ({MIN_TEST_SAMPLES_PER_CLASS}+ per gesture recommended):
              </p>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                {holdoutCoverageWarnings.map((warning) => (
                  <li key={warning.labelId}>{warning.message}</li>
                ))}
              </ul>
            </div>
          )}

          {arenaError && (
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {arenaError}
            </div>
          )}
          {arenaInfo && (
            <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
              {arenaInfo}
            </div>
          )}
        </div>

        {arenaResult && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="rounded-2xl border border-violet-300 bg-violet-50 p-4">
                <div className="text-xs uppercase tracking-wide text-violet-700">Arena Score</div>
                <div className="text-3xl font-bold text-violet-800">
                  {formatPercent(arenaResult.arenaScore)}
                </div>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="text-xs uppercase tracking-wide text-emerald-700">Generalization</div>
                <div className="text-3xl font-bold text-emerald-800">
                  {formatPercent(arenaResult.generalizationAccuracy)}
                </div>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <div className="text-xs uppercase tracking-wide text-amber-700">Generic Gesture</div>
                <div className="text-3xl font-bold text-amber-800">
                  {formatPercent(arenaResult.genericAccuracy)}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">Benchmarks</div>
                <div className="text-3xl font-bold text-slate-700">
                  {arenaResult.correct}/{arenaResult.total}
                </div>
              </div>
            </div>

            {waveLabelScore && waveLabelScore.genericTotal > 0 && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                <h3 className="font-bold text-blue-900 mb-1">Generic Wave Benchmark</h3>
                <p className="text-sm text-blue-800">
                  Your model scored {formatPercent(waveLabelScore.genericAccuracy)} on generic
                  &quot;{waveLabelScore.labelName}&quot; patterns ({waveLabelScore.genericCorrect}/
                  {waveLabelScore.genericTotal}).
                </p>
              </div>
            )}

            <div className="card">
              <h3 className="font-bold text-slate-800 mb-3">Per-Gesture Arena Results</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-200">
                      <th className="py-2 pr-4">Gesture</th>
                      <th className="py-2 pr-4">All Benchmarks</th>
                      <th className="py-2 pr-4">Generic Score</th>
                      <th className="py-2 pr-4">Coverage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {arenaResult.labelScores.map((labelScore) => (
                      <tr key={labelScore.labelId} className="border-b border-slate-100 text-slate-700">
                        <td className="py-2 pr-4 font-medium">{labelScore.labelName}</td>
                        <td className="py-2 pr-4">{formatPercent(labelScore.accuracy)}</td>
                        <td className="py-2 pr-4">
                          {labelScore.genericTotal > 0
                            ? formatPercent(labelScore.genericAccuracy)
                            : 'N/A'}
                        </td>
                        <td className="py-2 pr-4">{labelScore.correct}/{labelScore.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 className="font-bold text-slate-800">Class Leaderboard</h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={exportArenaLeaderboard}
                className="btn-secondary bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800"
              >
                Export JSON
              </button>
              <button
                onClick={triggerArenaImport}
                className="btn-secondary bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800"
              >
                Import JSON
              </button>
              <button
                onClick={clearArenaLeaderboard}
                className="btn-secondary bg-rose-100 hover:bg-rose-200 border-rose-300 text-rose-700"
              >
                Clear Leaderboard
              </button>
              <input
                ref={arenaImportRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(event) => {
                  void importArenaLeaderboard(event);
                }}
              />
            </div>
          </div>

          {rankedArenaSubmissions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-slate-500 text-sm">
              No submissions yet. Run arena benchmark and submit scores to start the competition.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="py-2 pr-4">Rank</th>
                    <th className="py-2 pr-4">Student</th>
                    <th className="py-2 pr-4">Project</th>
                    <th className="py-2 pr-4">Arena Score</th>
                    <th className="py-2 pr-4">Generalization</th>
                    <th className="py-2 pr-4">Generic</th>
                    <th className="py-2 pr-4">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {rankedArenaSubmissions.map((submission, index) => (
                    <tr key={submission.id} className="border-b border-slate-100 text-slate-700">
                      <td className="py-2 pr-4 font-bold">#{index + 1}</td>
                      <td className="py-2 pr-4">{submission.studentName}</td>
                      <td className="py-2 pr-4">{submission.projectName}</td>
                      <td className="py-2 pr-4 font-semibold text-violet-700">
                        {formatPercent(submission.arenaScore)}
                      </td>
                      <td className="py-2 pr-4">{formatPercent(submission.generalizationAccuracy)}</td>
                      <td className="py-2 pr-4">{formatPercent(submission.genericAccuracy)}</td>
                      <td className="py-2 pr-4 text-xs text-slate-500">
                        {formatDateTime(submission.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

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
          <button
            onClick={() => setMode('arena')}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
              mode === 'arena'
                ? 'bg-primary-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Model Arena
          </button>
        </div>
      </div>

      {mode === 'live' && renderLiveChallenge()}
      {mode === 'model-testing' && renderModelTesting()}
      {mode === 'arena' && renderArena()}
    </div>
  );
}
