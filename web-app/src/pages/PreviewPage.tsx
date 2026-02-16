/**
 * Preview Page — "What Does the AI See?"
 *
 * A dedicated sensor exploration stage before data collection.
 * Students see live sensor numbers, build intuition about what
 * the 6 values mean, and complete mini-challenges before moving on.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { getBLEService } from '../services/bleService';
import { SensorPacket } from '../types/ble';

// ============================================================================
// Sensor Challenges
// ============================================================================
interface Challenge {
  id: string;
  title: string;
  instruction: string;
  emoji: string;
  /** Return true if the current packet meets the challenge condition */
  check: (packet: SensorPacket, history: SensorPacket[]) => boolean;
}

const CHALLENGES: Challenge[] = [
  {
    id: 'wave',
    title: 'Wave It',
    instruction: 'Wave the board side to side. Watch which numbers change!',
    emoji: '👋',
    check: (_p, history) => {
      if (history.length < 15) return false;
      const recent = history.slice(-15);
      const maxAx = Math.max(...recent.map((p) => Math.abs(p.ax)));
      return maxAx > 1.2;
    },
  },
  {
    id: 'still',
    title: 'Hold Still',
    instruction: 'Hold the board perfectly still for 3 seconds. What do you notice?',
    emoji: '🧊',
    check: (_p, history) => {
      if (history.length < 20) return false;
      const recent = history.slice(-20);
      const allStill = recent.every(
        (p) =>
          Math.abs(p.ax) < 0.3 &&
          Math.abs(p.ay) < 0.3 &&
          Math.abs(p.gx) < 30 &&
          Math.abs(p.gy) < 30 &&
          Math.abs(p.gz) < 30
      );
      return allStill;
    },
  },
  {
    id: 'spin',
    title: 'Find gz',
    instruction: 'Try to make ONLY the gz bar move. Spin the board like a steering wheel!',
    emoji: '🎡',
    check: (_p, history) => {
      if (history.length < 15) return false;
      const recent = history.slice(-15);
      const maxGz = Math.max(...recent.map((p) => Math.abs(p.gz)));
      const maxGx = Math.max(...recent.map((p) => Math.abs(p.gx)));
      const maxGy = Math.max(...recent.map((p) => Math.abs(p.gy)));
      // gz should dominate
      return maxGz > 100 && maxGz > maxGx * 2 && maxGz > maxGy * 2;
    },
  },
  {
    id: 'flip',
    title: 'Flip It',
    instruction: 'Slowly flip the board upside down. Which number changes the most?',
    emoji: '🔄',
    check: (_p, history) => {
      if (history.length < 20) return false;
      const recent = history.slice(-20);
      // az should go from ~+1 to ~-1 (gravity flip)
      const azValues = recent.map((p) => p.az);
      const minAz = Math.min(...azValues);
      const maxAz = Math.max(...azValues);
      return maxAz - minAz > 1.5;
    },
  },
];

