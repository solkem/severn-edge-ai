import type { AppStage, GestureLabel, Sample } from '../types';

export type BadgeId =
  | 'connected'
  | 'sensor-explorer'
  | 'designer'
  | 'data-scientist'
  | 'ai-trainer'
  | 'edge-engineer'
  | 'sharp-shooter';

export type CheckpointId =
  | 'gate-1-sensor'
  | 'gate-2-gesture'
  | 'gate-3-confidence';

export interface ProjectBrief {
  studentName: string;
  name: string;
  problemStatement: string;
  useCase: 'accessibility' | 'gaming' | 'art' | 'communication' | 'other';
  gestureIdeas?: string;
}

export interface DesignJournalEntry {
  id: string;
  sessionId: string;
  prompt: 'after-preview' | 'after-train' | 'after-test';
  response: string;
  timestamp: number;
}

export interface SessionMeta {
  id: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  studentDisplayName: string | null;
  projectBrief: ProjectBrief | null;
  gestures: GestureLabel[];
  badgeIds: BadgeId[];
  checkpointIds: CheckpointId[];
  currentStage: AppStage;
  trainingAccuracy: number | null;
  lastDeviceName: string | null;
  overrideUsedAt: number[];
}

export interface PersistedSample extends Sample {
  sessionId: string;
  labelId: string;
}

export interface SessionBundle {
  meta: SessionMeta;
  samples: Sample[];
  journal: DesignJournalEntry[];
}

