import { describe, expect, it } from 'vitest';
import type { GestureLabel, Sample } from '../types';
import {
  buildArenaBenchmarks,
  createArenaSubmission,
  evaluateArenaBenchmarks,
  mergeArenaSubmissions,
  rankArenaSubmissions,
} from './modelArenaService';

const LABELS: GestureLabel[] = [
  { id: 'wave', name: 'Wave', sampleCount: 0 },
  { id: 'fist', name: 'Fist', sampleCount: 0 },
];

function makeSample(
  id: string,
  label: string,
  timestamp: number,
  split: 'train' | 'test',
): Sample {
  return {
    id,
    label,
    timestamp,
    quality: 90,
    split,
    data: [[timestamp, 0, 0, 0, 0, 0]],
  };
}

describe('modelArenaService', () => {
  it('builds holdout and generic benchmark cases', () => {
    const trainingSamples = [
      makeSample('w1', 'wave', 1, 'train'),
      makeSample('w2', 'wave', 2, 'train'),
      makeSample('f1', 'fist', 3, 'train'),
    ];
    const testingSamples = [
      makeSample('w-test', 'wave', 10, 'test'),
      makeSample('f-test', 'fist', 11, 'test'),
    ];

    const benchmarks = buildArenaBenchmarks(LABELS, trainingSamples, testingSamples);
    const holdout = benchmarks.filter((b) => b.track === 'holdout');
    const generic = benchmarks.filter((b) => b.track === 'generic');

    expect(holdout).toHaveLength(2);
    expect(generic.length).toBeGreaterThan(0);
    expect(generic.some((b) => b.expectedLabelId === 'wave')).toBe(true);
  });

  it('evaluates arena score with weighted holdout/generic tracks', () => {
    const benchmarks = [
      {
        id: 'holdout:wave:0',
        track: 'holdout' as const,
        expectedLabelId: 'wave',
        expectedLabelName: 'Wave',
        data: [[1, 0, 0, 0, 0, 0]],
      },
      {
        id: 'holdout:fist:0',
        track: 'holdout' as const,
        expectedLabelId: 'fist',
        expectedLabelName: 'Fist',
        data: [[2, 0, 0, 0, 0, 0]],
      },
      {
        id: 'generic:wave:0',
        track: 'generic' as const,
        expectedLabelId: 'wave',
        expectedLabelName: 'Wave',
        data: [[3, 0, 0, 0, 0, 0]],
      },
    ];

    const report = evaluateArenaBenchmarks(benchmarks, LABELS, (data) => {
      const key = data[0][0];
      if (key === 1) return { prediction: 0, confidence: 0.9 };
      if (key === 2) return { prediction: 1, confidence: 0.85 };
      return { prediction: 1, confidence: 0.6 };
    });

    expect(report.total).toBe(3);
    expect(report.overallAccuracy).toBeCloseTo(0.667, 3);
    expect(report.generalizationAccuracy).toBe(1);
    expect(report.genericAccuracy).toBe(0);
    expect(report.arenaScore).toBeCloseTo(0.7, 3);
  });

  it('ranks and merges submissions deterministically', () => {
    const base = createArenaSubmission({
      studentName: 'A',
      projectName: 'P',
      labels: LABELS,
      result: {
        total: 5,
        correct: 4,
        overallAccuracy: 0.8,
        generalizationAccuracy: 0.8,
        genericAccuracy: 0.8,
        arenaScore: 0.8,
        trackScores: [],
        labelScores: [],
      },
    });

    const lower = {
      ...base,
      id: 'x-low',
      studentName: 'B',
      arenaScore: 0.7,
      generalizationAccuracy: 0.7,
      createdAt: base.createdAt + 1,
    };

    const higher = {
      ...base,
      id: 'x-high',
      studentName: 'C',
      arenaScore: 0.95,
      generalizationAccuracy: 0.9,
      createdAt: base.createdAt + 2,
    };

    const ranked = rankArenaSubmissions([lower, higher, base]);
    expect(ranked[0].id).toBe('x-high');

    const merged = mergeArenaSubmissions([lower], [higher, lower]);
    expect(merged.map((s) => s.id)).toEqual(['x-high', 'x-low']);
  });
});
