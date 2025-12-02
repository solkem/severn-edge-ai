/**
 * Severn Edge AI - BLE Type Definitions
 * Matches the firmware protocol from specification v3.1
 */

// ============================================================================
// BLE UUIDs
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
// Operating Modes
// ============================================================================
export enum DeviceMode {
  COLLECT = 0,
  INFERENCE = 1,
}

// ============================================================================
// Sensor Packet (17 bytes)
// ============================================================================
export interface SensorPacket {
  ax: number;       // Acceleration X (scaled)
  ay: number;       // Acceleration Y (scaled)
  az: number;       // Acceleration Z (scaled)
  gx: number;       // Gyroscope X (scaled)
  gy: number;       // Gyroscope Y (scaled)
  gz: number;       // Gyroscope Z (scaled)
  sequence: number; // Packet counter
  timestamp: number;// Milliseconds mod 65536
  crc: number;      // CRC-8 checksum
}

// ============================================================================
// Device Info (20 bytes)
// ============================================================================
export interface DeviceInfo {
  firmwareMajor: number;
  firmwareMinor: number;
  chipType: number;      // 0=Rev1/LSM9DS1, 1=Rev2/BMI270
  batteryPct: number;    // 255=USB powered
  windowSize: number;
  sampleRateHz: number;
  uptimeSec: number;
  totalSamples: number;
  inferenceCount: number;
}

// ============================================================================
// Inference Result (4 bytes)
// ============================================================================
export interface InferenceResult {
  prediction: number;    // Class index
  confidence: number;    // 0-100
}

// ============================================================================
// Scaling Constants (matches firmware)
// ============================================================================
export const ACCEL_SCALE = 8192.0;  // int16 ÷ 8192 → g
export const GYRO_SCALE = 16.4;     // int16 ÷ 16.4 → dps
