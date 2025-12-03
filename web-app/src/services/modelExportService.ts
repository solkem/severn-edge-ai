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
  NN_INPUT_SIZE, 
  NN_HIDDEN_SIZE, 
  NN_MAX_CLASSES 
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
  
  // Clean up tensors
  hiddenWeightsTensor.dispose();
  hiddenBiasesTensor.dispose();
  outputWeightsTensor.dispose();
  outputBiasesTensor.dispose();
  
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
export function weightsToBytes(weights: SimpleNNWeights): Uint8Array {
  const totalFloats = 
    weights.hiddenWeights.length +
    weights.hiddenBiases.length +
    weights.outputWeights.length +
    weights.outputBiases.length;
  
  const buffer = new ArrayBuffer(totalFloats * 4);
  const view = new DataView(buffer);
  
  let offset = 0;
  
  // Helper to write a Float32Array
  const writeFloats = (arr: Float32Array) => {
    for (let i = 0; i < arr.length; i++) {
      view.setFloat32(offset, arr[i], true);  // true = little-endian
      offset += 4;
    }
  };
  
  writeFloats(weights.hiddenWeights);
  writeFloats(weights.hiddenBiases);
  writeFloats(weights.outputWeights);
  writeFloats(weights.outputBiases);
  
  console.log(`Packed ${totalFloats} floats into ${offset} bytes`);
  
  return new Uint8Array(buffer);
}

/**
 * Main function: Convert TF.js model to bytes for BLE upload
 */
export function modelToSimpleNNBytes(model: tf.LayersModel): Uint8Array {
  const weights = extractSimpleNNWeights(model);
  return weightsToBytes(weights);
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
export function calculateCrc32(data: Uint8Array): number {
  // CRC32 lookup table (pre-computed for speed)
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
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
  modelName: string = 'default_model'
): string {
  const bytes = weightsToBytes(weights);
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
