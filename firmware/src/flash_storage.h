/**
 * Flash Storage Module for Model Persistence
 * 
 * Stores trained neural network models in the Arduino's RAM.
 * 
 * ============================================================================
 * UPDATED: Now stores SimpleNN format instead of TFLite!
 * ============================================================================
 * 
 * The SimpleNN format stores raw weight arrays that our hand-written
 * inference engine can use directly. See docs/NEURAL_NETWORK_BASICS.md
 * for details on why we use this instead of TFLite.
 */

#ifndef FLASH_STORAGE_H
#define FLASH_STORAGE_H

#include <Arduino.h>
#include "config.h"
#include "simple_nn.h"

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
 * Check if a valid model is stored
 */
bool hasStoredModel();

/**
 * Get pointer to stored SimpleNN model
 * Returns nullptr if no valid model exists
 */
const SimpleNNModel* getStoredSimpleNNModel();

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
 * @param totalSize Expected total size of model data
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
 * Finalize and save the model
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
 * Clear stored model
 */
void clearStoredModel();

/**
 * Calculate CRC32 of data
 */
uint32_t calculateCrc32(const uint8_t* data, size_t length);

#endif // FLASH_STORAGE_H
