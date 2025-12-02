#ifdef USE_LSM9DS1

#include "sensor_reader.h"
#include <Arduino_LSM9DS1.h>

// ============================================================================
// LSM9DS1 Sensor Reader (Arduino Nano 33 BLE Sense Rev1)
// ============================================================================
class LSM9DS1Reader : public SensorReader {
public:
    bool begin() override {
        DEBUG_PRINTLN("Initializing LSM9DS1...");
        if (!IMU.begin()) {
            DEBUG_PRINTLN("ERROR: LSM9DS1 initialization failed!");
            return false;
        }
        DEBUG_PRINTLN("LSM9DS1 initialized successfully");
        return true;
    }

    bool read(SensorPacket& packet) override {
        // Check if new data is available
        if (!IMU.accelerationAvailable() || !IMU.gyroscopeAvailable()) {
            return false;
        }

        // Read raw sensor values (in g and dps)
        float ax, ay, az, gx, gy, gz;
        IMU.readAcceleration(ax, ay, az);
        IMU.readGyroscope(gx, gy, gz);

        // Scale and pack into packet
        packet.ax = scaleAccel(ax);
        packet.ay = scaleAccel(ay);
        packet.az = scaleAccel(az);
        packet.gx = scaleGyro(gx);
        packet.gy = scaleGyro(gy);
        packet.gz = scaleGyro(gz);

        // Add metadata
        packet.sequence = _sequence++;
        packet.timestamp = (uint16_t)(millis() & 0xFFFF);

        // Compute CRC-8 checksum over first 16 bytes
        packet.crc = crc8((uint8_t*)&packet, 16);

        return true;
    }

    const char* getChipName() override {
        return "LSM9DS1 (Rev1)";
    }

    uint8_t getChipType() override {
        return 0;  // Rev1
    }
};

// Factory function implementation for LSM9DS1
SensorReader* createSensorReader() {
    return new LSM9DS1Reader();
}

#endif // USE_LSM9DS1
