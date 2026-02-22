import { describe, expect, it } from 'vitest';
import type { GestureLabel, Sample } from '../types';
import {
  createRecommendedTestSplit,
  evaluateModelOnSamples,
  splitSamplesByDataset,
} from './modelTestingService';

const LABELS: GestureLabel[] = [
  { id: 'wave', name: 'Wave', sampleCount: 0 },
  { id: 'fist', name: 'Fist', sampleCount: 0 },
];

function makeSample(
  id: string,
  label: string,
  timestamp: number,
  split?: 'train' | 'test',
): Sample {
  return {
    id,
    label,
    timestamp,
    quality: 90,
    data: [[timestamp, 0, 0, 0, 0, 0]],
    split,
  };
}

describe('modelTestingService', () => {
  it('treats undefined split as training data', () => {
    const samples: Sample[] = [
      makeSample('s1', 'wave', 1),
      makeSample('s2', 'wave', 2, 'test'),
    ];

    const result = splitSamplesByDataset(samples);
    expect(result.trainingSamples.map((s) => s.id)).toEqual(['s1']);
    expect(result.testingSamples.map((s) => s.id)).toEqual(['s2']);
  });

  it('creates recommended stratified test split while keeping at least 3 training samples per class', () => {
    const samples: Sample[] = [
      ...Array.from({ length: 10 }, (_, i) => makeSample(`wave-${i}`, 'wave', i + 1)),
      ...Array.from({ length: 4 }, (_, i) => makeSample(`fist-${i}`, 'fist', 100 + i)),
    ];

    const split = createRecommendedTestSplit(samples, LABELS, 0.2);
    const waveTest = split.filter((s) => s.label === 'wave' && s.split === 'test');
    const fistTest = split.filter((s) => s.label === 'fist' && s.split === 'test');

    expect(waveTest).toHaveLength(2);
    expect(waveTest.map((s) => s.id)).toEqual(['wave-8', 'wave-9']);
    expect(fistTest).toHaveLength(0);
  });

  it('computes confusion matrix and per-label metrics from classify-all predictions', () => {
    const samples: Sample[] = [
      makeSample('a1', 'wave', 1, 'test'),
      makeSample('a2', 'wave', 2, 'test'),
      makeSample('b1', 'fist', 3, 'test'),
      makeSample('b2', 'fist', 4, 'test'),
    ];

    const lookup: Record<number, { prediction: number; confidence: number }> = {
      1: { prediction: 0, confidence: 0.9 }, // correct
      2: { prediction: 1, confidence: 0.6 }, // wrong
      3: { prediction: 1, confidence: 0.85 }, // correct
      4: { prediction: 9, confidence: 0.2 }, // invalid -> unknown
    };

    const report = evaluateModelOnSamples(samples, LABELS, (sampleData) => {
      const key = sampleData[0]?.[0] ?? -1;
      return lookup[key] ?? { prediction: 0, confidence: 0 };
    });

    expect(report.totalSamples).toBe(4);
    expect(report.correctSamples).toBe(2);
    expect(report.accuracy).toBe(0.5);
    expect(report.confusionMatrix).toEqual([
      [1, 1],
      [0, 1],
    ]);

    const waveMetrics = report.labelMetrics.find((m) => m.labelId === 'wave');
    const fistMetrics = report.labelMetrics.find((m) => m.labelId === 'fist');
    expect(waveMetrics).toMatchObject({
      support: 2,
      tp: 1,
      fp: 0,
      fn: 1,
      precision: 1,
      recall: 0.5,
    });
    expect(fistMetrics).toMatchObject({
      support: 2,
      tp: 1,
      fp: 1,
      fn: 1,
      precision: 0.5,
      recall: 0.5,
    });
  });
});
