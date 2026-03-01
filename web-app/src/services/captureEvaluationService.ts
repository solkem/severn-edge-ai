import type { GestureLabel } from '../types';

export interface InferenceFrame {
  timestamp: number;
  prediction: number;
  confidence: number;
}

export interface CaptureEvaluationConfig {
  minFrames: number;
  idleConfidenceThreshold: number;
  supportThreshold: number;
  minConfidence: number;
  idleRatioFailureThreshold: number;
}

export type CaptureEvaluationCode =
  | 'invalid_target'
  | 'not_enough_frames'
  | 'success'
  | 'mostly_idle'
  | 'wrong_gesture'
  | 'low_support'
  | 'low_confidence';

export interface CaptureEvaluationResult {
  code: CaptureEvaluationCode;
  note: string;
  countAttempt: boolean;
  isSuccess: boolean;
  targetLabelId: string | null;
  targetLabelName: string | null;
  predictedLabelName: string;
  support: number;
  avgConfidence: number;
  idleRatio: number;
  capturedFrameCount: number;
}

function formatPercent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function evaluateCaptureWindow(
  frames: InferenceFrame[],
  labels: GestureLabel[],
  targetIndex: number,
  windowStartMs: number,
  windowEndMs: number,
  config: CaptureEvaluationConfig,
): CaptureEvaluationResult {
  const target = labels[targetIndex];
  if (!target) {
    return {
      code: 'invalid_target',
      note: '',
      countAttempt: false,
      isSuccess: false,
      targetLabelId: null,
      targetLabelName: null,
      predictedLabelName: 'Idle',
      support: 0,
      avgConfidence: 0,
      idleRatio: 0,
      capturedFrameCount: 0,
    };
  }

  const capturedFrames = frames.filter(
    (frame) => frame.timestamp >= windowStartMs && frame.timestamp <= windowEndMs,
  );
  if (capturedFrames.length < config.minFrames) {
    return {
      code: 'not_enough_frames',
      note: `Not enough signal in timed capture (${capturedFrames.length} frames). Try a bigger, cleaner gesture.`,
      countAttempt: false,
      isSuccess: false,
      targetLabelId: target.id,
      targetLabelName: target.name,
      predictedLabelName: 'Idle',
      support: 0,
      avgConfidence: 0,
      idleRatio: 0,
      capturedFrameCount: capturedFrames.length,
    };
  }

  const labelCounts = new Array(labels.length).fill(0);
  const labelConfidenceSums = new Array(labels.length).fill(0);
  let idleCount = 0;

  for (const frame of capturedFrames) {
    const isIdleFrame =
      frame.prediction === labels.length
      || frame.confidence < config.idleConfidenceThreshold;
    if (isIdleFrame) {
      idleCount += 1;
      continue;
    }
    if (frame.prediction >= 0 && frame.prediction < labels.length) {
      labelCounts[frame.prediction] += 1;
      labelConfidenceSums[frame.prediction] += frame.confidence;
    }
  }

  let bestLabelIndex = -1;
  let bestVotes = -1;
  let bestConfidenceSum = -1;
  for (let idx = 0; idx < labels.length; idx += 1) {
    if (
      labelCounts[idx] > bestVotes
      || (labelCounts[idx] === bestVotes && labelConfidenceSums[idx] > bestConfidenceSum)
    ) {
      bestVotes = labelCounts[idx];
      bestConfidenceSum = labelConfidenceSums[idx];
      bestLabelIndex = idx;
    }
  }

  const support = bestVotes > 0 ? bestVotes / capturedFrames.length : 0;
  const avgConfidence = bestVotes > 0 ? bestConfidenceSum / bestVotes : 0;
  const idleRatio = idleCount / capturedFrames.length;
  const predictedLabelName =
    bestLabelIndex >= 0 && bestLabelIndex < labels.length
      ? labels[bestLabelIndex].name
      : 'Idle';

  const isCorrectGesture = bestLabelIndex === targetIndex;
  const hasSupport = support >= config.supportThreshold;
  const isConfident = avgConfidence >= config.minConfidence;
  const isSuccess =
    isCorrectGesture
    && hasSupport
    && isConfident
    && idleRatio < config.idleRatioFailureThreshold;

  if (isSuccess) {
    return {
      code: 'success',
      note: `Great capture. "${target.name}" won ${formatPercent(support)} of the timed window at ${formatPercent(avgConfidence)} confidence.`,
      countAttempt: true,
      isSuccess: true,
      targetLabelId: target.id,
      targetLabelName: target.name,
      predictedLabelName,
      support,
      avgConfidence,
      idleRatio,
      capturedFrameCount: capturedFrames.length,
    };
  }

  if (idleRatio >= config.idleRatioFailureThreshold) {
    return {
      code: 'mostly_idle',
      note: `Mostly idle during timed capture (${formatPercent(idleRatio)}). Repeat "${target.name}" with a larger motion.`,
      countAttempt: true,
      isSuccess: false,
      targetLabelId: target.id,
      targetLabelName: target.name,
      predictedLabelName,
      support,
      avgConfidence,
      idleRatio,
      capturedFrameCount: capturedFrames.length,
    };
  }

  if (!isCorrectGesture) {
    return {
      code: 'wrong_gesture',
      note: `Captured as "${predictedLabelName}" (support ${formatPercent(support)}). Match "${target.name}" more consistently.`,
      countAttempt: true,
      isSuccess: false,
      targetLabelId: target.id,
      targetLabelName: target.name,
      predictedLabelName,
      support,
      avgConfidence,
      idleRatio,
      capturedFrameCount: capturedFrames.length,
    };
  }

  if (!hasSupport) {
    return {
      code: 'low_support',
      note: `Mixed capture for "${target.name}" (${formatPercent(support)} support). Keep gesture shape steady during the whole timed window.`,
      countAttempt: true,
      isSuccess: false,
      targetLabelId: target.id,
      targetLabelName: target.name,
      predictedLabelName,
      support,
      avgConfidence,
      idleRatio,
      capturedFrameCount: capturedFrames.length,
    };
  }

  return {
    code: 'low_confidence',
    note: `Correct class but low confidence (${formatPercent(avgConfidence)}). Repeat "${target.name}" more like your training samples.`,
    countAttempt: true,
    isSuccess: false,
    targetLabelId: target.id,
    targetLabelName: target.name,
    predictedLabelName,
    support,
    avgConfidence,
    idleRatio,
    capturedFrameCount: capturedFrames.length,
  };
}

