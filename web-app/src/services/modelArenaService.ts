import type { GestureLabel, Sample } from '../types';

export type ArenaBenchmarkTrack = 'holdout' | 'generic';

export interface ArenaBenchmarkCase {
  id: string;
  track: ArenaBenchmarkTrack;
  expectedLabelId: string;
  expectedLabelName: string;
  data: number[][];
}

export interface ArenaTrackScore {
  track: ArenaBenchmarkTrack;
  total: number;
  correct: number;
  accuracy: number;
}

export interface ArenaLabelScore {
  labelId: string;
  labelName: string;
  total: number;
  correct: number;
  accuracy: number;
  genericTotal: number;
  genericCorrect: number;
  genericAccuracy: number;
}

export interface ArenaRunResult {
  total: number;
  correct: number;
  overallAccuracy: number;
  generalizationAccuracy: number;
  genericAccuracy: number;
  arenaScore: number;
  trackScores: ArenaTrackScore[];
  labelScores: ArenaLabelScore[];
}

export interface ArenaSubmission {
  id: string;
  studentName: string;
  projectName: string;
  createdAt: number;
  labels: string[];
  totalBenchmarks: number;
  overallAccuracy: number;
  generalizationAccuracy: number;
  genericAccuracy: number;
  arenaScore: number;
}

export interface PredictionResult {
  prediction: number;
  confidence: number;
}

