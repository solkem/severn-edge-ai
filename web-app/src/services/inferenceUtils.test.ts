import { describe, expect, it } from 'vitest';
import {
  applyMotionHeuristic,
  estimateMotionScore,
  MOTION_THRESHOLD,
  normalizeConfidence,
} from './inferenceUtils';

describe('inferenceUtils motion heuristic', () => {
  it('forces idle for static low-motion frames when model confidence is low', () => {
    const idleClassIndex = 2;
    const staticFrames = Array.from({ length: 100 }, () => [0, 0, 1, 0, 0, 0]);

    const result = applyMotionHeuristic(
      staticFrames,
      { prediction: 0, confidence: 0.4 },
      idleClassIndex,
    );

    expect(estimateMotionScore(staticFrames)).toBeLessThan(MOTION_THRESHOLD);
    expect(result.prediction).toBe(idleClassIndex);
    expect(result.confidence).toBeGreaterThan(0.7);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('preserves model output for high-motion frames', () => {
    const idleClassIndex = 2;
    const dynamicFrames = Array.from({ length: 100 }, (_, i) => [
      Math.sin(i * 0.2),
      Math.cos(i * 0.15),
      Math.sin(i * 0.1),
      90 + i,
      -50 + i * 0.5,
      20 + i * 0.25,
    ]);

    const original = { prediction: 1, confidence: 0.84 };
    const result = applyMotionHeuristic(dynamicFrames, original, idleClassIndex);

    expect(estimateMotionScore(dynamicFrames)).toBeGreaterThanOrEqual(MOTION_THRESHOLD);
    expect(result).toEqual(original);
  });
});

describe('inferenceUtils confidence normalization', () => {
  it('normalizes arduino confidence from 0-100 to 0-1', () => {
    expect(normalizeConfidence(75, 'arduino')).toBe(0.75);
    expect(normalizeConfidence(0, 'arduino')).toBe(0);
    expect(normalizeConfidence(100, 'arduino')).toBe(1);
  });

  it('keeps browser confidence in 0-1 scale', () => {
    expect(normalizeConfidence(0.75, 'browser')).toBe(0.75);
    expect(normalizeConfidence(0, 'browser')).toBe(0);
    expect(normalizeConfidence(1, 'browser')).toBe(1);
  });
});
