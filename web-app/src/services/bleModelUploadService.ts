/**
 * BLE Model Upload Service
 *
 * Handles over-the-air model deployment to Arduino via Bluetooth Low Energy.
 * This allows students to deploy trained models without touching firmware code.
 */

import { BLE_UUIDS } from '../config/constants';

// Model upload control commands (must match firmware)
const MODEL_CMD_START = 0x01;
const MODEL_CMD_CHUNK = 0x02;
const MODEL_CMD_COMPLETE = 0x03;
const MODEL_CMD_CANCEL = 0x04;

// Model status codes from firmware
const MODEL_STATUS_IDLE = 0x00;
const MODEL_STATUS_RECEIVING = 0x01;
const MODEL_STATUS_COMPLETE = 0x02;
const MODEL_STATUS_ERROR = 0x03;

// Upload status subcodes
const STATUS_SUCCESS = 0x04;

// BLE characteristic max write size (conservative for compatibility)
const MAX_CHUNK_SIZE = 200;  // Smaller chunks for reliability

export interface UploadProgress {
  state: 'idle' | 'starting' | 'uploading' | 'completing' | 'success' | 'error';
  progress: number;  // 0-100
  bytesTransferred: number;
  totalBytes: number;
  message: string;
}

export type UploadProgressCallback = (progress: UploadProgress) => void;

/**
 * Calculate CRC32 (IEEE 802.3 polynomial) - must match firmware implementation
 */
function calculateCrc32(data: Uint8Array): number {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }

  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

export class BLEModelUploadService {
  private modelUploadChar: BluetoothRemoteGATTCharacteristic | null = null;
  private modelStatusChar: BluetoothRemoteGATTCharacteristic | null = null;
  private isUploading = false;

  /**
   * Initialize the upload service with BLE characteristics
   */
  async initialize(server: BluetoothRemoteGATTServer): Promise<boolean> {
    try {
      console.log('Initializing model upload service...');
      console.log('Getting primary service:', BLE_UUIDS.SERVICE);
      
      const service = await server.getPrimaryService(BLE_UUIDS.SERVICE);
      console.log('Service obtained, getting characteristics...');

      console.log('Getting MODEL_UPLOAD characteristic:', BLE_UUIDS.MODEL_UPLOAD);
      this.modelUploadChar = await service.getCharacteristic(BLE_UUIDS.MODEL_UPLOAD);
      console.log('MODEL_UPLOAD characteristic obtained');

      console.log('Getting MODEL_STATUS characteristic:', BLE_UUIDS.MODEL_STATUS);
      this.modelStatusChar = await service.getCharacteristic(BLE_UUIDS.MODEL_STATUS);
      console.log('MODEL_STATUS characteristic obtained');

      console.log('Model upload service initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize model upload service:', error);
      console.error('Error name:', (error as Error).name);
      console.error('Error message:', (error as Error).message);
      return false;
    }
  }

  /**
   * Check if the service is ready for uploads
   */
  isReady(): boolean {
    return this.modelUploadChar !== null && this.modelStatusChar !== null;
  }

