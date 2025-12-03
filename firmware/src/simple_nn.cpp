/**
 * Simple Neural Network Inference Engine - Implementation
 * 
 * ============================================================================
 * EDUCATIONAL IMPLEMENTATION - See docs/NEURAL_NETWORK_BASICS.md
 * ============================================================================
 * 
 * This file contains the actual math that runs a neural network.
 * Every line of code here is doing what TensorFlow does internally!
 */

#include "simple_nn.h"
#include <math.h>

// ============================================================================
// CONSTRUCTOR
// ============================================================================

SimpleNN::SimpleNN() {
    modelLoaded = false;
    numClasses = 0;
    hiddenWeights = nullptr;
    hiddenBias = nullptr;
    outputWeights = nullptr;
    outputBias = nullptr;
    labels = nullptr;
    lastConfidence = 0;
    
    // Clear working memory
    memset(hiddenOutput, 0, sizeof(hiddenOutput));
}

// ============================================================================
// MODEL LOADING
// ============================================================================

bool SimpleNN::loadModel(const SimpleNNModel* modelData) {
    // Validate magic number
    if (modelData->magic != SIMPLE_NN_MAGIC) {
        DEBUG_PRINTLN("SimpleNN: Invalid magic number");
        modelLoaded = false;
        return false;
    }
    
    // Validate dimensions
    if (modelData->inputSize != NN_INPUT_SIZE) {
        DEBUG_PRINT("SimpleNN: Wrong input size, expected ");
        DEBUG_PRINT(NN_INPUT_SIZE);
        DEBUG_PRINT(" got ");
        DEBUG_PRINTLN(modelData->inputSize);
        modelLoaded = false;
        return false;
    }
    
    if (modelData->hiddenSize != NN_HIDDEN_SIZE) {
        DEBUG_PRINT("SimpleNN: Wrong hidden size, expected ");
        DEBUG_PRINT(NN_HIDDEN_SIZE);
        DEBUG_PRINT(" got ");
        DEBUG_PRINTLN(modelData->hiddenSize);
        modelLoaded = false;
        return false;
    }
    
    if (modelData->numClasses < 1 || modelData->numClasses > NN_MAX_CLASSES) {
        DEBUG_PRINT("SimpleNN: Invalid number of classes: ");
        DEBUG_PRINTLN(modelData->numClasses);
        modelLoaded = false;
        return false;
    }
    
    // Store pointers to weight data
    numClasses = modelData->numClasses;
    hiddenWeights = modelData->hiddenWeights;
    hiddenBias = modelData->hiddenBias;
    outputWeights = modelData->outputWeights;
    outputBias = modelData->outputBias;
    labels = modelData->labels;
    
    modelLoaded = true;
    
    DEBUG_PRINTLN("SimpleNN: Model loaded successfully!");
    DEBUG_PRINT("  Classes: ");
    DEBUG_PRINTLN(numClasses);
    DEBUG_PRINT("  Input size: ");
    DEBUG_PRINTLN(modelData->inputSize);
    DEBUG_PRINT("  Hidden size: ");
    DEBUG_PRINTLN(modelData->hiddenSize);
    
    return true;
}

const char* SimpleNN::getLabel(uint8_t classIndex) const {
    if (!modelLoaded || classIndex >= numClasses) {
        return "Unknown";
    }
    return labels[classIndex];
}

// ============================================================================
// INFERENCE - The Main Event!
// ============================================================================

