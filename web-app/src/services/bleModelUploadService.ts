/**
 * BLE Model Upload Service for SimpleNN Format
 *
 * ============================================================================
 * EDUCATIONAL IMPLEMENTATION
 * ============================================================================
 * 
 * Handles over-the-air model deployment to Arduino via Bluetooth Low Energy.
 * Uploads SimpleNN weights (real trained weights!) to the Arduino.
 * 
 * See firmware/docs/NEURAL_NETWORK_BASICS.md for how the neural network works.
 */

import { BLE_UUIDS } from '../config/constants';
import { calculateCrc32 } from './modelExportService';

// Model upload control commands (must match firmware)
const MODEL_CMD_START = 0x01;
const MODEL_CMD_CHUNK = 0x02;
const MODEL_CMD_COMPLETE = 0x03;
const MODEL_CMD_CANCEL = 0x04;

// Upload status subcodes
const STATUS_SUCCESS = 0x04;

// BLE characteristic max write size (conservative for compatibility)
const MAX_CHUNK_SIZE = 200;

export interface UploadProgress {
  state: 'idle' | 'starting' | 'uploading' | 'completing' | 'success' | 'error';
  progress: number;
  bytesTransferred: number;
  totalBytes: number;
  message: string;
}

export type UploadProgressCallback = (progress: UploadProgress) => void;

export class BLEModelUploadService {
  private modelUploadChar: BluetoothRemoteGATTCharacteristic | null = null;
  private modelStatusChar: BluetoothRemoteGATTCharacteristic | null = null;
  private isUploading = false;

  async initialize(server: BluetoothRemoteGATTServer): Promise<boolean> {
    try {
      console.log('Initializing SimpleNN model upload service...');
      
      const service = await server.getPrimaryService(BLE_UUIDS.SERVICE);
      
      this.modelUploadChar = await service.getCharacteristic(BLE_UUIDS.MODEL_UPLOAD);
      this.modelStatusChar = await service.getCharacteristic(BLE_UUIDS.MODEL_STATUS);

      console.log('Model upload service initialized');
      return true;
    } catch (error) {
      console.error('Failed to initialize model upload service:', error);
      return false;
    }
  }

  isReady(): boolean {
    return this.modelUploadChar !== null && this.modelStatusChar !== null;
  }

  /**
   * Upload trained model weights to the Arduino
   * 
   * @param modelData - SimpleNN weight data as Uint8Array
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
      const crc32 = calculateCrc32(modelData);
      console.log(`Starting SimpleNN upload: ${totalBytes} bytes, CRC32: 0x${crc32.toString(16)}`);
      console.log(`Classes: ${classLabels.join(', ')}`);

      // Step 1: Send START command
      reportProgress('starting', 0, 'Initiating upload...');
      await this.sendStartCommand(totalBytes, crc32, classLabels);
      console.log('START command sent');
      await this.delay(200);

      // Step 2: Send model data in chunks
      reportProgress('uploading', 0, 'Uploading neural network weights...');
      let offset = 0;
      const dataChunkSize = MAX_CHUNK_SIZE - 5;

      while (offset < totalBytes) {
        const remaining = totalBytes - offset;
        const chunkSize = Math.min(dataChunkSize, remaining);
        const chunk = modelData.slice(offset, offset + chunkSize);

        await this.sendChunkCommand(offset, chunk);
        offset += chunkSize;

        const pct = Math.round((offset / totalBytes) * 100);
        reportProgress('uploading', offset, `Uploading... ${pct}%`);
        
        await this.delay(50);
      }

      console.log('All weight data sent');

      // Step 3: Send COMPLETE command
      reportProgress('completing', totalBytes, 'Finalizing upload...');
      await this.sendCompleteCommand();
      console.log('COMPLETE command sent');

      await this.delay(1000);
      
      const status = await this.readStatus();
      console.log('Final status:', status);

      if (status.statusCode === STATUS_SUCCESS) {
        reportProgress('success', totalBytes, 'Model deployed! Your Arduino is now smart! ');
        return true;
      } else {
        throw new Error(`Upload failed with status code: ${status.statusCode}`);
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Upload error:', error);
      reportProgress('error', 0, `Upload failed: ${message}`);

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

  async cancelUpload(): Promise<void> {
    if (this.modelUploadChar) {
      await this.sendCancelCommand();
    }
    this.isUploading = false;
  }

  private async sendStartCommand(modelSize: number, crc32: number, labels: string[]): Promise<void> {
    const numClasses = Math.min(labels.length, 8);

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
    const data = new Uint8Array(5 + chunk.length);
    data[0] = MODEL_CMD_CHUNK;

    data[1] = offset & 0xFF;
    data[2] = (offset >> 8) & 0xFF;
    data[3] = (offset >> 16) & 0xFF;
    data[4] = (offset >> 24) & 0xFF;

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

// Singleton instance
export const bleModelUploadService = new BLEModelUploadService();
