/**
 * Severn Edge AI v3.1 - Arduino Firmware
 *
 * Complete BLE machine learning system for gesture recognition
 * Supports Arduino Nano 33 BLE Sense Rev1 (LSM9DS1) and Rev2 (BMI270)
 */

#include <ArduinoBLE.h>
#include "config.h"
#include "sensor_reader.h"
#include "inference.h"

// ============================================================================
// GLOBAL STATE
// ============================================================================
SensorReader* sensor = nullptr;
uint8_t currentMode = MODE_COLLECT;
uint32_t sampleIntervalMs = 1000 / DEFAULT_SAMPLE_RATE_HZ;
unsigned long lastSampleTime = 0;
unsigned long lastConnectTime = 0;

// Statistics
uint32_t uptimeSeconds = 0;
uint32_t totalSamples = 0;
uint32_t inferenceCount = 0;
unsigned long lastUptimeUpdate = 0;

// ============================================================================
// BLE SERVICE & CHARACTERISTICS
// ============================================================================
BLEService edgeService(SERVICE_UUID);

// Mode: 0=Collect, 1=Inference
BLEByteCharacteristic modeChar(MODE_CHAR_UUID, BLERead | BLEWrite);

// Sensor data: 17-byte packets with CRC
BLECharacteristic sensorChar(SENSOR_CHAR_UUID, BLERead | BLENotify, 17);

// Inference results: [class, confidence%, reserved, reserved]
BLECharacteristic inferenceChar(INFERENCE_CHAR_UUID, BLERead | BLENotify, 4);

// Device info: firmware version, chip type, stats (20 bytes)
BLECharacteristic deviceInfoChar(DEVICE_INFO_UUID, BLERead, 20);

// Config: [sample_rate_hz (uint16), window_size (uint16)]
BLECharacteristic configChar(CONFIG_CHAR_UUID, BLERead | BLEWrite, 4);

// ============================================================================
// DEVICE INFO PACKET BUILDER
// ============================================================================
void updateDeviceInfo() {
    uint8_t info[20];

    info[0] = FIRMWARE_VERSION_MAJOR;
    info[1] = FIRMWARE_VERSION_MINOR;
    info[2] = sensor->getChipType();
    info[3] = 255;  // Battery (255 = USB powered, no battery monitoring)

    // Window size
    uint16_t windowSize = WINDOW_SIZE;
    memcpy(&info[4], &windowSize, 2);

    // Sample rate
    uint16_t sampleRate = DEFAULT_SAMPLE_RATE_HZ;
    memcpy(&info[6], &sampleRate, 2);

    // Uptime in seconds
    memcpy(&info[8], &uptimeSeconds, 4);

    // Total samples collected
    memcpy(&info[12], &totalSamples, 4);

    // Inference count
    memcpy(&info[16], &inferenceCount, 4);

    deviceInfoChar.writeValue(info, 20);
}

