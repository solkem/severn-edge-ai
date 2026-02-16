/**
 * Model Export Service for SimpleNN Format
 *
 * ============================================================================
 * EDUCATIONAL EXPLANATION
 * ============================================================================
 * 
 * This file takes your trained TensorFlow.js model and extracts the weights
 * (the numbers the neural network learned) into a simple format that the
 * Arduino can understand.
 * 
 * Think of it like translating from one language to another:
 * - TensorFlow.js speaks "JavaScript"
 * - Arduino speaks "C++"
 * - We need to convert the weights to a format both can understand
 * 
 * The SimpleNN format is just a list of numbers (floats) in a specific order:
 * 1. Hidden layer weights (32 neurons x 600 inputs = 19,200 numbers)
 * 2. Hidden layer biases (32 numbers)
 * 3. Output layer weights (numClasses x 32 numbers)
 * 4. Output layer biases (numClasses numbers)
 * 
 * See firmware/docs/NEURAL_NETWORK_BASICS.md for more details!
 */

import * as tf from '@tensorflow/tfjs';
import { 
  LABEL_MAX_LEN,
  NN_INPUT_SIZE, 
  NN_HIDDEN_SIZE, 
  NN_MAX_CLASSES,
  SIMPLE_NN_MAGIC
} from '../config/constants';

/**
 * SimpleNN Weight Structure
 * 
 * This matches exactly what the Arduino expects.
 * See firmware/src/simple_nn.h for the C++ side.
 */
export interface SimpleNNWeights {
  inputSize: number;      // Should be 600 (100 samples x 6 axes)
  hiddenSize: number;     // Should be 32 neurons
  numClasses: number;     // 2-8 classes (the gestures you trained)
  
  // The actual learned weights:
  hiddenWeights: Float32Array;  // Shape: [hiddenSize, inputSize] = [32, 600]
  hiddenBiases: Float32Array;   // Shape: [hiddenSize] = [32]
  outputWeights: Float32Array;  // Shape: [numClasses, hiddenSize] = [N, 32]
  outputBiases: Float32Array;   // Shape: [numClasses] = [N]
}

/**
 * Extract weights from a trained TensorFlow.js model
 * 
 * ============================================================================
 * HOW THIS WORKS
 * ============================================================================
 * 
 * After training, TensorFlow.js stores the learned weights inside the model.
 * We need to:
 * 1. Find the Dense layers (the layers with weights)
 * 2. Extract the weight matrices and bias vectors
 * 3. Transpose the weights (TF.js stores them differently than we need)
 * 4. Package everything into our SimpleNN format
 * 
 * IMPORTANT: Weight Transpose
 * ---------------------------
 * TensorFlow.js stores Dense layer weights as [inputSize, outputSize]
 * But our Arduino code expects [outputSize, inputSize]
 * 
 * Example for hidden layer:
 * - TF.js shape: [600, 32] (600 inputs going to 32 neurons)
 * - Arduino shape: [32, 600] (32 neurons, each with 600 weights)
 * 
 * This is just a different way of organizing the same numbers!
 */
