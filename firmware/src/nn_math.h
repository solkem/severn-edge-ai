#ifndef NN_MATH_H
#define NN_MATH_H

void denseLayerForward(
    const float* input,
    float* output,
    const float* weights,
    const float* bias,
    int inputSize,
    int outputSize,
    bool useRelu
);

void softmaxInPlace(float* values, int size);

int argmaxIndex(const float* values, int size);

#endif // NN_MATH_H
