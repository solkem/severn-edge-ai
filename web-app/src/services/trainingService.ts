/**
 * TensorFlow.js Training Service
 * Trains gesture recognition model in the browser
 */

import * as tf from '@tensorflow/tfjs';
import type { Sample, GestureLabel, TrainingProgress, TrainingResult } from '../types';

const WINDOW_SIZE = 100;
const INPUT_SHAPE = [WINDOW_SIZE, 6]; // 100 samples × 6 axes

export class TrainingService {
  private model: tf.LayersModel | null = null;

  /**
   * Create the CNN model architecture (matches firmware spec)
   */
  createModel(numClasses: number): tf.LayersModel {
    const model = tf.sequential();

    // Input: (100, 6)
    model.add(
      tf.layers.batchNormalization({
        inputShape: INPUT_SHAPE,
      })
    );

    // Conv1D Block 1
    model.add(
      tf.layers.conv1d({
        filters: 8,
        kernelSize: 3,
        activation: 'relu',
        padding: 'same',
      })
    );
    model.add(tf.layers.maxPooling1d({ poolSize: 2 }));

    // Conv1D Block 2
    model.add(
      tf.layers.conv1d({
        filters: 16,
        kernelSize: 3,
        activation: 'relu',
        padding: 'same',
      })
    );
    model.add(tf.layers.maxPooling1d({ poolSize: 2 }));

    // Conv1D Block 3
    model.add(
      tf.layers.conv1d({
        filters: 32,
        kernelSize: 3,
        activation: 'relu',
        padding: 'same',
      })
    );
    model.add(tf.layers.maxPooling1d({ poolSize: 2 }));

    // Dense layers
    model.add(tf.layers.flatten());
    model.add(
      tf.layers.dense({
        units: 24,
        activation: 'relu',
      })
    );
    model.add(tf.layers.dropout({ rate: 0.3 }));
    model.add(
      tf.layers.dense({
        units: numClasses,
        activation: 'softmax',
      })
    );

    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy'],
    });

    return model;
  }

  /**
   * Prepare training data from samples
   */
  prepareData(samples: Sample[], labels: GestureLabel[]) {
    const labelMap = new Map(labels.map((l, idx) => [l.id, idx]));

    const xs: number[][][] = [];
    const ys: number[] = [];

    for (const sample of samples) {
      // Ensure sample has exactly WINDOW_SIZE samples
      if (sample.data.length < WINDOW_SIZE) {
        // Pad with zeros
        const padded = [...sample.data];
        while (padded.length < WINDOW_SIZE) {
          padded.push([0, 0, 0, 0, 0, 0]);
        }
        xs.push(padded.slice(0, WINDOW_SIZE));
      } else if (sample.data.length > WINDOW_SIZE) {
        // Truncate
        xs.push(sample.data.slice(0, WINDOW_SIZE));
      } else {
        xs.push(sample.data);
      }

      ys.push(labelMap.get(sample.label)!);
    }

    // Convert to tensors
    const xTensor = tf.tensor3d(xs);
    const yTensor = tf.oneHot(tf.tensor1d(ys, 'int32'), labels.length);

    return { xTensor, yTensor };
  }

  /**
   * Train the model
   */
  async train(
    samples: Sample[],
    labels: GestureLabel[],
    onProgress: (progress: TrainingProgress) => void
  ): Promise<TrainingResult> {
    console.log(`Training with ${samples.length} samples, ${labels.length} classes`);

    // Create model
    this.model = this.createModel(labels.length);

    // Prepare data
    const { xTensor, yTensor } = this.prepareData(samples, labels);

    // Training configuration
    const epochs = 50;
    const batchSize = 8;
    const validationSplit = 0.2;

    try {
      // Train model
      const history = await this.model.fit(xTensor, yTensor, {
        epochs,
        batchSize,
        validationSplit,
        shuffle: true,
        callbacks: {
          onEpochEnd: (epoch, logs) => {
            onProgress({
              epoch: epoch + 1,
              totalEpochs: epochs,
              loss: logs?.loss || 0,
              accuracy: logs?.acc || 0,
              valLoss: logs?.val_loss,
              valAccuracy: logs?.val_acc,
            });
          },
        },
      });

      // Get final metrics
      const finalEpoch = history.history.acc.length - 1;
      const accuracy = history.history.val_acc?.[finalEpoch] || history.history.acc[finalEpoch];
      const loss = history.history.val_loss?.[finalEpoch] || history.history.loss[finalEpoch];

      // Calculate model size
      const modelSizeKB = this.estimateModelSize();

      return {
        accuracy: typeof accuracy === 'number' ? accuracy : (accuracy as any)[0],
        loss: typeof loss === 'number' ? loss : (loss as any)[0],
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

    // Assume 4 bytes per float32 parameter
    return (totalParams * 4) / 1024;
  }

  /**
   * Convert model to TFLite format (for deployment)
   * Note: Full TFLite conversion requires server-side Python
   * This is a placeholder that returns the model for now
   */
  async exportToTFLite(): Promise<Blob> {
    if (!this.model) {
      throw new Error('No model trained');
    }

    // For Light Mode, we'll save as TF.js format
    // For Full Mode, this would be sent to server for TFLite conversion
    const saveResult = await this.model.save(tf.io.withSaveHandler(async (artifacts) => {
      return {
        modelArtifactsInfo: {
          dateSaved: new Date(),
          modelTopologyType: 'JSON',
        },
      };
    }));

    // Return a placeholder blob for now
    // In production, this would be converted to TFLite format
    return new Blob(['tflite-placeholder'], { type: 'application/octet-stream' });
  }

  /**
   * Get the trained model
   */
  getModel(): tf.LayersModel | null {
    return this.model;
  }

  /**
   * Run inference on a single sample
   */
  predict(sampleData: number[][]): { prediction: number; confidence: number } {
    if (!this.model) {
      throw new Error('No model trained');
    }

    // Prepare input
    let input = sampleData;
    if (input.length < WINDOW_SIZE) {
      input = [...input];
      while (input.length < WINDOW_SIZE) {
        input.push([0, 0, 0, 0, 0, 0]);
      }
    } else if (input.length > WINDOW_SIZE) {
      input = input.slice(0, WINDOW_SIZE);
    }

    // Run prediction
    const inputTensor = tf.tensor3d([input]);
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
