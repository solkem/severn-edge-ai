/**
 * Web Bluetooth Service
 * Handles all BLE communication with Arduino firmware
 */

import type { SensorPacket, DeviceInfo, InferenceResult } from '../types/ble';
import { DeviceMode } from '../types/ble';
import { BLE_CONFIG } from '../config/constants';
import { parseSensorPacket, parseDeviceInfo, parseInferenceResult } from './bleParser';

export type SensorDataCallback = (packet: SensorPacket) => void;
export type InferenceCallback = (result: InferenceResult) => void;
export type DisconnectCallback = () => void;

export class BLEService {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private service: BluetoothRemoteGATTService | null = null;

  // Characteristics
  private modeChar: BluetoothRemoteGATTCharacteristic | null = null;
  private sensorChar: BluetoothRemoteGATTCharacteristic | null = null;
  private inferenceChar: BluetoothRemoteGATTCharacteristic | null = null;
  private deviceInfoChar: BluetoothRemoteGATTCharacteristic | null = null;

  // Callbacks
  private sensorCallback: SensorDataCallback | null = null;
  private inferenceCallback: InferenceCallback | null = null;
  private disconnectCallback: DisconnectCallback | null = null;

  // Event handlers (stored so we can remove them)
  private sensorHandler: ((event: Event) => void) | null = null;
  private inferenceHandler: ((event: Event) => void) | null = null;

  // ============================================================================
  // Connection Management
  // ============================================================================

  async connect(): Promise<void> {
    if (!navigator.bluetooth) {
      throw new Error('Web Bluetooth API is not available in this browser');
    }

    // Request device
    this.device = await navigator.bluetooth.requestDevice({
      filters: [
        { namePrefix: BLE_CONFIG.DEVICE_NAME_PREFIX },
        { services: [BLE_CONFIG.SERVICE_UUID] },
      ],
      optionalServices: [BLE_CONFIG.SERVICE_UUID],
    });

    // Set up disconnect listener
    this.device.addEventListener('gattserverdisconnected', () => {
      console.log('Device disconnected');
      this.handleDisconnect();
    });

    // Connect to GATT server
    console.log('Connecting to GATT server...');
    this.server = await this.device.gatt!.connect();

    // Get primary service
    console.log('Getting service...');
    this.service = await this.server.getPrimaryService(BLE_CONFIG.SERVICE_UUID);

    // Get all characteristics
    console.log('Getting characteristics...');
    this.modeChar = await this.service.getCharacteristic(BLE_CONFIG.MODE_CHAR_UUID);
    this.sensorChar = await this.service.getCharacteristic(BLE_CONFIG.SENSOR_CHAR_UUID);
    this.inferenceChar = await this.service.getCharacteristic(BLE_CONFIG.INFERENCE_CHAR_UUID);
    this.deviceInfoChar = await this.service.getCharacteristic(BLE_CONFIG.DEVICE_INFO_UUID);

    console.log('Connected successfully!');
  }

  async disconnect(): Promise<void> {
    if (this.server && this.server.connected) {
      this.server.disconnect();
    }
    this.handleDisconnect();
  }

  private handleDisconnect(): void {
    this.server = null;
    this.service = null;
    this.modeChar = null;
    this.sensorChar = null;
    this.inferenceChar = null;
    this.deviceInfoChar = null;

    if (this.disconnectCallback) {
      this.disconnectCallback();
    }
  }

  isConnected(): boolean {
    return this.server !== null && this.server.connected;
  }

  getDeviceName(): string | null {
    return this.device?.name || null;
  }

  /**
   * Get the GATT server for direct characteristic access
   * Used by model upload service
   */
  getServer(): BluetoothRemoteGATTServer | null {
    return this.server;
  }

  // ============================================================================
  // Device Info
  // ============================================================================