export function extractSimpleNNWeights(model: tf.LayersModel): SimpleNNWeights {
  console.log('Extracting weights from trained model...');
  console.log('Model layers:', model.layers.map(l => l.name));
  
  // Find the Dense layers (layers with weights)
  const denseLayers = model.layers.filter(layer => 
    layer.getClassName() === 'Dense'
  );
  
  if (denseLayers.length < 2) {
    throw new Error(
      `Expected at least 2 Dense layers, found ${denseLayers.length}. ` +
      `Your model architecture might not be compatible with SimpleNN.`
    );
  }
  
  // First Dense layer = Hidden layer
  const hiddenLayer = denseLayers[0];
  const [hiddenWeightsTensor, hiddenBiasesTensor] = hiddenLayer.getWeights();
  
  // Second Dense layer = Output layer
  const outputLayer = denseLayers[denseLayers.length - 1];
  const [outputWeightsTensor, outputBiasesTensor] = outputLayer.getWeights();
  
  // Get the shapes
  const hiddenWeightsShape = hiddenWeightsTensor.shape;
  const outputWeightsShape = outputWeightsTensor.shape;
  
  console.log(`Hidden weights shape: [${hiddenWeightsShape}] (TF.js format)`);
  console.log(`Output weights shape: [${outputWeightsShape}] (TF.js format)`);
  
  const inputSize = hiddenWeightsShape[0] as number;
  const hiddenSize = hiddenWeightsShape[1] as number;
  const numClasses = outputWeightsShape[1] as number;
  
  // Validate dimensions
  if (inputSize !== NN_INPUT_SIZE) {
    console.warn(`Input size mismatch: model has ${inputSize}, expected ${NN_INPUT_SIZE}`);
  }
  if (hiddenSize !== NN_HIDDEN_SIZE) {
    console.warn(`Hidden size mismatch: model has ${hiddenSize}, expected ${NN_HIDDEN_SIZE}`);
  }
  if (numClasses > NN_MAX_CLASSES) {
    throw new Error(`Too many classes: ${numClasses}, max is ${NN_MAX_CLASSES}`);
  }
  
  // Extract and transpose weights
  // TF.js: [inputSize, hiddenSize] -> Arduino: [hiddenSize, inputSize]
  const hiddenWeightsRaw = hiddenWeightsTensor.arraySync() as number[][];
  const hiddenWeights = new Float32Array(hiddenSize * inputSize);
  
  for (let h = 0; h < hiddenSize; h++) {
    for (let i = 0; i < inputSize; i++) {
      // Transpose: row h, col i in Arduino = row i, col h in TF.js
      hiddenWeights[h * inputSize + i] = hiddenWeightsRaw[i][h];
    }
  }
  
  // TF.js: [hiddenSize, numClasses] -> Arduino: [numClasses, hiddenSize]
  const outputWeightsRaw = outputWeightsTensor.arraySync() as number[][];
  const outputWeights = new Float32Array(numClasses * hiddenSize);
  
  for (let c = 0; c < numClasses; c++) {
    for (let h = 0; h < hiddenSize; h++) {
      // Transpose: row c, col h in Arduino = row h, col c in TF.js
      outputWeights[c * hiddenSize + h] = outputWeightsRaw[h][c];
    }
  }
  
  // Biases don't need transposing (they're just 1D arrays)
  const hiddenBiases = new Float32Array(hiddenBiasesTensor.dataSync());
  const outputBiases = new Float32Array(outputBiasesTensor.dataSync());
  
  console.log(`Extracted weights for ${numClasses}-class classifier`);
  console.log(`  Hidden: ${hiddenSize} neurons x ${inputSize} inputs`);
  console.log(`  Output: ${numClasses} classes x ${hiddenSize} hidden`);
  
  // NOTE: Do NOT dispose these tensors — they are owned by the model's layers.
  // Disposing them would destroy the model's weights, breaking progressive
  // training ("Train More") and browser-side inference.

  return {
    inputSize,
    hiddenSize,
    numClasses,
    hiddenWeights,
    hiddenBiases,
    outputWeights,
    outputBiases
  };
}

/**
 * Convert SimpleNN weights to binary format for BLE upload
 * 
 * The binary format is simply all the floats concatenated together:
 * [hiddenWeights][hiddenBiases][outputWeights][outputBiases]
 * 
 * Each float is 4 bytes (32 bits), stored in little-endian format
 * (which is what most computers and the Arduino use).
 */
