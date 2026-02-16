/**
 * Simple Neural Network Inference Engine
 * 
 * ============================================================================
 * EDUCATIONAL IMPLEMENTATION - See docs/NEURAL_NETWORK_BASICS.md
 * ============================================================================
 * 
 * This is a hand-written neural network inference engine that runs the same
 * math as TensorFlow, but with explicit, readable code. Students can see
 * exactly what's happening!
 * 
 * Network Architecture:
 *   Input: 600 values (100 samples × 6 axes)
 *   Hidden: 32 neurons with ReLU activation
 *   Output: N classes with softmax activation
 * 
 * The Math:
 *   hidden[i] = ReLU(sum(input[j] * weights[i][j]) + bias[i])
 *   output[k] = softmax(sum(hidden[i] * weights[k][i]) + bias[k])
 */

#ifndef SIMPLE_NN_H
#define SIMPLE_NN_H

#include <Arduino.h>
#include "config.h"

// ============================================================================
// NETWORK ARCHITECTURE CONSTANTS
// ============================================================================

// These are defined in config.h:
// - NN_INPUT_SIZE: 600 (100 samples × 6 axes)
// - NN_HIDDEN_SIZE: 32 neurons in hidden layer
// - NN_MAX_CLASSES: 8 maximum gesture classes

// ============================================================================
// MODEL WEIGHTS STRUCTURE
// ============================================================================

/**
 * Stored model weights - uploaded via BLE from the web app
 * 
 * Memory layout:
 *   hidden_weights: [NN_HIDDEN_SIZE][NN_INPUT_SIZE] = 32 × 600 = 19,200 floats
 *   hidden_bias: [NN_HIDDEN_SIZE] = 32 floats
 *   output_weights: [NN_MAX_CLASSES][NN_HIDDEN_SIZE] = 8 × 32 = 256 floats
 *   output_bias: [NN_MAX_CLASSES] = 8 floats
 *   labels: class names
 * 
 * Total: ~78 KB for weights (stored as float32)
 */
struct SimpleNNModel {
    uint32_t magic;              // Magic number to verify valid model
    uint32_t numClasses;         // Actual number of output classes (1-8)
    uint32_t inputSize;          // Should be NN_INPUT_SIZE (600)
    uint32_t hiddenSize;         // Should be NN_HIDDEN_SIZE (32)
    
    // Layer 1: Input → Hidden (stored as flat array)
    float hiddenWeights[NN_HIDDEN_SIZE * NN_INPUT_SIZE];  // 32 × 600 = 19,200
    float hiddenBias[NN_HIDDEN_SIZE];                      // 32
    
    // Layer 2: Hidden → Output
    float outputWeights[NN_MAX_CLASSES * NN_HIDDEN_SIZE]; // 8 × 32 = 256
    float outputBias[NN_MAX_CLASSES];                      // 8
    
    // Class labels
    char labels[NN_MAX_CLASSES][LABEL_MAX_LEN];            // 8 labels × 16 chars
};

// Magic number: "SNNN" (Simple Neural Network)
#define SIMPLE_NN_MAGIC 0x4E4E4E53

// ============================================================================
// SIMPLE NEURAL NETWORK CLASS
// ============================================================================

class SimpleNN {
public:
    SimpleNN();
    
    /**
     * Load model weights from a buffer
     * @param modelData Pointer to SimpleNNModel structure
     * @return true if model loaded successfully
     */
    bool loadModel(const SimpleNNModel* modelData);
    
    /**
     * Check if a valid model is loaded
     */
    bool isModelLoaded() const { return modelLoaded; }
    
    /**
     * Get number of classes in loaded model
     */
    uint32_t getNumClasses() const { return numClasses; }
    
    /**
     * Get class label by index
     */
    const char* getLabel(uint8_t classIndex) const;
    
    /**
     * Run inference on input data
     * 
     * @param input Array of NN_INPUT_SIZE floats (normalized sensor data)
     * @param outputProbabilities Array to store output probabilities (size = numClasses)
     * @return Predicted class index (0 to numClasses-1)
     */
    int predict(const float* input, float* outputProbabilities);
    
    /**
     * Get the confidence of the last prediction
     */
    float getLastConfidence() const { return lastConfidence; }

private:
    // Model state
    bool modelLoaded;
    uint32_t numClasses;
    
    // Pointers to weight data (stored in model structure)
    const float* hiddenWeights;
    const float* hiddenBias;
    const float* outputWeights;
    const float* outputBias;
    const char (*labels)[LABEL_MAX_LEN];
    
    // Working memory for inference
    float hiddenOutput[NN_HIDDEN_SIZE];
    float lastConfidence;
    
    // ========================================================================
    // NEURAL NETWORK MATH FUNCTIONS
    // These are the actual operations that make a neural network work!
    // ========================================================================
    
    /**
     * ReLU (Rectified Linear Unit) Activation Function
     * 
     * The simplest and most popular activation function:
     *   if (x > 0) return x
     *   else return 0
     * 
     * Why use ReLU?
     * - It's fast (just a comparison)
     * - It helps the network learn complex patterns
     * - It prevents the "vanishing gradient" problem during training
     */
    inline float relu(float x) {
        return (x > 0) ? x : 0;
    }
    
    /**
     * Softmax Activation Function
     * 
     * Converts raw output values into probabilities that sum to 1.0 (100%)
     * 
     * Formula: softmax(x_i) = exp(x_i) / sum(exp(x_j) for all j)
     * 
     * Example:
     *   Input:  [2.0, 1.0, 0.5]
     *   Output: [0.64, 0.24, 0.12]  ← Now sums to 1.0!
     */
    void softmax(float* values, int size);
    
    /**
     * Argmax - Find the index of the maximum value
     * 
     * Returns which class has the highest probability
     */
    int argmax(const float* values, int size);
    
    /**
     * Dense Layer Forward Pass
     * 
     * This is the core operation of a neural network layer!
     * For each output neuron:
     *   output[i] = activation(sum(input[j] * weights[i][j]) + bias[i])
     */
    void denseLayer(
        const float* input,
        float* output,
        const float* weights,
        const float* bias,
        int inputSize,
        int outputSize,
        bool useRelu
    );
};

#endif // SIMPLE_NN_H
