/**
 * Severn Edge AI - Core Type Definitions
 */

export * from './ble';

// ============================================================================
// Application State
// ============================================================================
export enum AppStage {
  CONNECT = 'connect',
  PROJECT_BRIEF = 'project-brief',
  PREVIEW = 'preview',
  COLLECT = 'collect',
  TRAIN = 'train',
  TEST = 'test',
  PORTFOLIO = 'portfolio',
}

// ============================================================================
// Gesture/Label Management
// ============================================================================
export interface GestureLabel {
  id: string;
  name: string;
  sampleCount: number;
}

export interface Sample {
  id: string;
  label: string;
  data: number[][];  // Array of [ax, ay, az, gx, gy, gz] samples
  timestamp: number;
  quality: number;   // 0-100 quality score
}

// ============================================================================
// Training State
// ============================================================================
export interface TrainingConfig {
  epochs: number;
  batchSize: number;
  validationSplit: number;
  learningRate: number;
}

export interface TrainingProgress {
  epoch: number;
  totalEpochs: number;
  loss: number;
  accuracy: number;
  valLoss?: number;
  valAccuracy?: number;
}

export interface TrainingResult {
  accuracy: number;
  loss: number;
  confusionMatrix?: number[][];
  modelSizeKB: number;
}

// ============================================================================
// Data Quality
// ============================================================================
export interface QualityResult {
  accept: boolean;
  score: number;       // 0-100
  needsClean: boolean; // True if CRC errors detected
  issues: string[];    // Human-readable issues
}

// ============================================================================
// Connection State
// ============================================================================
export interface ConnectionState {
  isConnected: boolean;
  deviceName: string | null;
  deviceInfo: import('./ble').DeviceInfo | null;
  lastError: string | null;
}

// ============================================================================
// Recording State
// ============================================================================
export interface RecordingState {
  isRecording: boolean;
  currentLabel: string | null;
  sampleCount: number;
  duration: number;     // milliseconds
  packetLossRate: number;
}