export function weightsToBytes(weights: SimpleNNWeights, labels: string[] = []): Uint8Array {
  const expectedHiddenWeights = NN_HIDDEN_SIZE * NN_INPUT_SIZE;
  const expectedHiddenBiases = NN_HIDDEN_SIZE;
  const expectedOutputWeights = weights.numClasses * NN_HIDDEN_SIZE;
  const expectedOutputBiases = weights.numClasses;

  if (weights.inputSize !== NN_INPUT_SIZE) {
    throw new Error(`Invalid input size ${weights.inputSize}; expected ${NN_INPUT_SIZE}`);
  }
  if (weights.hiddenSize !== NN_HIDDEN_SIZE) {
    throw new Error(`Invalid hidden size ${weights.hiddenSize}; expected ${NN_HIDDEN_SIZE}`);
  }
  if (weights.numClasses < 1 || weights.numClasses > NN_MAX_CLASSES) {
    throw new Error(`Invalid class count ${weights.numClasses}; expected 1-${NN_MAX_CLASSES}`);
  }
  if (weights.hiddenWeights.length !== expectedHiddenWeights) {
    throw new Error(`Invalid hidden weights length ${weights.hiddenWeights.length}; expected ${expectedHiddenWeights}`);
  }
  if (weights.hiddenBiases.length !== expectedHiddenBiases) {
    throw new Error(`Invalid hidden bias length ${weights.hiddenBiases.length}; expected ${expectedHiddenBiases}`);
  }
  if (weights.outputWeights.length !== expectedOutputWeights) {
    throw new Error(`Invalid output weights length ${weights.outputWeights.length}; expected ${expectedOutputWeights}`);
  }
  if (weights.outputBiases.length !== expectedOutputBiases) {
    throw new Error(`Invalid output bias length ${weights.outputBiases.length}; expected ${expectedOutputBiases}`);
  }

  const totalBytes =
    16 + // Header: magic, numClasses, inputSize, hiddenSize
    (NN_HIDDEN_SIZE * NN_INPUT_SIZE * 4) +
    (NN_HIDDEN_SIZE * 4) +
    (NN_MAX_CLASSES * NN_HIDDEN_SIZE * 4) +
    (NN_MAX_CLASSES * 4) +
    (NN_MAX_CLASSES * LABEL_MAX_LEN);

  const buffer = new ArrayBuffer(totalBytes);
  const view = new DataView(buffer);
  
  let offset = 0;

  const writeUint32 = (value: number) => {
    view.setUint32(offset, value >>> 0, true);
    offset += 4;
  };

  // Helper to write a Float32Array with optional zero padding
  const writeFloats = (arr: Float32Array, paddedLength: number = arr.length) => {
    for (let i = 0; i < paddedLength; i++) {
      if (i < arr.length) {
        view.setFloat32(offset, arr[i], true); // true = little-endian
      } else {
        view.setFloat32(offset, 0, true);
      }
      offset += 4;
    }
  };

  const ascii = new TextEncoder();
  const safeLabels = labels.slice(0, NN_MAX_CLASSES);

  // SimpleNNModel header
  writeUint32(SIMPLE_NN_MAGIC);
  writeUint32(weights.numClasses);
  writeUint32(weights.inputSize);
  writeUint32(weights.hiddenSize);

  // Layer weights
  writeFloats(weights.hiddenWeights);
  writeFloats(weights.hiddenBiases);
  writeFloats(weights.outputWeights, NN_MAX_CLASSES * NN_HIDDEN_SIZE);
  writeFloats(weights.outputBiases, NN_MAX_CLASSES);

  // Fixed-width class labels [NN_MAX_CLASSES][LABEL_MAX_LEN]
  for (let classIndex = 0; classIndex < NN_MAX_CLASSES; classIndex++) {
    const rawLabel = safeLabels[classIndex] ?? '';
    const encoded = ascii.encode(rawLabel);
    const copyLen = Math.min(encoded.length, LABEL_MAX_LEN - 1);

    for (let i = 0; i < LABEL_MAX_LEN; i++) {
      if (i < copyLen) {
        view.setUint8(offset, encoded[i]);
      } else {
        view.setUint8(offset, 0);
      }
      offset += 1;
    }
  }
  
  console.log(`Packed full SimpleNNModel struct into ${offset} bytes`);
  
  return new Uint8Array(buffer);
}

