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
  weightsToBytes,
  calculateCrc32,
} from './modelExportService';
import {
  LABEL_MAX_LEN,
  NN_HIDDEN_SIZE,
  NN_INPUT_SIZE,
  NN_MAX_CLASSES,
  SIMPLE_NN_MAGIC,
} from '../config/constants';

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

describe('weightsToBytes', () => {
  it('serializes full SimpleNNModel layout with header, fixed padding, and labels', () => {
    const numClasses = 3;
    const hiddenWeights = new Float32Array(NN_HIDDEN_SIZE * NN_INPUT_SIZE);
    hiddenWeights[0] = 1.25;
    hiddenWeights[hiddenWeights.length - 1] = -2.5;

    const hiddenBiases = new Float32Array(NN_HIDDEN_SIZE);
    hiddenBiases[0] = 0.5;

    const outputWeights = new Float32Array(numClasses * NN_HIDDEN_SIZE);
    outputWeights[0] = 3.5;
    outputWeights[outputWeights.length - 1] = -4.5;

    const outputBiases = new Float32Array(numClasses);
    outputBiases[0] = 0.75;
    outputBiases[outputBiases.length - 1] = -0.25;

    const bytes = weightsToBytes(
      {
        inputSize: NN_INPUT_SIZE,
        hiddenSize: NN_HIDDEN_SIZE,
        numClasses,
        hiddenWeights,
        hiddenBiases,
        outputWeights,
        outputBiases,
      },
      ['Wave', 'Shake', 'Circle']
    );

    const expectedSize =
      16 +
      NN_HIDDEN_SIZE * NN_INPUT_SIZE * 4 +
      NN_HIDDEN_SIZE * 4 +
      NN_MAX_CLASSES * NN_HIDDEN_SIZE * 4 +
      NN_MAX_CLASSES * 4 +
      NN_MAX_CLASSES * LABEL_MAX_LEN;
    expect(bytes.length).toBe(expectedSize);

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint32(0, true)).toBe(SIMPLE_NN_MAGIC);
    expect(view.getUint32(4, true)).toBe(numClasses);
    expect(view.getUint32(8, true)).toBe(NN_INPUT_SIZE);
    expect(view.getUint32(12, true)).toBe(NN_HIDDEN_SIZE);

    const outputWeightsOffset =
      16 + NN_HIDDEN_SIZE * NN_INPUT_SIZE * 4 + NN_HIDDEN_SIZE * 4;
    // First trained output weight should be present.
    expect(view.getFloat32(outputWeightsOffset, true)).toBeCloseTo(3.5, 5);
    // First padded class (index 3) should be zero-filled.
    const paddedClassOffset = outputWeightsOffset + (numClasses * NN_HIDDEN_SIZE * 4);
    expect(view.getFloat32(paddedClassOffset, true)).toBeCloseTo(0, 5);

    const labelsOffset =
      outputWeightsOffset +
      NN_MAX_CLASSES * NN_HIDDEN_SIZE * 4 +
      NN_MAX_CLASSES * 4;
    expect(bytes[labelsOffset]).toBe('W'.charCodeAt(0));
    expect(bytes[labelsOffset + 1]).toBe('a'.charCodeAt(0));
    // Unused label slots are zero-filled.
    const unusedLabelOffset = labelsOffset + (4 * LABEL_MAX_LEN);
    expect(bytes[unusedLabelOffset]).toBe(0);
  });
});
