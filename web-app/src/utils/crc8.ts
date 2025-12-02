/**
 * CRC-8/MAXIM Implementation
 * Must match the firmware implementation exactly
 */

export function crc8(data: Uint8Array): number {
  let crc = 0x00;

  for (const byte of data) {
    let b = byte;
    for (let i = 0; i < 8; i++) {
      const mix = (crc ^ b) & 0x01;
      crc >>= 1;
      if (mix) {
        crc ^= 0x8c;
      }
      b >>= 1;
    }
  }

  return crc;
}

/**
 * Validate a sensor packet's CRC checksum
 * @param packetData Full 17-byte packet
 * @returns true if CRC is valid
 */
export function validatePacketCRC(packetData: Uint8Array): boolean {
  if (packetData.length !== 17) {
    return false;
  }

  const receivedCRC = packetData[16];
  const computedCRC = crc8(packetData.slice(0, 16));

  return receivedCRC === computedCRC;
}
