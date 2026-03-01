#ifndef INFERENCE_FEATURES_H
#define INFERENCE_FEATURES_H

#include <stdint.h>

static const float NORM_ACCEL = 4.0f;
static const float NORM_GYRO = 500.0f;
static const float MOTION_STILL_THRESHOLD = 0.010f;

float normalizeAccelSample(int16_t rawValue);

float normalizeGyroSample(int16_t rawValue);

float estimateMotionScoreFromWindow(const float sampleWindow[][6], int sampleCount);

#endif // INFERENCE_FEATURES_H
