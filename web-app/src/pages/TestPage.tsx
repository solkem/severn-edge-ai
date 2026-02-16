/**
 * Test Page - Live Inference Testing
 * Uses Arduino-side inference (model runs on device!)
 */

import { useState, useEffect, useMemo } from 'react';
import { GestureLabel } from '../types';
import { TrainingService } from '../services/trainingService';
import { InferenceResult } from '../types/ble';
import { getBLEService } from '../services/bleService';

interface TestPageProps {
  labels: GestureLabel[];
  trainingService: TrainingService;
  onStartOver?: () => void;
}

interface TrialRecord {
  expected: number;
  predicted: number;
  confidence: number;
  correct: boolean;
  timestamp: number;
}

const CHALLENGE_ATTEMPTS = 10;

export function TestPage({ labels, trainingService, onStartOver }: TestPageProps) {
  const displayLabels = useMemo(() => {
    if (labels.length === 1) {
      return [
        ...labels,
        { id: '__idle__', name: 'Idle', sampleCount: 0 } as GestureLabel,
      ];
    }
    return labels;
  }, [labels]);

  const [isRunning, setIsRunning] = useState(false);
  const [currentPrediction, setCurrentPrediction] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<number>(0);
  const [recentResults, setRecentResults] = useState<InferenceResult[]>([]);
  const [useArduinoInference, setUseArduinoInference] = useState(true);
  const [targetIndex, setTargetIndex] = useState(0);
  const [trialHistory, setTrialHistory] = useState<TrialRecord[]>([]);

  useEffect(() => {
    return () => {
      // Cleanup on unmount: stop both stream types to avoid stale closure issues
      const ble = getBLEService();
      void Promise.allSettled([ble.stopInference(), ble.stopSensorStream()]);
    };
  }, []);

  useEffect(() => {
    setTargetIndex(0);
    setTrialHistory([]);
  }, [displayLabels]);

  const startTesting = async () => {
    setCurrentPrediction(null);
    setConfidence(0);
    setRecentResults([]);
    setIsRunning(true);
    const ble = getBLEService();

    if (useArduinoInference) {
      // Use inference running ON the Arduino!
      await ble.startInference((result: InferenceResult) => {
        setCurrentPrediction(result.prediction);
        setConfidence(result.confidence / 100); // Convert 0-100 to 0-1
        setRecentResults((prev) => [...prev.slice(-39), result]);
      });
    } else {
      // Fallback: browser-side inference (requires model not disposed)
      const { MODEL_CONFIG } = await import('../config/constants');
      const sampleBuffer: number[][] = [];
      
      await ble.startSensorStream((packet) => {
        sampleBuffer.push([
          packet.ax, packet.ay, packet.az,
          packet.gx, packet.gy, packet.gz,
        ]);

        if (sampleBuffer.length >= MODEL_CONFIG.WINDOW_SIZE) {
          const { prediction, confidence } = trainingService.predict(
            sampleBuffer.slice(-MODEL_CONFIG.WINDOW_SIZE)
          );
          setCurrentPrediction(prediction);
          setConfidence(confidence);
          setRecentResults((prev) => [
            ...prev.slice(-39),
            { prediction, confidence: Math.round(confidence * 100) },
          ]);
          sampleBuffer.splice(0, sampleBuffer.length - MODEL_CONFIG.WINDOW_STRIDE);
        }
      });
    }
  };

  const stopTesting = async () => {
    const ble = getBLEService();
    
    if (useArduinoInference) {
      await ble.stopInference();
    } else {
      await ble.stopSensorStream();
    }
    setIsRunning(false);
  };

  const scoreCurrentAttempt = () => {
    if (displayLabels.length === 0 || recentResults.length === 0) {
      return;
    }

    if (trialHistory.length >= CHALLENGE_ATTEMPTS) {
      return;
    }

    const window = recentResults.slice(-15);
    const counts = new Map<number, number>();

    for (const result of window) {
      counts.set(result.prediction, (counts.get(result.prediction) ?? 0) + 1);
    }

    let bestPrediction = -1;
    let bestCount = -1;
    for (const [pred, count] of counts.entries()) {
      if (count > bestCount) {
        bestPrediction = pred;
        bestCount = count;
      }
    }

    const inRangePrediction =
      bestPrediction >= 0 && bestPrediction < displayLabels.length
        ? bestPrediction
        : -1;
    const confidences = window
      .filter((r) => r.prediction === bestPrediction)
      .map((r) => r.confidence);
    const avgConfidence =
      confidences.length > 0
        ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
        : 0;

    const expected = targetIndex;
    const correct = inRangePrediction === expected;

    setTrialHistory((prev) => [
      {
        expected,
        predicted: inRangePrediction,
        confidence: avgConfidence,
        correct,
        timestamp: Date.now(),
      },
      ...prev,
    ].slice(0, 20));

    setTargetIndex((prev) =>
      displayLabels.length > 0 ? (prev + 1) % displayLabels.length : 0
    );
  };

  const resetGuidedScores = () => {
    setTargetIndex(0);
    setTrialHistory([]);
  };
  const challengeWindow = trialHistory.slice(0, CHALLENGE_ATTEMPTS);
  const challengeCompleted = challengeWindow.length;
  const challengeCorrect = challengeWindow.filter((trial) => trial.correct).length;
  const challengePct = (challengeCorrect / CHALLENGE_ATTEMPTS) * 100;
  const challengeIsComplete = challengeCompleted >= CHALLENGE_ATTEMPTS;
  const targetLabel = displayLabels[targetIndex]?.name ?? 'Unknown';
  const predictedLabel =
    currentPrediction !== null && currentPrediction >= 0 && currentPrediction < displayLabels.length
      ? displayLabels[currentPrediction].name
      : currentPrediction !== null
      ? `Class ${currentPrediction}`
      : null;

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Controls & Live View */}
        <div className="lg:col-span-2 space-y-6">
          <div className="card bg-gradient-to-br from-white to-slate-50">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="heading-md mb-2"> Test Your Model</h1>
                <p className="text-slate-600">
                  {useArduinoInference 
                    ? ' AI runs on Arduino! Perform gestures to test!'
                    : 'Perform gestures and watch the AI recognize them!'}
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
                    {useArduinoInference ? ' On Device' : ' Browser'}
                  </span>
                </label>
              </div>
            </div>

            {/* Live Prediction Display */}
            <div className="bg-slate-900 rounded-2xl p-8 text-center relative overflow-hidden min-h-[300px] flex flex-col items-center justify-center">
              {/* Background Grid */}
              <div className="absolute inset-0 opacity-10"
                   style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
              </div>

              {isRunning ? (
                predictedLabel ? (
                  <div className="relative z-10 animate-in fade-in zoom-in duration-300">
                    <div className="text-slate-400 text-sm uppercase tracking-widest mb-4 font-bold">
                      {useArduinoInference ? ' Arduino Says...' : 'Detected Gesture'}
                    </div>
                    <div className="text-6xl md:text-7xl font-bold text-white mb-4 tracking-tight">
                      {predictedLabel}
                    </div>

                    <div className="inline-flex items-center gap-2 bg-slate-800/50 rounded-full px-4 py-2 backdrop-blur-sm border border-slate-700">
                      <div className={`w-3 h-3 rounded-full ${
                        confidence > 0.7 ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' :
                        confidence > 0.4 ? 'bg-amber-500' : 'bg-rose-500'
                      }`}></div>
                      <span className="text-slate-300 font-mono">
                        {(confidence * 100).toFixed(1)}% Confident
                      </span>
                    </div>

                    {/* Confidence Bar */}
                    <div className="mt-8 w-64 mx-auto bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          confidence > 0.7 ? 'bg-emerald-500' :
                          confidence > 0.4 ? 'bg-amber-500' : 'bg-rose-500'
                        }`}
                        style={{ width: `${confidence * 100}%` }}
                      />
                    </div>

                    <div className="mt-5 text-sm text-indigo-200">
                      Target now: <span className="font-bold text-white">{targetLabel}</span>
                    </div>

                    <div className="mt-6 w-full max-w-xl bg-slate-800/40 border border-slate-700 rounded-2xl p-4 text-slate-200 text-sm">
                      Keep the board steady, do one clear gesture, then tap <span className="font-semibold">Score Attempt</span>.
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-500 animate-pulse">
                    <div className="text-4xl mb-4"></div>
                    <p>Watching for movement...</p>
                  </div>
                )
              ) : (
                <div className="text-slate-500">
                  <div className="text-6xl mb-4 opacity-50"></div>
                  <p className="text-lg">Ready to start?</p>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-center">
              {!isRunning ? (
                <button onClick={startTesting} className="btn-primary text-xl px-12 py-4 shadow-xl shadow-primary-200">
                   Start Testing
                </button>
              ) : (
                <button onClick={stopTesting} className="btn-danger text-xl px-12 py-4 shadow-xl shadow-rose-200">
                   Stop Testing
                </button>
              )}
            </div>
          </div>
        </div>

          {/* Right Column: Challenge */}
          <div className="space-y-6">
            <div className="card">
              <h3 className="font-bold text-slate-800 mb-3">Challenge (10 Turns)</h3>
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 mb-3">
                <div className="text-xs uppercase tracking-wider text-indigo-700 font-semibold">
                  Do this gesture now
                </div>
                <div className="text-2xl font-bold text-indigo-900 mt-1">
                  {targetLabel}
                </div>
                <div className="text-xs text-indigo-700 mt-2">
                  Hold gesture for about 1 second, then tap score.
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={scoreCurrentAttempt}
                  disabled={!isRunning || recentResults.length === 0 || challengeIsComplete}
                  className="btn-primary text-sm py-2 px-3 disabled:opacity-50"
                >
                  Score Attempt
                </button>
                <button
                  onClick={() =>
                    setTargetIndex((prev) =>
                      displayLabels.length > 0 ? (prev + 1) % displayLabels.length : 0
                    )
                  }
                  disabled={displayLabels.length === 0}
                  className="btn-secondary text-sm py-2 px-3"
                >
                  Skip Target
                </button>
              </div>
              <button
                onClick={resetGuidedScores}
                className="mt-2 w-full btn-secondary text-sm py-2 px-3"
              >
                Reset Scores
              </button>

              <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-sm text-slate-700">
                <div className="flex justify-between">
                  <span className="font-semibold text-indigo-800">Score</span>
                  <span className="font-bold text-indigo-900">
                    {challengeCorrect}/{CHALLENGE_ATTEMPTS}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Attempts completed</span>
                  <span className="font-bold">
                    {challengeCompleted}/{CHALLENGE_ATTEMPTS}
                  </span>
                </div>
                <div className="flex justify-between border-t border-slate-100 pt-2 mt-2">
                  <span>Challenge accuracy</span>
                  <span className="font-bold">{challengePct.toFixed(0)}%</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-indigo-100 overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 transition-all duration-300"
                    style={{ width: `${(challengeCompleted / CHALLENGE_ATTEMPTS) * 100}%` }}
                  />
                </div>
                <div className="mt-2 text-xs text-indigo-800">
                  {challengeIsComplete
                    ? 'Challenge complete. Reset scores to try again.'
                    : 'Keep going until you finish all 10 turns.'}
                </div>
              </div>
            </div>

          {/* Instructions */}
          {!isRunning && (
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
              <h3 className="font-bold text-blue-900 mb-3 flex items-center gap-2">
                <span className="text-xl"></span> Tips
              </h3>
              <ul className="space-y-2 text-sm text-blue-800">
                <li className="flex gap-2">
                  <span className="text-blue-500"></span>
                  Hold the Arduino firmly
                </li>
                <li className="flex gap-2">
                  <span className="text-blue-500"></span>
                  Match your training moves
                </li>
                <li className="flex gap-2">
                  <span className="text-blue-500"></span>
                  Green bar = High confidence
                </li>
                {useArduinoInference && (
                  <li className="flex gap-2">
                    <span className="text-emerald-500"></span>
                    <span className="text-emerald-700 font-medium">Model runs ON the Arduino!</span>
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Start Over Button */}
          {onStartOver && !isRunning && (
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
    </div>
  );
}
