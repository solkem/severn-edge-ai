/**
 * Collect Page - Record Labeled Gesture Samples
 */

import { useState, useRef } from 'react';
import { getBLEService } from '../services/bleService';
import { SensorPacket } from '../types/ble';
import { KidFeedback, FeedbackStatus } from '../components/KidFeedback';
import { GestureLabel, Sample } from '../types';
import { COLLECTION_CONFIG } from '../config/constants';

/** Editable gesture pill for the setup phase */
function GesturePill({ label, canRemove, onRemove, onRename, maxLength }: {
  label: GestureLabel;
  canRemove: boolean;
  onRemove: () => void;
  onRename: (name: string) => void;
  maxLength: number;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(label.name);

  const commit = () => {
    const trimmed = editValue.trim();
    if (trimmed) onRename(trimmed);
    setEditing(false);
  };

  return (
    <div className="group flex items-center gap-2 bg-primary-50 border-2 border-primary-200 rounded-full px-4 py-2 transition-all hover:border-primary-300">
      {editing ? (
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') { setEditValue(label.name); setEditing(false); }
          }}
          maxLength={maxLength}
          className="bg-transparent border-none outline-none font-bold text-primary-700 w-28 text-center"
          autoFocus
        />
      ) : (
        <span
          className="font-bold text-primary-700 cursor-pointer hover:underline"
          onClick={() => { setEditValue(label.name); setEditing(true); }}
          title="Click to rename"
        >
          {label.name}
        </span>
      )}
      {canRemove && (
        <button
          onClick={onRemove}
          className="w-5 h-5 rounded-full bg-primary-200 text-primary-600 hover:bg-rose-200 hover:text-rose-600 flex items-center justify-center text-xs font-bold transition-colors"
          title="Remove gesture"
        >
          x
        </button>
      )}
    </div>
  );
}