  async getDeviceInfo(): Promise<DeviceInfo> {
    if (!this.deviceInfoChar) {
      throw new Error('Not connected');
    }

    const value = await this.deviceInfoChar.readValue();
    return parseDeviceInfo(value);
  }

  // ============================================================================
  // Mode Control
  // ============================================================================

  async setMode(mode: DeviceMode): Promise<void> {
    if (!this.modeChar) {
      throw new Error('Not connected');
    }

    const buffer = new Uint8Array([mode]);
    await this.modeChar.writeValue(buffer);
    console.log(`Mode set to: ${mode === DeviceMode.COLLECT ? 'COLLECT' : 'INFERENCE'}`);
  }

  // ============================================================================
  // Sensor Data Streaming
  // ============================================================================

  async startSensorStream(callback: SensorDataCallback): Promise<void> {
    if (!this.sensorChar) {
      throw new Error('Not connected');
    }

    // Set to collect mode
    await this.setMode(DeviceMode.COLLECT);

    // Store callback
    this.sensorCallback = callback;

    // Remove old handler if exists
    if (this.sensorHandler && this.sensorChar) {
      this.sensorChar.removeEventListener('characteristicvaluechanged', this.sensorHandler);
    }

    // Create and store new handler
    this.sensorHandler = (event: Event) => {
      const target = event.target as BluetoothRemoteGATTCharacteristic;
      const packet = parseSensorPacket(target.value!);

      if (packet && this.sensorCallback) {
        this.sensorCallback(packet);
      }
    };

    // Start notifications and add listener
    await this.sensorChar.startNotifications();
    this.sensorChar.addEventListener('characteristicvaluechanged', this.sensorHandler);

    console.log('Sensor streaming started');
  }

  async stopSensorStream(): Promise<void> {
    if (this.sensorChar) {
      // Remove event listener first
      if (this.sensorHandler) {
        this.sensorChar.removeEventListener('characteristicvaluechanged', this.sensorHandler);
        this.sensorHandler = null;
      }
      await this.sensorChar.stopNotifications();
      this.sensorCallback = null;
      console.log('Sensor streaming stopped');
    }
  }

  // ============================================================================
  // Inference Mode
  // ============================================================================

  async startInference(callback: InferenceCallback): Promise<void> {
    if (!this.inferenceChar) {
      throw new Error('Not connected');
    }

    // Set to inference mode
    await this.setMode(DeviceMode.INFERENCE);

    // Store callback
    this.inferenceCallback = callback;

    // Remove old handler if exists
    if (this.inferenceHandler && this.inferenceChar) {
      this.inferenceChar.removeEventListener('characteristicvaluechanged', this.inferenceHandler);
    }

    // Create and store new handler
    this.inferenceHandler = (event: Event) => {
      const target = event.target as BluetoothRemoteGATTCharacteristic;
      const result = parseInferenceResult(target.value!);

      console.log(`Inference result: class=${result.prediction}, confidence=${result.confidence}%`);

      if (this.inferenceCallback) {
        this.inferenceCallback(result);
      }
    };

    // Start notifications and add listener
    await this.inferenceChar.startNotifications();
    this.inferenceChar.addEventListener('characteristicvaluechanged', this.inferenceHandler);

    console.log('Inference mode started');
  }

  async stopInference(): Promise<void> {
    if (this.inferenceChar) {
      // Remove event listener first
      if (this.inferenceHandler) {
        this.inferenceChar.removeEventListener('characteristicvaluechanged', this.inferenceHandler);
        this.inferenceHandler = null;
      }
      await this.inferenceChar.stopNotifications();
      this.inferenceCallback = null;
      console.log('Inference mode stopped');
    }
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  onDisconnect(callback: DisconnectCallback): void {
    this.disconnectCallback = callback;
  }
}

// Singleton instance
let bleServiceInstance: BLEService | null = null;

export function getBLEService(): BLEService {
  if (!bleServiceInstance) {
    bleServiceInstance = new BLEService();
  }
  return bleServiceInstance;
}