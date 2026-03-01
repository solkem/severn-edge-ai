import { describe, expect, it } from 'vitest';
import * as tf from '@tensorflow/tfjs';
import {
  extractSimpleNNWeights,
  weightsToBytes,
} from './modelExportService';
import {
  NN_HIDDEN_SIZE,
  NN_INPUT_SIZE,
  NN_MAX_CLASSES,
} from '../config/constants';

type ReplicaModel = {
  numClasses: number;
  inputSize: number;
  hiddenSize: number;
  hiddenWeights: Float32Array;
  hiddenBiases: Float32Array;
  outputWeights: Float32Array;
  outputBiases: Float32Array;
};

function buildKnownModel(numClasses: number): tf.LayersModel {
  const model = tf.sequential();
  model.add(tf.layers.flatten({ inputShape: [100, 6], name: 'flatten' }));
  model.add(tf.layers.dense({ units: NN_HIDDEN_SIZE, activation: 'relu', name: 'hidden' }));
  model.add(tf.layers.dense({ units: numClasses, activation: 'softmax', name: 'output' }));
  model.compile({ optimizer: 'adam', loss: 'categoricalCrossentropy' });

  const hiddenKernel = new Float32Array(NN_INPUT_SIZE * NN_HIDDEN_SIZE);
  hiddenKernel[0 * NN_HIDDEN_SIZE + 0] = 1.0;
  hiddenKernel[1 * NN_HIDDEN_SIZE + 1] = 1.0;
  hiddenKernel[2 * NN_HIDDEN_SIZE + 2] = 1.0;
  const hiddenBias = new Float32Array(NN_HIDDEN_SIZE);

  const outputKernel = new Float32Array(NN_HIDDEN_SIZE * numClasses);
  outputKernel[0 * numClasses + 0] = 5.0;
  outputKernel[1 * numClasses + 1] = 5.0;
  outputKernel[2 * numClasses + 2] = 5.0;
  const outputBias = new Float32Array(numClasses);

  const hiddenLayer = model.getLayer('hidden');
  const outputLayer = model.getLayer('output');

  const hiddenKernelTensor = tf.tensor2d(hiddenKernel, [NN_INPUT_SIZE, NN_HIDDEN_SIZE]);
  const hiddenBiasTensor = tf.tensor1d(hiddenBias);
  hiddenLayer.setWeights([hiddenKernelTensor, hiddenBiasTensor]);

  const outputKernelTensor = tf.tensor2d(outputKernel, [NN_HIDDEN_SIZE, numClasses]);
  const outputBiasTensor = tf.tensor1d(outputBias);
  outputLayer.setWeights([outputKernelTensor, outputBiasTensor]);

  hiddenKernelTensor.dispose();
  hiddenBiasTensor.dispose();
  outputKernelTensor.dispose();
  outputBiasTensor.dispose();

  return model;
}

function decodeExportedModel(bytes: Uint8Array): ReplicaModel {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const numClasses = view.getUint32(4, true);
  const inputSize = view.getUint32(8, true);
  const hiddenSize = view.getUint32(12, true);

  let offset = 16;
  const readFloats = (count: number): Float32Array => {
    const out = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      out[i] = view.getFloat32(offset, true);
      offset += 4;
    }
    return out;
  };

  const hiddenWeights = readFloats(hiddenSize * inputSize);
  const hiddenBiases = readFloats(hiddenSize);
  const allOutputWeights = readFloats(NN_MAX_CLASSES * hiddenSize);
  const allOutputBiases = readFloats(NN_MAX_CLASSES);

  return {
    numClasses,
    inputSize,
    hiddenSize,
    hiddenWeights,
    hiddenBiases,
    outputWeights: allOutputWeights.slice(0, numClasses * hiddenSize),
    outputBiases: allOutputBiases.slice(0, numClasses),
  };
}

function softmax(values: number[]): number[] {
  const max = Math.max(...values);
  const exps = values.map((v) => Math.exp(v - max));
  const sum = exps.reduce((acc, cur) => acc + cur, 0);
  return exps.map((v) => v / sum);
}

function runFirmwareReplica(
  model: ReplicaModel,
  sampleData: number[][],
): { prediction: number; confidence: number } {
  const flatInput = new Float32Array(model.inputSize);
  let cursor = 0;
  for (let row = 0; row < sampleData.length; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      if (cursor < model.inputSize) {
        flatInput[cursor] = sampleData[row][col] ?? 0;
        cursor += 1;
      }
    }
  }

  const hidden = new Float32Array(model.hiddenSize);
  for (let h = 0; h < model.hiddenSize; h += 1) {
    let sum = model.hiddenBiases[h];
    const base = h * model.inputSize;
    for (let i = 0; i < model.inputSize; i += 1) {
      sum += flatInput[i] * model.hiddenWeights[base + i];
    }
    hidden[h] = Math.max(0, sum);
  }

  const logits = new Array(model.numClasses).fill(0);
  for (let c = 0; c < model.numClasses; c += 1) {
    let sum = model.outputBiases[c];
    const base = c * model.hiddenSize;
    for (let h = 0; h < model.hiddenSize; h += 1) {
      sum += hidden[h] * model.outputWeights[base + h];
    }
    logits[c] = sum;
  }

  const probs = softmax(logits);
  let prediction = 0;
  for (let i = 1; i < probs.length; i += 1) {
    if (probs[i] > probs[prediction]) {
      prediction = i;
    }
  }

  return {
    prediction,
    confidence: probs[prediction],
  };
}

function makeWindow(fill: (t: number, axis: number) => number): number[][] {
  return Array.from({ length: 100 }, (_, t) => [
    fill(t, 0),
    fill(t, 1),
    fill(t, 2),
    fill(t, 3),
    fill(t, 4),
    fill(t, 5),
  ]);
}

describe('inference parity (TF.js export vs firmware replica)', () => {
  it('matches predictions and confidence across representative inputs', () => {
    const numClasses = 3;
    const model = buildKnownModel(numClasses);

    const weights = extractSimpleNNWeights(model);
    const bytes = weightsToBytes(weights, ['Class0', 'Class1', 'Class2']);
    const replicaModel = decodeExportedModel(bytes);

    const classTrigger0 = makeWindow(() => 0);
    classTrigger0[0][0] = 2;

    const classTrigger1 = makeWindow(() => 0);
    classTrigger1[0][1] = 2;

    const classTrigger2 = makeWindow(() => 0);
    classTrigger2[0][2] = 2;

    const inputs = [
      makeWindow(() => 0),
      makeWindow(() => 1),
      makeWindow((t, axis) => Math.sin((t + 1) * (axis + 2) * 0.13) * 3.0),
      classTrigger0,
      classTrigger1,
      classTrigger2,
    ];

    for (const input of inputs) {
      const inputTensor = tf.tensor3d([input]);
      const outputTensor = model.predict(inputTensor) as tf.Tensor;
      const tfProbabilities = Array.from(outputTensor.dataSync());

      let tfPrediction = 0;
      for (let i = 1; i < tfProbabilities.length; i += 1) {
        if (tfProbabilities[i] > tfProbabilities[tfPrediction]) {
          tfPrediction = i;
        }
      }
      const tfConfidence = tfProbabilities[tfPrediction];

      const replica = runFirmwareReplica(replicaModel, input);

      expect(replica.prediction).toBe(tfPrediction);
      expect(Math.abs(replica.confidence - tfConfidence)).toBeLessThanOrEqual(0.01);

      outputTensor.dispose();
      inputTensor.dispose();
    }

    model.dispose();
  });
});
