import { describe, expect, it } from 'vitest';
import type { GestureLabel } from '../types';
import {
  evaluateCaptureWindow,
  type CaptureEvaluationConfig,
  type InferenceFrame,
} from './captureEvaluationService';

const LABELS: GestureLabel[] = [
  { id: 'wave', name: 'Wave', sampleCount: 0 },
  { id: 'fist', name: 'Fist', sampleCount: 0 },
];

const CONFIG: CaptureEvaluationConfig = {
  minFrames: 4,
  idleConfidenceThreshold: 0.55,
  supportThreshold: 0.6,
  minConfidence: 0.7,
  idleRatioFailureThreshold: 0.7,
};

function frame(
  timestamp: number,
  prediction: number,
  confidence: number,
): InferenceFrame {
  return { timestamp, prediction, confidence };
}

describe('captureEvaluationService', () => {
  it('returns invalid_target when target index is out of bounds', () => {
    const result = evaluateCaptureWindow([], LABELS, 99, 1000, 2000, CONFIG);

    expect(result.code).toBe('invalid_target');
    expect(result.countAttempt).toBe(false);
    expect(result.isSuccess).toBe(false);
  });

  it('returns not_enough_frames when capture window has too few frames', () => {
    const frames = [
      frame(1100, 0, 0.9),
      frame(1200, 0, 0.9),
      frame(1300, 0, 0.9),
    ];

    const result = evaluateCaptureWindow(frames, LABELS, 0, 1000, 2000, CONFIG);

    expect(result.code).toBe('not_enough_frames');
    expect(result.countAttempt).toBe(false);
    expect(result.capturedFrameCount).toBe(3);
  });

  it('returns success when target dominates with strong confidence', () => {
    const frames = [
      frame(1100, 0, 0.9),
      frame(1200, 0, 0.85),
      frame(1300, 0, 0.88),
      frame(1400, 0, 0.91),
      frame(1500, 1, 0.8),
    ];

    const result = evaluateCaptureWindow(frames, LABELS, 0, 1000, 2000, CONFIG);

    expect(result.code).toBe('success');
    expect(result.countAttempt).toBe(true);
    expect(result.isSuccess).toBe(true);
    expect(result.support).toBeCloseTo(0.8, 3);
  });

  it('returns mostly_idle when most frames are idle/low-motion', () => {
    const idleClassIndex = LABELS.length;
    const frames = [
      frame(1100, idleClassIndex, 0.5),
      frame(1200, idleClassIndex, 0.5),
      frame(1300, idleClassIndex, 0.5),
      frame(1400, 0, 0.8),
      frame(1500, idleClassIndex, 0.5),
      frame(1600, idleClassIndex, 0.5),
    ];

    const result = evaluateCaptureWindow(frames, LABELS, 0, 1000, 2000, CONFIG);

    expect(result.code).toBe('mostly_idle');
    expect(result.countAttempt).toBe(true);
    expect(result.isSuccess).toBe(false);
    expect(result.idleRatio).toBeGreaterThanOrEqual(CONFIG.idleRatioFailureThreshold);
  });

  it('returns wrong_gesture when another class wins the window', () => {
    const frames = [
      frame(1100, 1, 0.85),
      frame(1200, 1, 0.82),
      frame(1300, 1, 0.8),
      frame(1400, 0, 0.8),
      frame(1500, 1, 0.9),
    ];

    const result = evaluateCaptureWindow(frames, LABELS, 0, 1000, 2000, CONFIG);

    expect(result.code).toBe('wrong_gesture');
    expect(result.isSuccess).toBe(false);
    expect(result.predictedLabelName).toBe('Fist');
  });

  it('returns low_support when correct class wins but not consistently enough', () => {
    const idleClassIndex = LABELS.length;
    const frames = [
      frame(1100, 0, 0.8),
      frame(1200, 0, 0.83),
      frame(1300, 0, 0.79),
      frame(1400, 1, 0.8),
      frame(1500, 1, 0.78),
      frame(1600, idleClassIndex, 0.5),
    ];

    const result = evaluateCaptureWindow(frames, LABELS, 0, 1000, 2000, CONFIG);

    expect(result.code).toBe('low_support');
    expect(result.isSuccess).toBe(false);
    expect(result.support).toBeLessThan(CONFIG.supportThreshold);
  });

  it('returns low_confidence when support is enough but confidence is weak', () => {
    const frames = [
      frame(1100, 0, 0.6),
      frame(1200, 0, 0.62),
      frame(1300, 0, 0.59),
      frame(1400, 0, 0.58),
      frame(1500, 1, 0.8),
    ];

    const result = evaluateCaptureWindow(frames, LABELS, 0, 1000, 2000, CONFIG);

    expect(result.code).toBe('low_confidence');
    expect(result.isSuccess).toBe(false);
    expect(result.support).toBeGreaterThanOrEqual(CONFIG.supportThreshold);
    expect(result.avgConfidence).toBeLessThan(CONFIG.minConfidence);
  });
});
