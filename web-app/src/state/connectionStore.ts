import { createStore } from './createStore';

export type ConnectionUiState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'needs-user-action'
  | 'error';

export type DisconnectReason = 'none' | 'user' | 'transport' | 'timeout';

interface ConnectionStoreState {
  state: ConnectionUiState;
  deviceName: string | null;
  error: string | null;
  reconnectAttempt: number;
  disconnectReason: DisconnectReason;
}

interface ConnectionStoreActions {
  startConnecting: () => void;
  connectSuccess: (deviceName: string | null) => void;
  connectFail: (error: string) => void;
  startReconnecting: (attempt: number) => void;
  reconnectNeedsUserAction: (error?: string) => void;
  setDisconnected: (reason?: DisconnectReason) => void;
  clearError: () => void;
  reset: () => void;
}

export type ConnectionStore = ConnectionStoreState & ConnectionStoreActions;

const initialState: ConnectionStoreState = {
  state: 'disconnected',
  deviceName: null,
  error: null,
  reconnectAttempt: 0,
  disconnectReason: 'none',
};

export const useConnectionStore = createStore<ConnectionStore>((set) => ({
  ...initialState,

  startConnecting: () =>
    set({
      state: 'connecting',
      error: null,
      disconnectReason: 'none',
    }),

  connectSuccess: (deviceName) =>
    set({
      state: 'connected',
      deviceName,
      error: null,
      reconnectAttempt: 0,
      disconnectReason: 'none',
    }),

  connectFail: (error) =>
    set({
      state: 'error',
      error,
    }),

  startReconnecting: (attempt) =>
    set({
      state: 'reconnecting',
      reconnectAttempt: attempt,
      disconnectReason: 'transport',
    }),

  reconnectNeedsUserAction: (error) =>
    set({
      state: 'needs-user-action',
      error: error ?? null,
      disconnectReason: 'timeout',
    }),

  setDisconnected: (reason = 'none') =>
    set((s) => ({
      state: 'disconnected',
      error: reason === 'user' ? null : s.error,
      reconnectAttempt: 0,
      disconnectReason: reason,
    })),

  clearError: () =>
    set({
      error: null,
    }),

  reset: () => set(initialState),
}));
