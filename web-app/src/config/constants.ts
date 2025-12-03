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
  DEVICE_NAME_PREFIX: 'Severn School Edge AI',
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
// Machine Learning Model
// ============================================================================
export const MODEL_CONFIG = {
  WINDOW_SIZE: 100,
  NUM_AXES: 6,
  WINDOW_STRIDE: 50, // For inference sliding window
  EPOCHS: 50, // Default training epochs
};

// ============================================================================
// Sensor Scaling
// ============================================================================
export const SENSOR_SCALE = {
  ACCEL: 8192.0,
  GYRO: 16.4,
};
