import type { GestureLabel } from '../types';
import type { InferenceFrame } from './captureEvaluationService';

export type { InferenceFrame } from './captureEvaluationService';

export interface GuidedTestTarget {
  id: string;
  name: string;
  kind: 'gesture' | 'idle';
  labelIndex: number | null;
}

export interface GuidedIntervalConfig {
  minFrames: number;
  idleConfidenceThreshold: number;
}

export interface GuidedIntervalResult {
  targetId: string;
  targetName: string;
  targetKind: 'gesture' | 'idle';
  intervalIndex: number;
  windowStartMs: number;
  windowEndMs: number;
  predictedLabelName: string;
  support: number;
  avgConfidence: number;
  idleRatio: number;
  capturedFrameCount: number;
  isCorrect: boolean;
  note: string;
}

export interface GuidedTargetSummary {
  targetId: string;
  targetName: string;
  targetKind: 'gesture' | 'idle';
  correctIntervals: number;
  totalIntervals: number;
  successRate: number;
}

export interface GuidedRunSummary {
  targetSummaries: GuidedTargetSummary[];
  totalCorrectIntervals: number;
  totalIntervals: number;
  overallSuccessRate: number;
  overallFailureRate: number;
  macroSuccessRate: number;
}

function normalizeLabelName(value: string): string {
  return value.trim().toLowerCase();
}

function formatPercent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

const IDLE_BUCKET_ID = '__idle__';
const IDLE_LABEL = 'Idle';
const UNKNOWN_BUCKET_ID = '__unknown__';
const UNKNOWN_LABEL = 'Unknown';
const IDLE_LABEL_NORMALIZED = 'idle';

interface VoteBucket {
  id: string;
  name: string;
  votes: number;
  confidenceSum: number;
}

function selectWinningBucket(buckets: Iterable<VoteBucket>): VoteBucket | null {
  let winner: VoteBucket | null = null;
  for (const bucket of buckets) {
    if (
      !winner
      || bucket.votes > winner.votes
      || (bucket.votes === winner.votes && bucket.confidenceSum > winner.confidenceSum)
    ) {
      winner = bucket;
    }
  }
  return winner;
}

function captureFramesInWindow(
  frames: InferenceFrame[],
  windowStartMs: number,
  windowEndMs: number,
): InferenceFrame[] {
  // Use half-open windows [start, end) so boundary frames count once.
  return frames.filter(
    (frame) => frame.timestamp >= windowStartMs && frame.timestamp < windowEndMs,
  );
}

function resolveFrameBucket(
  frame: InferenceFrame,
  labels: GestureLabel[],
  idleConfidenceThreshold: number,
): { id: string; name: string } {
  const predictedLabel = (
    frame.prediction >= 0 && frame.prediction < labels.length
      ? labels[frame.prediction]
      : null
  );
  const isExplicitIdlePrediction =
    predictedLabel !== null
    && normalizeLabelName(predictedLabel.name) === IDLE_LABEL_NORMALIZED;
  const isIdleFrame =
    frame.prediction === labels.length
    || isExplicitIdlePrediction
    || frame.confidence < idleConfidenceThreshold;

  if (isIdleFrame) {
    return { id: IDLE_BUCKET_ID, name: IDLE_LABEL };
  }

  if (predictedLabel) {
    return { id: predictedLabel.id, name: predictedLabel.name };
  }

  return { id: UNKNOWN_BUCKET_ID, name: UNKNOWN_LABEL };
}