int SimpleNN::predict(const float* input, float* outputProbabilities) {
    if (!modelLoaded) {
        DEBUG_PRINTLN("SimpleNN: No model loaded!");
        return -1;
    }
    
    // ========================================================================
    // LAYER 1: Input → Hidden
    // ========================================================================
    // 
    // For each of the 32 hidden neurons:
    //   1. Multiply each of the 600 inputs by its corresponding weight
    //   2. Sum them all up
    //   3. Add the bias
    //   4. Apply ReLU activation
    //
    // This is where the network "looks for patterns" in the sensor data!
    // ========================================================================
    
    denseLayer(
        input,              // 600 input values (sensor data)
        hiddenOutput,       // 32 output values (pattern activations)
        hiddenWeights,      // 32 × 600 = 19,200 weights
        hiddenBias,         // 32 biases
        NN_INPUT_SIZE,      // 600
        NN_HIDDEN_SIZE,     // 32
        true                // Use ReLU activation
    );
    
    // ========================================================================
    // LAYER 2: Hidden → Output
    // ========================================================================
    //
    // For each output class (e.g., Wave, Shake, Circle):
    //   1. Multiply each hidden neuron output by its weight
    //   2. Sum them up
    //   3. Add the bias
    //
    // No ReLU here - we'll apply softmax after to get probabilities
    // ========================================================================
    
    denseLayer(
        hiddenOutput,           // 32 hidden neuron outputs
        outputProbabilities,    // N class scores
        outputWeights,          // N × 32 weights
        outputBias,             // N biases
        NN_HIDDEN_SIZE,         // 32
        numClasses,             // Number of output classes
        false                   // No ReLU - raw scores for softmax
    );
    
    // ========================================================================
    // SOFTMAX: Convert to Probabilities
    // ========================================================================
    //
    // The raw outputs might be [-2.3, 5.1, 1.2]
    // Softmax converts to [0.01, 0.95, 0.04] - probabilities that sum to 1!
    // ========================================================================
    
    softmax(outputProbabilities, numClasses);
    
    // ========================================================================
    // FIND THE WINNER
    // ========================================================================
    //
    // Which class has the highest probability?
    // ========================================================================
    
    int prediction = argmax(outputProbabilities, numClasses);
    lastConfidence = outputProbabilities[prediction];
    
    return prediction;
}

// ============================================================================
// DENSE LAYER - The Core Neural Network Operation
// ============================================================================
//
// This function implements a "fully connected" or "dense" layer.
// Every input is connected to every output through a weight.
//
// The math for one output neuron:
//   output = bias + (input[0] × weight[0]) + (input[1] × weight[1]) + ...
//
// In matrix notation: output = input · weights^T + bias
// ============================================================================

void SimpleNN::denseLayer(
    const float* input,
    float* output,
    const float* weights,
    const float* bias,
    int inputSize,
    int outputSize,
    bool useRelu
) {
    // For each output neuron...
    for (int outIdx = 0; outIdx < outputSize; outIdx++) {
        // Start with the bias
        float sum = bias[outIdx];
        
        // Add up: input[j] × weight[outIdx][j] for all j
        // Weights are stored as [outIdx * inputSize + inIdx]
        const float* neuronWeights = &weights[outIdx * inputSize];
        
        for (int inIdx = 0; inIdx < inputSize; inIdx++) {
            sum += input[inIdx] * neuronWeights[inIdx];
        }
        
        // Apply activation function
        if (useRelu) {
            output[outIdx] = relu(sum);
        } else {
            output[outIdx] = sum;
        }
    }
}

// ============================================================================
// SOFTMAX - Convert to Probabilities
// ============================================================================
//
// Softmax formula: softmax(x_i) = exp(x_i) / Σ exp(x_j)
//
// Steps:
// 1. Find the maximum value (for numerical stability)
// 2. Subtract max from all values
// 3. Compute exp() of each
// 4. Divide each by the sum
//
// The "subtract max" trick prevents overflow when computing exp()
// ============================================================================

void SimpleNN::softmax(float* values, int size) {
    // Step 1: Find maximum for numerical stability
    float maxVal = values[0];
    for (int i = 1; i < size; i++) {
        if (values[i] > maxVal) {
            maxVal = values[i];
        }
    }
    
    // Step 2 & 3: Compute exp(x - max) and sum
    float sum = 0;
    for (int i = 0; i < size; i++) {
        values[i] = expf(values[i] - maxVal);
        sum += values[i];
    }
    
    // Step 4: Normalize to get probabilities
    for (int i = 0; i < size; i++) {
        values[i] /= sum;
    }
}

// ============================================================================
// ARGMAX - Find the Winner
// ============================================================================

int SimpleNN::argmax(const float* values, int size) {
    int maxIdx = 0;
    float maxVal = values[0];
    
    for (int i = 1; i < size; i++) {
        if (values[i] > maxVal) {
            maxVal = values[i];
            maxIdx = i;
        }
    }
    
    return maxIdx;
}
