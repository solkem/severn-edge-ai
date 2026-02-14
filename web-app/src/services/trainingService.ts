/**
 * TensorFlow.js Training Service for SimpleNN
 *
 * ============================================================================
 * EDUCATIONAL IMPLEMENTATION
 * ============================================================================
 *
 * This service trains a neural network in your browser!
 *
 * The model architecture is kept simple so it can run on the Arduino:
 * - Flatten: Converts the 2D sensor data (100 time steps  6 axes) into 1D (600 numbers)
 * - Dense Hidden Layer: 32 neurons with ReLU activation
 * - Dense Output Layer: N neurons (one per gesture class) with Softmax activation
 *
 * See firmware/docs/NEURAL_NETWORK_BASICS.md for how neural networks work!
 */

import * as tf from '@tensorflow/tfjs';
import type { Sample, GestureLabel, TrainingProgress, TrainingResult } from '../types';
import { MODEL_CONFIG, NN_HIDDEN_SIZE, NN_MAX_CLASSES } from '../config/constants';

const INPUT_SHAPE = [MODEL_CONFIG.WINDOW_SIZE, MODEL_CONFIG.NUM_AXES];

// Normalization constants for sensor data
// These values are used to scale sensor readings to a reasonable range for neural networks
// Accelerometer: 4g range, so max value is ~4
// Gyroscope: 2000 dps range, so max value is ~2000
// We divide by these to get values roughly in -1 to +1 range
const NORM_ACCEL = 4.0;    // Accelerometer normalization (divide by this)
const NORM_GYRO = 500.0;   // Gyroscope normalization (divide by this)

export class TrainingService {
  private model: tf.LayersModel | null = null;

