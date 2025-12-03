/**
 * Severn Edge AI - TensorFlow Lite Micro Inference Engine
 * 
 * This module handles on-device gesture recognition using a trained
 * TFLite model uploaded via BLE and stored in flash memory.
 */

#include "inference.h"
#include "flash_storage.h"

// TensorFlow Lite Micro headers
#include <TensorFlowLite.h>
#include <tensorflow/lite/micro/all_ops_resolver.h>
#include <tensorflow/lite/micro/micro_interpreter.h>
#include <tensorflow/lite/schema/schema_generated.h>

// Forward declaration
bool loadModelFromFlash();

// ============================================================================
// Sliding Window Buffer
// ============================================================================
static float sampleBuffer[WINDOW_SIZE][6];  // 100 samples × 6 axes (normalized)
static int sampleIndex = 0;

// ============================================================================
// TensorFlow Lite Micro Objects
// ============================================================================
static const tflite::Model* model = nullptr;
static tflite::MicroInterpreter* interpreter = nullptr;
static TfLiteTensor* input = nullptr;
static TfLiteTensor* output = nullptr;

// Memory arena for TFLite (must be aligned)
alignas(16) static uint8_t tensor_arena[TENSOR_ARENA_SIZE];

// All operations resolver
static tflite::AllOpsResolver resolver;

// Flag to track if model is valid
static bool modelLoaded = false;
static uint32_t loadedModelNumClasses = 0;

bool setupInference() {
    DEBUG_PRINTLN("Setting up TFLite Micro inference...");

    // Reset buffer
    sampleIndex = 0;
    memset(sampleBuffer, 0, sizeof(sampleBuffer));

    // Initialize flash storage
    initFlashStorage();

    // Check if we have a model stored in flash
    if (!hasStoredModel()) {
        DEBUG_PRINTLN("No model in flash - waiting for BLE upload");
        modelLoaded = false;
        return true;  // Continue in fallback mode
    }

    return loadModelFromFlash();
}

bool loadModelFromFlash() {
    DEBUG_PRINTLN("Loading model from flash...");

    const uint8_t* modelData = getStoredModelData();
    if (modelData == nullptr) {
        DEBUG_PRINTLN("Failed to read model from flash");
        modelLoaded = false;
        return false;
    }

    uint32_t modelSize = getStoredModelSize();
    DEBUG_PRINT("Model size: ");
    DEBUG_PRINT(modelSize);
    DEBUG_PRINTLN(" bytes");

    // Load the model
    model = tflite::GetModel(modelData);
    if (model->version() != TFLITE_SCHEMA_VERSION) {
        DEBUG_PRINT("Model schema version mismatch: ");
        DEBUG_PRINT(model->version());
        DEBUG_PRINT(" vs ");
        DEBUG_PRINTLN(TFLITE_SCHEMA_VERSION);
        modelLoaded = false;
        return false;
    }

    // Create interpreter
    static tflite::MicroInterpreter static_interpreter(
        model, resolver, tensor_arena, TENSOR_ARENA_SIZE);
    interpreter = &static_interpreter;

    // Allocate tensors
    TfLiteStatus allocate_status = interpreter->AllocateTensors();
    if (allocate_status != kTfLiteOk) {
        DEBUG_PRINTLN("AllocateTensors() failed!");
        modelLoaded = false;
        return false;
    }

    // Get input and output tensors
    input = interpreter->input(0);
    output = interpreter->output(0);

    // Store number of classes from flash metadata
    loadedModelNumClasses = getStoredModelNumClasses();

    DEBUG_PRINTLN("TFLite Micro initialized successfully!");
    DEBUG_PRINT("Arena used: ");
    DEBUG_PRINT(interpreter->arena_used_bytes());
    DEBUG_PRINT(" bytes, Classes: ");
    DEBUG_PRINTLN(loadedModelNumClasses);

    modelLoaded = true;
    return true;
}

bool reloadModel() {
    // Called after a new model is uploaded via BLE
    DEBUG_PRINTLN("Reloading model after BLE upload...");
    return loadModelFromFlash();
}

bool isModelLoaded() {
    return modelLoaded;
}


void addSample(int16_t ax, int16_t ay, int16_t az, int16_t gx, int16_t gy, int16_t gz) {
    if (sampleIndex < WINDOW_SIZE) {
        // Normalize values: convert from int16 back to physical units
        // These should match the normalization used during training
        sampleBuffer[sampleIndex][0] = (float)ax / ACCEL_SCALE;
        sampleBuffer[sampleIndex][1] = (float)ay / ACCEL_SCALE;
        sampleBuffer[sampleIndex][2] = (float)az / ACCEL_SCALE;
        sampleBuffer[sampleIndex][3] = (float)gx / GYRO_SCALE / 100.0f;  // Scale gyro to similar range
        sampleBuffer[sampleIndex][4] = (float)gy / GYRO_SCALE / 100.0f;
        sampleBuffer[sampleIndex][5] = (float)gz / GYRO_SCALE / 100.0f;
        sampleIndex++;
    }
}

bool isWindowReady() {
    return sampleIndex >= WINDOW_SIZE;
}

int runInference(float* confidence) {
    if (!isWindowReady()) {
        *confidence = 0.0f;
        return -1;
    }

    // Fallback mode when no real model is loaded
    if (!modelLoaded || interpreter == nullptr) {
        DEBUG_PRINTLN("Running inference (fallback mode - no trained model)");
        *confidence = 0.50f;
        return 0;
    }

    // Copy buffer to input tensor
    float* input_data = input->data.f;
    for (int i = 0; i < WINDOW_SIZE; i++) {
        for (int j = 0; j < 6; j++) {
            input_data[i * 6 + j] = sampleBuffer[i][j];
        }
    }

    // Run inference
    TfLiteStatus invoke_status = interpreter->Invoke();
    if (invoke_status != kTfLiteOk) {
        DEBUG_PRINTLN("Invoke() failed!");
        *confidence = 0.0f;
        return -1;
    }

    // Get output probabilities
    float* probabilities = output->data.f;
    int numClasses = output->dims->data[1];

    // Find class with highest probability
    int bestClass = 0;
    float bestProb = probabilities[0];
    for (int i = 1; i < numClasses; i++) {
        if (probabilities[i] > bestProb) {
            bestProb = probabilities[i];
            bestClass = i;
        }
    }

    *confidence = bestProb;

    DEBUG_PRINT("Inference: class=");
    DEBUG_PRINT(bestClass);
    if (bestClass < (int)loadedModelNumClasses) {
        DEBUG_PRINT(" (");
        DEBUG_PRINT(getStoredModelLabel(bestClass));
        DEBUG_PRINT(")");
    }
    DEBUG_PRINT(" conf=");
    DEBUG_PRINTLN((int)(bestProb * 100));

    return bestClass;
}

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

int getSampleCount() {
    return sampleIndex;
}