/** Collapsible live sensor display — "See what the AI sees" */
function SensorPeek({ packet }: { packet: number[] | null }) {
  const [open, setOpen] = useState(false);

  const axes = [
    { label: 'ax', value: packet?.[0] ?? 0, max: 4, color: 'bg-red-400' },
    { label: 'ay', value: packet?.[1] ?? 0, max: 4, color: 'bg-red-400' },
    { label: 'az', value: packet?.[2] ?? 0, max: 4, color: 'bg-red-400' },
    { label: 'gx', value: packet?.[3] ?? 0, max: 500, color: 'bg-blue-400' },
    { label: 'gy', value: packet?.[4] ?? 0, max: 500, color: 'bg-blue-400' },
    { label: 'gz', value: packet?.[5] ?? 0, max: 500, color: 'bg-blue-400' },
  ];

  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen(!open)}
        className="text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1"
      >
        <span>{open ? '\u25BC' : '\u25B6'}</span>
        {open ? 'Hide the numbers' : 'See what the AI sees'}
      </button>
      {open && (
        <div className="mt-3 bg-slate-900 rounded-xl p-4 font-mono text-sm">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {axes.map((a) => {
              const pct = Math.min(100, (Math.abs(a.value) / a.max) * 100);
              return (
                <div key={a.label} className="flex items-center gap-2">
                  <span className="text-slate-400 w-6 text-right">{a.label}</span>
                  <span className={`w-16 text-right ${Math.abs(a.value) > a.max * 0.7 ? 'text-amber-300' : 'text-emerald-300'}`}>
                    {a.value.toFixed(2)}
                  </span>
                  <div className="flex-1 bg-slate-700 rounded-full h-2 overflow-hidden">
                    <div
                      className={`${a.color} h-full transition-all duration-75`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          {!packet && (
            <p className="text-slate-500 text-xs text-center mt-2">Start recording to see live data</p>
          )}
        </div>
      )}
    </div>
  );
}

interface CollectPageProps {
  onComplete: (samples: Sample[], labels: GestureLabel[]) => void;
}

function getTimestampMs(): number {
  return Date.now();
}

function makeClientId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
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

  // Gesture setup phase
  const [isSetupComplete, setIsSetupComplete] = useState(false);
  const [newGestureName, setNewGestureName] = useState('');

  // Live sensor display
  const [livePacket, setLivePacket] = useState<number[] | null>(null);

  const currentSampleData = useRef<number[][]>([]);
  const recordingStartTime = useRef<number>(0);
  const expectedSequence = useRef<number>(0);
  const packetLossCount = useRef<number>(0);
  const isFinishing = useRef(false);

  // Start recording for a specific label
  const startRecording = async (labelId: string) => {
    setCurrentLabel(labelId);
    setIsRecording(true);
    setRecordingProgress(0);
    setFeedback('recording');
    currentSampleData.current = [];
    recordingStartTime.current = getTimestampMs();
    expectedSequence.current = -1; // Will be set on first packet
    packetLossCount.current = 0;
    isFinishing.current = false;

    const ble = getBLEService();

    try {
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
        const values = [packet.ax, packet.ay, packet.az, packet.gx, packet.gy, packet.gz];
        currentSampleData.current.push(values);

        // Update live display (~6 fps, every 4th packet)
        if (currentSampleData.current.length % 4 === 0) {
          setLivePacket(values);
        }

        // Update progress
        const elapsed = getTimestampMs() - recordingStartTime.current;
        const progress = Math.min(100, (elapsed / COLLECTION_CONFIG.SAMPLE_DURATION_MS) * 100);
        setRecordingProgress(progress);

        // Stop when duration reached (guard against multiple calls)
        if (elapsed >= COLLECTION_CONFIG.SAMPLE_DURATION_MS && !isFinishing.current) {
          isFinishing.current = true;
          finishRecording(labelId);
        }
      });
    } catch (err) {
      console.error('Recording failed:', err);
      setIsRecording(false);
      setCurrentLabel(null);
    }
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
        id: makeClientId('sample'),
        label: labelId,
        data: sampleData,
        timestamp: getTimestampMs(),
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
    setLivePacket(null);
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

  // --- Gesture Setup Handlers ---
  const addGesture = () => {
    const trimmed = newGestureName.trim();
    if (!trimmed) return;
    if (trimmed.length > COLLECTION_CONFIG.MAX_GESTURE_NAME_LENGTH) return;
    if (labels.length >= COLLECTION_CONFIG.MAX_GESTURES) return;
    if (labels.some((l) => l.name.toLowerCase() === trimmed.toLowerCase())) return;

    setLabels((prev) => [
      ...prev,
      { id: makeClientId('label'), name: trimmed, sampleCount: 0 },
    ]);
    setNewGestureName('');
  };

  const removeGesture = (labelId: string) => {
    if (labels.length <= COLLECTION_CONFIG.MIN_GESTURES) return;
    setLabels((prev) => prev.filter((l) => l.id !== labelId));
  };

  const renameGesture = (labelId: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed.length > COLLECTION_CONFIG.MAX_GESTURE_NAME_LENGTH) return;
    if (labels.some((l) => l.id !== labelId && l.name.toLowerCase() === trimmed.toLowerCase())) return;
    setLabels((prev) => prev.map((l) => (l.id === labelId ? { ...l, name: trimmed } : l)));
  };

  const canAddMore = labels.length < COLLECTION_CONFIG.MAX_GESTURES;
  const canStartRecording = labels.length >= COLLECTION_CONFIG.MIN_GESTURES;
  const isDuplicateName = newGestureName.trim() &&
    labels.some((l) => l.name.toLowerCase() === newGestureName.trim().toLowerCase());

  return (
    <div className="p-4 max-w-6xl mx-auto">
      {!isSetupComplete ? (
        /* ============= PHASE 1: GESTURE SETUP ============= */
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="card bg-gradient-to-br from-white to-slate-50 text-center">
            <div className="text-6xl mb-4">🎨</div>
            <h1 className="heading-md mb-2">Choose Your Gestures</h1>
            <p className="text-slate-600 text-lg">
              Pick the moves you want to teach the AI!
            </p>
            <p className="text-sm text-slate-400 mt-1">
              You need at least {COLLECTION_CONFIG.MIN_GESTURES}, up to {COLLECTION_CONFIG.MAX_GESTURES}
            </p>
          </div>

          {/* Current gestures as editable pills */}
          <div className="card">
            <h2 className="font-bold text-slate-700 text-lg mb-4">Your Gestures</h2>
            <div className="flex flex-wrap gap-3 mb-6">
              {labels.map((label) => (
                <GesturePill
                  key={label.id}
                  label={label}
                  canRemove={labels.length > COLLECTION_CONFIG.MIN_GESTURES}
                  onRemove={() => removeGesture(label.id)}
                  onRename={(name) => renameGesture(label.id, name)}
                  maxLength={COLLECTION_CONFIG.MAX_GESTURE_NAME_LENGTH}
                />
              ))}
            </div>

            {/* Add new gesture */}
            {canAddMore ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newGestureName}
                  onChange={(e) => setNewGestureName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addGesture(); }}
                  placeholder="Type a gesture name..."
                  maxLength={COLLECTION_CONFIG.MAX_GESTURE_NAME_LENGTH}
                  className="flex-1 px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100 text-lg font-medium"
                />
                <button
                  onClick={addGesture}
                  disabled={!newGestureName.trim() || !!isDuplicateName}
                  className="px-6 py-3 rounded-xl bg-primary-100 text-primary-700 font-bold text-lg hover:bg-primary-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  + Add
                </button>
              </div>
            ) : (
              <p className="text-sm text-slate-400 text-center">
                Maximum {COLLECTION_CONFIG.MAX_GESTURES} gestures reached
              </p>
            )}

            {isDuplicateName && (
              <p className="text-sm text-amber-600 font-medium mt-2">
                You already have a gesture with that name!
              </p>
            )}
          </div>

          {/* Start Recording button */}
          <button
            onClick={() => setIsSetupComplete(true)}
            disabled={!canStartRecording}
            className="btn-success text-xl w-full py-4 shadow-xl shadow-emerald-200 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            I'm Ready! Start Recording
          </button>

          {!canStartRecording && (
            <p className="text-center text-sm text-slate-400">
              Add at least {COLLECTION_CONFIG.MIN_GESTURES} gestures to continue
            </p>
          )}
        </div>
      ) : (
        /* ============= PHASE 2: RECORDING ============= */
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
              <SensorPeek packet={isRecording ? livePacket : null} />
            </div>
          </div>

          {/* Right Column: Gesture List */}
          <div className="space-y-4">
            <h2 className="font-bold text-slate-700 text-lg px-2">Gestures to Learn</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
              {labels.map((label) => {
                const labelComplete = label.sampleCount >= COLLECTION_CONFIG.SAMPLES_PER_GESTURE;
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
                      {labelComplete ? (
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
                        className={`h-full transition-all duration-300 ${labelComplete ? 'bg-emerald-500' : 'bg-primary-500'}`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>

                    <button
                      onClick={() => startRecording(label.id)}
                      disabled={isRecording || labelComplete}
                      className={`w-full py-2 rounded-lg font-bold text-sm transition-colors ${
                        labelComplete
                          ? 'bg-slate-100 text-slate-400 cursor-default'
                          : 'bg-primary-50 text-primary-700 hover:bg-primary-100 active:bg-primary-200'
                      }`}
                    >
                      {labelComplete ? 'Completed' : 'Record Sample'}
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
      )}
    </div>
  );
}
