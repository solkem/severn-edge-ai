import { describe, expect, it } from 'vitest';
import type { GestureLabel } from '../types';
import type { InferenceFrame } from './captureEvaluationService';
import {
  buildGuidedTestTargets,
  evaluateGuidedInterval,
  summarizeGuidedIntervals,
  type GuidedIntervalConfig,
} from './guidedGestureTestingService';

const TWO_LABELS: GestureLabel[] = [
  { id: 'wave', name: 'Wave', sampleCount: 0 },
  { id: 'shake', name: 'Shake', sampleCount: 0 },
];

const SINGLE_LABEL: GestureLabel[] = [
  { id: 'wave', name: 'Wave', sampleCount: 0 },
];

const LABELS_WITH_EXPLICIT_IDLE: GestureLabel[] = [
  { id: 'wave', name: 'Wave', sampleCount: 0 },
  { id: '__idle__', name: 'Idle', sampleCount: 0 },
];

const LABELS_WITH_NON_CANONICAL_IDLE_ID: GestureLabel[] = [
  { id: 'wave', name: 'Wave', sampleCount: 0 },
  { id: 'idle-manual', name: 'Idle', sampleCount: 0 },
];

const CONFIG: GuidedIntervalConfig = {
  minFrames: 4,
  idleConfidenceThreshold: 0.55,
};

function frame(timestamp: number, prediction: number, confidence: number): InferenceFrame {
  return {
    timestamp,
    prediction,
    confidence,
  };
}

