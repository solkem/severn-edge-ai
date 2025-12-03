/**
 * Collect Page - Record Labeled Gesture Samples
 */

import { useState, useEffect, useRef } from 'react';
import { getBLEService } from '../services/bleService';
import { SensorPacket } from '../types/ble';
import { KidFeedback, FeedbackStatus } from '../components/KidFeedback';
import { GestureLabel, Sample } from '../types';
import { COLLECTION_CONFIG } from '../config/constants';

interface CollectPageProps {
  onComplete: (samples: Sample[], labels: GestureLabel[]) => void;
}

export function CollectPage({ onComplete }: CollectPageProps) {
  const [labels, setLabels] = useState<GestureLabel[]>(
    COLLECTION_CONFIG.DEFAULT_GESTURES.map((name, idx) => ({
      id: `label-${idx}`,
      name,
      sampleCount: 0,
    }))
  );

  const [samples, setSamples] = useState<Sample[]>([]);
  const [currentLabel, setCurrentLabel] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingProgress, setRecordingProgress] = useState(0);
  const [feedback, setFeedback] = useState<FeedbackStatus>('recording');

  const currentSampleData = useRef<number[][]>([]);
  const recordingStartTime = useRef<number>(0);
  const expectedSequence = useRef<number>(0);
  const packetLossCount = useRef<number>(0);

  // Start recording for a specific label
  const startRecording = async (labelId: string) => {
    setCurrentLabel(labelId);
    setIsRecording(true);
    setRecordingProgress(0);
    setFeedback('recording');
    currentSampleData.current = [];
    recordingStartTime.current = Date.now();
    expectedSequence.current = -1; // Will be set on first packet
    packetLossCount.current = 0;

    const ble = getBLEService();

    // Start sensor stream
    await ble.startSensorStream((packet: SensorPacket) => {
      // Track packet loss
      if (expectedSequence.current !== -1) {
        const expectedSeq = expectedSequence.current;
        const receivedSeq = packet.sequence;

        // Handle sequence wrapping
        if (receivedSeq !== expectedSeq) {
          let lost = (receivedSeq - expectedSeq + 65536) % 65536;
          if (lost > 100) lost = 0; // Ignore large jumps (reconnections)
          packetLossCount.current += lost;
        }
      }
      expectedSequence.current = (packet.sequence + 1) % 65536;

      // Store sample data
      currentSampleData.current.push([
        packet.ax,
        packet.ay,
        packet.az,
        packet.gx,
        packet.gy,
        packet.gz,
      ]);

      // Update progress
      const elapsed = Date.now() - recordingStartTime.current;
      const progress = Math.min(100, (elapsed / COLLECTION_CONFIG.SAMPLE_DURATION_MS) * 100);
      setRecordingProgress(progress);

      // Stop when duration reached
      if (elapsed >= COLLECTION_CONFIG.SAMPLE_DURATION_MS) {
        finishRecording(labelId);
      }
    });
  };

  const finishRecording = async (labelId: string) => {
    const ble = getBLEService();
    await ble.stopSensorStream();

    const sampleData = currentSampleData.current;
    const packetLoss = packetLossCount.current;
    const totalPackets = sampleData.length + packetLoss;
    const lossRate = totalPackets > 0 ? packetLoss / totalPackets : 0;

    // Quality check
    const quality = calculateQuality(sampleData, lossRate);

    if (quality >= 30) {
      // Accept sample (kid mode: lower threshold)
      const newSample: Sample = {
        id: `sample-${Date.now()}-${Math.random()}`,
        label: labelId,
        data: sampleData,
        timestamp: Date.now(),
        quality,
      };

      setSamples((prev) => [...prev, newSample]);
      setLabels((prev) =>
        prev.map((l) =>
          l.id === labelId ? { ...l, sampleCount: l.sampleCount + 1 } : l
        )
      );

      setFeedback('success');
      setTimeout(() => setFeedback('recording'), 2000);
    } else {
      // Reject sample
      setFeedback('retry');
      setTimeout(() => setFeedback('recording'), 2000);
    }

    setIsRecording(false);
    setCurrentLabel(null);
  };

  const calculateQuality = (data: number[][], packetLossRate: number): number => {
    let score = 100;

    // Penalize for insufficient samples
    if (data.length < 90) score -= 30;

    // Penalize for packet loss
    if (packetLossRate > 0.1) score -= 20;

    // Check for movement
    const hasMovement = data.some((sample) =>
      Math.abs(sample[0]) > 0.1 || Math.abs(sample[1]) > 0.1 || Math.abs(sample[2] - 1.0) > 0.1
    );
    if (!hasMovement) score -= 40;

    return Math.max(0, score);
  };

  const getTotalSamples = () => {
    return labels.reduce((sum, l) => sum + l.sampleCount, 0);
  };

  const getRequiredSamples = () => {
    return labels.length * COLLECTION_CONFIG.SAMPLES_PER_GESTURE;
  };

  const isComplete = () => {
    return labels.every((l) => l.sampleCount >= COLLECTION_CONFIG.SAMPLES_PER_GESTURE);
  };

  const handleNext = () => {
    onComplete(samples, labels);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-teal-100 p-4">
      <div className="max-w-4xl mx-auto py-8">
        {/* Header */}
        <div className="card mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            📊 Collect Training Data
          </h1>
          <p className="text-gray-600">
            Record {COLLECTION_CONFIG.SAMPLES_PER_GESTURE} examples of each gesture. Hold your Arduino and perform
            the gesture while recording!
          </p>
          <div className="mt-4 bg-blue-50 rounded-lg p-3">
            <div className="flex justify-between items-center">
              <span className="font-bold text-blue-900">Progress:</span>
              <span className="text-2xl font-bold text-blue-600">
                {getTotalSamples()} / {getRequiredSamples()}
              </span>
            </div>
            <div className="mt-2 bg-blue-200 rounded-full h-4 overflow-hidden">
              <div
                className="bg-blue-600 h-full transition-all duration-300"
                style={{ width: `${(getTotalSamples() / getRequiredSamples()) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Feedback */}
        {isRecording && (
          <div className="card mb-6">
            <KidFeedback status={feedback} />
            <div className="mt-4 bg-gray-200 rounded-full h-6 overflow-hidden">
              <div
                className="bg-blue-600 h-full transition-all duration-100"
                style={{ width: `${recordingProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Gesture Labels */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {labels.map((label) => (
            <div key={label.id} className="card">
              <div className="text-center">
                <h3 className="text-xl font-bold text-gray-800 mb-2">{label.name}</h3>
                <div className="text-4xl font-bold text-blue-600 mb-3">
                  {label.sampleCount} / {COLLECTION_CONFIG.SAMPLES_PER_GESTURE}
                </div>
                <button
                  onClick={() => startRecording(label.id)}
                  disabled={isRecording || label.sampleCount >= COLLECTION_CONFIG.SAMPLES_PER_GESTURE}
                  className={`w-full ${
                    label.sampleCount >= COLLECTION_CONFIG.SAMPLES_PER_GESTURE
                      ? 'btn-success'
                      : 'btn-primary'
                  }`}
                >
                  {label.sampleCount >= COLLECTION_CONFIG.SAMPLES_PER_GESTURE ? '✓ Complete' : '🎯 Record'}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Next Button */}
        {isComplete() && (
          <div className="card text-center">
            <div className="emoji-medium mb-4">🎉</div>
            <h2 className="text-2xl font-bold text-green-600 mb-4">
              All data collected! Ready to train!
            </h2>
            <button onClick={handleNext} className="btn-success text-xl">
              Next: Train Model →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