// ============================================================================
// Axis Bar Component
// ============================================================================
function AxisBar({
  label,
  value,
  max,
  color,
  unit,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  unit: string;
}) {
  // Center-origin bar: negative values go left, positive go right
  const clamped = Math.max(-max, Math.min(max, value));
  const pct = (clamped / max) * 50; // -50% to +50% range
  const isHigh = Math.abs(value) > max * 0.5;

  return (
    <div className="flex items-center gap-3">
      <span className="text-slate-400 font-mono text-sm w-7 text-right font-bold">{label}</span>
      <div className="flex-1 bg-slate-700 rounded-full h-6 overflow-hidden relative">
        {/* Center line */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-500 z-10" />
        {/* Value bar — grows from center */}
        <div
          className={`${color} h-full absolute top-0 transition-all duration-75 rounded-full`}
          style={{
            left: pct >= 0 ? '50%' : `${50 + pct}%`,
            width: `${Math.abs(pct)}%`,
          }}
        />
        {/* Numeric label */}
        <div className="absolute inset-0 flex items-center justify-end pr-2 z-20">
          <span className={`text-xs font-mono font-bold ${isHigh ? 'text-white' : 'text-slate-400'}`}>
            {value >= 0 ? '+' : ''}{value.toFixed(2)}
          </span>
        </div>
      </div>
      <span className="text-slate-500 text-xs w-8">{unit}</span>
    </div>
  );
}

// ============================================================================
// Preview Page Component
// ============================================================================
interface PreviewPageProps {
  onReady: () => void;
}

export function PreviewPage({ onReady }: PreviewPageProps) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [packet, setPacket] = useState<SensorPacket | null>(null);
  const [completedChallenges, setCompletedChallenges] = useState<Set<string>>(new Set());
  const [activeChallengeIdx, setActiveChallengeIdx] = useState(0);
  const [justCompleted, setJustCompleted] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const historyRef = useRef<SensorPacket[]>([]);
  const streamingRef = useRef(false);

  // Refs for challenge state accessible inside the stream callback
  const completedRef = useRef<Set<string>>(new Set());
  const activeIdxRef = useRef(0);

  // Keep refs in sync with state
  useEffect(() => {
    completedRef.current = completedChallenges;
  }, [completedChallenges]);

  useEffect(() => {
    activeIdxRef.current = activeChallengeIdx;
  }, [activeChallengeIdx]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamingRef.current) {
        getBLEService().stopSensorStream().catch(() => {});
      }
    };
  }, []);

  const startStream = useCallback(async () => {
    try {
      setError(null);
      const ble = getBLEService();

      await ble.startSensorStream((p: SensorPacket) => {
        // Keep rolling history (last ~3 seconds at 25 Hz)
        historyRef.current.push(p);
        if (historyRef.current.length > 75) {
          historyRef.current = historyRef.current.slice(-75);
        }

        // Update display (~12 fps to keep it smooth)
        if (historyRef.current.length % 2 === 0) {
          setPacket({ ...p });
        }

        // Check active challenge inside the stream callback (external event)
        const idx = activeIdxRef.current;
        const challenge = CHALLENGES[idx];
        if (challenge && !completedRef.current.has(challenge.id)) {
          if (challenge.check(p, historyRef.current)) {
            setCompletedChallenges((prev) => new Set(prev).add(challenge.id));
            setJustCompleted(challenge.id);

            // Clear celebration after 2 seconds
            setTimeout(() => setJustCompleted(null), 2000);

            // Auto-advance to next incomplete challenge
            const nextIdx = CHALLENGES.findIndex(
              (c, i) => i > idx && !completedRef.current.has(c.id)
            );
            if (nextIdx >= 0) {
              setTimeout(() => setActiveChallengeIdx(nextIdx), 1500);
            }
          }
        }
      });

      streamingRef.current = true;
      setIsStreaming(true);
    } catch (err) {
      console.error('Sensor stream failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to start sensor stream');
    }
  }, []);

  const stopStream = useCallback(async () => {
    try {
      await getBLEService().stopSensorStream();
      streamingRef.current = false;
      setIsStreaming(false);
    } catch (err) {
      console.error('Stop stream failed:', err);
    }
  }, []);

  const allDone = completedChallenges.size >= CHALLENGES.length;

  return (
    <div className="p-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="card bg-gradient-to-br from-white to-slate-50 text-center mb-6">
        <div className="text-5xl mb-3">🔍</div>
        <h1 className="heading-md mb-2">What Does the AI See?</h1>
        <p className="text-slate-600 text-lg">
          Before we teach the AI, let's see the world through its eyes.
        </p>
        <p className="text-sm text-slate-400 mt-1">
          The AI has no camera, no ears — just 6 numbers, 25 times per second.
        </p>
      </div>

      {!isStreaming ? (
        /* ============= NOT STREAMING — START BUTTON ============= */
        <div className="max-w-lg mx-auto text-center space-y-6">
          <div className="card">
            <p className="text-slate-600 text-lg mb-6">
              Hold your Arduino in one hand. When you start, the 6 sensor numbers
              will appear live on screen. Move the board around and watch what happens!
            </p>
            <button
              onClick={startStream}
              className="btn-primary text-xl w-full py-4 shadow-xl shadow-primary-200"
            >
              👁️ Start Seeing Numbers
            </button>
            {error && (
              <div className="mt-4 bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-700 text-sm">
                {error}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ============= STREAMING — LIVE SENSOR VIEW ============= */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Live Numbers (the star of the show) */}
          <div className="lg:col-span-2 space-y-6">
            <div className="card bg-slate-900 text-white p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-xl font-bold text-white">Live Sensor Data</h2>
                  <p className="text-sm text-slate-400">
                    6 numbers, updating 25× per second — this is ALL the AI sees
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs text-emerald-400 font-bold">LIVE</span>
                </div>
              </div>

              {/* Accelerometer */}
              <div className="mb-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-sm bg-red-400" />
                  <span className="text-sm font-bold text-red-300">
                    Accelerometer — Movement & Gravity
                  </span>
                </div>
                <div className="space-y-2">
                  <AxisBar label="ax" value={packet?.ax ?? 0} max={2} color="bg-red-400" unit="g" />
                  <AxisBar label="ay" value={packet?.ay ?? 0} max={2} color="bg-red-400" unit="g" />
                  <AxisBar label="az" value={packet?.az ?? 0} max={2} color="bg-red-400" unit="g" />
                </div>
              </div>

              {/* Gyroscope */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-sm bg-blue-400" />
                  <span className="text-sm font-bold text-blue-300">
                    Gyroscope — Rotation Speed
                  </span>
                </div>
                <div className="space-y-2">
                  <AxisBar label="gx" value={packet?.gx ?? 0} max={250} color="bg-blue-400" unit="°/s" />
                  <AxisBar label="gy" value={packet?.gy ?? 0} max={250} color="bg-blue-400" unit="°/s" />
                  <AxisBar label="gz" value={packet?.gz ?? 0} max={250} color="bg-blue-400" unit="°/s" />
                </div>
              </div>

              {/* Raw numbers table */}
              <div className="mt-5 pt-4 border-t border-slate-700">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                    Raw Numbers
                  </span>
                </div>
                <div className="grid grid-cols-6 gap-2 font-mono text-center text-sm">
                  {['ax', 'ay', 'az', 'gx', 'gy', 'gz'].map((label, i) => (
                    <div key={label}>
                      <div className={`text-xs font-bold mb-1 ${i < 3 ? 'text-red-400' : 'text-blue-400'}`}>
                        {label}
                      </div>
                      <div className="bg-slate-800 rounded-lg py-2 px-1 text-white font-bold text-xs">
                        {packet
                          ? [packet.ax, packet.ay, packet.az, packet.gx, packet.gy, packet.gz][i].toFixed(2)
                          : '—'}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-3 text-center">
                  Every gesture is 100 rows of these 6 numbers = <strong className="text-slate-300">600 numbers</strong>
                </p>
              </div>
            </div>

            {/* Stop button */}
            <button
              onClick={stopStream}
              className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
            >
              ⏸ Pause sensor stream
            </button>
          </div>

          {/* Right Column: Challenges */}
          <div className="space-y-4">
            <h2 className="font-bold text-slate-700 text-lg px-2">
              Sensor Challenges
              <span className="text-sm font-normal text-slate-400 ml-2">
                {completedChallenges.size}/{CHALLENGES.length}
              </span>
            </h2>

            {CHALLENGES.map((challenge, idx) => {
              const done = completedChallenges.has(challenge.id);
              const active = idx === activeChallengeIdx && !done;
              const celebrating = justCompleted === challenge.id;

              return (
                <div
                  key={challenge.id}
                  onClick={() => {
                    if (!done) setActiveChallengeIdx(idx);
                  }}
                  className={`card p-4 transition-all duration-300 cursor-pointer ${
                    celebrating
                      ? 'ring-4 ring-emerald-300 bg-emerald-50 border-emerald-300 scale-105'
                      : active
                      ? 'ring-2 ring-primary-300 border-primary-400 shadow-lg bg-primary-50'
                      : done
                      ? 'bg-emerald-50 border-emerald-200 opacity-80'
                      : 'hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="text-2xl">
                      {celebrating ? '🎉' : done ? '✅' : challenge.emoji}
                    </div>
                    <div className="flex-1">
                      <h3 className={`font-bold ${done ? 'text-emerald-700' : 'text-slate-800'}`}>
                        {challenge.title}
                      </h3>
                      <p className={`text-sm mt-1 ${
                        active ? 'text-primary-700' : done ? 'text-emerald-600' : 'text-slate-500'
                      }`}>
                        {celebrating
                          ? 'Nice one! You got it! 🎉'
                          : done
                          ? 'Completed!'
                          : challenge.instruction}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Ready Button */}
            <div className={`sticky bottom-4 pt-4 transition-all duration-500 ${
              allDone ? 'opacity-100 translate-y-0' : 'opacity-60'
            }`}>
              <div className={`card shadow-lg ${
                allDone
                  ? 'bg-emerald-50 border-emerald-200 shadow-emerald-100/50 animate-bounce-slow'
                  : 'bg-slate-50 border-slate-200'
              }`}>
                <div className="text-center">
                  {allDone ? (
                    <>
                      <h2 className="text-xl font-bold text-emerald-800 mb-3">
                        🎉 All Challenges Done!
                      </h2>
                      <p className="text-sm text-emerald-600 mb-4">
                        You know what the AI sees. Now let's teach it!
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-slate-500 mb-4">
                      Complete the challenges, or skip ahead when you're ready
                    </p>
                  )}
                  <button
                    onClick={async () => {
                      await stopStream();
                      onReady();
                    }}
                    className={`w-full py-3 rounded-xl font-bold text-lg transition-colors ${
                      allDone
                        ? 'btn-success shadow-emerald-200'
                        : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                    }`}
                  >
                    {allDone ? "I'm Ready! Let's Collect Data →" : 'Skip to Collect Data →'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
