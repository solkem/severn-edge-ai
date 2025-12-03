/**
 * Severn Edge AI - SimpleNN Inference Engine
 * 
 * ============================================================================
 * EDUCATIONAL IMPLEMENTATION - No TensorFlow Required!
 * ============================================================================
 * 
 * This module uses our hand-written neural network (SimpleNN) instead of
 * TensorFlow Lite. Students can see exactly what happens during inference!
 * 
 * See docs/NEURAL_NETWORK_BASICS.md for a full explanation of:
 *   - What neural networks are
 *   - How matrix multiplication works
 *   - What activation functions do
 *   - Why we built our own instead of using TFLite
 */

#include "inference.h"
#include "flash_storage.h"
#include "simple_nn.h"

// ============================================================================
// Sliding Window Buffer
// ============================================================================
// We collect 100 samples of sensor data (at 25Hz = 4 seconds)
// Each sample has 6 values: ax, ay, az, gx, gy, gz
// Total: 100 × 6 = 600 input values to the neural network
// ============================================================================
static float sampleBuffer[WINDOW_SIZE][6];  // 100 samples × 6 axes (normalized)
static int sampleIndex = 0;

// ============================================================================
// SimpleNN Instance
// ============================================================================
static SimpleNN neuralNetwork;

// ============================================================================
// SETUP
// ============================================================================

bool setupInference() {
    DEBUG_PRINTLN("Setting up SimpleNN inference engine...");
    DEBUG_PRINTLN("(See docs/NEURAL_NETWORK_BASICS.md for how this works!)");

    // Reset buffer
    sampleIndex = 0;
    memset(sampleBuffer, 0, sizeof(sampleBuffer));

    // Initialize flash storage
    initFlashStorage();

    // Check if we have a model stored
    if (!hasStoredModel()) {
        DEBUG_PRINTLN("No model stored - waiting for BLE upload from web app");
        return true;  // Continue in fallback mode
    }

    return reloadModel();
}

bool reloadModel() {
    DEBUG_PRINTLN("Loading SimpleNN model from storage...");

    const SimpleNNModel* modelData = getStoredSimpleNNModel();
    if (modelData == nullptr) {
        DEBUG_PRINTLN("Failed to get model from storage");
        return false;
    }

    if (!neuralNetwork.loadModel(modelData)) {
        DEBUG_PRINTLN("Failed to load model into SimpleNN");
        return false;
    }

    DEBUG_PRINTLN("SimpleNN model loaded successfully!");
    DEBUG_PRINT("  Classes: ");
    DEBUG_PRINTLN(neuralNetwork.getNumClasses());
    
    // Print class labels
    for (uint32_t i = 0; i < neuralNetwork.getNumClasses(); i++) {
        DEBUG_PRINT("    ");
        DEBUG_PRINT(i);
        DEBUG_PRINT(": ");
        DEBUG_PRINTLN(neuralNetwork.getLabel(i));
    }

    return true;
}

bool isModelLoaded() {
    return neuralNetwork.isModelLoaded();
}

// ============================================================================
// SAMPLE COLLECTION
// ============================================================================

void addSample(int16_t ax, int16_t ay, int16_t az, int16_t gx, int16_t gy, int16_t gz) {
    if (sampleIndex < WINDOW_SIZE) {
        // Normalize values to approximately -1 to +1 range
        // This matches what the web app does during training
        sampleBuffer[sampleIndex][0] = (float)ax / ACCEL_SCALE;
        sampleBuffer[sampleIndex][1] = (float)ay / ACCEL_SCALE;
        sampleBuffer[sampleIndex][2] = (float)az / ACCEL_SCALE;
        sampleBuffer[sampleIndex][3] = (float)gx / GYRO_SCALE / 100.0f;
        sampleBuffer[sampleIndex][4] = (float)gy / GYRO_SCALE / 100.0f;
        sampleBuffer[sampleIndex][5] = (float)gz / GYRO_SCALE / 100.0f;
        sampleIndex++;
    }
}

bool isWindowReady() {
    return sampleIndex >= WINDOW_SIZE;
}

int getSampleCount() {
    return sampleIndex;
}

// ============================================================================
// INFERENCE
// ============================================================================

int runInference(float* confidence) {
    if (!isWindowReady()) {
        *confidence = 0.0f;
        return -1;
    }

    // ========================================================================
    // Fallback Mode (no model loaded)
    // ========================================================================
    if (!neuralNetwork.isModelLoaded()) {
        DEBUG_PRINTLN("Inference (fallback mode - no trained model)");
        *confidence = 0.50f;
        return 0;
    }

    // ========================================================================
    // FLATTEN the 2D sample buffer into 1D input array
    // ========================================================================
    // The neural network expects a flat array of 600 values:
    //   [ax0, ay0, az0, gx0, gy0, gz0, ax1, ay1, az1, gx1, ...]
    // ========================================================================
    float flatInput[WINDOW_SIZE * 6];
    for (int i = 0; i < WINDOW_SIZE; i++) {
        for (int j = 0; j < 6; j++) {
            flatInput[i * 6 + j] = sampleBuffer[i][j];
        }
    }

    // ========================================================================
    // RUN THE NEURAL NETWORK
    // ========================================================================
    // This is where the magic happens! Inside predict():
    //   1. Matrix multiply: input × hidden_weights + hidden_bias
    //   2. Apply ReLU activation
    //   3. Matrix multiply: hidden × output_weights + output_bias
    //   4. Apply softmax to get probabilities
    //   5. Return the class with highest probability
    // ========================================================================
    float probabilities[NN_MAX_CLASSES];
    int prediction = neuralNetwork.predict(flatInput, probabilities);
    
    *confidence = neuralNetwork.getLastConfidence();

    // Print result
    DEBUG_PRINT("Prediction: ");
    DEBUG_PRINT(prediction);
    DEBUG_PRINT(" (");
    DEBUG_PRINT(neuralNetwork.getLabel(prediction));
    DEBUG_PRINT(") confidence: ");
    DEBUG_PRINT((int)(*confidence * 100));
    DEBUG_PRINTLN("%");

    return prediction;
}

const char* getPredictionLabel(int classIndex) {
    return neuralNetwork.getLabel(classIndex);
}

// ============================================================================
// SLIDING WINDOW
// ============================================================================

void slideWindow() {
    // Keep the last (WINDOW_SIZE - WINDOW_STRIDE) samples
    int keep = WINDOW_SIZE - WINDOW_STRIDE;

    // Shift samples to the beginning
    for (int i = 0; i < keep; i++) {
        for (int j = 0; j < 6; j++) {
            sampleBuffer[i][j] = sampleBuffer[i + WINDOW_STRIDE][j];
        }
    }

    // Reset index to continue filling from kept samples
    sampleIndex = keep;
}
