/**
 * Tests for model export correctness bugs
 *
 * Bug 1 (Critical): extractSimpleNNWeights disposes the model's own weight
 *   tensors. After extraction, the model is broken — predict() and fit()
 *   produce garbage or crash.
 *
 * Bug 2 (Warning): CRC32 table is regenerated on every call (perf, not
 *   correctness — but we verify CRC correctness here for completeness).
 */

import { describe, it, expect } from 'vitest';
import * as tf from '@tensorflow/tfjs';
import {
  extractSimpleNNWeights,
  calculateCrc32,
} from './modelExportService';
import { NN_HIDDEN_SIZE } from '../config/constants';

// ---------------------------------------------------------------------------
// Helper: create a small SimpleNN-compatible model
// ---------------------------------------------------------------------------
function createTestModel(numClasses: number = 3): tf.LayersModel {
  const model = tf.sequential();
  model.add(tf.layers.flatten({ inputShape: [100, 6], name: 'flatten' }));
  model.add(
    tf.layers.dense({
      units: NN_HIDDEN_SIZE,
      activation: 'relu',
      name: 'hidden',
    })
  );
  model.add(
    tf.layers.dense({
      units: numClasses,
      activation: 'softmax',
      name: 'output',
    })
  );
  model.compile({
    optimizer: 'adam',
    loss: 'categoricalCrossentropy',
  });
  return model;
}

// ---------------------------------------------------------------------------
// Bug 1: Tensor disposal breaks the model
// ---------------------------------------------------------------------------
describe('extractSimpleNNWeights — tensor lifecycle', () => {
  it('should not dispose the model weight tensors', () => {
    const model = createTestModel(3);

    // Snapshot the hidden layer's weight tensor id before extraction
    const hiddenLayer = model.getLayer('hidden');
    const [weightsBefore] = hiddenLayer.getWeights();
    const weightDataBefore = weightsBefore.dataSync().slice(); // copy values

    // This is the call under test
    extractSimpleNNWeights(model);

    // After extraction, the model's weights should still be intact
    const [weightsAfter] = hiddenLayer.getWeights();

    // If the tensors were disposed, dataSync() will throw:
    //   "Tensor is disposed."
    expect(() => weightsAfter.dataSync()).not.toThrow();

    // Values should be identical (extraction is read-only)
    const weightDataAfter = weightsAfter.dataSync();
    expect(Array.from(weightDataAfter)).toEqual(Array.from(weightDataBefore));

    model.dispose();
  });

  it('model should still produce valid predictions after weight extraction', () => {
    const model = createTestModel(3);

    // Run prediction before extraction
    const input = tf.randomNormal([1, 100, 6]);
    const predBefore = (model.predict(input) as tf.Tensor).dataSync().slice();

    // Extract weights (the buggy code disposes tensors here)
    extractSimpleNNWeights(model);

    // Run prediction after extraction — should produce same results
    const predAfter = (model.predict(input) as tf.Tensor).dataSync().slice();

    expect(predAfter.length).toBe(predBefore.length);
    for (let i = 0; i < predBefore.length; i++) {
      expect(predAfter[i]).toBeCloseTo(predBefore[i], 5);
    }

    input.dispose();
    model.dispose();
  });

  it('model should still be trainable after weight extraction', async () => {
    const model = createTestModel(2);

    extractSimpleNNWeights(model);

    // Attempt a single training step — should not throw
    const xs = tf.randomNormal([4, 100, 6]);
    const ys = tf.oneHot(tf.tensor1d([0, 1, 0, 1], 'int32'), 2);

    await expect(
      model.fit(xs, ys, { epochs: 1 })
    ).resolves.toBeDefined();

    xs.dispose();
    ys.dispose();
    model.dispose();
  });
});

// ---------------------------------------------------------------------------
// Weight transpose correctness
// ---------------------------------------------------------------------------
describe('extractSimpleNNWeights — transpose correctness', () => {
  it('should transpose hidden weights from [inputSize, hiddenSize] to [hiddenSize, inputSize]', () => {
    const model = createTestModel(3);
    const weights = extractSimpleNNWeights(model);

    // TF.js hidden layer: shape [600, 32]
    // Arduino format: shape [32, 600] (row-major)
    const hiddenLayer = model.getLayer('hidden');
    const [tfWeights] = hiddenLayer.getWeights();
    const tfData = tfWeights.arraySync() as number[][];

    // Verify: Arduino weight[h][i] === TF weight[i][h]
    for (let h = 0; h < weights.hiddenSize; h++) {
      for (let i = 0; i < weights.inputSize; i++) {
        const arduinoVal = weights.hiddenWeights[h * weights.inputSize + i];
        const tfVal = tfData[i][h];
        expect(arduinoVal).toBeCloseTo(tfVal, 5);
      }
    }

    model.dispose();
  });
});

// ---------------------------------------------------------------------------
// CRC32 correctness
// ---------------------------------------------------------------------------
describe('calculateCrc32', () => {
  it('should match known CRC32 for empty input', () => {
    const result = calculateCrc32(new Uint8Array([]));
    expect(result).toBe(0x00000000);
  });

  it('should match known CRC32 for "123456789"', () => {
    const data = new TextEncoder().encode('123456789');
    const result = calculateCrc32(data);
    // IEEE 802.3 CRC32 of "123456789" = 0xCBF43926
    expect(result).toBe(0xCBF43926);
  });

  it('should be deterministic across multiple calls', () => {
    const data = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
    const a = calculateCrc32(data);
    const b = calculateCrc32(data);
    expect(a).toBe(b);
  });
});