  /**
   * Upload a trained model to the Arduino
   * @param modelData - The model weights as Uint8Array
   * @param classLabels - Array of class label names
   * @param onProgress - Callback for upload progress updates
   */
  async uploadModel(
    modelData: Uint8Array,
    classLabels: string[] = [],
    onProgress?: UploadProgressCallback
  ): Promise<boolean> {
    if (!this.isReady()) {
      throw new Error('Upload service not initialized');
    }

    if (this.isUploading) {
      throw new Error('Upload already in progress');
    }

    this.isUploading = true;
    const totalBytes = modelData.length;

    const reportProgress = (
      state: UploadProgress['state'],
      bytesTransferred: number,
      message: string
    ) => {
      onProgress?.({
        state,
        progress: totalBytes > 0 ? Math.round((bytesTransferred / totalBytes) * 100) : 0,
        bytesTransferred,
        totalBytes,
        message,
      });
    };

    try {
      // Calculate CRC32 of model data
      const crc32 = calculateCrc32(modelData);
      console.log(`Starting upload: ${totalBytes} bytes, CRC32: ${crc32.toString(16)}`);

      // Step 1: Send START command with model info
      reportProgress('starting', 0, 'Initiating upload...');
      await this.sendStartCommand(totalBytes, crc32, classLabels);
      console.log('START command sent');

      // Delay to let firmware prepare
      await this.delay(200);

      // Step 2: Send model data in chunks
      reportProgress('uploading', 0, 'Uploading model...');
      let offset = 0;

      // Data chunk size: MAX_CHUNK_SIZE - 5 bytes for header (cmd + offset)
      const dataChunkSize = MAX_CHUNK_SIZE - 5;

      while (offset < totalBytes) {
        const remaining = totalBytes - offset;
        const chunkSize = Math.min(dataChunkSize, remaining);
        const chunk = modelData.slice(offset, offset + chunkSize);

        await this.sendChunkCommand(offset, chunk);

        offset += chunkSize;

        reportProgress(
          'uploading',
          offset,
          `Uploading... ${Math.round((offset / totalBytes) * 100)}%`
        );

        // Delay between chunks to prevent BLE buffer overflow
        await this.delay(50);
      }

      console.log('All chunks sent');

      // Step 3: Send COMPLETE command
      reportProgress('completing', totalBytes, 'Finalizing upload...');
      await this.sendCompleteCommand();
      console.log('COMPLETE command sent');

      // Wait for firmware to process and save
      await this.delay(1000);
      
      // Check status
      const status = await this.readStatus();
      console.log('Status:', status);

      if (status.statusCode === STATUS_SUCCESS) {
        reportProgress('success', totalBytes, 'Model deployed successfully! ');
        return true;
      } else {
        throw new Error(`Upload failed with status code: ${status.statusCode}`);
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Upload error:', error);
      reportProgress('error', 0, `Upload failed: ${message}`);

      // Try to cancel the upload
      try {
        await this.sendCancelCommand();
      } catch {
        // Ignore cancel errors
      }

      throw error;
    } finally {
      this.isUploading = false;
    }
  }

  /**
   * Cancel an ongoing upload
   */
  async cancelUpload(): Promise<void> {
    if (this.modelUploadChar) {
      await this.sendCancelCommand();
    }
    this.isUploading = false;
  }

  // Private helper methods

  private async sendStartCommand(modelSize: number, crc32: number, labels: string[]): Promise<void> {
    // Format: [cmd(1), size(4), crc32(4), numClasses(1), labels...]
    const numClasses = Math.min(labels.length, 8);

    // Build labels string (null-terminated, concatenated)
    let labelsData = '';
    for (let i = 0; i < numClasses; i++) {
      labelsData += labels[i].substring(0, 15) + '\0';
    }
    const labelsBytes = new TextEncoder().encode(labelsData);

    const data = new Uint8Array(10 + labelsBytes.length);
    data[0] = MODEL_CMD_START;

    // Model size (4 bytes, little-endian)
    data[1] = modelSize & 0xFF;
    data[2] = (modelSize >> 8) & 0xFF;
    data[3] = (modelSize >> 16) & 0xFF;
    data[4] = (modelSize >> 24) & 0xFF;

    // CRC32 (4 bytes, little-endian)
    data[5] = crc32 & 0xFF;
    data[6] = (crc32 >> 8) & 0xFF;
    data[7] = (crc32 >> 16) & 0xFF;
    data[8] = (crc32 >> 24) & 0xFF;

    // Number of classes
    data[9] = numClasses;

    // Labels
    data.set(labelsBytes, 10);

    await this.modelUploadChar!.writeValueWithResponse(data);
  }

  private async sendChunkCommand(offset: number, chunk: Uint8Array): Promise<void> {
    // Format: [cmd(1), offset(4), data(N)]
    const data = new Uint8Array(5 + chunk.length);
    data[0] = MODEL_CMD_CHUNK;

    // Offset (4 bytes, little-endian)
    data[1] = offset & 0xFF;
    data[2] = (offset >> 8) & 0xFF;
    data[3] = (offset >> 16) & 0xFF;
    data[4] = (offset >> 24) & 0xFF;

    // Chunk data
    data.set(chunk, 5);

    await this.modelUploadChar!.writeValueWithResponse(data);
  }

  private async sendCompleteCommand(): Promise<void> {
    const data = new Uint8Array([MODEL_CMD_COMPLETE]);
    await this.modelUploadChar!.writeValueWithResponse(data);
  }

  private async sendCancelCommand(): Promise<void> {
    const data = new Uint8Array([MODEL_CMD_CANCEL]);
    await this.modelUploadChar!.writeValueWithResponse(data);
  }

  private async readStatus(): Promise<{ state: number; progress: number; statusCode: number }> {
    const value = await this.modelStatusChar!.readValue();
    return {
      state: value.getUint8(0),
      progress: value.getUint8(1),
      statusCode: value.getUint8(2)
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
