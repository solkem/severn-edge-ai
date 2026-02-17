/**
 * Preview Page — "What Does the AI See?"
 *
 * A dedicated sensor exploration stage before data collection.
 * Students see live sensor numbers, build intuition about what
 * the 6 values mean, and complete mini-challenges before moving on.
 *
 * DESIGN: Challenges are STUDENT-DRIVEN. The student explores freely,
 * observes the numbers, and clicks "Got it!" when they feel they
 * understand. No auto-detection, no rushing.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { getBLEService } from '../services/bleService';
import { SensorPacket } from '../types/ble';

// ============================================================================
// Sensor Challenges — student-paced, observation-based
// ============================================================================
interface Challenge {
  id: string;
  title: string;
  instruction: string;
  hint: string;
  emoji: string;
}

const CHALLENGES: Challenge[] = [
  {
    id: 'wave',
    title: 'Wave It',
    instruction: 'Wave the board side to side. Which numbers change the most?',
    hint: 'Look at the red bars (ax, ay). Do they swing when you wave?',
    emoji: '👋',
  },
  {
    id: 'still',
    title: 'Hold Still',
    instruction: 'Hold the board flat and still. What do you notice about az?',
    hint: 'Even when still, gravity is there: face-up az stays near +1.0g.',
    emoji: '🧊',
  },
  {
    id: 'spin',
    title: 'Find gz',
    instruction: 'Spin the board like a steering wheel. Which BLUE bar moves?',
    hint: 'When held flat, spinning like a steering wheel mostly changes gz.',
    emoji: '🎡',
  },
  {
    id: 'flip',
    title: 'Flip It',
    instruction: 'Slowly flip the board upside down. Watch az carefully!',
    hint: 'If you start face-up, az usually goes from +1.0 to -1.0 as gravity reverses.',
    emoji: '🔄',
  },
];

// ============================================================================
// Axis Bar Component — center-origin, shows direction
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
  const clamped = Math.max(-max, Math.min(max, value));
  const pct = (clamped / max) * 50;
  const isHigh = Math.abs(value) > max * 0.5;

  return (
    <div className="flex items-center gap-3">
      <span className="text-slate-400 font-mono text-sm w-7 text-right font-bold">{label}</span>
      <div className="flex-1 bg-slate-700 rounded-full h-6 overflow-hidden relative">
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-500 z-10" />
        <div
          className={`${color} h-full absolute top-0 transition-all duration-75 rounded-full`}
          style={{
            left: pct >= 0 ? '50%' : `${50 + pct}%`,
            width: `${Math.abs(pct)}%`,
          }}
        />
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
  const [showHint, setShowHint] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [packetCount, setPacketCount] = useState(0);

  const streamingRef = useRef(false);

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
        setPacket({ ...p });
        setPacketCount((c) => c + 1);
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

  // Student manually marks a challenge as done
  const markDone = useCallback((challengeId: string) => {
    setCompletedChallenges((prev) => new Set(prev).add(challengeId));
    setShowHint(false);

    // Auto-advance to next incomplete challenge after a brief moment
    setTimeout(() => {
      const nextIdx = CHALLENGES.findIndex(
        (c, i) => i > CHALLENGES.findIndex((ch) => ch.id === challengeId) &&
          !completedChallenges.has(c.id) && c.id !== challengeId
      );
      if (nextIdx >= 0) {
        setActiveChallengeIdx(nextIdx);
      }
    }, 500);
  }, [completedChallenges]);

  const allDone = completedChallenges.size >= CHALLENGES.length;
  const activeChallenge = CHALLENGES[activeChallengeIdx];

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
                <div className="flex items-center gap-3">
                  <div className="bg-slate-800 rounded-lg px-2 py-1 text-xs font-mono text-amber-300">
                    Packets: {packetCount}
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs text-emerald-400 font-bold">LIVE</span>
                  </div>
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
                <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                  Raw Numbers
                </span>
                <div className="grid grid-cols-6 gap-2 font-mono text-center text-sm mt-2">
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

          {/* Right Column: Challenges — student-paced */}
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

              return (
                <div
                  key={challenge.id}
                  onClick={() => {
                    if (!done) {
                      setActiveChallengeIdx(idx);
                      setShowHint(false);
                    }
                  }}
                  className={`card p-4 transition-all duration-300 cursor-pointer ${
                    active
                      ? 'ring-2 ring-primary-300 border-primary-400 shadow-lg bg-primary-50'
                      : done
                      ? 'bg-emerald-50 border-emerald-200'
                      : 'hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="text-2xl">
                      {done ? '✅' : challenge.emoji}
                    </div>
                    <div className="flex-1">
                      <h3 className={`font-bold ${done ? 'text-emerald-700' : 'text-slate-800'}`}>
                        {challenge.title}
                      </h3>
                      <p className={`text-sm mt-1 ${
                        active ? 'text-primary-700' : done ? 'text-emerald-600' : 'text-slate-500'
                      }`}>
                        {done ? 'Completed!' : challenge.instruction}
                      </p>

                      {/* Active challenge: show hint toggle and "Got it!" button */}
                      {active && (
                        <div className="mt-3 space-y-2">
                          {/* Hint */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowHint(!showHint);
                            }}
                            className="text-xs text-primary-500 hover:text-primary-700 transition-colors"
                          >
                            {showHint ? '▼ Hide hint' : '▶ Need a hint?'}
                          </button>
                          {showHint && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                              💡 {challenge.hint}
                            </div>
                          )}

                          {/* "Got it!" button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              markDone(challenge.id);
                            }}
                            className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl transition-colors text-sm shadow-sm"
                          >
                            ✓ Got it! I see what happens
                          </button>
                        </div>
                      )}
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
                  ? 'bg-emerald-50 border-emerald-200 shadow-emerald-100/50'
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
                        : 'btn-secondary bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
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