// ============================================================================
// SETUP
// ============================================================================
void setup() {
    // Initialize serial for debugging
    Serial.begin(115200);
    delay(1000);  // Wait for serial connection

    DEBUG_PRINTLN("=================================");
    DEBUG_PRINTLN("Severn Edge AI v3.1");
    DEBUG_PRINTLN("=================================");

    // Initialize sensor
    DEBUG_PRINT("Initializing sensor... ");
    sensor = createSensorReader();
    if (!sensor->begin()) {
        DEBUG_PRINTLN("FAILED!");
        DEBUG_PRINTLN("ERROR: Sensor initialization failed!");
        DEBUG_PRINTLN("Check: 1) Correct board selected");
        DEBUG_PRINTLN("       2) Correct #define (LSM9DS1 or BMI270)");
        while (1) {
            delay(1000);  // Halt on sensor failure
        }
    }
    DEBUG_PRINTLN("OK");
    DEBUG_PRINT("Detected: ");
    DEBUG_PRINTLN(sensor->getChipName());

    // Initialize inference engine
    DEBUG_PRINT("Setting up inference... ");
    if (!setupInference()) {
        DEBUG_PRINTLN("FAILED!");
    } else {
        DEBUG_PRINTLN("OK");
    }

    // Initialize BLE
    DEBUG_PRINT("Starting BLE... ");
    if (!BLE.begin()) {
        DEBUG_PRINTLN("FAILED!");
        while (1) delay(1000);
    }
    DEBUG_PRINTLN("OK");

    // Set device name
    BLE.setLocalName(DEVICE_NAME_PREFIX);
    BLE.setDeviceName(DEVICE_NAME_PREFIX);

    DEBUG_PRINT("Device name: ");
    DEBUG_PRINTLN(DEVICE_NAME_PREFIX);

    // Configure service and characteristics
    BLE.setAdvertisedService(edgeService);

    edgeService.addCharacteristic(modeChar);
    edgeService.addCharacteristic(sensorChar);
    edgeService.addCharacteristic(inferenceChar);
    edgeService.addCharacteristic(deviceInfoChar);
    edgeService.addCharacteristic(configChar);

    BLE.addService(edgeService);

    // Set initial values
    modeChar.writeValue(currentMode);
    updateDeviceInfo();

    uint8_t configData[4];
    uint16_t rate = DEFAULT_SAMPLE_RATE_HZ;
    uint16_t window = WINDOW_SIZE;
    memcpy(&configData[0], &rate, 2);
    memcpy(&configData[2], &window, 2);
    configChar.writeValue(configData, 4);

    // Start advertising
    BLE.advertise();

    DEBUG_PRINTLN("=================================");
    DEBUG_PRINTLN("Ready! Waiting for connection...");
    DEBUG_PRINTLN("=================================");
}

// ============================================================================
// MAIN LOOP
// ============================================================================
void loop() {
    // Wait for BLE central to connect
    BLEDevice central = BLE.central();

    if (central) {
        DEBUG_PRINT("Connected to: ");
        DEBUG_PRINTLN(central.address());

        // Debounce reconnections
        if (millis() - lastConnectTime < RECONNECT_DEBOUNCE_MS) {
            delay(RECONNECT_DEBOUNCE_MS);
        }
        lastConnectTime = millis();

        // Update device info on connection
        updateDeviceInfo();

        // Main loop while connected
        while (central.connected()) {
            // Update uptime counter
            if (millis() - lastUptimeUpdate >= 1000) {
                uptimeSeconds++;
                lastUptimeUpdate = millis();
            }

            // Check for mode changes
            if (modeChar.written()) {
                currentMode = modeChar.value();
                DEBUG_PRINT("Mode changed to: ");
                DEBUG_PRINTLN(currentMode == MODE_COLLECT ? "COLLECT" : "INFERENCE");

                // Update device info when mode changes
                updateDeviceInfo();
            }

            // Sample at configured rate
            if (millis() - lastSampleTime >= sampleIntervalMs) {
                lastSampleTime = millis();

                SensorPacket packet;
                if (sensor->read(packet)) {
                    totalSamples++;

                    if (currentMode == MODE_COLLECT) {
                        // Stream raw sensor data over BLE
                        sensorChar.writeValue((uint8_t*)&packet, sizeof(packet));

                    } else if (currentMode == MODE_INFERENCE) {
                        // Add sample to inference buffer
                        addSample(packet.ax, packet.ay, packet.az,
                                packet.gx, packet.gy, packet.gz);

                        // Run inference when window is ready
                        if (isWindowReady()) {
                            float confidence;
                            int prediction = runInference(&confidence);

                            if (prediction >= 0) {
                                // Send inference result
                                uint8_t result[4];
                                result[0] = (uint8_t)prediction;
                                result[1] = (uint8_t)(confidence * 100);
                                result[2] = 0;  // Reserved
                                result[3] = 0;  // Reserved

                                inferenceChar.writeValue(result, 4);
                                inferenceCount++;

                                DEBUG_PRINT("Prediction: ");
                                DEBUG_PRINT(prediction);
                                DEBUG_PRINT(" (");
                                DEBUG_PRINT((int)(confidence * 100));
                                DEBUG_PRINTLN("%)");
                            }

                            // Slide window for next inference
                            slideWindow();
                        }
                    }
                }
            }

            // Small delay to prevent busy-waiting
            delay(1);
        }

        DEBUG_PRINT("Disconnected from: ");
        DEBUG_PRINTLN(central.address());
    }

    // Small delay when not connected
    delay(10);
}
