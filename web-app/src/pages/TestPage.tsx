/**
 * Test Page — Guided Inference Check
 *
 * Students run a guided sequence where each gesture is prompted for 30 seconds.
 * The app scores one result every 4 seconds and summarizes per-target and overall
 * success/failure. In single-gesture mode, an additional Idle target is scored.
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
import {
  buildGuidedTestTargets,
  evaluateGuidedInterval,
  summarizeGuidedIntervals,
  type GuidedIntervalResult,
  type InferenceFrame,
} from '../services/guidedGestureTestingService';

const LIVE_IDLE_CONFIDENCE_THRESHOLD = 0.55;
const GUIDED_PROMPT_MS = 30 * 1000;
const GUIDED_INTERVAL_MS = 4 * 1000;
const GUIDED_INTERVALS_PER_TARGET = Math.floor(GUIDED_PROMPT_MS / GUIDED_INTERVAL_MS);
const GUIDED_INTERVAL_MIN_FRAMES = 8;
const INFERENCE_FRAME_BUFFER_MS = 20000;

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
  const [useArduinoInference, setUseArduinoInference] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [challengeNote, setChallengeNote] = useState<string | null>(null);

  // Guided testing state
  const guidedTargets = useMemo(() => buildGuidedTestTargets(labels), [labels]);
  const hasVirtualIdleTarget = useMemo(
    () => guidedTargets.some((target) => target.kind === 'idle' && target.labelIndex === null),
    [guidedTargets],
  );
  const [guidedPhase, setGuidedPhase] = useState<'idle' | 'running' | 'complete'>('idle');
  const [guidedIntervals, setGuidedIntervals] = useState<GuidedIntervalResult[]>([]);
  const [activeTargetIndex, setActiveTargetIndex] = useState(0);
  const [sessionMsRemaining, setSessionMsRemaining] = useState(guidedTargets.length * GUIDED_PROMPT_MS);
  const [targetMsRemaining, setTargetMsRemaining] = useState(GUIDED_PROMPT_MS);

  // Refs for sequence timing + interval scoring
  const guidedRunIdRef = useRef(0);
  const guidedTimerRef = useRef<number | null>(null);
  const guidedTargetStartedAtRef = useRef<number | null>(null);
  const guidedCompletedIntervalsRef = useRef(0);
  const guidedActiveTargetIndexRef = useRef(0);
  const inferenceFramesRef = useRef<InferenceFrame[]>([]);
  const guidedWaitingForFirstPredictionRef = useRef(false);

  const clearGuidedTimer = useCallback(() => {
    if (guidedTimerRef.current !== null) {
      window.clearInterval(guidedTimerRef.current);
      guidedTimerRef.current = null;
    }
  }, []);

  const resetGuidedRuntime = useCallback((clearResults = false) => {
    clearGuidedTimer();
    guidedRunIdRef.current += 1;
    guidedTargetStartedAtRef.current = null;
    guidedCompletedIntervalsRef.current = 0;
    guidedActiveTargetIndexRef.current = 0;
    guidedWaitingForFirstPredictionRef.current = false;
    setGuidedPhase('idle');
    setActiveTargetIndex(0);
    setTargetMsRemaining(GUIDED_PROMPT_MS);
    setSessionMsRemaining(guidedTargets.length * GUIDED_PROMPT_MS);
    if (clearResults) {
      setGuidedIntervals([]);
    }
  }, [clearGuidedTimer, guidedTargets.length]);

  const appendInferenceFrame = useCallback((prediction: number, confidenceValue: number) => {
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
  }, []);

  // ---------- Cleanup ----------
  useEffect(() => {
    return () => {
      clearGuidedTimer();
      const ble = getBLEService();
      void Promise.allSettled([ble.stopInference(), ble.stopSensorStream()]);
    };
  }, [clearGuidedTimer]);

  // Keep guided state in sync with labels
  useEffect(() => {
    setGuidedIntervals([]);
    setChallengeNote(null);
    resetGuidedRuntime(false);
  }, [labels, resetGuidedRuntime]);

  const stopTestingInternal = useCallback(async (reason?: string, markComplete = false) => {
    const ble = getBLEService();
    try {
      await Promise.allSettled([ble.stopInference(), ble.stopSensorStream()]);
    } catch (err) {
      console.error('Stop testing failed:', err);
    } finally {
      setIsRunning(false);
      clearGuidedTimer();
      guidedTargetStartedAtRef.current = null;
      guidedCompletedIntervalsRef.current = 0;
      guidedWaitingForFirstPredictionRef.current = false;
      if (markComplete) {
        setGuidedPhase('complete');
        setSessionMsRemaining(0);
        setTargetMsRemaining(0);
      } else {
        setGuidedPhase('idle');
        setTargetMsRemaining(GUIDED_PROMPT_MS);
        setSessionMsRemaining(guidedTargets.length * GUIDED_PROMPT_MS);
      }
      if (reason) {
        setChallengeNote(reason);
      }
    }
  }, [clearGuidedTimer, guidedTargets.length]);

  const startGuidedSequence = useCallback(() => {
    if (guidedTargets.length === 0) {
      setChallengeNote('Add at least one gesture before starting guided testing.');
      return;
    }

    const runId = guidedRunIdRef.current + 1;
    guidedRunIdRef.current = runId;
    guidedTargetStartedAtRef.current = Date.now();
    guidedCompletedIntervalsRef.current = 0;
    guidedActiveTargetIndexRef.current = 0;
    setActiveTargetIndex(0);
    setGuidedPhase('running');
    setGuidedIntervals([]);
    setTargetMsRemaining(GUIDED_PROMPT_MS);
    setSessionMsRemaining(guidedTargets.length * GUIDED_PROMPT_MS);

    const firstTarget = guidedTargets[0];
    setChallengeNote(
      firstTarget.kind === 'idle'
        ? 'Stay still for 30 seconds (Idle check).'
        : `Perform "${firstTarget.name}" for 30 seconds.`,
    );

    clearGuidedTimer();
    const totalRunMs = guidedTargets.length * GUIDED_PROMPT_MS;

    const tick = () => {
      if (guidedRunIdRef.current !== runId) return;

      const targetIndex = guidedActiveTargetIndexRef.current;
      const target = guidedTargets[targetIndex];
      const targetStart = guidedTargetStartedAtRef.current;
      if (!target || targetStart === null) return;

      const now = Date.now();
      const elapsedTargetMs = now - targetStart;
      const elapsedOverallMs = targetIndex * GUIDED_PROMPT_MS + Math.min(
        elapsedTargetMs,
        GUIDED_PROMPT_MS,
      );
      setTargetMsRemaining(Math.max(0, GUIDED_PROMPT_MS - elapsedTargetMs));
      setSessionMsRemaining(Math.max(0, totalRunMs - elapsedOverallMs));

      while (guidedCompletedIntervalsRef.current < GUIDED_INTERVALS_PER_TARGET) {
        const intervalNumber = guidedCompletedIntervalsRef.current + 1;
        const intervalEnd = targetStart + intervalNumber * GUIDED_INTERVAL_MS;
        if (now < intervalEnd) break;

        const intervalStart = intervalEnd - GUIDED_INTERVAL_MS;
        const intervalResult = evaluateGuidedInterval(
          inferenceFramesRef.current,
          labels,
          target,
          intervalNumber,
          intervalStart,
          intervalEnd,
          {
            minFrames: GUIDED_INTERVAL_MIN_FRAMES,
            idleConfidenceThreshold: hasVirtualIdleTarget ? LIVE_IDLE_CONFIDENCE_THRESHOLD : 0,
          },
        );
        setGuidedIntervals((prev) => [...prev, intervalResult]);
        guidedCompletedIntervalsRef.current = intervalNumber;
      }

      if (elapsedTargetMs < GUIDED_PROMPT_MS) {
        return;
      }

      const nextTargetIndex = targetIndex + 1;
      if (nextTargetIndex >= guidedTargets.length) {
        guidedRunIdRef.current += 1;
        clearGuidedTimer();
        guidedTargetStartedAtRef.current = null;
        guidedCompletedIntervalsRef.current = 0;
        void stopTestingInternal('Guided testing complete.', true);
        return;
      }

      guidedActiveTargetIndexRef.current = nextTargetIndex;
      setActiveTargetIndex(nextTargetIndex);
      guidedCompletedIntervalsRef.current = 0;
      guidedTargetStartedAtRef.current = now;
      setTargetMsRemaining(GUIDED_PROMPT_MS);

      const nextTarget = guidedTargets[nextTargetIndex];
      setChallengeNote(
        nextTarget.kind === 'idle'
          ? 'Stay still for 30 seconds (Idle check).'
          : `Perform "${nextTarget.name}" for 30 seconds.`,
      );
    };

    tick();
    guidedTimerRef.current = window.setInterval(tick, 100);
  }, [clearGuidedTimer, guidedTargets, hasVirtualIdleTarget, labels, stopTestingInternal]);

  const startGuidedSequenceOnFirstPrediction = useCallback(() => {
    if (!guidedWaitingForFirstPredictionRef.current) return;
    guidedWaitingForFirstPredictionRef.current = false;
    startGuidedSequence();
  }, [startGuidedSequence]);

  // ---------- Start / Stop ----------
  const startTesting = async () => {
    if (guidedTargets.length === 0) {
      setLiveError('Add at least one gesture before testing.');
      return;
    }

    const ble = getBLEService();
    setLiveError(null);
    setChallengeNote(null);
    setCurrentPrediction(null);
    setConfidence(0);
    resetGuidedRuntime(true);
    inferenceFramesRef.current = [];
    guidedWaitingForFirstPredictionRef.current = true;
    setIsRunning(true);
    setChallengeNote('Warming up model window... scoring starts on first prediction.');

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
          const normalizedConfidence = normalizeConfidence(result.confidence, 'arduino');
          setCurrentPrediction(result.prediction);
          setConfidence(normalizedConfidence);
          appendInferenceFrame(result.prediction, normalizedConfidence);
          startGuidedSequenceOnFirstPrediction();
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

            const normalizedConfidence = normalizeConfidence(adjusted.confidence, 'browser');
            setCurrentPrediction(adjusted.prediction);
            setConfidence(normalizedConfidence);
            appendInferenceFrame(adjusted.prediction, normalizedConfidence);
            startGuidedSequenceOnFirstPrediction();
            // Keep an overlapping window and slide by WINDOW_STRIDE samples.
            sampleBuffer.splice(0, MODEL_CONFIG.WINDOW_STRIDE);
          }
        });
      }
    } catch (err) {
      guidedWaitingForFirstPredictionRef.current = false;
      setIsRunning(false);
      resetGuidedRuntime(false);
      console.error('Start testing failed:', err);
      setLiveError(
        err instanceof Error
          ? err.message
          : 'Failed to start testing. Reconnect and try again.',
      );
    }
  };

  const stopTesting = () => void stopTestingInternal('Guided testing stopped.');

  const resetGuidedResults = () => {
    if (isRunning) return;
    setChallengeNote(null);
    setGuidedPhase('idle');
    setGuidedIntervals([]);
    setActiveTargetIndex(0);
    setTargetMsRemaining(GUIDED_PROMPT_MS);
    setSessionMsRemaining(guidedTargets.length * GUIDED_PROMPT_MS);
  };

  // ---------- Computed ----------
  const livePredictionView = useMemo(() => {
    if (currentPrediction === null) {
      return { label: null as string | null, isIdle: false };
    }

    if (currentPrediction >= 0 && currentPrediction < labels.length) {
      const predictedLabel = labels[currentPrediction];
      const isExplicitIdle = predictedLabel.name.trim().toLowerCase() === 'idle';

      if (hasVirtualIdleTarget && confidence < LIVE_IDLE_CONFIDENCE_THRESHOLD) {
        return { label: 'Idle', isIdle: true };
      }
      return { label: predictedLabel.name, isIdle: isExplicitIdle };
    }

    if (currentPrediction === labels.length) {
      return { label: 'Idle', isIdle: true };
    }

    return { label: `Class ${currentPrediction}`, isIdle: false };
  }, [confidence, currentPrediction, hasVirtualIdleTarget, labels]);

  const guidedSummary = useMemo(
    () => summarizeGuidedIntervals(guidedTargets, guidedIntervals),
    [guidedIntervals, guidedTargets],
  );
  const challengeRows = guidedSummary.targetSummaries;
  const challengeComplete = guidedPhase === 'complete' && guidedSummary.totalIntervals > 0;
  const activeTarget = guidedTargets[activeTargetIndex] ?? null;
  const activeTargetScoredIntervals = activeTarget
    ? guidedIntervals.filter((interval) => interval.targetId === activeTarget.id).length
    : 0;
  const nonIdleGestureCount = labels.filter(
    (label) => label.name.trim().toLowerCase() !== 'idle',
  ).length;

  // ---------- Render ----------
  return (
    <div className="p-4 max-w-5xl mx-auto space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card bg-gradient-to-br from-white to-slate-50">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="heading-md mb-2">🧪 Guided Inference Check</h1>
                <p className="text-slate-600">
                  Follow the prompts. The app scores each 4-second interval automatically.
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

            <div className="mt-6 flex justify-center">
              {!isRunning ? (
                <button
                  onClick={startTesting}
                  className="btn-primary text-xl px-12 py-4 shadow-xl shadow-primary-200"
                >
                  Start Guided Check
                </button>
              ) : (
                <button
                  onClick={stopTesting}
                  className="btn-danger text-xl px-12 py-4 shadow-xl shadow-rose-200"
                >
                  Stop Guided Check
                </button>
              )}
            </div>

            <div className="mt-3 text-center text-sm text-slate-600">
              {isRunning
                ? `Guided testing ends in ${formatClock(sessionMsRemaining)}`
                : `Each guided run scores ${GUIDED_INTERVALS_PER_TARGET} intervals per target (${formatClock(guidedTargets.length * GUIDED_PROMPT_MS)} total).`}
            </div>

            {useArduinoInference && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                On Device uses the model currently stored on Arduino.
                Retraining in the web app does not upload automatically.
              </div>
            )}

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
              <span className="text-xl">🏁</span> Guided Gesture Scoring
            </h3>
            <p className="text-sm text-amber-800">
              30 seconds per target, scored once every 4 seconds.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
                30s prompt / target
              </span>
              <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
                4s scoring interval
              </span>
              <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
                {GUIDED_INTERVALS_PER_TARGET} scored intervals / target
              </span>
            </div>

            <div className="mt-4 rounded-xl border border-amber-200 bg-white p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-700">Overall Success</span>
                <span className="font-bold text-slate-900">
                  {formatPercent(guidedSummary.overallSuccessRate)}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-rose-100">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${guidedSummary.overallSuccessRate * 100}%` }}
                />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
                  Success: {formatPercent(guidedSummary.overallSuccessRate)}
                </div>
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
                  Failure: {formatPercent(guidedSummary.overallFailureRate)}
                </div>
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-2 col-span-2">
                  Averaged per-target success: {formatPercent(guidedSummary.macroSuccessRate)}
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
                {activeTarget && isRunning
                  ? (
                    <>
                      <div className="font-semibold">Current target: {activeTarget.name}</div>
                      <div className="text-xs text-slate-500 mt-1">
                        {activeTarget.kind === 'idle'
                          ? 'Stay still and let the model choose Idle.'
                          : 'Perform the target gesture consistently.'}
                      </div>
                      <div className="mt-2 text-xs text-slate-600">
                        Target timer: {formatClock(targetMsRemaining)} | Interval
                        {' '}
                        {Math.min(GUIDED_INTERVALS_PER_TARGET, activeTargetScoredIntervals)}
                        /
                        {GUIDED_INTERVALS_PER_TARGET}
                      </div>
                    </>
                  )
                  : (
                    <div>Press <strong>Start Guided Check</strong> to run the full sequence.</div>
                  )}
              </div>

              <button
                onClick={resetGuidedResults}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                disabled={isRunning}
              >
                Reset Guided Results
              </button>
            </div>

            {challengeNote && (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                {challengeNote}
              </div>
            )}

            {nonIdleGestureCount === 1 && (
              <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
                Single-gesture projects evaluate your target gesture against <strong>Idle</strong>.
              </div>
            )}

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="py-2 pr-4">Target</th>
                    <th className="py-2 pr-4">Correct</th>
                    <th className="py-2 pr-4">Total</th>
                    <th className="py-2 pr-4">Success</th>
                  </tr>
                </thead>
                <tbody>
                  {challengeRows.map((row) => (
                    <tr key={row.targetId} className="border-b border-slate-100 text-slate-700">
                      <td className="py-2 pr-4 font-medium">{row.targetName}</td>
                      <td className="py-2 pr-4">{row.correctIntervals}</td>
                      <td className="py-2 pr-4">{row.totalIntervals}</td>
                      <td className="py-2 pr-4">{formatPercent(row.successRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {challengeComplete && (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                Guided testing complete. Final success: {formatPercent(guidedSummary.overallSuccessRate)}
                {' '}
                ({guidedSummary.totalCorrectIntervals}/{guidedSummary.totalIntervals} intervals).
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
    </div>
  );
}
