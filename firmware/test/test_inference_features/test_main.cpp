#include <unity.h>
#include "inference_features.h"

void test_normalization_pipeline_matches_constants() {
    TEST_ASSERT_FLOAT_WITHIN(1e-5f, 0.5f, normalizeAccelSample(16384));
    TEST_ASSERT_FLOAT_WITHIN(1e-4f, -0.25f, normalizeAccelSample(-8192));

    TEST_ASSERT_FLOAT_WITHIN(1e-4f, 1.0f, normalizeGyroSample(8200));
    TEST_ASSERT_FLOAT_WITHIN(1e-4f, -0.5f, normalizeGyroSample(-4100));
}

void test_motion_score_static_window_is_below_threshold() {
    float samples[8][6] = {{0}};

    const float motion = estimateMotionScoreFromWindow(samples, 8);
    TEST_ASSERT_TRUE(motion < MOTION_STILL_THRESHOLD);
}

void test_motion_score_dynamic_window_is_above_threshold() {
    float samples[8][6] = {{0}};
    for (int i = 0; i < 8; i++) {
      const float step = (float)i;
      samples[i][0] = 0.02f * step;
      samples[i][1] = 0.01f * step;
      samples[i][2] = 0.015f * step;
      samples[i][3] = 0.04f + 0.005f * step;
      samples[i][4] = 0.03f + 0.004f * step;
      samples[i][5] = 0.02f + 0.003f * step;
    }

    const float motion = estimateMotionScoreFromWindow(samples, 8);
    TEST_ASSERT_TRUE(motion > MOTION_STILL_THRESHOLD);
}

int main(int argc, char** argv) {
    (void)argc;
    (void)argv;

    UNITY_BEGIN();
    RUN_TEST(test_normalization_pipeline_matches_constants);
    RUN_TEST(test_motion_score_static_window_is_below_threshold);
    RUN_TEST(test_motion_score_dynamic_window_is_above_threshold);
    return UNITY_END();
}
