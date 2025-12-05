/**
 * Application Constants
 * Centralized configuration for the web application
 */

// ============================================================================
// BLE Configuration
// ============================================================================
export const BLE_CONFIG = {
  SERVICE_UUID: '19b10000-e8f2-537e-4f6c-d104768a1214',
  MODE_CHAR_UUID: '19b10001-e8f2-537e-4f6c-d104768a1214',
  SENSOR_CHAR_UUID: '19b10002-e8f2-537e-4f6c-d104768a1214',
  INFERENCE_CHAR_UUID: '19b10003-e8f2-537e-4f6c-d104768a1214',
  DEVICE_INFO_UUID: '19b10004-e8f2-537e-4f6c-d104768a1214',
  CONFIG_CHAR_UUID: '19b10005-e8f2-537e-4f6c-d104768a1214',
  MODEL_UPLOAD_UUID: '19b10006-e8f2-537e-4f6c-d104768a1214',
  MODEL_STATUS_UUID: '19b10007-e8f2-537e-4f6c-d104768a1214',
  // Device names are now unique per Arduino: "SevernEdgeAI-XXXX" where XXXX is hardware ID
  DEVICE_NAME_PREFIX: 'SevernEdgeAI',
} as const;

// Convenience alias for BLE UUIDs
export const BLE_UUIDS = {
  SERVICE: BLE_CONFIG.SERVICE_UUID,
  MODE: BLE_CONFIG.MODE_CHAR_UUID,
  SENSOR: BLE_CONFIG.SENSOR_CHAR_UUID,
  INFERENCE: BLE_CONFIG.INFERENCE_CHAR_UUID,
  DEVICE_INFO: BLE_CONFIG.DEVICE_INFO_UUID,
  CONFIG: BLE_CONFIG.CONFIG_CHAR_UUID,
  MODEL_UPLOAD: BLE_CONFIG.MODEL_UPLOAD_UUID,
  MODEL_STATUS: BLE_CONFIG.MODEL_STATUS_UUID,
} as const;

// ============================================================================
// Data Collection
// ============================================================================
export const COLLECTION_CONFIG = {
  SAMPLE_DURATION_MS: 4000, // 4 seconds per sample
  SAMPLES_PER_GESTURE: 10,
  DEFAULT_GESTURES: ['Wave', 'Shake', 'Circle'],
};

// ============================================================================
// Machine Learning Model (matches firmware config.h)
// ============================================================================
export const MODEL_CONFIG = {
  WINDOW_SIZE: 100,
  NUM_AXES: 6,
  WINDOW_STRIDE: 50, // For inference sliding window
  EPOCHS: 50, // Default training epochs
};

// ============================================================================
// SimpleNN Configuration
// MUST MATCH firmware/src/config.h values exactly!
// ============================================================================
export const NN_INPUT_SIZE = 600;    // 100 samples * 6 axes
export const NN_HIDDEN_SIZE = 32;    // Hidden layer neurons
export const NN_MAX_CLASSES = 8;     // Maximum gesture classes

// ============================================================================
// Sensor Scaling
// ============================================================================
export const SENSOR_SCALE = {
  ACCEL: 8192.0,
  GYRO: 16.4,
} as const;
