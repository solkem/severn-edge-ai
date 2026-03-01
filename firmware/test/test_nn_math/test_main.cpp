#include <unity.h>
#include <math.h>
#include "nn_math.h"

void test_dense_layer_bias_only() {
    const float input[3] = {1.0f, -2.0f, 3.0f};
    const float weights[6] = {
        0.0f, 0.0f, 0.0f,
        0.0f, 0.0f, 0.0f,
    };
    const float bias[2] = {0.5f, -1.0f};
    float output[2] = {0.0f, 0.0f};

    denseLayerForward(input, output, weights, bias, 3, 2, false);

    TEST_ASSERT_FLOAT_WITHIN(1e-6f, 0.5f, output[0]);
    TEST_ASSERT_FLOAT_WITHIN(1e-6f, -1.0f, output[1]);
}

void test_dense_layer_identity_with_relu() {
    const float input[3] = {1.0f, -2.0f, 0.5f};
    const float weights[9] = {
        1.0f, 0.0f, 0.0f,
        0.0f, 1.0f, 0.0f,
        0.0f, 0.0f, 1.0f,
    };
    const float bias[3] = {0.0f, 0.0f, 0.0f};
    float output[3] = {0.0f, 0.0f, 0.0f};

    denseLayerForward(input, output, weights, bias, 3, 3, true);

    TEST_ASSERT_FLOAT_WITHIN(1e-6f, 1.0f, output[0]);
    TEST_ASSERT_FLOAT_WITHIN(1e-6f, 0.0f, output[1]);
    TEST_ASSERT_FLOAT_WITHIN(1e-6f, 0.5f, output[2]);
}

void test_dense_layer_negative_weights() {
    const float input[2] = {2.0f, -1.0f};
    const float weights[4] = {
        -1.0f, 0.5f,
        -0.25f, -0.75f,
    };
    const float bias[2] = {0.0f, 0.2f};
    float output[2] = {0.0f, 0.0f};

    denseLayerForward(input, output, weights, bias, 2, 2, false);

    // out0 = (2 * -1.0) + (-1 * 0.5) = -2.5
    // out1 = (2 * -0.25) + (-1 * -0.75) + 0.2 = 0.45
    TEST_ASSERT_FLOAT_WITHIN(1e-6f, -2.5f, output[0]);
    TEST_ASSERT_FLOAT_WITHIN(1e-6f, 0.45f, output[1]);
}

void test_softmax_stability_and_argmax() {
    float values[3] = {1000.0f, 1001.0f, 999.0f};

    softmaxInPlace(values, 3);

    const float sum = values[0] + values[1] + values[2];
    TEST_ASSERT_FALSE(isnan(values[0]));
    TEST_ASSERT_FALSE(isnan(values[1]));
    TEST_ASSERT_FALSE(isnan(values[2]));
    TEST_ASSERT_FLOAT_WITHIN(1e-5f, 1.0f, sum);

    const int idx = argmaxIndex(values, 3);
    TEST_ASSERT_EQUAL_INT(1, idx);
}

int main(int argc, char** argv) {
    (void)argc;
    (void)argv;

    UNITY_BEGIN();
    RUN_TEST(test_dense_layer_bias_only);
    RUN_TEST(test_dense_layer_identity_with_relu);
    RUN_TEST(test_dense_layer_negative_weights);
    RUN_TEST(test_softmax_stability_and_argmax);
    return UNITY_END();
}