/**
 * Main function: Convert TF.js model to bytes for BLE upload
 */
export function modelToSimpleNNBytes(model: tf.LayersModel, labels: string[] = []): Uint8Array {
  const weights = extractSimpleNNWeights(model);
  return weightsToBytes(weights, labels);
}

/**
 * Calculate CRC32 checksum
 * 
 * CRC = Cyclic Redundancy Check
 * 
 * This is like a "fingerprint" of the data. If even one byte is wrong
 * during transmission, the CRC will be different, and we'll know
 * something went wrong.
 * 
 * The Arduino calculates the same CRC and compares it to make sure
 * all the weight data arrived correctly.
 */
// CRC32 lookup table (pre-computed once at module load for speed)
const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC32_TABLE[i] = c;
}

export function calculateCrc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = CRC32_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }

  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Export model as a C header file
 * 
 * This is useful for embedding a pre-trained model directly in the firmware,
 * instead of uploading over BLE. Good for:
 * - Default models
 * - Testing
 * - Offline deployment
 */
export function exportModelToHeader(
  weights: SimpleNNWeights,
  labels: string[] = [],
  modelName: string = 'default_model'
): string {
  const bytes = weightsToBytes(weights, labels);
  const crc = calculateCrc32(bytes);
  
  const bytesPerLine = 12;
  let hexArray = '';
  
  for (let i = 0; i < bytes.length; i++) {
    if (i % bytesPerLine === 0) {
      hexArray += '  ';
    }
    hexArray += `0x${bytes[i].toString(16).padStart(2, '0')}`;
    if (i < bytes.length - 1) {
      hexArray += ', ';
    }
    if ((i + 1) % bytesPerLine === 0) {
      hexArray += '\n';
    }
  }
  
  return `/**
 * Auto-generated SimpleNN Model
 * 
 * Model: ${modelName}
 * Classes: ${weights.numClasses}
 * Size: ${bytes.length} bytes
 * CRC32: 0x${crc.toString(16).toUpperCase()}
 * 
 * Generated by SimpleNN Export Service
 */

#ifndef ${modelName.toUpperCase()}_H
#define ${modelName.toUpperCase()}_H

#include <stdint.h>

#define ${modelName.toUpperCase()}_INPUT_SIZE ${weights.inputSize}
#define ${modelName.toUpperCase()}_HIDDEN_SIZE ${weights.hiddenSize}
#define ${modelName.toUpperCase()}_NUM_CLASSES ${weights.numClasses}
#define ${modelName.toUpperCase()}_SIZE ${bytes.length}
#define ${modelName.toUpperCase()}_CRC32 0x${crc.toString(16).toUpperCase()}

const uint8_t ${modelName}_data[${bytes.length}] PROGMEM = {
${hexArray}
};

#endif // ${modelName.toUpperCase()}_H
`;
}

// ============================================================================
// EXPORTS
// ============================================================================

import type { GestureLabel } from '../types';

/**
 * Export model as a downloadable C header file
 */
export async function exportForArduino(
  model: tf.LayersModel,
  labels: GestureLabel[]
): Promise<void> {
  const weights = extractSimpleNNWeights(model);
  const labelNames = labels.map(l => l.name).join(', ');
  const headerContent = exportModelToHeader(weights, labels.map(l => l.name), 'gesture_model');
  
  const labelComment = [
    '',
    '// Class labels: ' + labelNames,
    '// Label indices:'
  ].concat(labels.map((l, i) => '//   ' + i + ': ' + l.name)).join('\n');
  
  const finalContent = headerContent.replace(
    '#ifndef GESTURE_MODEL_H',
    labelComment + '\n#ifndef GESTURE_MODEL_H'
  );
  
  const blob = new Blob([finalContent], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'gesture_model.h';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  console.log('Model exported as gesture_model.h');
}
