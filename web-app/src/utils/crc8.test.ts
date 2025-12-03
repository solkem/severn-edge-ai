import { describe, it, expect } from 'vitest';
import { crc8, validatePacketCRC } from './crc8';

describe('CRC-8/MAXIM', () => {
  it('should calculate correct CRC for known data', () => {
    // Test case 1: Single byte
    // CRC-8/MAXIM of 0x00 is 0x00
    expect(crc8(new Uint8Array([0x00]))).toBe(0x00);

    // Test case 2: Simple sequence
    // CRC-8/MAXIM of [0x01, 0x02, 0x03]
    // Calculated using online calculator for CRC-8/MAXIM (poly 0x31, init 0x00, refIn true, refOut true, xorOut 0x00)
    // Wait, the implementation in crc8.ts uses 0x8C polynomial which corresponds to reversed 0x31 (MAXIM).
    // Let's verify with the implementation logic.
    // 0x31 reversed is 0x8C.
    
    // Let's use a known vector if possible, or rely on the implementation being consistent.
    // "123456789" -> 0xA1 (Check=0xA1 for CRC-8/MAXIM)
    const text = "123456789";
    const data = new TextEncoder().encode(text);
    expect(crc8(data)).toBe(0xA1);
  });

  it('should validate correct packet', () => {
    // Create a 17-byte packet
    const packet = new Uint8Array(17);
    // Fill with some data
    for (let i = 0; i < 16; i++) {
      packet[i] = i;
    }
    // Calculate CRC
    const crc = crc8(packet.slice(0, 16));
    packet[16] = crc;

    expect(validatePacketCRC(packet)).toBe(true);
  });

  it('should reject incorrect packet', () => {
    const packet = new Uint8Array(17);
    for (let i = 0; i < 16; i++) {
      packet[i] = i;
    }
    // Calculate CRC but modify it
    const crc = crc8(packet.slice(0, 16));
    packet[16] = crc ^ 0xFF; // Corrupt CRC

    expect(validatePacketCRC(packet)).toBe(false);
  });

  it('should reject packet with wrong length', () => {
    const packet = new Uint8Array(16); // Too short
    expect(validatePacketCRC(packet)).toBe(false);
  });
});