  /**
   * Create the SimpleNN model architecture
   */
  createModel(numClasses: number): tf.LayersModel {
    console.log(`Creating SimpleNN model for ${numClasses} classes`);

    if (numClasses > NN_MAX_CLASSES) {
      throw new Error(`Too many classes: ${numClasses}. Maximum is ${NN_MAX_CLASSES}`);
    }

    const model = tf.sequential();

    // Flatten: (100, 6)  (600)
    model.add(
      tf.layers.flatten({
        inputShape: INPUT_SHAPE,
        name: 'flatten'
      })
    );

    // Hidden Layer: 600  32
    model.add(
      tf.layers.dense({
        units: NN_HIDDEN_SIZE,
        activation: 'relu',
        name: 'hidden',
        kernelInitializer: 'glorotNormal',
        biasInitializer: 'zeros'
      })
    );

    // Output Layer: 32  numClasses
    model.add(
      tf.layers.dense({
        units: numClasses,
        activation: 'softmax',
        name: 'output',
        kernelInitializer: 'glorotNormal',
        biasInitializer: 'zeros'
      })
    );

    // Compile with Adam optimizer
    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy'],
    });

    console.log('Model created:');
    model.summary();

    this.model = model;
    return model;
  }

  /**
   * Normalize a single sample's sensor data
   * 
   * The raw values from the sensor are:
   * - Accelerometer: in g units (roughly -4 to +4)
   * - Gyroscope: in dps (roughly -2000 to +2000)
   * 
   * We normalize both to roughly -1 to +1 range so the neural network
   * can learn effectively from all sensor channels.
   */
  private normalizeSample(sampleData: number[][]): number[][] {
    return sampleData.map(row => [
      row[0] / NORM_ACCEL,  // ax
      row[1] / NORM_ACCEL,  // ay
      row[2] / NORM_ACCEL,  // az
      row[3] / NORM_GYRO,   // gx
      row[4] / NORM_GYRO,   // gy
      row[5] / NORM_GYRO,   // gz
    ]);
  }

  /**
   * Data augmentation on normalized data - creates variations to improve model robustness
   * Works on already-normalized data (values roughly in -1 to +1 range)
   */
  private augmentNormalized(normalizedData: number[][]): number[][] {
    const augmented = normalizedData.map(row => [...row]);
    
    // Random scaling (0.85 to 1.15x intensity)
    const scale = 0.85 + Math.random() * 0.3;
    
    // Add small noise (values are normalized, so use small noise ~0.02)
    for (let i = 0; i < augmented.length; i++) {
      for (let j = 0; j < 6; j++) {
        augmented[i][j] = augmented[i][j] * scale + (Math.random() - 0.5) * 0.04;
      }
    }
    
    return augmented;
  }

  /**
   * Generate synthetic "Idle" samples (device sitting still on a table).
   * Used when only 1 gesture class is defined, so we can create a 2-class
   * model (gesture vs idle) that actually distinguishes motion from stillness.
   */
  private generateIdleSamples(count: number): number[][][] {
    const idleSamples: number[][][] = [];
    for (let i = 0; i < count; i++) {
      const sample: number[][] = [];
      for (let t = 0; t < MODEL_CONFIG.WINDOW_SIZE; t++) {
        // Simulate a still device: ~0g on X/Y, ~1g on Z (gravity), ~0 dps gyro
        // Add small noise to make it realistic
        sample.push([
          (Math.random() - 0.5) * 0.05 / NORM_ACCEL,   // ax ≈ 0
          (Math.random() - 0.5) * 0.05 / NORM_ACCEL,   // ay ≈ 0
          (1.0 + (Math.random() - 0.5) * 0.05) / NORM_ACCEL, // az ≈ 1g
          (Math.random() - 0.5) * 5.0 / NORM_GYRO,     // gx ≈ 0
          (Math.random() - 0.5) * 5.0 / NORM_GYRO,     // gy ≈ 0
          (Math.random() - 0.5) * 5.0 / NORM_GYRO,     // gz ≈ 0
        ]);
      }
      idleSamples.push(sample);
    }
    return idleSamples;
  }

  /**
   * Prepare training data from samples with augmentation.
   *
   * Special case: if only 1 gesture class exists, synthetic "Idle" data is
   * auto-generated so that tf.oneHot (which requires depth >= 2) works AND
   * the resulting model can distinguish the gesture from no motion.
   */
  prepareData(samples: Sample[], labels: GestureLabel[]) {
    // When there's only 1 gesture, add a synthetic "Idle" class
    const isSingleGesture = labels.length === 1;
    const effectiveLabels = isSingleGesture
      ? [...labels, { id: '__idle__', name: 'Idle', sampleCount: 0 }]
      : labels;
    const numClasses = effectiveLabels.length;

    const labelMap = new Map(effectiveLabels.map((l, idx) => [l.id, idx]));

    const xs: number[][][] = [];
    const ys: number[] = [];

    for (const sample of samples) {
      let sampleData = sample.data;
      
      // Ensure sample has exactly MODEL_CONFIG.WINDOW_SIZE samples
      if (sampleData.length < MODEL_CONFIG.WINDOW_SIZE) {
        // Pad with zeros
        const padded = [...sampleData];
        while (padded.length < MODEL_CONFIG.WINDOW_SIZE) {
          padded.push([0, 0, 0, 0, 0, 0]);
        }
        sampleData = padded.slice(0, MODEL_CONFIG.WINDOW_SIZE);
      } else if (sampleData.length > MODEL_CONFIG.WINDOW_SIZE) {
        // Truncate
        sampleData = sampleData.slice(0, MODEL_CONFIG.WINDOW_SIZE);
      }

      // Normalize the sensor data
      const normalized = this.normalizeSample(sampleData);
      xs.push(normalized);
      ys.push(labelMap.get(sample.label)!);
      
      // Add 2 augmented versions of each sample for better generalization
      for (let aug = 0; aug < 2; aug++) {
        // Augment the normalized data (not raw data)
        const augmented = this.augmentNormalized(normalized);
        xs.push(augmented);
        ys.push(labelMap.get(sample.label)!);
      }
    }

    // Auto-generate Idle samples for single-gesture mode
    if (isSingleGesture) {
      const idleClassIdx = labelMap.get('__idle__')!;
      // Generate same number of idle samples as real gesture samples (with augmentation)
      const idleSamples = this.generateIdleSamples(samples.length * 3);
      for (const idleSample of idleSamples) {
        xs.push(idleSample);
        ys.push(idleClassIdx);
      }
      console.log(`Single-gesture mode: added ${idleSamples.length} synthetic Idle samples`);
    }

    console.log(`Prepared ${xs.length} samples (${samples.length} original + augmented${isSingleGesture ? ' + idle' : ''}), ${numClasses} classes`);

    // Convert to tensors
    const xTensor = tf.tensor3d(xs);
    const yTensor = tf.oneHot(tf.tensor1d(ys, 'int32'), numClasses);

    return { xTensor, yTensor, effectiveLabels };
  }

  /**
   * Train the model
   */
  async train(
    samples: Sample[],
    labels: GestureLabel[],
    onProgress: (progress: TrainingProgress) => void
  ): Promise<TrainingResult> {
    console.log(`Training SimpleNN with ${samples.length} samples, ${labels.length} classes`);

    // Prepare data with normalization (may add synthetic Idle class for single-gesture)
    const { xTensor, yTensor, effectiveLabels } = this.prepareData(samples, labels);
    const numClasses = effectiveLabels.length;

    // Create or reuse model (for progressive training)
    if (!this.model || this.model.outputShape[1] !== numClasses) {
      this.model = this.createModel(numClasses);
    }

    // Log data statistics for debugging
    const dataStats = xTensor.mean().dataSync()[0];
    console.log(`Data mean: ${dataStats.toFixed(4)}`);

    // Training configuration
    const epochs = MODEL_CONFIG.EPOCHS;
    const batchSize = Math.min(16, Math.floor(samples.length / 2)); // Adaptive batch size
    const validationSplit = 0.2;

    try {
      // Train model
      const history = await this.model.fit(xTensor, yTensor, {
        epochs,
        batchSize: Math.max(1, batchSize),
        validationSplit,
        shuffle: true,
        callbacks: {
          onEpochEnd: (epoch, logs) => {
            // TF.js uses 'acc'/'val_acc'; handle both for future-proofing
            const acc = (logs?.acc ?? logs?.accuracy ?? 0) as number;
            const valAcc = (logs?.val_acc ?? logs?.val_accuracy) as number | undefined;
            onProgress({
              epoch: epoch + 1,
              totalEpochs: epochs,
              loss: logs?.loss || 0,
              accuracy: acc,
              valLoss: logs?.val_loss,
              valAccuracy: valAcc,
            });
          },
        },
      });

      // Get final metrics — handle both 'acc' and 'accuracy' history keys
      const hist = history.history;
      const accHist = (hist.acc ?? hist.accuracy ?? []) as number[];
      const valAccHist = (hist.val_acc ?? hist.val_accuracy ?? []) as number[];
      const valLossHist = (hist.val_loss ?? []) as number[];
      const lossHist = (hist.loss ?? []) as number[];

      const finalEpoch = accHist.length - 1;
      const accuracy = valAccHist[finalEpoch] ?? accHist[finalEpoch] ?? 0;
      const loss = valLossHist[finalEpoch] ?? lossHist[finalEpoch] ?? 0;

      // Calculate model size
      const modelSizeKB = this.estimateModelSize();

      console.log(`Training complete! Accuracy: ${((accuracy as number) * 100).toFixed(1)}%`);

      return {
        accuracy: accuracy as number,
        loss: loss as number,
        modelSizeKB,
      };
    } finally {
      // Cleanup tensors
      xTensor.dispose();
      yTensor.dispose();
    }
  }

  /**
   * Estimate model size in KB
   */
  private estimateModelSize(): number {
    if (!this.model) return 0;

    let totalParams = 0;
    for (const layer of this.model.layers) {
      const weights = layer.getWeights();
      for (const weight of weights) {
        totalParams += weight.size;
      }
    }

    // 4 bytes per float32 parameter
    return (totalParams * 4) / 1024;
  }

  /**
   * Get the trained model
   */
  getModel(): tf.LayersModel | null {
    return this.model;
  }

  /**
   * Run inference on a single sample (for testing in browser)
   */
  predict(sampleData: number[][]): { prediction: number; confidence: number } {
    if (!this.model) {
      throw new Error('No model trained');
    }

    // Prepare input
    let input = sampleData;
    if (input.length < MODEL_CONFIG.WINDOW_SIZE) {
      input = [...input];
      while (input.length < MODEL_CONFIG.WINDOW_SIZE) {
        input.push([0, 0, 0, 0, 0, 0]);
      }
    } else if (input.length > MODEL_CONFIG.WINDOW_SIZE) {
      input = input.slice(0, MODEL_CONFIG.WINDOW_SIZE);
    }

    // Normalize the input (same as training!)
    const normalized = this.normalizeSample(input);

    // Run prediction
    const inputTensor = tf.tensor3d([normalized]);
    const output = this.model.predict(inputTensor) as tf.Tensor;
    const probabilities = output.dataSync();

    // Get prediction and confidence
    let maxProb = 0;
    let prediction = 0;
    for (let i = 0; i < probabilities.length; i++) {
      if (probabilities[i] > maxProb) {
        maxProb = probabilities[i];
        prediction = i;
      }
    }

    // Cleanup
    inputTensor.dispose();
    output.dispose();

    return { prediction, confidence: maxProb };
  }
}

// Export normalization constants for use in firmware
export const NORMALIZATION = {
  ACCEL: NORM_ACCEL,
  GYRO: NORM_GYRO,
};