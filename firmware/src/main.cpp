/**
 * Severn Edge AI v3.2 - Arduino Firmware
 *
 * Complete BLE machine learning system for gesture recognition
 * Supports Arduino Nano 33 BLE Sense Rev1 (LSM9DS1) and Rev2 (BMI270)
 * 
 * Features:
 * - Over-the-air model upload via BLE
 * - Model persistence in flash memory
 * - Real-time inference with TFLite Micro
 */

#include <ArduinoBLE.h>
#include "config.h"
#include "sensor_reader.h"
#include "inference.h"
#include "flash_storage.h"

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

// Device info: firmware version, chip type, stats (24 bytes - extended)
BLECharacteristic deviceInfoChar(DEVICE_INFO_UUID, BLERead, 24);

// Config: [sample_rate_hz (uint16), window_size (uint16)]
BLECharacteristic configChar(CONFIG_CHAR_UUID, BLERead | BLEWrite, 4);

// Model upload: variable length chunks (max 244 bytes per write)
// Format: [cmd(1)] [offset(4)] [data(up to 239)]
// Commands: 0x01=start, 0x02=chunk, 0x03=finish, 0x04=cancel
BLECharacteristic modelUploadChar(MODEL_UPLOAD_UUID, BLEWrite | BLEWriteWithoutResponse, 244);

// Model status: [state(1), progress(1), status_code(1), reserved(1)]
BLECharacteristic modelStatusChar(MODEL_STATUS_UUID, BLERead | BLENotify, 4);

// ============================================================================
// MODEL UPLOAD STATE
// ============================================================================
static uint32_t uploadExpectedSize = 0;
static uint32_t uploadExpectedCrc = 0;
static uint8_t uploadNumClasses = 0;

// ============================================================================
// DEVICE INFO PACKET BUILDER
// ============================================================================
void updateDeviceInfo() {
    uint8_t info[24];

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

    // Model status: 1 byte (0=no model, 1=model loaded)
    info[20] = hasStoredModel() ? 1 : 0;
    
    // Stored model size (3 bytes, little-endian, up to 16MB)
    uint32_t modelSize = hasStoredModel() ? getStoredModelSize() : 0;
    info[21] = modelSize & 0xFF;
    info[22] = (modelSize >> 8) & 0xFF;
    info[23] = (modelSize >> 16) & 0xFF;

    deviceInfoChar.writeValue(info, 24);
}

// ============================================================================
// MODEL UPLOAD STATUS UPDATE
// ============================================================================
void updateModelStatus(UploadState state, uint8_t progress, UploadStatus status) {
    uint8_t statusData[4];
    statusData[0] = (uint8_t)state;
    statusData[1] = progress;
    statusData[2] = (uint8_t)status;
    statusData[3] = 0;  // Reserved
    modelStatusChar.writeValue(statusData, 4);
}

// ============================================================================
// MODEL UPLOAD HANDLER
// ============================================================================
void handleModelUpload() {
    if (!modelUploadChar.written()) return;
    
    int len = modelUploadChar.valueLength();
    if (len < 1) return;
    
    const uint8_t* data = modelUploadChar.value();
    uint8_t cmd = data[0];
    
    switch (cmd) {
        case 0x01: {  // START: [cmd(1), size(4), crc32(4), numClasses(1), labels...]
            if (len < 10) {
                updateModelStatus(UPLOAD_ERROR, 0, STATUS_ERROR_FORMAT);
                return;
            }
            
            memcpy(&uploadExpectedSize, &data[1], 4);
            memcpy(&uploadExpectedCrc, &data[5], 4);
            uploadNumClasses = data[9];
            
            DEBUG_PRINT("Model upload starting: ");
            DEBUG_PRINT(uploadExpectedSize);
            DEBUG_PRINT(" bytes, ");
            DEBUG_PRINT(uploadNumClasses);
            DEBUG_PRINTLN(" classes");
            
            if (uploadExpectedSize > MAX_MODEL_SIZE) {
                updateModelStatus(UPLOAD_ERROR, 0, STATUS_ERROR_SIZE);
                return;
            }
            
            beginModelUpload(uploadExpectedSize, uploadNumClasses);
            
            // Parse class labels from remaining bytes
            int offset = 10;
            for (int i = 0; i < uploadNumClasses && offset < len; i++) {
                // Labels are null-terminated strings
                const char* label = (const char*)&data[offset];
                setModelLabel(i, label);
                offset += strlen(label) + 1;
            }
            
            updateModelStatus(UPLOAD_RECEIVING, 0, STATUS_RECEIVING);
            break;
        }
        
        case 0x02: {  // CHUNK: [cmd(1), offset(4), data(N)]
            if (len < 5) {
                updateModelStatus(UPLOAD_ERROR, 0, STATUS_ERROR_FORMAT);
                return;
            }
            
            uint32_t offset;
            memcpy(&offset, &data[1], 4);
            uint16_t chunkLen = len - 5;
            
            if (!receiveModelChunk(&data[5], chunkLen, offset)) {
                updateModelStatus(UPLOAD_ERROR, getUploadProgress(), STATUS_ERROR_FORMAT);
                return;
            }
            
            updateModelStatus(UPLOAD_RECEIVING, getUploadProgress(), STATUS_RECEIVING);
            break;
        }
        
        case 0x03: {  // FINISH: [cmd(1)]
            DEBUG_PRINTLN("Finalizing model upload...");
            updateModelStatus(UPLOAD_RECEIVING, 100, STATUS_VALIDATING);
            
            UploadStatus result = finalizeModelUpload(uploadExpectedCrc);
            
            if (result == STATUS_SUCCESS) {
                DEBUG_PRINTLN("Model saved! Reloading...");
                updateModelStatus(UPLOAD_COMPLETE, 100, STATUS_SAVING);
                
                // Reload the model into TFLite interpreter
                if (reloadModel()) {
                    updateModelStatus(UPLOAD_COMPLETE, 100, STATUS_SUCCESS);
                    updateDeviceInfo();  // Update device info with new model status
                    DEBUG_PRINTLN("Model reload successful!");
                } else {
                    updateModelStatus(UPLOAD_ERROR, 100, STATUS_ERROR_FORMAT);
                    DEBUG_PRINTLN("Model reload failed!");
                }
            } else {
                updateModelStatus(UPLOAD_ERROR, 100, result);
            }
            break;
        }
        
        case 0x04: {  // CANCEL: [cmd(1)]
            DEBUG_PRINTLN("Model upload cancelled");
            updateModelStatus(UPLOAD_IDLE, 0, STATUS_READY);
            break;
        }
        
        default:
            DEBUG_PRINT("Unknown upload command: ");
            DEBUG_PRINTLN(cmd);
            break;
    }
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
    edgeService.addCharacteristic(modelUploadChar);
    edgeService.addCharacteristic(modelStatusChar);

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
            
            // Handle model upload commands
            handleModelUpload();

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
