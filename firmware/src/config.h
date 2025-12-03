#ifndef CONFIG_H
#define CONFIG_H

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
// BLE UUIDs (Severn Edge AI Service)
// ============================================================================
#define DEVICE_NAME_PREFIX "Severn School Edge AI"
#define SERVICE_UUID "19B10000-E8F2-537E-4F6C-D104768A1214"

// Characteristics
#define MODE_CHAR_UUID        "19B10001-E8F2-537E-4F6C-D104768A1214"
#define SENSOR_CHAR_UUID      "19B10002-E8F2-537E-4F6C-D104768A1214"
#define INFERENCE_CHAR_UUID   "19B10003-E8F2-537E-4F6C-D104768A1214"
#define DEVICE_INFO_UUID      "19B10004-E8F2-537E-4F6C-D104768A1214"
#define CONFIG_CHAR_UUID      "19B10005-E8F2-537E-4F6C-D104768A1214"
#define MODEL_UPLOAD_UUID     "19B10006-E8F2-537E-4F6C-D104768A1214"  // Model upload (write)
#define MODEL_STATUS_UUID     "19B10007-E8F2-537E-4F6C-D104768A1214"  // Upload status (notify)

// ============================================================================
// MODEL STORAGE CONFIGURATION
// ============================================================================
#define MAX_MODEL_SIZE (20 * 1024)    // 20KB max model size
#define MODEL_CHUNK_SIZE 240          // BLE MTU-safe chunk size
#define FLASH_MODEL_MAGIC 0x4D4C5446  // "TFLM" magic number

// ============================================================================
// SENSOR CONFIGURATION
// ============================================================================
#define DEFAULT_SAMPLE_RATE_HZ 25
#define MIN_SAMPLE_RATE_HZ 10
#define MAX_SAMPLE_RATE_HZ 50

// Scaling factors for conversion
#define ACCEL_SCALE 8192.0f   // int16 ÷ 8192 → g (±4g range)
#define GYRO_SCALE 16.4f      // int16 ÷ 16.4 → dps (±2000°/s range)

// ============================================================================
// INFERENCE CONFIGURATION
// ============================================================================
#define WINDOW_SIZE 100       // Number of samples in sliding window
#define WINDOW_STRIDE 50      // Samples to slide after inference
#define TENSOR_ARENA_SIZE (12 * 1024)  // 12KB for TFLite model
#define NUM_CLASSES 3         // Default number of gesture classes

// ============================================================================
// OPERATING MODES
// ============================================================================
#define MODE_COLLECT 0        // Stream sensor data for training
#define MODE_INFERENCE 1      // Run inference on device

// ============================================================================
// SAFETY & RELIABILITY
// ============================================================================
#define WATCHDOG_TIMEOUT_MS 4000
#define RECONNECT_DEBOUNCE_MS 500
#define MIN_FREE_HEAP_BYTES 2048

// ============================================================================
// PACKET STRUCTURE
// ============================================================================
#define SENSOR_PACKET_SIZE 17  // 6×int16 + 2×uint16 + 1×uint8 = 17 bytes

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
