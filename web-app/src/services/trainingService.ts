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
import { MODEL_CONFIG, NN_INPUT_SIZE, NN_HIDDEN_SIZE, NN_MAX_CLASSES } from '../config/constants';

const INPUT_SHAPE = [MODEL_CONFIG.WINDOW_SIZE, MODEL_CONFIG.NUM_AXES];

export class TrainingService {
  private model: tf.LayersModel | null = null;

  /**
   * Create the SimpleNN model architecture
   * 
   * ============================================================================
   * WHY THIS ARCHITECTURE?
   * ============================================================================
   * 
   * We use a simple 2-layer network because:
   * 1. It's small enough to fit in Arduino's limited memory (~78KB for weights)
   * 2. It's fast enough to run in real-time on the Arduino
   * 3. It's simple enough for students to understand
   * 4. It still works surprisingly well for gesture recognition!
   * 
   * The architecture:
   * 
   *   Input (100  6 = 600 numbers)
   *         
   *   [Flatten] - reshape to 1D
   *         
   *   [Dense 32 neurons] - hidden layer with ReLU
   *           
   *   [Dense N neurons] - output layer with Softmax
   *         
   *   Prediction (one probability per gesture)
   */
  createModel(numClasses: number): tf.LayersModel {
    console.log(`Creating SimpleNN model for ${numClasses} classes`);
    
    if (numClasses > NN_MAX_CLASSES) {
      throw new Error(`Too many classes: ${numClasses}. Maximum is ${NN_MAX_CLASSES}`);
    }

    const model = tf.sequential();

    // Flatten: (100, 6)  (600)
    // This converts our 2D time-series data into a 1D vector
    model.add(
      tf.layers.flatten({
        inputShape: INPUT_SHAPE,
        name: 'flatten'
      })
    );

    // Hidden Layer: 600  32
    // This is where the "learning" happens!
    // The network learns which combinations of sensor readings
    // are important for recognizing each gesture.
    model.add(
      tf.layers.dense({
        units: NN_HIDDEN_SIZE,
        activation: 'relu',
        name: 'hidden',
        // Initialize with small random weights
        kernelInitializer: 'glorotNormal',
        biasInitializer: 'zeros'
      })
    );

    // Output Layer: 32  numClasses
    // Each output neuron gives the probability of one gesture.
    // Softmax ensures all probabilities add up to 1.0
    model.add(
      tf.layers.dense({
        units: numClasses,
        activation: 'softmax',
        name: 'output',
        kernelInitializer: 'glorotNormal',
        biasInitializer: 'zeros'
      })
    );

    // Compile the model with optimizer and loss function
    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy'],
    });

    // Print model summary
    console.log('Model created:');
    model.summary();

    return model;
  }

  /**
   * Prepare training data from samples
   * 
   * This converts your recorded gesture samples into the format
   * that TensorFlow.js needs for training.
   */
  prepareData(samples: Sample[], labels: GestureLabel[]) {
    const labelMap = new Map(labels.map((l, idx) => [l.id, idx]));

    const xs: number[][][] = [];
    const ys: number[] = [];

    for (const sample of samples) {
      // Ensure sample has exactly MODEL_CONFIG.WINDOW_SIZE samples
      if (sample.data.length < MODEL_CONFIG.WINDOW_SIZE) {
        // Pad with zeros
        const padded = [...sample.data];
        while (padded.length < MODEL_CONFIG.WINDOW_SIZE) {
          padded.push([0, 0, 0, 0, 0, 0]);
        }
        xs.push(padded.slice(0, MODEL_CONFIG.WINDOW_SIZE));
      } else if (sample.data.length > MODEL_CONFIG.WINDOW_SIZE) {
        // Truncate
        xs.push(sample.data.slice(0, MODEL_CONFIG.WINDOW_SIZE));
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
   * 
   * ============================================================================
   * HOW TRAINING WORKS
   * ============================================================================
   * 
   * Training is an iterative process:
   * 1. Show the network your gesture samples
   * 2. The network makes predictions (initially random!)
   * 3. Compare predictions to the correct answers
   * 4. Calculate how wrong the network was (the "loss")
   * 5. Adjust the weights slightly to reduce the loss
   * 6. Repeat many times (epochs)
   * 
   * After enough repetitions, the network learns patterns in your data!
   */
  async train(
    samples: Sample[],
    labels: GestureLabel[],
    onProgress: (progress: TrainingProgress) => void
  ): Promise<TrainingResult> {
    console.log(`Training SimpleNN with ${samples.length} samples, ${labels.length} classes`);

    // Create model
    this.model = this.createModel(labels.length);

    // Prepare data
    const { xTensor, yTensor } = this.prepareData(samples, labels);

    // Training configuration
    const epochs = MODEL_CONFIG.EPOCHS;
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

      console.log(`Training complete! Accuracy: ${(accuracy as number * 100).toFixed(1)}%`);

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
   * 
   * For SimpleNN with 32 hidden neurons and N classes:
   * - Hidden weights: 600  32 = 19,200 floats = 76.8 KB
   * - Hidden biases: 32 floats = 128 bytes
   * - Output weights: 32  N floats
   * - Output biases: N floats
   * 
   * Total: ~77-78 KB depending on number of classes
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

// Singleton instance
export const trainingService = new TrainingService();
