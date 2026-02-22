import type { GestureLabel, Sample } from '../types';

export interface DatasetSplit {
  trainingSamples: Sample[];
  testingSamples: Sample[];
}

export interface EvaluatedSample {
  sampleId: string;
  expectedLabelId: string;
  expectedLabelName: string;
  predictedLabelId: string | null;
  predictedLabelName: string;
  confidence: number;
  correct: boolean;
}

export interface LabelMetrics {
  labelId: string;
  labelName: string;
  support: number;
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
}

export interface ModelTestingReport {
  totalSamples: number;
  correctSamples: number;
  accuracy: number;
  macroF1: number;
  meanConfidence: number;
  confusionMatrix: number[][];
  labelMetrics: LabelMetrics[];
  sampleResults: EvaluatedSample[];
}

export interface PredictionResult {
  prediction: number;
  confidence: number;
}

function getSplit(sample: Sample): 'train' | 'test' {
  return sample.split === 'test' ? 'test' : 'train';
}

function roundMetric(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function recommendedTestCount(total: number, ratio: number): number {
  if (total < 5 || ratio <= 0) {
    return 0;
  }

  const maxAllowed = Math.max(0, total - 3); // Leave at least 3 samples for training.
  const desired = Math.max(1, Math.round(total * ratio));
  return Math.max(0, Math.min(desired, maxAllowed));
}

export function splitSamplesByDataset(samples: Sample[]): DatasetSplit {
  const trainingSamples: Sample[] = [];
  const testingSamples: Sample[] = [];

  for (const sample of samples) {
    if (getSplit(sample) === 'test') {
      testingSamples.push(sample);
    } else {
      trainingSamples.push(sample);
    }
  }

  return { trainingSamples, testingSamples };
}

export function createRecommendedTestSplit(
  samples: Sample[],
  labels: GestureLabel[],
  ratio = 0.2,
): Sample[] {
  const labelSet = new Set(labels.map((label) => label.id));
  const next = samples.map((sample) => ({ ...sample }));
  const labelGroups = new Map<string, number[]>();

  next.forEach((sample, index) => {
    if (!labelSet.has(sample.label)) {
      return;
    }

    sample.split = 'train';
    const group = labelGroups.get(sample.label);
    if (group) {
      group.push(index);
    } else {
      labelGroups.set(sample.label, [index]);
    }
  });

  for (const [, indexes] of labelGroups) {
    const ordered = [...indexes].sort((a, b) => next[a].timestamp - next[b].timestamp);
    const testCount = recommendedTestCount(ordered.length, ratio);
    const selected = ordered.slice(ordered.length - testCount);

    for (const idx of selected) {
      next[idx].split = 'test';
    }
  }

  return next;
}

export function evaluateModelOnSamples(
  samples: Sample[],
  labels: GestureLabel[],
  predict: (sampleData: number[][]) => PredictionResult,
): ModelTestingReport {
  const labelToIndex = new Map(labels.map((label, idx) => [label.id, idx]));
  const confusionMatrix = labels.map(() => new Array(labels.length).fill(0));
  const supportCounts = new Array(labels.length).fill(0);
  const sampleResults: EvaluatedSample[] = [];
  let totalSamples = 0;
  let correctSamples = 0;
  let confidenceSum = 0;

  for (const sample of samples) {
    const expectedIndex = labelToIndex.get(sample.label);
    if (expectedIndex === undefined) {
      continue;
    }

    const rawPrediction = predict(sample.data);
    const predictedIndex = Number.isInteger(rawPrediction.prediction)
      ? rawPrediction.prediction
      : -1;
    const validPrediction =
      predictedIndex >= 0 && predictedIndex < labels.length ? predictedIndex : -1;

    const confidence = Math.max(0, Math.min(1, rawPrediction.confidence || 0));
    const correct = validPrediction === expectedIndex;

    totalSamples += 1;
    supportCounts[expectedIndex] += 1;
    confidenceSum += confidence;
    if (correct) {
      correctSamples += 1;
    }

    if (validPrediction >= 0) {
      confusionMatrix[expectedIndex][validPrediction] += 1;
    }

    sampleResults.push({
      sampleId: sample.id,
      expectedLabelId: labels[expectedIndex].id,
      expectedLabelName: labels[expectedIndex].name,
      predictedLabelId: validPrediction >= 0 ? labels[validPrediction].id : null,
      predictedLabelName: validPrediction >= 0 ? labels[validPrediction].name : 'Unknown',
      confidence,
      correct,
    });
  }

  const labelMetrics: LabelMetrics[] = labels.map((label, idx) => {
    const tp = confusionMatrix[idx][idx];
    let fp = 0;

    for (let row = 0; row < labels.length; row++) {
      if (row !== idx) {
        fp += confusionMatrix[row][idx];
      }
    }

    const support = supportCounts[idx];
    const fn = Math.max(0, support - tp);
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = support > 0 ? tp / support : 0;
    const f1 =
      precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    return {
      labelId: label.id,
      labelName: label.name,
      support,
      tp,
      fp,
      fn,
      precision: roundMetric(precision),
      recall: roundMetric(recall),
      f1: roundMetric(f1),
    };
  });

  const accuracy = totalSamples > 0 ? correctSamples / totalSamples : 0;
  const macroF1 =
    labelMetrics.length > 0
      ? labelMetrics.reduce((sum, metric) => sum + metric.f1, 0) / labelMetrics.length
      : 0;
  const meanConfidence = totalSamples > 0 ? confidenceSum / totalSamples : 0;

  return {
    totalSamples,
    correctSamples,
    accuracy: roundMetric(accuracy),
    macroF1: roundMetric(macroF1),
    meanConfidence: roundMetric(meanConfidence),
    confusionMatrix,
    labelMetrics,
    sampleResults,
  };
}
