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
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 to-orange-100 p-4">
      <div className="max-w-4xl mx-auto py-8">
        {/* Header */}
        <div className="card mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">🎯 Test Your Model</h1>
          <p className="text-gray-600">
            Perform gestures and watch the AI recognize them in real-time!
          </p>
        </div>

        {/* Controls */}
        <div className="card mb-6 text-center">
          {!isRunning ? (
            <button onClick={startTesting} className="btn-primary text-xl">
              ▶️ Start Testing
            </button>
          ) : (
            <button onClick={stopTesting} className="btn-danger text-xl">
              ⏹️ Stop Testing
            </button>
          )}
        </div>

        {/* Live Prediction */}
        {isRunning && (
          <>
            <div className="card mb-6">
              <div className="text-center">
                <div className="text-gray-600 mb-2">Current Prediction:</div>
                {currentPrediction !== null ? (
                  <>
                    <div className="text-6xl font-bold text-blue-600 mb-2">
                      {labels[currentPrediction].name}
                    </div>
                    <div className="text-2xl text-gray-600">
                      {(confidence * 100).toFixed(1)}% confident
                    </div>

                    {/* Confidence bar */}
                    <div className="mt-4 bg-gray-200 rounded-full h-6 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          confidence > 0.7
                            ? 'bg-green-500'
                            : confidence > 0.4
                            ? 'bg-yellow-500'
                            : 'bg-red-500'
                        }`}
                        style={{ width: `${confidence * 100}%` }}
                      />
                    </div>
                  </>
                ) : (
                  <div className="text-2xl text-gray-400 py-8">
                    Collecting samples... (need {WINDOW_SIZE})
                  </div>
                )}
              </div>
            </div>

            {/* Prediction History */}
            {predictionHistory.length > 0 && (
              <div className="card">
                <h3 className="text-xl font-bold text-gray-800 mb-4">
                  Prediction Distribution
                </h3>
                <div className="space-y-3">
                  {labels.map((label, idx) => {
                    const counts = getPredictionCounts();
                    const count = counts[idx];
                    const total = predictionHistory.length;
                    const percentage = total > 0 ? (count / total) * 100 : 0;

                    return (
                      <div key={label.id}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-bold">{label.name}</span>
                          <span className="text-gray-600">
                            {count} / {total} ({percentage.toFixed(0)}%)
                          </span>
                        </div>
                        <div className="bg-gray-200 rounded-full h-4 overflow-hidden">
                          <div
                            className="bg-blue-600 h-full transition-all duration-300"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* Instructions */}
        {!isRunning && (
          <div className="card bg-blue-50 border-blue-200">
            <h3 className="font-bold text-blue-900 mb-2">Tips for Testing:</h3>
            <ul className="list-disc list-inside text-blue-800 space-y-1">
              <li>Hold the Arduino firmly while performing gestures</li>
              <li>Try to match how you recorded the training samples</li>
              <li>Green confidence = Great! Yellow = OK, Red = Try again</li>
              <li>The AI predicts every few seconds based on recent motion</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
