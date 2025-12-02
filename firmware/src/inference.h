#ifndef INFERENCE_H
#define INFERENCE_H

#include <Arduino.h>
#include "config.h"
#include "sensor_reader.h"

// ============================================================================
// TensorFlow Lite Micro Inference Engine
// ============================================================================

// Initialize the TFLite interpreter with the model
bool setupInference();

// Add a sensor sample to the sliding window buffer
void addSample(int16_t ax, int16_t ay, int16_t az, int16_t gx, int16_t gy, int16_t gz);

// Check if we have enough samples for inference
bool isWindowReady();

// Run inference on the current window
// Returns: predicted class index
// confidence: output parameter for confidence score (0.0-1.0)
int runInference(float* confidence);

// Slide the window by WINDOW_STRIDE samples
void slideWindow();

// Get the current number of samples in buffer
int getSampleCount();

#endif // INFERENCE_H
