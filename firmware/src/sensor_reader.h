#ifndef SENSOR_READER_H
#define SENSOR_READER_H

#include <Arduino.h>
#include "config.h"

// ============================================================================
// CRC-8/MAXIM Implementation (for packet validation)
// ============================================================================
inline uint8_t crc8(const uint8_t* data, size_t len) {
    uint8_t crc = 0x00;
    while (len--) {
        uint8_t byte = *data++;
        for (uint8_t i = 0; i < 8; i++) {
            uint8_t mix = (crc ^ byte) & 0x01;
            crc >>= 1;
            if (mix) crc ^= 0x8C;
            byte >>= 1;
        }
    }
    return crc;
}

// ============================================================================
// Sensor Packet Structure (17 bytes)
// ============================================================================
struct SensorPacket {
    int16_t ax, ay, az;      // Acceleration (scaled by ACCEL_SCALE)
    int16_t gx, gy, gz;      // Gyroscope (scaled by GYRO_SCALE)
    uint16_t sequence;       // Packet counter (wraps at 65535)
    uint16_t timestamp;      // Milliseconds mod 65536
    uint8_t crc;             // CRC-8 checksum of bytes 0-15
} __attribute__((packed));

// ============================================================================
// Hardware Abstraction Interface
// ============================================================================
class SensorReader {
public:
    // Initialize the sensor hardware
    virtual bool begin() = 0;

    // Read a new sensor sample and populate packet
    // Returns true if new data available, false otherwise
    virtual bool read(SensorPacket& packet) = 0;

    // Get human-readable chip name
    virtual const char* getChipName() = 0;

    // Get chip type identifier (0=Rev1/LSM9DS1, 1=Rev2/BMI270)
    virtual uint8_t getChipType() = 0;

    // Virtual destructor
    virtual ~SensorReader() = default;

protected:
    uint16_t _sequence = 0;  // Packet sequence counter

    // Helper functions for scaling raw sensor values (with clamping to avoid int16 overflow)
    int16_t scaleAccel(float g) {
        float scaled = g * ACCEL_SCALE;
        if (scaled > 32767.0f) return 32767;
        if (scaled < -32768.0f) return -32768;
        return (int16_t)scaled;
    }

    int16_t scaleGyro(float dps) {
        float scaled = dps * GYRO_SCALE;
        if (scaled > 32767.0f) return 32767;
        if (scaled < -32768.0f) return -32768;
        return (int16_t)scaled;
    }
};

// Factory function - creates correct sensor reader for hardware
SensorReader* createSensorReader();

#endif // SENSOR_READER_H
