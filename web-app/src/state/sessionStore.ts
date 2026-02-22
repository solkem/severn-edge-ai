import { createStore } from './createStore';
import type { AppStage, GestureLabel, Sample } from '../types';
import type { BadgeId, CheckpointId, DesignJournalEntry, ProjectBrief, SessionMeta } from '../storage/schema';
import {
  appendJournalEntry,
  clearAllDeviceData,
  createEmptySessionMeta,
  getSessionBundle,
  listRecoverableSessions,
  replaceSessionSamples,
  saveSessionMetaQueued,
  upsertSample,
} from '../storage/db';
import { debounce } from '../utils/debounce';

interface SessionState {
  session: SessionMeta | null;
  samples: Sample[];
  journal: DesignJournalEntry[];
  recoverySessions: SessionMeta[];
  resumeStageAfterReconnect: AppStage | null;
  isLoading: boolean;
  lastAwardedBadge: BadgeId | null;
}

interface SessionActions {
  initialize: () => Promise<void>;
  recoverSession: (sessionId: string) => Promise<void>;
  startFresh: () => Promise<void>;
  clearAllDataAndRestart: () => Promise<void>;
  clearResumeStage: () => void;
  setStage: (stage: AppStage) => void;
  setDeviceName: (name: string | null) => void;
  setProjectBrief: (brief: ProjectBrief | null) => void;
  setGestures: (gestures: GestureLabel[]) => void;
  setSamples: (samples: Sample[]) => Promise<void>;
  addSample: (sample: Sample) => Promise<void>;
  setTrainingAccuracy: (accuracy: number | null) => void;
  addBadge: (badgeId: BadgeId) => void;
  clearAwardedBadge: () => void;
  passCheckpoint: (checkpointId: CheckpointId) => void;
  addJournalEntry: (
    prompt: DesignJournalEntry['prompt'],
    response: string,
  ) => Promise<void>;
  logTeacherOverride: (checkpointId: CheckpointId) => void;
}

export type SessionStore = SessionState & SessionActions;

function ensureSession(session: SessionMeta | null): SessionMeta {
  return session ?? createEmptySessionMeta();
}

function bumpRevision(
  session: SessionMeta,
  patch: Partial<SessionMeta>,
): SessionMeta {
  return {
    ...session,
    ...patch,
    revision: session.revision + 1,
    updatedAt: Date.now(),
  };
}

const debouncedMetaSave = debounce((meta: SessionMeta) => {
  void saveSessionMetaQueued(meta);
}, 500);

export const useSessionStore = createStore<SessionStore>((set, get) => ({
  session: null,
  samples: [],
  journal: [],
  recoverySessions: [],
  resumeStageAfterReconnect: null,
  isLoading: true,
  lastAwardedBadge: null,

  initialize: async () => {
    const recoverySessions = await listRecoverableSessions(10);
    if (recoverySessions.length > 0) {
      set({
        recoverySessions,
        isLoading: false,
      });
      return;
    }

    const session = createEmptySessionMeta();
    await saveSessionMetaQueued(session);
    set({
      session,
      samples: [],
      journal: [],
      recoverySessions: [],
      resumeStageAfterReconnect: null,
      isLoading: false,
    });
  },

  recoverSession: async (sessionId) => {
    const bundle = await getSessionBundle(sessionId);
    if (!bundle) {
      return;
    }
    set({
      // Re-enter connect stage first, then resume to saved stage after reconnect.
      session: {
        ...bundle.meta,
        currentStage: 'connect' as AppStage,
      },
      samples: bundle.samples,
      journal: bundle.journal,
      recoverySessions: [],
      resumeStageAfterReconnect: bundle.meta.currentStage,
      isLoading: false,
    });
  },

  startFresh: async () => {
    const session = createEmptySessionMeta();
    await saveSessionMetaQueued(session);
    set({
      session,
      samples: [],
      journal: [],
      recoverySessions: [],
      resumeStageAfterReconnect: null,
      isLoading: false,
      lastAwardedBadge: null,
    });
  },

  clearAllDataAndRestart: async () => {
    await clearAllDeviceData();
    const session = createEmptySessionMeta();
    await saveSessionMetaQueued(session);
    set({
      session,
      samples: [],
      journal: [],
      recoverySessions: [],
      resumeStageAfterReconnect: null,
      isLoading: false,
      lastAwardedBadge: null,
    });
  },

  clearResumeStage: () => {
    set({ resumeStageAfterReconnect: null });
  },

  setStage: (stage) => {
    const session = ensureSession(get().session);
    const updated = bumpRevision(session, { currentStage: stage });
    set({
      session: updated,
      resumeStageAfterReconnect: null,
    });
    debouncedMetaSave(updated);
  },

  setDeviceName: (name) => {
    const session = ensureSession(get().session);
    const updated = bumpRevision(session, { lastDeviceName: name });
    set({ session: updated });
    debouncedMetaSave(updated);
  },

  setProjectBrief: (brief) => {
    const session = ensureSession(get().session);
    const updated = bumpRevision(session, {
      projectBrief: brief,
      studentDisplayName: brief?.studentName ?? null,
    });
    set({ session: updated });
    debouncedMetaSave(updated);
  },

  setGestures: (gestures) => {
    const session = ensureSession(get().session);
    const updated = bumpRevision(session, { gestures });
    set({ session: updated });
    debouncedMetaSave(updated);
  },

  setSamples: async (samples) => {
    const session = ensureSession(get().session);
    set({ samples });
    await replaceSessionSamples(session.id, samples);
  },

  addSample: async (sample) => {
    const session = ensureSession(get().session);
    const nextSamples = [...get().samples, sample];
    set({ samples: nextSamples });
    await upsertSample(session.id, sample);
  },

  setTrainingAccuracy: (accuracy) => {
    const session = ensureSession(get().session);
    const updated = bumpRevision(session, { trainingAccuracy: accuracy });
    set({ session: updated });
    void saveSessionMetaQueued(updated);
  },

  addBadge: (badgeId) => {
    const session = ensureSession(get().session);
    if (session.badgeIds.includes(badgeId)) {
      return;
    }
    const updated = bumpRevision(session, {
      badgeIds: [...session.badgeIds, badgeId],
    });
    set({
      session: updated,
      lastAwardedBadge: badgeId,
    });
    void saveSessionMetaQueued(updated);
  },

  clearAwardedBadge: () => {
    set({ lastAwardedBadge: null });
  },

  passCheckpoint: (checkpointId) => {
    const session = ensureSession(get().session);
    if (session.checkpointIds.includes(checkpointId)) {
      return;
    }
    const updated = bumpRevision(session, {
      checkpointIds: [...session.checkpointIds, checkpointId],
    });
    set({ session: updated });
    void saveSessionMetaQueued(updated);
  },

  addJournalEntry: async (prompt, response) => {
    const session = ensureSession(get().session);
    const entry: DesignJournalEntry = {
      id: crypto.randomUUID(),
      sessionId: session.id,
      prompt,
      response,
      timestamp: Date.now(),
    };
    const nextJournal = [...get().journal, entry];
    set({ journal: nextJournal });
    await appendJournalEntry(entry);
  },

  logTeacherOverride: (checkpointId) => {
    const session = ensureSession(get().session);
    const updated = bumpRevision(session, {
      overrideUsedAt: [...session.overrideUsedAt, Date.now()],
      checkpointIds: session.checkpointIds.includes(checkpointId)
        ? session.checkpointIds
        : [...session.checkpointIds, checkpointId],
    });
    set({ session: updated });
    void saveSessionMetaQueued(updated);
  },
}));
