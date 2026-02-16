/**
 * Severn Edge AI - BLE Type Definitions
 * Matches the firmware protocol from specification v3.1
 */

// ============================================================================
// BLE UUIDs
// ============================================================================
// Moved to src/config/constants.ts

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
  hasModel: boolean;     // true if firmware has a trained model in storage
  storedModelSize: number; // bytes (0 when no model)
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
// Moved to src/config/constants.ts
