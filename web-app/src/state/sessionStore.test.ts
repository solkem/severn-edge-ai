import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppStage } from '../types';
import type { Sample } from '../types';
import type { SessionMeta } from '../storage/schema';

const dbMocks = vi.hoisted(() => {
  let seq = 0;
  const makeSession = (id?: string): SessionMeta => {
    const now = 1700000000000 + seq;
    seq += 1;
    return {
      id: id ?? `session-${seq}`,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      studentDisplayName: null,
      projectBrief: null,
      gestures: [],
      badgeIds: [],
      checkpointIds: [],
      currentStage: AppStage.CONNECT,
      trainingAccuracy: null,
      lastDeviceName: null,
      overrideUsedAt: [],
    };
  };

  return {
    makeSession,
    appendJournalEntry: vi.fn(async () => undefined),
    clearAllDeviceData: vi.fn(async () => undefined),
    createEmptySessionMeta: vi.fn(() => makeSession()),
    getSessionBundle: vi.fn(async () => null),
    listRecoverableSessions: vi.fn(async (): Promise<SessionMeta[]> => []),
    replaceSessionSamples: vi.fn(async () => undefined),
    saveSessionMetaQueued: vi.fn(async () => undefined),
    upsertSample: vi.fn(async () => undefined),
  };
});

vi.mock('../storage/db', () => ({
  appendJournalEntry: dbMocks.appendJournalEntry,
  clearAllDeviceData: dbMocks.clearAllDeviceData,
  createEmptySessionMeta: dbMocks.createEmptySessionMeta,
  getSessionBundle: dbMocks.getSessionBundle,
  listRecoverableSessions: dbMocks.listRecoverableSessions,
  replaceSessionSamples: dbMocks.replaceSessionSamples,
  saveSessionMetaQueued: dbMocks.saveSessionMetaQueued,
  upsertSample: dbMocks.upsertSample,
}));

vi.mock('../utils/debounce', () => ({
  debounce: (fn: (...args: unknown[]) => void) => fn,
}));

import { useSessionStore } from './sessionStore';

describe('sessionStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.setState({
      session: null,
      samples: [],
      journal: [],
      recoverySessions: [],
      isLoading: true,
      lastAwardedBadge: null,
    });
  });

  it('initializes a new session when no recovery sessions exist', async () => {
    dbMocks.listRecoverableSessions.mockResolvedValueOnce([]);

    await useSessionStore.getState().initialize();

    const state = useSessionStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.recoverySessions).toEqual([]);
    expect(state.session?.currentStage).toBe('connect');
    expect(dbMocks.saveSessionMetaQueued).toHaveBeenCalledTimes(1);
  });

  it('exposes recoverable sessions instead of auto-creating a new session', async () => {
    const recoverable = dbMocks.makeSession('recoverable-1');
    dbMocks.listRecoverableSessions.mockResolvedValueOnce([recoverable]);

    await useSessionStore.getState().initialize();

    const state = useSessionStore.getState();
    expect(state.session).toBeNull();
    expect(state.recoverySessions).toEqual([recoverable]);
    expect(dbMocks.saveSessionMetaQueued).not.toHaveBeenCalled();
  });

  it('awards each badge at most once', () => {
    const session = dbMocks.makeSession('badge-session');
    useSessionStore.setState({
      session,
      isLoading: false,
    });

    const store = useSessionStore.getState();
    store.addBadge('connected');
    store.addBadge('connected');

    const state = useSessionStore.getState();
    expect(state.session?.badgeIds).toEqual(['connected']);
    expect(state.lastAwardedBadge).toBe('connected');
    expect(dbMocks.saveSessionMetaQueued).toHaveBeenCalledTimes(1);
  });

  it('records teacher overrides with checkpoint and timestamp', () => {
    const session = dbMocks.makeSession('override-session');
    useSessionStore.setState({
      session,
      isLoading: false,
    });

    useSessionStore.getState().logTeacherOverride('gate-1-sensor');

    const state = useSessionStore.getState();
    expect(state.session?.checkpointIds).toEqual(['gate-1-sensor']);
    expect(state.session?.overrideUsedAt).toHaveLength(1);
    expect(dbMocks.saveSessionMetaQueued).toHaveBeenCalledTimes(1);
  });

  it('persists normalized samples through replaceSessionSamples', async () => {
    const session = dbMocks.makeSession('sample-session');
    useSessionStore.setState({
      session,
      isLoading: false,
    });

    const samples: Sample[] = [
      {
        id: 'sample-1',
        label: 'gesture-1',
        data: [[1, 2, 3, 4, 5, 6]],
        timestamp: 1700000000100,
        quality: 92,
      },
    ];

    await useSessionStore.getState().setSamples(samples);

    expect(useSessionStore.getState().samples).toEqual(samples);
    expect(dbMocks.replaceSessionSamples).toHaveBeenCalledWith(session.id, samples);
  });
});
