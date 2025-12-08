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
    <div className="p-4 max-w-6xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Instructions & Progress */}
        <div className="lg:col-span-2 space-y-6">
          <div className="card bg-gradient-to-br from-white to-slate-50">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="heading-md mb-2">
                  📊 Collect Training Data
                </h1>
                <p className="text-slate-600">
                  Record {COLLECTION_CONFIG.SAMPLES_PER_GESTURE} examples of each gesture.
                </p>
              </div>
              <div className="hidden sm:block text-4xl">📸</div>
            </div>
            
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <div className="flex justify-between items-center mb-2">
                <span className="font-bold text-slate-700">Total Progress</span>
                <span className="text-xl font-bold text-primary-600">
                  {Math.min(100, Math.round((getTotalSamples() / getRequiredSamples()) * 100))}%
                </span>
              </div>
              <div className="bg-slate-200 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-primary-600 h-full transition-all duration-500 ease-out rounded-full"
                  style={{ width: `${Math.min(100, (getTotalSamples() / getRequiredSamples()) * 100)}%` }}
                />
              </div>
              <div className="mt-2 text-xs text-slate-500 text-right">
                {getTotalSamples()} / {getRequiredSamples()} samples collected
              </div>
            </div>
          </div>

          {/* Feedback Area */}
          <div className={`card transition-all duration-300 ${isRecording ? 'ring-4 ring-primary-200 scale-[1.02]' : ''}`}>
            {isRecording ? (
              <div>
                <KidFeedback status={feedback} />
                <div className="mt-6 bg-slate-100 rounded-full h-4 overflow-hidden border border-slate-200">
                  <div
                    className="bg-primary-500 h-full transition-all duration-100 ease-linear"
                    style={{ width: `${recordingProgress}%` }}
                  />
                </div>
                <p className="text-center text-sm text-slate-500 mt-2">Recording...</p>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400">
                <div className="text-6xl mb-4 opacity-50">👆</div>
                <p className="text-lg">Select a gesture below to start recording</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Gesture List */}
        <div className="space-y-4">
          <h2 className="font-bold text-slate-700 text-lg px-2">Gestures to Learn</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
            {labels.map((label) => {
              const isComplete = label.sampleCount >= COLLECTION_CONFIG.SAMPLES_PER_GESTURE;
              const progress = (label.sampleCount / COLLECTION_CONFIG.SAMPLES_PER_GESTURE) * 100;
              
              return (
                <div 
                  key={label.id} 
                  className={`card p-4 transition-all duration-200 ${
                    currentLabel === label.id 
                      ? 'border-primary-500 ring-2 ring-primary-200 shadow-lg' 
                      : 'hover:border-primary-200 hover:shadow-md'
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="font-bold text-slate-800 text-lg">{label.name}</h3>
                    {isComplete ? (
                      <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-2 py-1 rounded-full">
                        DONE
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
                        {label.sampleCount}/{COLLECTION_CONFIG.SAMPLES_PER_GESTURE}
                      </span>
                    )}
                  </div>
                  
                  <div className="bg-slate-100 rounded-full h-2 mb-4 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${isComplete ? 'bg-emerald-500' : 'bg-primary-500'}`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  <button
                    onClick={() => startRecording(label.id)}
                    disabled={isRecording || isComplete}
                    className={`w-full py-2 rounded-lg font-bold text-sm transition-colors ${
                      isComplete
                        ? 'bg-slate-100 text-slate-400 cursor-default'
                        : 'bg-primary-50 text-primary-700 hover:bg-primary-100 active:bg-primary-200'
                    }`}
                  >
                    {isComplete ? 'Completed' : 'Record Sample'}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Next Button */}
          {isComplete() && (
            <div className="sticky bottom-4 pt-4">
              <div className="card bg-emerald-50 border-emerald-200 shadow-lg shadow-emerald-100/50 animate-bounce-slow">
                <div className="text-center">
                  <h2 className="text-xl font-bold text-emerald-800 mb-3">
                    🎉 All Done!
                  </h2>
                  <button onClick={handleNext} className="btn-success w-full shadow-emerald-200">
                    Next: Train Model →
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
