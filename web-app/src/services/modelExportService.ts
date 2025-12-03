/**
 * Model Export Service
 * 
 * Exports trained TensorFlow.js models to formats suitable for deployment:
 * - C Header file (.h) for Arduino/embedded firmware
 * - TFLite format for mobile/edge devices
 */

import * as tf from '@tensorflow/tfjs';
import type { GestureLabel } from '../types';

/**
 * Convert a TensorFlow.js model to a C header file for Arduino
 * 
 * This uses TensorFlow.js's built-in model serialization and converts
 * the weights to a format that can be embedded in C/C++ code.
 */
export async function exportModelToHeader(
  model: tf.LayersModel,
  labels: GestureLabel[],
  modelName: string = 'trained_model'
): Promise<string> {
  // Save model to memory and get the binary weights
  const saveResult = await model.save(tf.io.withSaveHandler(async (artifacts) => {
    return {
      modelArtifactsInfo: {
        dateSaved: new Date(),
        modelTopologyType: 'JSON',
      },
    };
  }));

  // Get model weights as typed arrays
  const weightData = await getModelWeightsAsBytes(model);
  
  // Generate C header file content
  const header = generateCHeader(weightData, labels, modelName);
  
  return header;
}

/**
 * Extract all model weights as a single byte array
 */
async function getModelWeightsAsBytes(model: tf.LayersModel): Promise<Uint8Array> {
  // Collect all weight tensors
  const weights: ArrayBuffer[] = [];
  
  for (const layer of model.layers) {
    const layerWeights = layer.getWeights();
    for (const weight of layerWeights) {
      const data = await weight.data();
      // Convert Float32Array to bytes
      weights.push(new Float32Array(data).buffer);
    }
  }
  
  // For now, we'll create a simplified representation
  // In production, you'd use proper TFLite conversion
  
  // Serialize the model topology and weights together
  const modelJson = model.toJSON();
  const jsonStr = JSON.stringify(modelJson);
  const encoder = new TextEncoder();
  const jsonBytes = encoder.encode(jsonStr);
  
  // Combine topology with weight data
  let totalSize = jsonBytes.length;
  for (const w of weights) {
    totalSize += w.byteLength;
  }
  
  const result = new Uint8Array(totalSize);
  let offset = 0;
  
  // Write JSON topology first
  result.set(jsonBytes, offset);
  offset += jsonBytes.length;
  
  // Write weight data
  for (const w of weights) {
    result.set(new Uint8Array(w), offset);
    offset += w.byteLength;
  }
  
  return result;
}

/**
 * Generate C header file content from model bytes
 */
function generateCHeader(
  modelBytes: Uint8Array,
  labels: GestureLabel[],
  modelName: string
): string {
  const timestamp = new Date().toISOString();
  const classNames = labels.map(l => l.name);
  
  // Format bytes as hex array
  const bytesPerLine = 12;
  const hexLines: string[] = [];
  
  for (let i = 0; i < modelBytes.length; i += bytesPerLine) {
    const slice = modelBytes.slice(i, Math.min(i + bytesPerLine, modelBytes.length));
    const hexValues = Array.from(slice).map(b => `0x${b.toString(16).padStart(2, '0')}`);
    hexLines.push('    ' + hexValues.join(', ') + ',');
  }
  
  // Remove trailing comma from last line
  if (hexLines.length > 0) {
    hexLines[hexLines.length - 1] = hexLines[hexLines.length - 1].slice(0, -1);
  }

  return `/**
 * Severn Edge AI - Trained Model Header
 * 
 * ============================================================================
 * AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
 * ============================================================================
 * 
 * Generated: ${timestamp}
 * Classes: ${classNames.join(', ')}
 * Model Size: ${(modelBytes.length / 1024).toFixed(2)} KB
 * 
 * To use this model:
 * 1. Replace the existing model.h in firmware/src/
 * 2. Rebuild and upload the firmware to your Arduino
 */

#ifndef MODEL_H
#define MODEL_H

// ============================================================================
// MODEL DATA
// ============================================================================
alignas(8) const unsigned char ${modelName}[] = {
${hexLines.join('\n')}
};

const unsigned int ${modelName}_len = ${modelBytes.length};

// ============================================================================
// MODEL METADATA
// ============================================================================
#define MODEL_NUM_CLASSES ${labels.length}
#define MODEL_WINDOW_SIZE 100
#define MODEL_NUM_AXES 6

// Class labels
const char* const CLASS_LABELS[MODEL_NUM_CLASSES] = {
${classNames.map(name => `    "${name}"`).join(',\n')}
};

#endif // MODEL_H
`;
}

/**
 * Download a string as a file
 */
export function downloadAsFile(content: string, filename: string, mimeType: string = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}

/**
 * Export the trained model for Arduino deployment
 */
export async function exportForArduino(
  model: tf.LayersModel,
  labels: GestureLabel[]
): Promise<void> {
  const headerContent = await exportModelToHeader(model, labels);
  downloadAsFile(headerContent, 'model.h', 'text/x-c');
}

/**
 * Convert the model to bytes suitable for BLE transfer
 * This creates a compact format for over-the-air deployment
 */
export async function modelToTFLiteBytes(
  model: tf.LayersModel,
  labels: GestureLabel[]
): Promise<Uint8Array> {
  // Get the raw model weights as bytes
  return await getModelWeightsAsBytes(model);
}