describe('guidedGestureTestingService', () => {
  it('builds gesture-only targets for multi-gesture projects', () => {
    const targets = buildGuidedTestTargets(TWO_LABELS);

    expect(targets).toHaveLength(2);
    expect(targets.map((target) => target.name)).toEqual(['Wave', 'Shake']);
    expect(targets.some((target) => target.kind === 'idle')).toBe(false);
  });

  it('adds Idle target for single-gesture projects', () => {
    const targets = buildGuidedTestTargets(SINGLE_LABEL);

    expect(targets).toHaveLength(2);
    expect(targets[0]).toMatchObject({ name: 'Wave', kind: 'gesture' });
    expect(targets[1]).toMatchObject({ name: 'Idle', kind: 'idle' });
  });

  it('uses an explicit Idle label without adding a duplicate target', () => {
    const targets = buildGuidedTestTargets(LABELS_WITH_EXPLICIT_IDLE);

    expect(targets).toHaveLength(2);
    expect(targets.map((target) => target.name)).toEqual(['Wave', 'Idle']);
    expect(targets[1]).toMatchObject({ name: 'Idle', kind: 'idle', labelIndex: 1 });
  });

  it('treats Idle by label name even when idle label id is non-canonical', () => {
    const targets = buildGuidedTestTargets(LABELS_WITH_NON_CANONICAL_IDLE_ID);
    const waveTarget = targets[0];
    const frames: InferenceFrame[] = [
      frame(1100, 1, 0.94),
      frame(1200, 1, 0.95),
      frame(1300, 1, 0.93),
      frame(1400, 0, 0.9),
      frame(1500, 0, 0.88),
      frame(1600, 0, 0.89),
      frame(1700, 1, 0.96),
    ];

    const result = evaluateGuidedInterval(
      frames,
      LABELS_WITH_NON_CANONICAL_IDLE_ID,
      waveTarget,
      1,
      1000,
      2000,
      CONFIG,
    );

    expect(result.predictedLabelName).toBe('Wave');
    expect(result.isCorrect).toBe(true);
    expect(result.idleRatio).toBeGreaterThan(0);
  });

  it('scores a gesture interval as correct when that gesture wins', () => {
    const targets = buildGuidedTestTargets(TWO_LABELS);
    const waveTarget = targets[0];
    const frames: InferenceFrame[] = [
      frame(1100, 0, 0.9),
      frame(1300, 0, 0.88),
      frame(1500, 0, 0.91),
      frame(1700, 1, 0.8),
      frame(1900, 0, 0.87),
    ];

    const result = evaluateGuidedInterval(
      frames,
      TWO_LABELS,
      waveTarget,
      1,
      1000,
      2000,
      CONFIG,
    );

    expect(result.isCorrect).toBe(true);
    expect(result.predictedLabelName).toBe('Wave');
    expect(result.capturedFrameCount).toBe(5);
  });

  it('scores a gesture interval as incorrect when Idle wins the interval vote', () => {
    const targets = buildGuidedTestTargets(TWO_LABELS);
    const waveTarget = targets[0];
    const frames: InferenceFrame[] = [
      frame(1100, 0, 0.9),
      frame(1300, 0, 0.86),
      frame(1450, 1, 0.45),
      frame(1550, 1, 0.43),
      frame(1650, 0, 0.41),
      frame(1750, 1, 0.4),
      frame(1850, 1, 0.39),
    ];

    const result = evaluateGuidedInterval(
      frames,
      TWO_LABELS,
      waveTarget,
      1,
      1000,
      2000,
      CONFIG,
    );

    expect(result.predictedLabelName).toBe('Idle');
    expect(result.isCorrect).toBe(false);
    expect(result.idleRatio).toBeGreaterThan(0.5);
  });

  it('can score gesture intervals from active frames even when idle frames are present', () => {
    const targets = buildGuidedTestTargets(TWO_LABELS);
    const waveTarget = targets[0];
    const frames: InferenceFrame[] = [
      frame(1100, 0, 0.91),
      frame(1200, 0, 0.88),
      frame(1300, 0, 0.9),
      frame(1400, 1, 0.45),
      frame(1500, 1, 0.4),
      frame(1600, 1, 0.42),
      frame(1700, 1, 0.43),
    ];

    const result = evaluateGuidedInterval(
      frames,
      TWO_LABELS,
      waveTarget,
      1,
      1000,
      2000,
      CONFIG,
    );

    expect(result.predictedLabelName).toBe('Wave');
    expect(result.isCorrect).toBe(true);
    expect(result.idleRatio).toBeGreaterThan(0.5);
  });

  it('scores Idle target correctly when interval is mostly idle', () => {
    const targets = buildGuidedTestTargets(SINGLE_LABEL);
    const idleTarget = targets[1];
    const idleClassIndex = SINGLE_LABEL.length;
    const frames: InferenceFrame[] = [
      frame(1100, idleClassIndex, 0.52),
      frame(1300, idleClassIndex, 0.49),
      frame(1500, idleClassIndex, 0.53),
      frame(1700, 0, 0.82),
      frame(1900, idleClassIndex, 0.5),
      frame(1950, idleClassIndex, 0.51),
    ];

    const result = evaluateGuidedInterval(
      frames,
      SINGLE_LABEL,
      idleTarget,
      1,
      1000,
      2000,
      CONFIG,
    );

    expect(result.predictedLabelName).toBe('Idle');
    expect(result.isCorrect).toBe(true);
    expect(result.idleRatio).toBeGreaterThan(0.5);
  });

  it('summarizes per-target and overall success/failure percentages', () => {
    const targets = buildGuidedTestTargets(TWO_LABELS);
    const intervals = [
      {
        targetId: 'wave',
        targetName: 'Wave',
        targetKind: 'gesture' as const,
        intervalIndex: 1,
        windowStartMs: 0,
        windowEndMs: 4000,
        predictedLabelName: 'Wave',
        support: 0.8,
        avgConfidence: 0.9,
        idleRatio: 0,
        capturedFrameCount: 10,
        isCorrect: true,
        note: '',
      },
      {
        targetId: 'wave',
        targetName: 'Wave',
        targetKind: 'gesture' as const,
        intervalIndex: 2,
        windowStartMs: 4000,
        windowEndMs: 8000,
        predictedLabelName: 'Shake',
        support: 0.7,
        avgConfidence: 0.84,
        idleRatio: 0,
        capturedFrameCount: 10,
        isCorrect: false,
        note: '',
      },
      {
        targetId: 'shake',
        targetName: 'Shake',
        targetKind: 'gesture' as const,
        intervalIndex: 1,
        windowStartMs: 8000,
        windowEndMs: 12000,
        predictedLabelName: 'Shake',
        support: 0.9,
        avgConfidence: 0.92,
        idleRatio: 0,
        capturedFrameCount: 10,
        isCorrect: true,
        note: '',
      },
    ];

    const summary = summarizeGuidedIntervals(targets, intervals);

    expect(summary.totalIntervals).toBe(3);
    expect(summary.totalCorrectIntervals).toBe(2);
    expect(summary.overallSuccessRate).toBeCloseTo(2 / 3, 5);
    expect(summary.overallFailureRate).toBeCloseTo(1 / 3, 5);
    expect(summary.targetSummaries.find((row) => row.targetId === 'wave')?.successRate).toBe(0.5);
    expect(summary.targetSummaries.find((row) => row.targetId === 'shake')?.successRate).toBe(1);
  });
});
