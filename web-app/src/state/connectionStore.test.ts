import { beforeEach, describe, expect, it } from 'vitest';
import { useConnectionStore } from './connectionStore';

describe('connectionStore', () => {
  beforeEach(() => {
    useConnectionStore.getState().reset();
  });

  it('tracks the happy-path connection lifecycle', () => {
    const store = useConnectionStore.getState();
    store.startConnecting();
    store.connectSuccess('Arduino Nano 33 BLE');

    const state = useConnectionStore.getState();
    expect(state.state).toBe('connected');
    expect(state.deviceName).toBe('Arduino Nano 33 BLE');
    expect(state.error).toBeNull();
    expect(state.reconnectAttempt).toBe(0);
    expect(state.disconnectReason).toBe('none');
  });

  it('tracks reconnect attempts and user-action fallback', () => {
    const store = useConnectionStore.getState();
    store.startReconnecting(2);
    store.reconnectNeedsUserAction('Could not reconnect');

    const state = useConnectionStore.getState();
    expect(state.state).toBe('needs-user-action');
    expect(state.reconnectAttempt).toBe(2);
    expect(state.disconnectReason).toBe('timeout');
    expect(state.error).toBe('Could not reconnect');
  });

  it('keeps transport errors visible after an unexpected disconnect', () => {
    const store = useConnectionStore.getState();
    store.connectFail('GATT server disconnected');
    store.setDisconnected('transport');

    const state = useConnectionStore.getState();
    expect(state.state).toBe('disconnected');
    expect(state.disconnectReason).toBe('transport');
    expect(state.error).toBe('GATT server disconnected');
  });
});
