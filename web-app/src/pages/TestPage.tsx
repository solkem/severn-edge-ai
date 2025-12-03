/**
 * Test Page - Live Inference Testing
 */

import { useState, useEffect, useRef } from 'react';
import { GestureLabel } from '../types';
import { TrainingService } from '../services/trainingService';
import { SensorPacket } from '../types/ble';
import { getBLEService } from '../services/bleService';
import { MODEL_CONFIG } from '../config/constants';

interface TestPageProps {
  labels: GestureLabel[];
  trainingService: TrainingService;
}

export function TestPage({ labels, trainingService }: TestPageProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [currentPrediction, setCurrentPrediction] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<number>(0);
  const [predictionHistory, setPredictionHistory] = useState<number[]>([]);

  const sampleBuffer = useRef<number[][]>([]);

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      stopTesting();
    };
  }, []);

  const startTesting = async () => {
    setIsRunning(true);
    sampleBuffer.current = [];

    const ble = getBLEService();

    await ble.startSensorStream((packet: SensorPacket) => {
      // Add sample to buffer
      sampleBuffer.current.push([
        packet.ax,
        packet.ay,
        packet.az,
        packet.gx,
        packet.gy,
        packet.gz,
      ]);

      // Run inference when we have enough samples
      if (sampleBuffer.current.length >= MODEL_CONFIG.WINDOW_SIZE) {
        const { prediction, confidence } = trainingService.predict(
          sampleBuffer.current.slice(-MODEL_CONFIG.WINDOW_SIZE)
        );

        setCurrentPrediction(prediction);
        setConfidence(confidence);

        // Add to history
        setPredictionHistory((prev) => [...prev.slice(-19), prediction]);

        // Slide window (keep last 50 samples for overlap)
        sampleBuffer.current = sampleBuffer.current.slice(-MODEL_CONFIG.WINDOW_STRIDE);
      }
    });
  };

  const stopTesting = async () => {
    const ble = getBLEService();
    await ble.stopSensorStream();
    setIsRunning(false);
  };

  const getPredictionCounts = () => {
    const counts = new Array(labels.length).fill(0);
    for (const pred of predictionHistory) {
      counts[pred]++;
    }
    return counts;
  };

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Controls & Live View */}
        <div className="lg:col-span-2 space-y-6">
          <div className="card bg-gradient-to-br from-white to-slate-50">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="heading-md mb-2">🎯 Test Your Model</h1>
                <p className="text-slate-600">
                  Perform gestures and watch the AI recognize them!
                </p>
              </div>
            </div>

            {/* Live Prediction Display */}
            <div className="bg-slate-900 rounded-2xl p-8 text-center relative overflow-hidden min-h-[300px] flex flex-col items-center justify-center">
              {/* Background Grid */}
              <div className="absolute inset-0 opacity-10" 
                   style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
              </div>

              {isRunning ? (
                currentPrediction !== null ? (
                  <div className="relative z-10 animate-in fade-in zoom-in duration-300">
                    <div className="text-slate-400 text-sm uppercase tracking-widest mb-4 font-bold">Detected Gesture</div>
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
                    <div className="text-4xl mb-4">👀</div>
                    <p>Watching for movement...</p>
                  </div>
                )
              ) : (
                <div className="text-slate-500">
                  <div className="text-6xl mb-4 opacity-50">⏸️</div>
                  <p className="text-lg">Ready to start?</p>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-center">
              {!isRunning ? (
                <button onClick={startTesting} className="btn-primary text-xl px-12 py-4 shadow-xl shadow-primary-200">
                  ▶️ Start Testing
                </button>
              ) : (
                <button onClick={stopTesting} className="btn-danger text-xl px-12 py-4 shadow-xl shadow-rose-200">
                  ⏹️ Stop Testing
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Stats & History */}
        <div className="space-y-6">
          {/* Prediction History */}
          <div className="card h-full">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
              <span className="text-xl">📊</span> Distribution
            </h3>
            
            {predictionHistory.length > 0 ? (
              <div className="space-y-4">
                {labels.map((label, idx) => {
                  const counts = getPredictionCounts();
                  const count = counts[idx];
                  const total = predictionHistory.length;
                  const percentage = total > 0 ? (count / total) * 100 : 0;

                  return (
                    <div key={label.id}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-bold text-slate-700">{label.name}</span>
                        <span className="text-slate-500 text-xs">
                          {count} ({percentage.toFixed(0)}%)
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
                <span className="text-xl">💡</span> Tips
              </h3>
              <ul className="space-y-2 text-sm text-blue-800">
                <li className="flex gap-2">
                  <span className="text-blue-500">•</span>
                  Hold the Arduino firmly
                </li>
                <li className="flex gap-2">
                  <span className="text-blue-500">•</span>
                  Match your training moves
                </li>
                <li className="flex gap-2">
                  <span className="text-blue-500">•</span>
                  Green bar = High confidence
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
