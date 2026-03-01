#include "inference_features.h"
#include "config.h"
#include <math.h>

float normalizeAccelSample(int16_t rawValue) {
    return (float)rawValue / (ACCEL_SCALE * NORM_ACCEL);
}

float normalizeGyroSample(int16_t rawValue) {
    return (float)rawValue / (GYRO_SCALE * NORM_GYRO);
}

float estimateMotionScoreFromWindow(const float sampleWindow[][6], int sampleCount) {
    if (sampleCount < 2) {
        return 0.0f;
    }

    float accelDeltaMean = 0.0f;
    float gyroMean = 0.0f;
    const int count = sampleCount - 1;

    for (int i = 1; i < sampleCount; i++) {
        accelDeltaMean += fabsf(sampleWindow[i][0] - sampleWindow[i - 1][0]);
        accelDeltaMean += fabsf(sampleWindow[i][1] - sampleWindow[i - 1][1]);
        accelDeltaMean += fabsf(sampleWindow[i][2] - sampleWindow[i - 1][2]);

        gyroMean += fabsf(sampleWindow[i][3]);
        gyroMean += fabsf(sampleWindow[i][4]);
        gyroMean += fabsf(sampleWindow[i][5]);
    }

    accelDeltaMean /= (float)(count * 3);
    gyroMean /= (float)(count * 3);

    return accelDeltaMean + gyroMean;
}
