/**
 * Regression tests for BLE parser correctness bugs
 *
 * Bug 1 (Critical): parseSensorPacket uses `new Uint8Array(data.buffer)`
 *   which ignores DataView.byteOffset. When the DataView is a slice of a
 *   larger ArrayBuffer, CRC validation runs on the wrong bytes.
 *
 * Bug 2 (Warning): parseDeviceInfo does not validate input length.
 *   A short payload throws an unguarded RangeError.
 */

import { describe, it, expect } from 'vitest';
import { parseSensorPacket, parseDeviceInfo, parseInferenceResult } from './bleParser';
import { crc8 } from '../utils/crc8';

// ---------------------------------------------------------------------------
// Helper: build a valid 17-byte sensor packet inside a DataView
// ---------------------------------------------------------------------------
function buildValidPacket(): { buffer: ArrayBuffer; view: DataView } {
  const buffer = new ArrayBuffer(17);
  const view = new DataView(buffer);

  // ax = 8192 (1g), ay = 0, az = -4096 (-0.5g)
  view.setInt16(0, 8192, true);
  view.setInt16(2, 0, true);
  view.setInt16(4, -4096, true);
  // gx = 164 (10 dps), gy = -164, gz = 0
  view.setInt16(6, 164, true);
  view.setInt16(8, -164, true);
  view.setInt16(10, 0, true);
  // sequence, timestamp
  view.setUint16(12, 1, true);
  view.setUint16(14, 100, true);
  // CRC over first 16 bytes
  const bytes = new Uint8Array(buffer);
  view.setUint8(16, crc8(bytes.slice(0, 16)));

  return { buffer, view };
}

// ---------------------------------------------------------------------------
// Bug 1: DataView with non-zero byteOffset
// ---------------------------------------------------------------------------
describe('parseSensorPacket — byteOffset regression', () => {
  it('should parse correctly when DataView starts at offset 0 (baseline)', () => {
    const { view } = buildValidPacket();
    const packet = parseSensorPacket(view);

    expect(packet).not.toBeNull();
    expect(packet!.ax).toBeCloseTo(1.0);
    expect(packet!.sequence).toBe(1);
  });

  it('should parse correctly when DataView has a non-zero byteOffset', () => {
    // Simulate a Web Bluetooth implementation that pools ArrayBuffers:
    // the 17-byte packet lives at offset 64 inside a 256-byte buffer.
    const { buffer: packetBuf } = buildValidPacket();
    const packetBytes = new Uint8Array(packetBuf);

    const bigBuffer = new ArrayBuffer(256);
    const target = new Uint8Array(bigBuffer, 64, 17);
    target.set(packetBytes); // copy the valid packet into the middle

    // Create DataView the way Chrome might — pointing into the big buffer
    const offsetView = new DataView(bigBuffer, 64, 17);

    const packet = parseSensorPacket(offsetView);

    // Current code does `new Uint8Array(data.buffer)` which gives ALL 256 bytes.
    // The CRC will be wrong → packet is null. This test FAILS until the bug is fixed.
    expect(packet).not.toBeNull();
    if (packet) {
      expect(packet.ax).toBeCloseTo(1.0);
      expect(packet.sequence).toBe(1);
    }
  });

  it('should reject a packet even when garbage before the offset has a coincidental CRC match', () => {
    // Ensures we're validating exactly the 17-byte slice, not the wider buffer
    const { buffer: packetBuf } = buildValidPacket();
    const packetBytes = new Uint8Array(packetBuf);

    const bigBuffer = new ArrayBuffer(64);
    const target = new Uint8Array(bigBuffer, 32, 17);
    target.set(packetBytes);

    // Corrupt one byte of the actual packet data (byte 0 of the view → offset 32)
    const corruptView = new Uint8Array(bigBuffer);
    corruptView[32] ^= 0xFF;

    const offsetView = new DataView(bigBuffer, 32, 17);
    const packet = parseSensorPacket(offsetView);
    expect(packet).toBeNull(); // CRC should fail on corrupted data
  });
});

// ---------------------------------------------------------------------------
// Bug 2: parseDeviceInfo missing length validation
// ---------------------------------------------------------------------------
describe('parseDeviceInfo — short payload', () => {
  it('should handle a full 20-byte payload', () => {
    const buffer = new ArrayBuffer(20);
    const view = new DataView(buffer);
    view.setUint8(0, 1);  // major
    view.setUint8(1, 1);  // minor
    view.setUint8(2, 1);  // chipType
    view.setUint8(3, 255); // battery
    view.setUint16(4, 100, true);  // window
    view.setUint16(6, 25, true);   // rate
    view.setUint32(8, 3600, true); // uptime
    view.setUint32(12, 1000, true); // samples
    view.setUint32(16, 50, true);  // inference

    const info = parseDeviceInfo(view);
    expect(info.firmwareMajor).toBe(1);
    expect(info.windowSize).toBe(100);
    expect(info.inferenceCount).toBe(50);
  });

  it('should throw or return a meaningful error for a truncated payload (4 bytes)', () => {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setUint8(0, 1);
    view.setUint8(1, 1);

    // Current code: throws RangeError when reading past end.
    // After fix: should throw a descriptive error or return a partial result.
    expect(() => parseDeviceInfo(view)).toThrow();
  });

  it('should throw or return a meaningful error for an empty payload', () => {
    const buffer = new ArrayBuffer(0);
    const view = new DataView(buffer);

    expect(() => parseDeviceInfo(view)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// parseInferenceResult length validation
// ---------------------------------------------------------------------------
describe('parseInferenceResult — short payload', () => {
  it('should parse a valid 2+ byte payload', () => {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setUint8(0, 2);   // prediction class 2
    view.setUint8(1, 85);  // 85% confidence

    const result = parseInferenceResult(view);
    expect(result.prediction).toBe(2);
    expect(result.confidence).toBe(85);
  });

  it('should throw for a 0-byte payload', () => {
    const buffer = new ArrayBuffer(0);
    const view = new DataView(buffer);

    expect(() => parseInferenceResult(view)).toThrow();
  });

  it('should throw for a 1-byte payload', () => {
    const buffer = new ArrayBuffer(1);
    const view = new DataView(buffer);
    view.setUint8(0, 0);

    expect(() => parseInferenceResult(view)).toThrow();
  });
});
