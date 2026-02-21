import { useConnectionStore } from '../state/connectionStore';

export function ConnectionStatusPill() {
  const { state, deviceName } = useConnectionStore();

  const config = {
    disconnected: {
      color: 'bg-rose-500',
      text: 'Disconnected',
      pulse: false,
    },
    connecting: {
      color: 'bg-amber-500',
      text: 'Connecting...',
      pulse: true,
    },
    connected: {
      color: 'bg-emerald-500',
      text: deviceName ? `Connected: ${deviceName}` : 'Connected',
      pulse: false,
    },
    reconnecting: {
      color: 'bg-amber-500',
      text: 'Reconnecting...',
      pulse: true,
    },
    'needs-user-action': {
      color: 'bg-rose-500',
      text: 'Reconnect Needed',
      pulse: false,
    },
    error: {
      color: 'bg-rose-500',
      text: 'Connection Error',
      pulse: false,
    },
  }[state];

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200">
      <span
        className={`w-2.5 h-2.5 rounded-full ${config.color} ${
          config.pulse ? 'animate-pulse' : ''
        }`}
      />
      <span className="text-xs sm:text-sm font-semibold text-slate-700">{config.text}</span>
    </div>
  );
}