function pickWinningBucket(
  frames: InferenceFrame[],
  labels: GestureLabel[],
  config: GuidedIntervalConfig,
): {
  predictedLabelName: string;
  support: number;
  avgConfidence: number;
  idleRatio: number;
} {
  if (frames.length === 0) {
    return {
      predictedLabelName: IDLE_LABEL,
      support: 0,
      avgConfidence: 0,
      idleRatio: 0,
    };
  }

  const buckets = new Map<string, VoteBucket>();
  let idleVotes = 0;

  for (const frame of frames) {
    const bucket = resolveFrameBucket(frame, labels, config.idleConfidenceThreshold);
    const current = buckets.get(bucket.id) ?? {
      id: bucket.id,
      name: bucket.name,
      votes: 0,
      confidenceSum: 0,
    };

    current.votes += 1;
    current.confidenceSum += frame.confidence;
    buckets.set(bucket.id, current);

    if (bucket.id === IDLE_BUCKET_ID) {
      idleVotes += 1;
    }
  }

  const winner = selectWinningBucket(buckets.values());

  const winningVotes = winner?.votes ?? 0;
  return {
    predictedLabelName: winner?.name ?? UNKNOWN_LABEL,
    support: winningVotes / frames.length,
    avgConfidence: winningVotes > 0 ? (winner?.confidenceSum ?? 0) / winningVotes : 0,
    idleRatio: idleVotes / frames.length,
  };
}

export function buildGuidedTestTargets(labels: GestureLabel[]): GuidedTestTarget[] {
  const targets: GuidedTestTarget[] = labels.map((label, index) => ({
    id: label.id,
    name: label.name,
    kind: normalizeLabelName(label.name) === 'idle' ? 'idle' : 'gesture',
    labelIndex: index,
  }));

  const hasExplicitIdle = targets.some((target) => target.kind === 'idle');
  if (labels.length === 1 && !hasExplicitIdle) {
    targets.push({
      id: IDLE_BUCKET_ID,
      name: IDLE_LABEL,
      kind: 'idle',
      labelIndex: null,
    });
  }

  return targets;
}

export function evaluateGuidedInterval(
  frames: InferenceFrame[],
  labels: GestureLabel[],
  target: GuidedTestTarget,
  intervalIndex: number,
  windowStartMs: number,
  windowEndMs: number,
  config: GuidedIntervalConfig,
): GuidedIntervalResult {
  if (
    target.kind === 'gesture'
    && (target.labelIndex === null || target.labelIndex < 0 || target.labelIndex >= labels.length)
  ) {
    return {
      targetId: target.id,
      targetName: target.name,
      targetKind: target.kind,
      intervalIndex,
      windowStartMs,
      windowEndMs,
      predictedLabelName: UNKNOWN_LABEL,
      support: 0,
      avgConfidence: 0,
      idleRatio: 0,
      capturedFrameCount: 0,
      isCorrect: false,
      note: `Interval ${intervalIndex}: invalid target.`,
    };
  }

  const capturedFrames = captureFramesInWindow(
    frames,
    windowStartMs,
    windowEndMs,
  );
  if (capturedFrames.length < config.minFrames) {
    return {
      targetId: target.id,
      targetName: target.name,
      targetKind: target.kind,
      intervalIndex,
      windowStartMs,
      windowEndMs,
      predictedLabelName: IDLE_LABEL,
      support: 0,
      avgConfidence: 0,
      idleRatio: 0,
      capturedFrameCount: capturedFrames.length,
      isCorrect: false,
      note: `Interval ${intervalIndex}: not enough frames (${capturedFrames.length}).`,
    };
  }

  const frameBuckets = capturedFrames.map((frame) =>
    resolveFrameBucket(frame, labels, config.idleConfidenceThreshold));
  const idleVotes = frameBuckets.filter((bucket) => bucket.id === IDLE_BUCKET_ID).length;

  if (target.kind === 'gesture') {
    const minGestureFrames = Math.max(3, Math.floor(config.minFrames * 0.5));
    const gestureBuckets = new Map<string, VoteBucket>();

    for (let idx = 0; idx < capturedFrames.length; idx += 1) {
      const bucket = frameBuckets[idx];
      if (bucket.id === IDLE_BUCKET_ID || bucket.id === UNKNOWN_BUCKET_ID) {
        continue;
      }

      const current = gestureBuckets.get(bucket.id) ?? {
        id: bucket.id,
        name: bucket.name,
        votes: 0,
        confidenceSum: 0,
      };
      current.votes += 1;
      current.confidenceSum += capturedFrames[idx].confidence;
      gestureBuckets.set(bucket.id, current);
    }

    const winner = selectWinningBucket(gestureBuckets.values());
    const activeGestureFrames = [...gestureBuckets.values()]
      .reduce((sum, bucket) => sum + bucket.votes, 0);

    if (!winner || activeGestureFrames < minGestureFrames) {
      return {
        targetId: target.id,
        targetName: target.name,
        targetKind: target.kind,
        intervalIndex,
        windowStartMs,
        windowEndMs,
        predictedLabelName: IDLE_LABEL,
        support: 0,
        avgConfidence: 0,
        idleRatio: idleVotes / capturedFrames.length,
        capturedFrameCount: capturedFrames.length,
        isCorrect: false,
        note: `Interval ${intervalIndex}: mostly idle or uncertain gesture (${activeGestureFrames}/${capturedFrames.length} active frames).`,
      };
    }

    const support = winner.votes / capturedFrames.length;
    const avgConfidence = winner.confidenceSum / winner.votes;
    const isCorrect = normalizeLabelName(winner.name) === normalizeLabelName(target.name);

    return {
      targetId: target.id,
      targetName: target.name,
      targetKind: target.kind,
      intervalIndex,
      windowStartMs,
      windowEndMs,
      predictedLabelName: winner.name,
      support,
      avgConfidence,
      idleRatio: idleVotes / capturedFrames.length,
      capturedFrameCount: capturedFrames.length,
      isCorrect,
      note: isCorrect
        ? `Interval ${intervalIndex}: "${target.name}" detected (${formatPercent(support)} support).`
        : `Interval ${intervalIndex}: predicted "${winner.name}".`,
    };
  }

  const winner = pickWinningBucket(capturedFrames, labels, config);

  const isCorrect =
    normalizeLabelName(winner.predictedLabelName) === normalizeLabelName(target.name);

  return {
    targetId: target.id,
    targetName: target.name,
    targetKind: target.kind,
    intervalIndex,
    windowStartMs,
    windowEndMs,
    predictedLabelName: winner.predictedLabelName,
    support: winner.support,
    avgConfidence: winner.avgConfidence,
    idleRatio: winner.idleRatio,
    capturedFrameCount: capturedFrames.length,
    isCorrect,
    note: isCorrect
      ? target.kind === 'idle'
        ? `Interval ${intervalIndex}: Idle detected (${formatPercent(winner.support)} support).`
        : `Interval ${intervalIndex}: "${target.name}" detected (${formatPercent(winner.support)} support).`
      : target.kind === 'idle'
      ? `Interval ${intervalIndex}: predicted "${winner.predictedLabelName}" instead of Idle.`
      : `Interval ${intervalIndex}: predicted "${winner.predictedLabelName}".`,
  };
}