const ARENA_GENERIC_VARIANTS_PER_SEED = 2;
const ARENA_MAX_SEEDS_PER_LABEL = 3;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function roundMetric(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function makeCaseId(prefix: string, labelId: string, index: number): string {
  return `${prefix}:${labelId}:${index}`;
}

function pickSeedsForLabel(trainingSamples: Sample[]): Sample[] {
  if (trainingSamples.length === 0) return [];

  const sorted = [...trainingSamples].sort((a, b) => {
    if (b.quality !== a.quality) {
      return b.quality - a.quality;
    }
    return b.timestamp - a.timestamp;
  });

  return sorted.slice(0, ARENA_MAX_SEEDS_PER_LABEL);
}

function copyRows(data: number[][]): number[][] {
  return data.map((row) => [...row]);
}

function perturbSample(data: number[][], variantIndex: number): number[][] {
  if (data.length === 0) return [];

  const source = copyRows(data);
  const shifted = source.map((_, idx) => source[(idx + (variantIndex + 1) * 3) % source.length]);
  const scale = variantIndex === 0 ? 0.92 : 1.08;
  const noiseAmp = variantIndex === 0 ? 0.015 : 0.02;

  return shifted.map((row, rowIndex) =>
    row.map((value, colIndex) => {
      const phase = (rowIndex + 1) * (colIndex + 2);
      const waveNoise = Math.sin(phase * 0.17) * noiseAmp;
      return value * scale + waveNoise;
    }),
  );
}

export function buildArenaBenchmarks(
  labels: GestureLabel[],
  trainingSamples: Sample[],
  testingSamples: Sample[],
): ArenaBenchmarkCase[] {
  const labelSet = new Set(labels.map((label) => label.id));
  const labelNameById = new Map(labels.map((label) => [label.id, label.name]));
  const byLabelTrain = new Map<string, Sample[]>();

  for (const sample of trainingSamples) {
    if (!labelSet.has(sample.label)) continue;
    const group = byLabelTrain.get(sample.label);
    if (group) {
      group.push(sample);
    } else {
      byLabelTrain.set(sample.label, [sample]);
    }
  }

  const cases: ArenaBenchmarkCase[] = [];
  let holdoutIndex = 0;
  let genericIndex = 0;

  for (const sample of testingSamples) {
    if (!labelSet.has(sample.label)) continue;
    cases.push({
      id: makeCaseId('holdout', sample.label, holdoutIndex++),
      track: 'holdout',
      expectedLabelId: sample.label,
      expectedLabelName: labelNameById.get(sample.label) ?? sample.label,
      data: copyRows(sample.data),
    });
  }

  for (const label of labels) {
    const seeds = pickSeedsForLabel(byLabelTrain.get(label.id) ?? []);
    for (const seed of seeds) {
      for (let variant = 0; variant < ARENA_GENERIC_VARIANTS_PER_SEED; variant++) {
        cases.push({
          id: makeCaseId('generic', label.id, genericIndex++),
          track: 'generic',
          expectedLabelId: label.id,
          expectedLabelName: label.name,
          data: perturbSample(seed.data, variant),
        });
      }
    }
  }

  return cases;
}

export function evaluateArenaBenchmarks(
  benchmarks: ArenaBenchmarkCase[],
  labels: GestureLabel[],
  predict: (sampleData: number[][]) => PredictionResult,
): ArenaRunResult {
  const labelToIndex = new Map(labels.map((label, idx) => [label.id, idx]));
  const labelScoresMap = new Map<string, ArenaLabelScore>();

  for (const label of labels) {
    labelScoresMap.set(label.id, {
      labelId: label.id,
      labelName: label.name,
      total: 0,
      correct: 0,
      accuracy: 0,
      genericTotal: 0,
      genericCorrect: 0,
      genericAccuracy: 0,
    });
  }

  const trackCounts: Record<ArenaBenchmarkTrack, { total: number; correct: number }> = {
    holdout: { total: 0, correct: 0 },
    generic: { total: 0, correct: 0 },
  };

  let total = 0;
  let correct = 0;

  for (const bench of benchmarks) {
    const expectedIndex = labelToIndex.get(bench.expectedLabelId);
    if (expectedIndex === undefined) continue;

    const prediction = predict(bench.data).prediction;
    const predictedIndex = Number.isInteger(prediction) ? prediction : -1;
    const isCorrect = predictedIndex === expectedIndex;

    total += 1;
    if (isCorrect) {
      correct += 1;
      trackCounts[bench.track].correct += 1;
    }
    trackCounts[bench.track].total += 1;

    const labelScore = labelScoresMap.get(bench.expectedLabelId);
    if (!labelScore) continue;
    labelScore.total += 1;
    if (isCorrect) {
      labelScore.correct += 1;
    }
    if (bench.track === 'generic') {
      labelScore.genericTotal += 1;
      if (isCorrect) {
        labelScore.genericCorrect += 1;
      }
    }
  }

  const overallAccuracy = total > 0 ? correct / total : 0;
  const generalizationAccuracy =
    trackCounts.holdout.total > 0
      ? trackCounts.holdout.correct / trackCounts.holdout.total
      : 0;
  const genericAccuracy =
    trackCounts.generic.total > 0
      ? trackCounts.generic.correct / trackCounts.generic.total
      : 0;

  const holdoutWeight = trackCounts.holdout.total > 0 ? 0.7 : 0;
  const genericWeight = trackCounts.generic.total > 0 ? 0.3 : 0;
  const totalWeight = holdoutWeight + genericWeight;
  const arenaScore = totalWeight > 0
    ? (generalizationAccuracy * holdoutWeight + genericAccuracy * genericWeight) / totalWeight
    : overallAccuracy;

  const labelScores = [...labelScoresMap.values()].map((entry) => ({
    ...entry,
    accuracy: roundMetric(entry.total > 0 ? entry.correct / entry.total : 0),
    genericAccuracy: roundMetric(
      entry.genericTotal > 0 ? entry.genericCorrect / entry.genericTotal : 0,
    ),
  }));

  const trackScores: ArenaTrackScore[] = (['holdout', 'generic'] as const).map((track) => {
    const row = trackCounts[track];
    return {
      track,
      total: row.total,
      correct: row.correct,
      accuracy: roundMetric(row.total > 0 ? row.correct / row.total : 0),
    };
  });

  return {
    total,
    correct,
    overallAccuracy: roundMetric(overallAccuracy),
    generalizationAccuracy: roundMetric(generalizationAccuracy),
    genericAccuracy: roundMetric(genericAccuracy),
    arenaScore: roundMetric(clamp01(arenaScore)),
    trackScores,
    labelScores,
  };
}

export function rankArenaSubmissions(
  submissions: ArenaSubmission[],
): ArenaSubmission[] {
  return [...submissions].sort((a, b) => {
    if (b.arenaScore !== a.arenaScore) return b.arenaScore - a.arenaScore;
    if (b.generalizationAccuracy !== a.generalizationAccuracy) {
      return b.generalizationAccuracy - a.generalizationAccuracy;
    }
    return a.createdAt - b.createdAt;
  });
}

export function mergeArenaSubmissions(
  current: ArenaSubmission[],
  incoming: ArenaSubmission[],
): ArenaSubmission[] {
  const byId = new Map<string, ArenaSubmission>();
  for (const row of current) {
    byId.set(row.id, row);
  }
  for (const row of incoming) {
    const existing = byId.get(row.id);
    if (!existing || row.createdAt > existing.createdAt) {
      byId.set(row.id, row);
    }
  }
  return rankArenaSubmissions([...byId.values()]);
}

export function createArenaSubmission(input: {
  studentName: string;
  projectName: string;
  labels: GestureLabel[];
  result: ArenaRunResult;
}): ArenaSubmission {
  return {
    id: crypto.randomUUID(),
    studentName: input.studentName,
    projectName: input.projectName,
    createdAt: Date.now(),
    labels: input.labels.map((label) => label.name),
    totalBenchmarks: input.result.total,
    overallAccuracy: input.result.overallAccuracy,
    generalizationAccuracy: input.result.generalizationAccuracy,
    genericAccuracy: input.result.genericAccuracy,
    arenaScore: input.result.arenaScore,
  };
}
