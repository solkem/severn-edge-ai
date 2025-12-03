import { describe, it, expect } from 'vitest';
import { parseSensorPacket, parseDeviceInfo } from './bleParser';
import { SENSOR_SCALE } from '../config/constants';
import { crc8 } from '../utils/crc8';

describe('BLE Parser', () => {
  describe('parseSensorPacket', () => {
    it('should parse valid packet correctly', () => {
      // Create a valid packet
      const buffer = new ArrayBuffer(17);
      const view = new DataView(buffer);
      
      // Set values
      // ax = 8192 (1.0g)
      view.setInt16(0, 8192, true);
      // ay = 0
      view.setInt16(2, 0, true);
      // az = -4096 (-0.5g)
      view.setInt16(4, -4096, true);
      
      // gx = 164 (10 dps)
      view.setInt16(6, 164, true);
      // gy = -164 (-10 dps)
      view.setInt16(8, -164, true);
      // gz = 0
      view.setInt16(10, 0, true);
      
      // sequence = 12345
      view.setUint16(12, 12345, true);
      // timestamp = 54321
      view.setUint16(14, 54321, true);
      
      // Calculate CRC
      const bytes = new Uint8Array(buffer);
      const crc = crc8(bytes.slice(0, 16));
      view.setUint8(16, crc);
      
      const packet = parseSensorPacket(view);
      
      expect(packet).not.toBeNull();
      if (packet) {
        expect(packet.ax).toBeCloseTo(1.0);
        expect(packet.ay).toBeCloseTo(0.0);
        expect(packet.az).toBeCloseTo(-0.5);
        expect(packet.gx).toBeCloseTo(10.0);
        expect(packet.gy).toBeCloseTo(-10.0);
        expect(packet.gz).toBeCloseTo(0.0);
        expect(packet.sequence).toBe(12345);
        expect(packet.timestamp).toBe(54321);
        expect(packet.crc).toBe(crc);
      }
    });

    it('should return null for invalid CRC', () => {
      const buffer = new ArrayBuffer(17);
      const view = new DataView(buffer);
      // Leave empty (zeros), CRC should be 0.
      // Set CRC to 1 (invalid)
      view.setUint8(16, 1);
      
      const packet = parseSensorPacket(view);
      expect(packet).toBeNull();
    });

    it('should return null for wrong size', () => {
      const buffer = new ArrayBuffer(16);
      const view = new DataView(buffer);
      const packet = parseSensorPacket(view);
      expect(packet).toBeNull();
    });
  });

  describe('parseDeviceInfo', () => {
    it('should parse device info correctly', () => {
      const buffer = new ArrayBuffer(20);
      const view = new DataView(buffer);
      
      // Major=3, Minor=1
      view.setUint8(0, 3);
      view.setUint8(1, 1);
      // Chip=1 (BMI270)
      view.setUint8(2, 1);
      // Battery=255
      view.setUint8(3, 255);
      // Window=100
      view.setUint16(4, 100, true);
      // Rate=25
      view.setUint16(6, 25, true);
      // Uptime=3600
      view.setUint32(8, 3600, true);
      // Samples=10000
      view.setUint32(12, 10000, true);
      // Inference=500
      view.setUint32(16, 500, true);
      
      const info = parseDeviceInfo(view);
      
      expect(info.firmwareMajor).toBe(3);
      expect(info.firmwareMinor).toBe(1);
      expect(info.chipType).toBe(1);
      expect(info.batteryPct).toBe(255);
      expect(info.windowSize).toBe(100);
      expect(info.sampleRateHz).toBe(25);
      expect(info.uptimeSec).toBe(3600);
      expect(info.totalSamples).toBe(10000);
      expect(info.inferenceCount).toBe(500);
    });
  });
});
