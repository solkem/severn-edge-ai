/**
 * Test Page - Live Inference Testing
 * Uses Arduino-side inference (model runs on device!)
 */

import { useState, useEffect, useMemo } from 'react';
import { GestureLabel } from '../types';
import { TrainingService } from '../services/trainingService';
import { InferenceResult } from '../types/ble';
import { getBLEService } from '../services/bleService';
import { EdgeAIFactsPanel } from '../components/EdgeAIFactsPanel';
import { useSessionStore } from '../state/sessionStore';

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
  const { addBadge } = useSessionStore();

  useEffect(() => {
    return () => {
      // Cleanup on unmount: stop both stream types to avoid stale closure issues
      const ble = getBLEService();
      void Promise.allSettled([ble.stopInference(), ble.stopSensorStream()]);
    };
  }, []);

  const startTesting = async () => {
    setIsRunning(true);
    const ble = getBLEService();

    if (useArduinoInference) {
      // Use inference running ON the Arduino!
      await ble.startInference((result: InferenceResult) => {
        setCurrentPrediction(result.prediction);
        setConfidence(result.confidence / 100); // Convert 0-100 to 0-1
        if (result.confidence >= 80) {
          setHighConfidenceCount((c) => {
            const next = c + 1;
            if (next === 10) {
              addBadge('sharp-shooter');
            }
            return next;
          });
        }
        
        // Add to history
        setPredictionHistory((prev) => [...prev.slice(-99), result.prediction]);
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
          setPredictionHistory((prev) => [...prev.slice(-99), prediction]);
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

  const predictionCounts = useMemo(() => {
    const counts = new Array(labels.length).fill(0);
    for (const pred of predictionHistory) {
      if (pred >= 0 && pred < counts.length) {
        counts[pred]++;
      }
    }
    return counts;
  }, [predictionHistory, labels.length]);

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
                currentPrediction !== null && currentPrediction < labels.length ? (
                  <div className="relative z-10 animate-in fade-in zoom-in duration-300">
                    <div className="text-slate-400 text-sm uppercase tracking-widest mb-4 font-bold">
                      {useArduinoInference ? ' Arduino Says...' : 'Detected Gesture'}
                    </div>
                    <div className="text-6xl md:text-7xl font-bold text-white mb-4 tracking-tight">
                      {labels[currentPrediction].name}
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

            <div className="mt-6">
              <EdgeAIFactsPanel />
            </div>
          </div>
        </div>

        {/* Right Column: Stats & History */}
        <div className="space-y-6">
          {/* Prediction History */}
          <div className="card h-full">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
              <span className="text-xl"></span> Distribution
            </h3>

            {predictionHistory.length > 0 ? (
              <div className="space-y-4">
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
                  Based on last {predictionHistory.length} predictions
                </div>
              </div>
            ) : (
              <div className="text-center text-slate-400 py-8 text-sm">
                No predictions yet.
                <br/>Start testing to see data!
              </div>
            )}
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
                <li className="flex gap-2">
                  <span className="text-blue-500"></span>
                  High-confidence count: {highConfidenceCount}/10
                </li>
              </ul>
            </div>
          )}

          {/* Start Over Button */}
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