export function summarizeGuidedIntervals(
  targets: GuidedTestTarget[],
  intervals: GuidedIntervalResult[],
): GuidedRunSummary {
  const targetSummaries = targets.map<GuidedTargetSummary>((target) => {
    const scoped = intervals.filter((interval) => interval.targetId === target.id);
    const totalIntervals = scoped.length;
    const correctIntervals = scoped.filter((interval) => interval.isCorrect).length;
    const successRate = totalIntervals > 0 ? correctIntervals / totalIntervals : 0;

    return {
      targetId: target.id,
      targetName: target.name,
      targetKind: target.kind,
      totalIntervals,
      correctIntervals,
      successRate,
    };
  });

  const totalIntervals = targetSummaries.reduce((sum, row) => sum + row.totalIntervals, 0);
  const totalCorrectIntervals = targetSummaries.reduce((sum, row) => sum + row.correctIntervals, 0);
  const overallSuccessRate = totalIntervals > 0 ? totalCorrectIntervals / totalIntervals : 0;
  const overallFailureRate = totalIntervals > 0 ? 1 - overallSuccessRate : 0;
  const macroSuccessRate = targetSummaries.length > 0
    ? targetSummaries.reduce((sum, row) => sum + row.successRate, 0) / targetSummaries.length
    : 0;

  return {
    targetSummaries,
    totalCorrectIntervals,
    totalIntervals,
    overallSuccessRate,
    overallFailureRate,
    macroSuccessRate,
  };
}
