import { useConnectionStore } from '../state/connectionStore';
import { getBLEService } from '../services/bleService';

export function ReconnectModal() {
  const { state, reconnectAttempt, deviceName, error } = useConnectionStore();
  const isReconnecting = state === 'reconnecting';
  const needsChooser = state === 'needs-user-action';
  const visible = isReconnecting || needsChooser;

  if (!visible) return null;

  const chooseDevice = async () => {
    try {
      await getBLEService().connect();
    } catch (err) {
      console.error('Chooser reconnect failed:', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[999] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm p-6 text-center shadow-2xl">
        {isReconnecting ? (
          <>
            <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-800 mb-2">Connection Lost</h2>
            <p className="text-slate-600 text-sm">
              Trying to reconnect... Attempt {reconnectAttempt}/2
            </p>
          </>
        ) : (
          <>
            <div className="text-4xl mb-3">😕</div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Need to Reconnect</h2>
            <p className="text-slate-600 text-sm mb-4">
              Please choose your Arduino again.
              {deviceName ? ` Look for "${deviceName}".` : ''}
            </p>
            {error && <p className="text-xs text-rose-600 mb-3">{error}</p>}
            <button onClick={chooseDevice} className="btn-primary w-full">
              Choose Device
            </button>
          </>
        )}
      </div>
    </div>
  );
}

