import { describe, expect, it, vi } from 'vitest';
import { BLEService } from './bleService';

describe('BLEService inference notifications', () => {
  it('continues processing valid payloads after malformed payloads', async () => {
    const service = new BLEService();

    let eventHandler: ((event: Event) => void) | null = null;
    const inferenceChar = {
      startNotifications: vi.fn(async () => undefined),
      addEventListener: vi.fn((event: string, handler: (event: Event) => void) => {
        if (event === 'characteristicvaluechanged') {
          eventHandler = handler;
        }
      }),
      removeEventListener: vi.fn(),
      stopNotifications: vi.fn(async () => undefined),
    };

    const receivedPredictions: number[] = [];
    const parseErrors: Error[] = [];

    (service as unknown as { inferenceChar: unknown }).inferenceChar = inferenceChar;
    (service as unknown as { inferenceCallback: (value: { prediction: number }) => void })
      .inferenceCallback = (result) => {
        receivedPredictions.push(result.prediction);
      };
    service.onParseError((err) => parseErrors.push(err));

    await (service as unknown as { enableInferenceNotifications: () => Promise<void> })
      .enableInferenceNotifications();

    expect(eventHandler).not.toBeNull();

    const emit = (view: DataView) => {
      eventHandler!(
        { target: { value: view } } as unknown as Event,
      );
    };

    // Malformed payload (length 1) should be swallowed and reported.
    emit(new DataView(new ArrayBuffer(1)));
    // Valid payload should still be processed after parse error.
    const validBuf = new ArrayBuffer(4);
    const validView = new DataView(validBuf);
    validView.setUint8(0, 3);
    validView.setUint8(1, 92);
    emit(validView);
    // Another malformed payload should not break subsequent valid payloads.
    emit(new DataView(new ArrayBuffer(0)));
    const validBuf2 = new ArrayBuffer(2);
    const validView2 = new DataView(validBuf2);
    validView2.setUint8(0, 1);
    validView2.setUint8(1, 80);
    emit(validView2);

    expect(parseErrors.length).toBe(2);
    expect(receivedPredictions).toEqual([3, 1]);
  });
});

