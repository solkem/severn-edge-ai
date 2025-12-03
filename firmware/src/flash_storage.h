/**
 * Flash Storage Module for Model Persistence
 * 
 * Stores trained TFLite models in the Arduino's flash memory so they
 * persist across power cycles. Uses the FlashStorage library for
 * nRF52840-based boards (Arduino Nano 33 BLE).
 */

#ifndef FLASH_STORAGE_H
#define FLASH_STORAGE_H

#include <Arduino.h>
#include "config.h"

// ============================================================================
// Model Storage Structure
// ============================================================================
struct StoredModel {
    uint32_t magic;           // Magic number to verify valid model
    uint32_t modelSize;       // Size of model data in bytes
    uint32_t numClasses;      // Number of output classes
    uint32_t crc32;           // CRC32 checksum of model data
    char labels[8][16];       // Up to 8 class labels, 16 chars each
    uint8_t modelData[MAX_MODEL_SIZE];  // The TFLite model bytes
};

// ============================================================================
// Upload State Machine
// ============================================================================
enum UploadState {
    UPLOAD_IDLE = 0,
    UPLOAD_RECEIVING = 1,
    UPLOAD_COMPLETE = 2,
    UPLOAD_ERROR = 3
};

// Status codes sent back to web app
enum UploadStatus {
    STATUS_READY = 0,
    STATUS_RECEIVING = 1,
    STATUS_VALIDATING = 2,
    STATUS_SAVING = 3,
    STATUS_SUCCESS = 4,
    STATUS_ERROR_SIZE = 10,
    STATUS_ERROR_CRC = 11,
    STATUS_ERROR_FLASH = 12,
    STATUS_ERROR_FORMAT = 13
};

// ============================================================================
// Flash Storage Functions
// ============================================================================

/**
 * Initialize flash storage system
 */
void initFlashStorage();

/**
 * Check if a valid model is stored in flash
 */
bool hasStoredModel();

/**
 * Get pointer to stored model data (read-only)
 * Returns nullptr if no valid model exists
 */
const uint8_t* getStoredModelData();

/**
 * Get size of stored model in bytes
 */
uint32_t getStoredModelSize();

/**
 * Get number of classes in stored model
 */
uint32_t getStoredModelNumClasses();

/**
 * Get class label by index
 */
const char* getStoredModelLabel(uint8_t classIndex);

/**
 * Begin receiving a new model over BLE
 * @param totalSize Expected total size of model
 * @param numClasses Number of output classes
 */
void beginModelUpload(uint32_t totalSize, uint32_t numClasses);

/**
 * Receive a chunk of model data
 * @param data Pointer to chunk data
 * @param length Length of chunk
 * @param offset Byte offset in model
 * @return true if chunk received successfully
 */
bool receiveModelChunk(const uint8_t* data, uint16_t length, uint32_t offset);

/**
 * Set class label for stored model
 */
void setModelLabel(uint8_t classIndex, const char* label);

/**
 * Finalize and save the model to flash
 * @param expectedCrc32 CRC32 checksum to verify
 * @return UploadStatus code
 */
UploadStatus finalizeModelUpload(uint32_t expectedCrc32);

/**
 * Get current upload progress (0-100)
 */
uint8_t getUploadProgress();

/**
 * Get current upload state
 */
UploadState getUploadState();

/**
 * Clear stored model from flash
 */
void clearStoredModel();

/**
 * Calculate CRC32 of data
 */
uint32_t calculateCrc32(const uint8_t* data, size_t length);

#endif // FLASH_STORAGE_H
