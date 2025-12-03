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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="card max-w-2xl w-full">
        <div className="text-center">
          <img
            src="/severn-logo.png"
            alt="Severn School"
            className="w-24 h-24 mx-auto mb-6"
          />
          <h1 className="text-4xl font-bold text-gray-800 mb-4">
            Severn School Edge AI
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Let's teach your Arduino to recognize gestures!
          </p>

          {!isConnecting && !error && (
            <div className="space-y-6">
              <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 text-left">
                <h3 className="font-bold text-blue-900 mb-2">Before you start:</h3>
                <ul className="list-disc list-inside text-blue-800 space-y-1">
                  <li>Make sure your Arduino is powered on (orange LED)</li>
                  <li>Bluetooth must be enabled on your device</li>
                  <li>Keep the Arduino close (within 30 feet)</li>
                </ul>
              </div>

              <button
                onClick={handleConnect}
                className="btn-primary text-xl w-full py-4"
              >
                🔗 Connect to Arduino
              </button>
            </div>
          )}

          {isConnecting && (
            <div className="space-y-4">
              <div className="animate-pulse-slow emoji-medium">📡</div>
              <p className="text-xl text-gray-600">
                Looking for your Arduino...
              </p>
              <p className="text-sm text-gray-500">
                A popup will appear - select your Severn device
              </p>
            </div>
          )}

          {error && (
            <div className="space-y-4">
              <div className="emoji-medium">⚠️</div>
              <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
                <h3 className="font-bold text-red-900 mb-2">Connection Failed</h3>
                <p className="text-red-800">{error}</p>
              </div>
              <button
                onClick={handleConnect}
                className="btn-primary"
              >
                Try Again
              </button>
            </div>
          )}

          <div className="mt-8 pt-8 border-t-2 border-gray-200">
            <p className="text-sm text-gray-500">
              Need help? Ask your teacher!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
