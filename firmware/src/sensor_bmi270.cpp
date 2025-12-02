#ifdef USE_BMI270

#include "sensor_reader.h"
#include <Arduino_BMI270_BMM150.h>

// ============================================================================
// BMI270 Sensor Reader (Arduino Nano 33 BLE Sense Rev2)
// ============================================================================
class BMI270Reader : public SensorReader {
public:
    bool begin() override {
        DEBUG_PRINTLN("Initializing BMI270...");
        if (!IMU.begin()) {
            DEBUG_PRINTLN("ERROR: BMI270 initialization failed!");
            return false;
        }
        DEBUG_PRINTLN("BMI270 initialized successfully");
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
        return "BMI270 (Rev2)";
    }

    uint8_t getChipType() override {
        return 1;  // Rev2
    }
};

// Factory function implementation for BMI270
SensorReader* createSensorReader() {
    return new BMI270Reader();
}

#endif // USE_BMI270
