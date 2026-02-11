/**
 * Tests for TrainingService correctness
 *
 * Bug (Critical, downstream): After modelExportService.extractSimpleNNWeights
 *   disposes model tensors, predict() and progressive training break. These
 *   tests verify the training service survives the full lifecycle:
 *     create → train → export → predict → train again
 */

import { describe, it, expect } from 'vitest';
import { TrainingService } from './trainingService';
import { extractSimpleNNWeights } from './modelExportService';
import type { Sample, GestureLabel } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeLabels(names: string[]): GestureLabel[] {
  return names.map((name, idx) => ({
    id: `label-${idx}`,
    name,
    sampleCount: 5,
  }));
}

function makeSample(labelId: string, length: number = 100): Sample {
  const data: number[][] = [];
  for (let i = 0; i < length; i++) {
    data.push([
      Math.random() * 2 - 1,   // ax
      Math.random() * 2 - 1,   // ay
      Math.random() * 2 - 1,   // az
      Math.random() * 100 - 50, // gx
      Math.random() * 100 - 50, // gy
      Math.random() * 100 - 50, // gz
    ]);
  }
  return {
    id: `sample-${Date.now()}-${Math.random()}`,
    label: labelId,
    data,
    timestamp: Date.now(),
    quality: 100,
  };
}

function makeSamples(labels: GestureLabel[], perLabel: number = 5): Sample[] {
  const samples: Sample[] = [];
  for (const label of labels) {
    for (let i = 0; i < perLabel; i++) {
      samples.push(makeSample(label.id));
    }
  }
  return samples;
}

// ---------------------------------------------------------------------------
// Full lifecycle: train → export → predict → retrain
// ---------------------------------------------------------------------------
describe('TrainingService lifecycle', () => {
  it('predict should work after training', async () => {
    const service = new TrainingService();
    const labels = makeLabels(['Wave', 'Shake']);
    const samples = makeSamples(labels, 5);

    await service.train(samples, labels, () => {});

    // predict should not throw
    const input = samples[0].data;
    const result = service.predict(input);
    expect(result.prediction).toBeGreaterThanOrEqual(0);
    expect(result.prediction).toBeLessThan(labels.length);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  }, 30000);

  it('predict should still work after extractSimpleNNWeights is called', async () => {
    const service = new TrainingService();
    const labels = makeLabels(['Wave', 'Shake']);
    const samples = makeSamples(labels, 5);

    await service.train(samples, labels, () => {});

    const model = service.getModel()!;
    // This is the call that currently breaks the model
    extractSimpleNNWeights(model);

    // predict should still work — this FAILS until the dispose bug is fixed
    expect(() => service.predict(samples[0].data)).not.toThrow();

    const result = service.predict(samples[0].data);
    expect(result.prediction).toBeGreaterThanOrEqual(0);
  }, 30000);

  it('progressive training should work after weight extraction', async () => {
    const service = new TrainingService();
    const labels = makeLabels(['Wave', 'Shake']);
    const samples = makeSamples(labels, 5);

    // First training round
    await service.train(samples, labels, () => {});

    // Extract weights (triggers the dispose bug)
    const model = service.getModel()!;
    extractSimpleNNWeights(model);

    // Second training round — should not throw
    const result = await service.train(samples, labels, () => {});
    expect(result.accuracy).toBeGreaterThanOrEqual(0);
    expect(result.accuracy).toBeLessThanOrEqual(1);
  }, 60000);
});

// ---------------------------------------------------------------------------
// Edge cases: sample padding and truncation
// ---------------------------------------------------------------------------
describe('TrainingService — sample size handling', () => {
  it('should handle samples shorter than WINDOW_SIZE (pad with zeros)', async () => {
    const service = new TrainingService();
    const labels = makeLabels(['A', 'B']);

    // Create short samples (50 instead of 100)
    const samples: Sample[] = [];
    for (const label of labels) {
      for (let i = 0; i < 5; i++) {
        samples.push(makeSample(label.id, 50));
      }
    }

    // Should not throw
    const result = await service.train(samples, labels, () => {});
    expect(result.accuracy).toBeGreaterThanOrEqual(0);
  }, 30000);

  it('should handle samples longer than WINDOW_SIZE (truncate)', async () => {
    const service = new TrainingService();
    const labels = makeLabels(['A', 'B']);

    // Create long samples (200 instead of 100)
    const samples: Sample[] = [];
    for (const label of labels) {
      for (let i = 0; i < 5; i++) {
        samples.push(makeSample(label.id, 200));
      }
    }

    const result = await service.train(samples, labels, () => {});
    expect(result.accuracy).toBeGreaterThanOrEqual(0);
  }, 30000);

  it('predict should handle short input by padding', () => {
    const service = new TrainingService();
    service.createModel(2);

    // 10 samples instead of 100
    const shortInput: number[][] = Array.from({ length: 10 }, () => [0, 0, 0, 0, 0, 0]);
    const result = service.predict(shortInput);
    expect(result.prediction).toBeGreaterThanOrEqual(0);
  });
});
