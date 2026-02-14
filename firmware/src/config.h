#ifndef CONFIG_H
#define CONFIG_H

#include <stdint.h>

// ============================================================================
// FIRMWARE VERSION
// ============================================================================
#ifndef FIRMWARE_VERSION_MAJOR
#define FIRMWARE_VERSION_MAJOR 1
#endif
#ifndef FIRMWARE_VERSION_MINOR
#define FIRMWARE_VERSION_MINOR 1
#endif

// ============================================================================
// BLE DEVICE NAMING
// ============================================================================
// Each Arduino gets a unique name based on its hardware ID
// Format: "SevernEdgeAI-XXXX" where XXXX is derived from device ID
// This helps students identify their specific device!
#define DEVICE_NAME_PREFIX "SevernEdgeAI"
#define DEVICE_NAME_MAX_LEN 20
// Lookup table: map hardware hex IDs to classroom numbers
// To find a new board's hex ID, flash with an empty tabl;e and check serial
// output
struct DeviceMapping {
  uint16_t hexId;
  uint8_t classroomNum;
};
static const DeviceMapping DEVICE_MAP[] = {
    {0x91D8, 1},  {0x4320, 2},  {0xA192, 3},
    {0x73DA, 4},  {0x3F26, 5},  {0xFC4C, 6},
    {0xDA72, 7},  {0x6F7B, 8},  {0xEF23, 9},
    {0x788d, 10}, {0x88D5, 11}, {0x8AAE, 12},
    {0x1B7E, 13}, {0xEB92, 14}, {0x76C7, 15},
    {0xEE03, 16}, {0x2EAB, 17}, {0x9A11, 18},
    {0x1E7E, 19}, {0x6AA3, 20}

    // Add more boards here: {0xXXXX, N}
};

#define DEVICE_MAP_SIZE (sizeof(DEVICE_MAP) / sizeof(DEVICE_MAP[0]))

// ============================================================================
// BLE UUIDs (Severn Edge AI Service)
// ============================================================================
#define SERVICE_UUID "19B10000-E8F2-537E-4F6C-D104768A1214"

// Characteristics
#define MODE_CHAR_UUID "19B10001-E8F2-537E-4F6C-D104768A1214"
#define SENSOR_CHAR_UUID "19B10002-E8F2-537E-4F6C-D104768A1214"
#define INFERENCE_CHAR_UUID "19B10003-E8F2-537E-4F6C-D104768A1214"
#define DEVICE_INFO_UUID "19B10004-E8F2-537E-4F6C-D104768A1214"
#define CONFIG_CHAR_UUID "19B10005-E8F2-537E-4F6C-D104768A1214"
#define MODEL_UPLOAD_UUID                                                      \
  "19B10006-E8F2-537E-4F6C-D104768A1214" // Model upload (write)
#define MODEL_STATUS_UUID                                                      \
  "19B10007-E8F2-537E-4F6C-D104768A1214" // Upload status (notify)

// ============================================================================
// MODEL STORAGE CONFIGURATION
// ============================================================================
// Note: We now use SimpleNN format instead of TFLite!
// See docs/NEURAL_NETWORK_BASICS.md for details
#define MODEL_CHUNK_SIZE 240 // BLE MTU-safe chunk size

// ============================================================================
// SIMPLENN CONFIGURATION
// ============================================================================
// These MUST match the web app's training service!
// Architecture: Input(600) → Dense(32, relu) → Dense(N, softmax)
#define NN_INPUT_SIZE 600 // 100 samples × 6 axes = 600
#define NN_HIDDEN_SIZE 32 // Hidden layer neurons
#define NN_MAX_CLASSES 8  // Maximum gesture classes

// Model weight buffer sizes
// hiddenWeights: 32 × 600 = 19,200 floats = 76,800 bytes
// hiddenBiases: 32 floats = 128 bytes
// outputWeights: 8 × 32 = 256 floats = 1,024 bytes (max)
// outputBiases: 8 floats = 32 bytes (max)
// Total max: ~78 KB
#define MAX_MODEL_SIZE 85000 // ~83 KB buffer for SimpleNN weights

// ============================================================================
// SENSOR CONFIGURATION
// ============================================================================
#define DEFAULT_SAMPLE_RATE_HZ 25
#define MIN_SAMPLE_RATE_HZ 10
#define MAX_SAMPLE_RATE_HZ 50

// Scaling factors for conversion
#define ACCEL_SCALE 8192.0f // int16 ÷ 8192 → g (±4g range)
#define GYRO_SCALE 16.4f    // int16 ÷ 16.4 → dps (±2000°/s range)

// ============================================================================
// INFERENCE CONFIGURATION
// ============================================================================
#define WINDOW_SIZE 100 // Number of samples in sliding window
#define WINDOW_STRIDE                                                          \
  25 // Samples to slide after inference (1 sec @ 25Hz = faster response!)
#define NUM_CLASSES 3 // Default number of gesture classes

// ============================================================================
// OPERATING MODES
// ============================================================================
#define MODE_COLLECT 0   // Stream sensor data for training
#define MODE_INFERENCE 1 // Run inference on device

// ============================================================================
// SAFETY & RELIABILITY
// ============================================================================
#define WATCHDOG_TIMEOUT_MS 4000
#define RECONNECT_DEBOUNCE_MS 500
#define MIN_FREE_HEAP_BYTES 2048

// ============================================================================
// PACKET STRUCTURE
// ============================================================================
#define SENSOR_PACKET_SIZE 17 // 6×int16 + 2×uint16 + 1×uint8 = 17 bytes

// ============================================================================
// DEBUG (uncomment to enable serial debugging)
// ============================================================================
#define DEBUG_MODE
#ifdef DEBUG_MODE
#define DEBUG_PRINT(x) Serial.print(x)
#define DEBUG_PRINTLN(x) Serial.println(x)
#else
#define DEBUG_PRINT(x)
#define DEBUG_PRINTLN(x)
#endif

#endif // CONFIG_H
