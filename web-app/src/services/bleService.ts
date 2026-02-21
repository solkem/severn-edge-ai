/**
 * Web Bluetooth Service
 * Handles all BLE communication with Arduino firmware
 */

import type { SensorPacket, DeviceInfo, InferenceResult } from '../types/ble';
import { DeviceMode } from '../types/ble';
import { BLE_CONFIG } from '../config/constants';
import { parseSensorPacket, parseDeviceInfo, parseInferenceResult } from './bleParser';
import { useConnectionStore } from '../state/connectionStore';

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
  private reconnectTask: Promise<void> | null = null;
  private userInitiatedDisconnect = false;

  // ============================================================================
  // Connection Management
  // ============================================================================

  async connect(): Promise<void> {
    const store = useConnectionStore.getState();
    store.startConnecting();

    if (!navigator.bluetooth) {
      const msg = 'Web Bluetooth API is not available in this browser';
      store.connectFail(msg);
      throw new Error(msg);
    }

    try {
      // Request device must be user gesture initiated.
      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: BLE_CONFIG.DEVICE_NAME_PREFIX }],
        optionalServices: [BLE_CONFIG.SERVICE_UUID],
      });

      this.userInitiatedDisconnect = false;
      this.device.removeEventListener(
        'gattserverdisconnected',
        this.handleGattDisconnected,
      );
      this.device.addEventListener(
        'gattserverdisconnected',
        this.handleGattDisconnected,
      );

      await this.connectFull();
      store.connectSuccess(this.device.name ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      store.connectFail(message);
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    this.userInitiatedDisconnect = true;

    await Promise.allSettled([this.stopSensorStream(), this.stopInference()]);

    if (this.server && this.server.connected) {
      this.server.disconnect();
    }
    this.clearRuntimeHandles();
    useConnectionStore.getState().setDisconnected('user');
    if (this.disconnectCallback) {
      this.disconnectCallback();
    }
  }

  private clearRuntimeHandles(): void {
    if (this.sensorChar && this.sensorHandler) {
      this.sensorChar.removeEventListener(
        'characteristicvaluechanged',
        this.sensorHandler,
      );
    }
    if (this.inferenceChar && this.inferenceHandler) {
      this.inferenceChar.removeEventListener(
        'characteristicvaluechanged',
        this.inferenceHandler,
      );
    }

    this.sensorHandler = null;
    this.inferenceHandler = null;
    this.server = null;
    this.service = null;
    this.modeChar = null;
    this.sensorChar = null;
    this.inferenceChar = null;
    this.deviceInfoChar = null;
  }

  private handleGattDisconnected = (): void => {
    // If we intentionally disconnected, do not auto-reconnect.
    if (this.userInitiatedDisconnect) {
      this.clearRuntimeHandles();
      useConnectionStore.getState().setDisconnected('user');
      if (this.disconnectCallback) {
        this.disconnectCallback();
      }
      return;
    }

    this.clearRuntimeHandles();
    if (this.disconnectCallback) {
      this.disconnectCallback();
    }

    void this.trySilentReconnect();
  };

  private async trySilentReconnect(): Promise<void> {
    if (!this.device?.gatt) {
      useConnectionStore
        .getState()
        .reconnectNeedsUserAction('Device handle unavailable');
      return;
    }

    // Deduplicate reconnect loops if multiple disconnect events fire.
    if (this.reconnectTask) {
      return this.reconnectTask;
    }

    const delays = [500, 1500];
    const store = useConnectionStore.getState();
    this.reconnectTask = (async () => {
      for (let i = 0; i < delays.length; i++) {
        store.startReconnecting(i + 1);
        await this.delay(delays[i]);
        try {
          await this.connectFull();
          store.connectSuccess(this.device?.name ?? null);
          return;
        } catch (err) {
          console.warn(`Silent reconnect attempt ${i + 1} failed`, err);
        }
      }
      store.reconnectNeedsUserAction(
        'Could not reconnect automatically. Please choose your device again.',
      );
    })()
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'Reconnect failed';
        useConnectionStore.getState().reconnectNeedsUserAction(msg);
      })
      .finally(() => {
        this.reconnectTask = null;
      });

    return this.reconnectTask;
  }

  private async connectFull(): Promise<void> {
    if (!this.device?.gatt) {
      throw new Error('No Bluetooth device selected');
    }

    this.server = await this.device.gatt.connect();
    this.service = await this.server.getPrimaryService(BLE_CONFIG.SERVICE_UUID);
    this.modeChar = await this.service.getCharacteristic(BLE_CONFIG.MODE_CHAR_UUID);
    this.sensorChar = await this.service.getCharacteristic(
      BLE_CONFIG.SENSOR_CHAR_UUID,
    );
    this.inferenceChar = await this.service.getCharacteristic(
      BLE_CONFIG.INFERENCE_CHAR_UUID,
    );
    this.deviceInfoChar = await this.service.getCharacteristic(
      BLE_CONFIG.DEVICE_INFO_UUID,
    );

    // Rehydrate notification listeners if streams were active pre-disconnect.
    if (this.sensorCallback) {
      await this.enableSensorNotifications();
    }
    if (this.inferenceCallback) {
      await this.enableInferenceNotifications();
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

  private async enableSensorNotifications(): Promise<void> {
    if (!this.sensorChar) return;

    if (this.sensorHandler) {
      this.sensorChar.removeEventListener(
        'characteristicvaluechanged',
        this.sensorHandler,
      );
    }

    this.sensorHandler = (event: Event) => {
      const target = event.target as BluetoothRemoteGATTCharacteristic;
      if (!target.value) return;
      const packet = parseSensorPacket(target.value);
      if (packet && this.sensorCallback) {
        this.sensorCallback(packet);
      }
    };

    await this.sensorChar.startNotifications();
    this.sensorChar.addEventListener(
      'characteristicvaluechanged',
      this.sensorHandler,
    );
  }

  async startSensorStream(callback: SensorDataCallback): Promise<void> {
    if (!this.sensorChar) {
      throw new Error('Not connected');
    }

    // Set to collect mode
    await this.setMode(DeviceMode.COLLECT);

    // Store callback
    this.sensorCallback = callback;
    await this.enableSensorNotifications();

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

  private async enableInferenceNotifications(): Promise<void> {
    if (!this.inferenceChar) return;

    if (this.inferenceHandler) {
      this.inferenceChar.removeEventListener(
        'characteristicvaluechanged',
        this.inferenceHandler,
      );
    }

    this.inferenceHandler = (event: Event) => {
      const target = event.target as BluetoothRemoteGATTCharacteristic;
      if (!target.value) return;
      const result = parseInferenceResult(target.value);

      if (this.inferenceCallback) {
        this.inferenceCallback(result);
      }
    };

    await this.inferenceChar.startNotifications();
    this.inferenceChar.addEventListener(
      'characteristicvaluechanged',
      this.inferenceHandler,
    );
  }

  async startInference(callback: InferenceCallback): Promise<void> {
    if (!this.inferenceChar) {
      throw new Error('Not connected');
    }

    // Set to inference mode
    await this.setMode(DeviceMode.INFERENCE);

    // Store callback
    this.inferenceCallback = callback;
    await this.enableInferenceNotifications();

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

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
