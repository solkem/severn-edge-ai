/**
 * BLE Packet Parser
 * Decodes binary data from Arduino firmware
 */

import type { SensorPacket, DeviceInfo, InferenceResult } from '../types/ble';
import { SENSOR_SCALE } from '../config/constants';
import { validatePacketCRC } from '../utils/crc8';

// ============================================================================
// Helper Functions
// ============================================================================

function readInt16LE(buffer: DataView, offset: number): number {
  return buffer.getInt16(offset, true); // true = little endian
}

function readUint16LE(buffer: DataView, offset: number): number {
  return buffer.getUint16(offset, true);
}

function readUint32LE(buffer: DataView, offset: number): number {
  return buffer.getUint32(offset, true);
}

// ============================================================================
// Sensor Packet Parser (17 bytes)
// ============================================================================

export function parseSensorPacket(data: DataView): SensorPacket | null {
  if (data.byteLength !== 17) {
    console.error(`Invalid sensor packet size: ${data.byteLength} (expected 17)`);
    return null;
  }

  // Validate CRC before parsing
  // Use byteOffset/byteLength to correctly handle DataViews backed by larger ArrayBuffers
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (!validatePacketCRC(bytes)) {
    console.warn('CRC validation failed for sensor packet');
    return null;
  }

  // Parse packet
  const packet: SensorPacket = {
    ax: readInt16LE(data, 0) / SENSOR_SCALE.ACCEL,
    ay: readInt16LE(data, 2) / SENSOR_SCALE.ACCEL,
    az: readInt16LE(data, 4) / SENSOR_SCALE.ACCEL,
    gx: readInt16LE(data, 6) / SENSOR_SCALE.GYRO,
    gy: readInt16LE(data, 8) / SENSOR_SCALE.GYRO,
    gz: readInt16LE(data, 10) / SENSOR_SCALE.GYRO,
    sequence: readUint16LE(data, 12),
    timestamp: readUint16LE(data, 14),
    crc: data.getUint8(16),
  };

  return packet;
}

// ============================================================================
// Device Info Parser (20 bytes)
// ============================================================================

export function parseDeviceInfo(data: DataView): DeviceInfo {
  if (data.byteLength < 20) {
    throw new Error(`Invalid device info size: ${data.byteLength} (expected >= 20)`);
  }

  const hasModel = data.byteLength >= 21 ? data.getUint8(20) === 1 : false;
  const storedModelSize =
    data.byteLength >= 24
      ? (data.getUint8(21) |
          (data.getUint8(22) << 8) |
          (data.getUint8(23) << 16)) >>> 0
      : 0;

  return {
    firmwareMajor: data.getUint8(0),
    firmwareMinor: data.getUint8(1),
    chipType: data.getUint8(2),
    batteryPct: data.getUint8(3),
    windowSize: readUint16LE(data, 4),
    sampleRateHz: readUint16LE(data, 6),
    uptimeSec: readUint32LE(data, 8),
    totalSamples: readUint32LE(data, 12),
    inferenceCount: readUint32LE(data, 16),
    hasModel,
    storedModelSize,
  };
}

// ============================================================================
// Inference Result Parser (4 bytes)
// ============================================================================

export function parseInferenceResult(data: DataView): InferenceResult {
  if (data.byteLength < 2) {
    throw new Error(`Invalid inference result size: ${data.byteLength} (expected >= 2)`);
  }

  return {
    prediction: data.getUint8(0),
    confidence: data.getUint8(1),  // Already in 0-100 range
  };
}

// ============================================================================
// Config Parser (4 bytes)
// ============================================================================

export interface DeviceConfig {
  sampleRateHz: number;
  windowSize: number;
}

export function parseDeviceConfig(data: DataView): DeviceConfig {
  return {
    sampleRateHz: readUint16LE(data, 0),
    windowSize: readUint16LE(data, 2),
  };
}
