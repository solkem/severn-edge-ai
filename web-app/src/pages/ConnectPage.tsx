/**
 * Connect Page - BLE Device Connection
 */

import { useState } from 'react';
import { getBLEService } from '../services/bleService';
import { DeviceInfo } from '../types/ble';

interface ConnectPageProps {
  onConnected: (deviceInfo: DeviceInfo) => void;
}

export function ConnectPage({ onConnected }: ConnectPageProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);

    try {
      const ble = getBLEService();

      // Connect to device
      await ble.connect();

      // Get device info
      const info = await ble.getDeviceInfo();

      // Success!
      onConnected(info);
    } catch (err) {
      console.error('Connection failed:', err);
      const message = err instanceof Error ? err.message : 'Failed to connect to device';
      
      // Handle user cancellation gracefully
      if (message.includes('User cancelled') || message.includes('User canceled')) {
        setError(null); // Don't show error for cancellation
      } else {
        setError(message);
      }
      
      setIsConnecting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10">
        <div className="absolute top-[-10%] right-[-5%] w-96 h-96 bg-primary-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob"></div>
        <div className="absolute bottom-[-10%] left-[-5%] w-96 h-96 bg-secondary-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>
      </div>

      <div className="card max-w-2xl w-full relative z-10">
        <div className="text-center">
          <div className="mb-8 relative inline-block">
            <div className="absolute inset-0 bg-primary-100 rounded-full blur-xl opacity-50"></div>
            <img
              src={`${import.meta.env.BASE_URL}severn-logo.png`}
              alt="Severn School"
              className="w-24 h-24 relative z-10 mx-auto transform hover:scale-110 transition-transform duration-300"
            />
          </div>
          
          <h1 className="heading-lg mb-4 pb-1 bg-clip-text text-transparent bg-gradient-to-r from-primary-600 to-secondary-600">
            Severn School Edge AI
          </h1>
          <p className="text-xl text-slate-600 mb-10 font-medium">
            Let's teach your Arduino to recognize gestures!
          </p>

          {!isConnecting && !error && (
            <div className="space-y-8">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-left">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <span className="bg-primary-100 text-primary-700 p-1 rounded-md">📋</span> 
                  Before you start:
                </h3>
                <div className="grid gap-3">
                  {[
                    { icon: '🔋', text: 'Power on your Arduino (orange LED)' },
                    { icon: '📱', text: 'Enable Bluetooth on your device' },
                    { icon: '📏', text: 'Keep the Arduino close (within 30 feet)' },
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3 text-slate-600 bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                      <span className="text-xl">{item.icon}</span>
                      <span>{item.text}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={handleConnect}
                className="btn-primary text-xl w-full py-4 shadow-xl shadow-primary-200 hover:shadow-2xl hover:shadow-primary-300"
              >
                🔗 Connect to Arduino
              </button>
            </div>
          )}

          {isConnecting && (
            <div className="space-y-6 py-8">
              <div className="relative">
                <div className="absolute inset-0 bg-primary-100 rounded-full blur-xl opacity-50 animate-pulse"></div>
                <div className="animate-bounce emoji-medium relative z-10">📡</div>
              </div>
              <div>
                <h3 className="text-2xl font-bold text-slate-800 mb-2">Searching...</h3>
                <p className="text-slate-500">
                  Check the popup window to select your device
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="space-y-6">
              <div className="emoji-medium animate-bounce">⚠️</div>
              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6">
                <h3 className="font-bold text-rose-900 mb-2">Connection Failed</h3>
                <p className="text-rose-800">{error}</p>
              </div>
              <button
                onClick={handleConnect}
                className="btn-primary w-full"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
