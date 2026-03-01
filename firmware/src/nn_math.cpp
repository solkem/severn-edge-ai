#include "nn_math.h"
#include <math.h>

static inline float relu(float value) {
    return value > 0.0f ? value : 0.0f;
}

void denseLayerForward(
    const float* input,
    float* output,
    const float* weights,
    const float* bias,
    int inputSize,
    int outputSize,
    bool useRelu
) {
    if (inputSize <= 0 || outputSize <= 0) {
        return;
    }

    for (int outIdx = 0; outIdx < outputSize; outIdx++) {
        float sum = bias[outIdx];
        const float* neuronWeights = &weights[outIdx * inputSize];

        for (int inIdx = 0; inIdx < inputSize; inIdx++) {
            sum += input[inIdx] * neuronWeights[inIdx];
        }

        output[outIdx] = useRelu ? relu(sum) : sum;
    }
}

void softmaxInPlace(float* values, int size) {
    if (size <= 0) {
        return;
    }

    float maxVal = values[0];
    for (int i = 1; i < size; i++) {
        if (values[i] > maxVal) {
            maxVal = values[i];
        }
    }

    float sum = 0.0f;
    for (int i = 0; i < size; i++) {
        values[i] = expf(values[i] - maxVal);
        sum += values[i];
    }

    if (sum <= 0.0f) {
        return;
    }

    for (int i = 0; i < size; i++) {
        values[i] /= sum;
    }
}

int argmaxIndex(const float* values, int size) {
    if (size <= 0) {
        return -1;
    }

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
