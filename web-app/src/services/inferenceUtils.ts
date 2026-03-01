export type Prediction = {
  prediction: number;
  confidence: number;
};

export type ConfidenceSource = 'arduino' | 'browser';

// Must stay aligned with firmware/src/inference_features.h
export const MOTION_THRESHOLD = 0.010;

const LOW_CONFIDENCE_THRESHOLD = 0.60;
const IDLE_CONFIDENCE_MIN = 0.78;
const IDLE_CONFIDENCE_MAX = 0.92;
const NORM_ACCEL = 4.0;
const NORM_GYRO = 500.0;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function normalizeMotionFrame(frame: number[]): number[] {
  return [
    (frame[0] ?? 0) / NORM_ACCEL,
    (frame[1] ?? 0) / NORM_ACCEL,
    (frame[2] ?? 0) / NORM_ACCEL,
    (frame[3] ?? 0) / NORM_GYRO,
    (frame[4] ?? 0) / NORM_GYRO,
    (frame[5] ?? 0) / NORM_GYRO,
  ];
}

export function estimateMotionScore(frames: number[][]): number {
  if (frames.length < 2) return 0;

  let accelDeltaMean = 0;
  let gyroMean = 0;
  const count = frames.length - 1;

  for (let i = 1; i < frames.length; i += 1) {
    const prev = normalizeMotionFrame(frames[i - 1]);
    const next = normalizeMotionFrame(frames[i]);

    accelDeltaMean += Math.abs(next[0] - prev[0]);
    accelDeltaMean += Math.abs(next[1] - prev[1]);
    accelDeltaMean += Math.abs(next[2] - prev[2]);

    gyroMean += Math.abs(next[3]);
    gyroMean += Math.abs(next[4]);
    gyroMean += Math.abs(next[5]);
  }

  accelDeltaMean /= count * 3;
  gyroMean /= count * 3;
  return accelDeltaMean + gyroMean;
}

export function applyMotionHeuristic(
  frames: number[][],
  prediction: Prediction,
  idleClassIndex: number,
): Prediction {
  if (idleClassIndex < 0 || !Number.isInteger(idleClassIndex)) {
    return {
      prediction: prediction.prediction,
      confidence: clamp01(prediction.confidence),
    };
  }

  const motionScore = estimateMotionScore(frames);
  if (motionScore >= MOTION_THRESHOLD) {
    return {
      prediction: prediction.prediction,
      confidence: clamp01(prediction.confidence),
    };
  }

  const stillConfidence = Math.max(
    IDLE_CONFIDENCE_MIN,
    IDLE_CONFIDENCE_MAX - (motionScore / MOTION_THRESHOLD) * (IDLE_CONFIDENCE_MAX - IDLE_CONFIDENCE_MIN),
  );

  if (prediction.prediction === idleClassIndex) {
    return {
      prediction: idleClassIndex,
      confidence: Math.max(clamp01(prediction.confidence), stillConfidence),
    };
  }

  if (prediction.confidence < LOW_CONFIDENCE_THRESHOLD) {
    return {
      prediction: idleClassIndex,
      confidence: stillConfidence,
    };
  }

  return {
    prediction: prediction.prediction,
    confidence: clamp01(prediction.confidence),
  };
}

export function normalizeConfidence(raw: number, source: ConfidenceSource): number {
  if (!Number.isFinite(raw)) return 0;
  if (source === 'arduino') {
    return clamp01(raw / 100);
  }
  return clamp01(raw);
}

