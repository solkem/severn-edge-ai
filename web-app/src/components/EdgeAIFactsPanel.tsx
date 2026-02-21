import { useState } from 'react';

interface EdgeAIFactsPanelProps {
  inferenceTimeMs?: number;
}

export function EdgeAIFactsPanel({ inferenceTimeMs }: EdgeAIFactsPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-blue-200 bg-blue-50 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen((s) => !s)}
        className="w-full px-4 py-3 flex items-center justify-between text-left"
      >
        <span className="font-semibold text-blue-900">Did you know? This is Edge AI</span>
        <span className="text-blue-700 text-sm">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 text-sm text-blue-900">
          <p className="mb-3">
            Your model runs directly on the Arduino chip. No cloud server is needed for
            predictions.
          </p>
          {typeof inferenceTimeMs === 'number' && (
            <p className="mb-3 font-semibold">
              Latest inference time: {inferenceTimeMs.toFixed(1)} ms
            </p>
          )}
          <ul className="space-y-1 text-blue-800">
            <li>- Works without internet once loaded</li>
            <li>- Faster response because data stays local</li>
            <li>- Better privacy for sensor data</li>
          </ul>
        </div>
      )}
    </div>
  );
}

