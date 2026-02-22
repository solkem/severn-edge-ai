import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { AppStage, Sample } from '../types';
import type { DesignJournalEntry, PersistedSample, SessionMeta, SessionBundle } from './schema';

interface SevernEdgeDB extends DBSchema {
  sessions: {
    key: string;
    value: SessionMeta;
    indexes: {
      'by-updated': number;
    };
  };
  samples: {
    key: string;
    value: PersistedSample;
    indexes: {
      'by-session': string;
      'by-session-label': [string, string];
    };
  };
  journals: {
    key: string;
    value: DesignJournalEntry;
    indexes: {
      'by-session': string;
      'by-session-time': [string, number];
    };
  };
}

const DB_NAME = 'severn-edge-ai';
export const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<SevernEdgeDB>> | null = null;
const sessionWriteQueues = new Map<string, Promise<void>>();

function now(): number {
  return Date.now();
}

export function createEmptySessionMeta(): SessionMeta {
  return {
    id: crypto.randomUUID(),
    revision: 1,
    createdAt: now(),
    updatedAt: now(),
    studentDisplayName: null,
    projectBrief: null,
    gestures: [],
    badgeIds: [],
    checkpointIds: [],
    currentStage: 'connect' as AppStage,
    trainingAccuracy: null,
    lastDeviceName: null,
    overrideUsedAt: [],
  };
}

async function getDb(): Promise<IDBPDatabase<SevernEdgeDB>> {
  if (!dbPromise) {
    dbPromise = openDB<SevernEdgeDB>(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, tx) {
        if (!db.objectStoreNames.contains('sessions')) {
          const sessions = db.createObjectStore('sessions', { keyPath: 'id' });
          sessions.createIndex('by-updated', 'updatedAt');
        } else {
          const sessions = tx.objectStore('sessions');
          if (!sessions.indexNames.contains('by-updated')) {
            sessions.createIndex('by-updated', 'updatedAt');
          }
        }

        if (!db.objectStoreNames.contains('samples')) {
          const samples = db.createObjectStore('samples', { keyPath: 'id' });
          samples.createIndex('by-session', 'sessionId');
          samples.createIndex('by-session-label', ['sessionId', 'labelId']);
        }

        if (!db.objectStoreNames.contains('journals')) {
          const journals = db.createObjectStore('journals', { keyPath: 'id' });
          journals.createIndex('by-session', 'sessionId');
          journals.createIndex('by-session-time', ['sessionId', 'timestamp']);
        }

        // Best-effort migration from legacy monolithic sessions to normalized stores.
        if (oldVersion < 2 && db.objectStoreNames.contains('sessions')) {
          const sessionsStore = tx.objectStore('sessions');
          const samplesStore = tx.objectStore('samples');
          const journalsStore = tx.objectStore('journals');

          let cursor = await sessionsStore.openCursor();
          while (cursor) {
            const raw = cursor.value as unknown as Record<string, unknown>;
            const id = typeof raw.id === 'string' ? raw.id : crypto.randomUUID();
            const createdAt =
              typeof raw.createdAt === 'number'
                ? raw.createdAt
                : typeof raw.createdAt === 'string'
                ? Date.parse(raw.createdAt)
                : now();
            const updatedAt =
              typeof raw.lastUpdated === 'number'
                ? raw.lastUpdated
                : typeof raw.lastUpdated === 'string'
                ? Date.parse(raw.lastUpdated)
                : now();

            const meta: SessionMeta = {
              id,
              revision: typeof raw.revision === 'number' ? raw.revision : 1,
              createdAt,
              updatedAt,
              studentDisplayName:
                typeof raw.studentDisplayName === 'string'
                  ? raw.studentDisplayName
                  : null,
              projectBrief: (raw.projectBrief as SessionMeta['projectBrief']) ?? null,
              gestures: Array.isArray(raw.gestures)
                ? (raw.gestures as SessionMeta['gestures'])
                : [],
              badgeIds: Array.isArray(raw.badgeIds)
                ? (raw.badgeIds as SessionMeta['badgeIds'])
                : Array.isArray(raw.badges)
                ? (raw.badges as SessionMeta['badgeIds'])
                : [],
              checkpointIds: Array.isArray(raw.checkpointIds)
                ? (raw.checkpointIds as SessionMeta['checkpointIds'])
                : Array.isArray(raw.checkpointsPassed)
                ? (raw.checkpointsPassed as SessionMeta['checkpointIds'])
                : [],
              currentStage: (raw.currentStage as AppStage) ?? ('connect' as AppStage),
              trainingAccuracy:
                typeof raw.trainingAccuracy === 'number' ? raw.trainingAccuracy : null,
              lastDeviceName:
                typeof raw.lastDeviceName === 'string' ? raw.lastDeviceName : null,
              overrideUsedAt: Array.isArray(raw.overrideUsedAt)
                ? (raw.overrideUsedAt as number[])
                : [],
            };

            const legacySamples = Array.isArray(raw.samples) ? (raw.samples as Sample[]) : [];
            for (const sample of legacySamples) {
              await samplesStore.put({
                ...sample,
                sessionId: id,
                labelId: sample.label,
              });
            }

            const legacyJournal = Array.isArray(raw.designJournal)
              ? (raw.designJournal as DesignJournalEntry[])
              : [];
            for (const entry of legacyJournal) {
              await journalsStore.put({
                ...entry,
                sessionId: id,
              });
            }

            await cursor.update(meta);
            cursor = await cursor.continue();
          }
        }
      },
    });
  }
  return dbPromise;
}

function queueSessionWrite(sessionId: string, task: () => Promise<void>): Promise<void> {
  const prior = sessionWriteQueues.get(sessionId) ?? Promise.resolve();
  const next = prior.then(task);
  sessionWriteQueues.set(
    sessionId,
    next.catch(() => {
      // Keep queue chain alive after failures.
    }),
  );
  return next;
}

export async function listRecoverableSessions(limit = 10): Promise<SessionMeta[]> {
  const db = await getDb();
  const all = await db.getAll('sessions');
  const sorted = all
    .filter((s) => s.gestures.length > 0 || !!s.projectBrief)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return sorted.slice(0, limit);
}

export async function getSessionBundle(sessionId: string): Promise<SessionBundle | null> {
  const db = await getDb();
  const meta = await db.get('sessions', sessionId);
  if (!meta) return null;

  const persistedSamples = await db.getAllFromIndex('samples', 'by-session', sessionId);
  const journals = await db.getAllFromIndex('journals', 'by-session', sessionId);
  journals.sort((a, b) => a.timestamp - b.timestamp);

  const samples: Sample[] = persistedSamples.map((s) => ({
    id: s.id,
    label: s.label,
    data: s.data,
    timestamp: s.timestamp,
    quality: s.quality,
    split: s.split,
  }));

  return {
    meta,
    samples,
    journal: journals,
  };
}

export async function saveSessionMetaQueued(meta: SessionMeta): Promise<void> {
  await queueSessionWrite(meta.id, async () => {
    const db = await getDb();
    const existing = await db.get('sessions', meta.id);
    if (existing && existing.revision > meta.revision) {
      return;
    }
    await db.put('sessions', meta);
  });
}

export async function upsertSample(sessionId: string, sample: Sample): Promise<void> {
  const db = await getDb();
  const persisted: PersistedSample = {
    ...sample,
    sessionId,
    labelId: sample.label,
  };
  await db.put('samples', persisted);
}

export async function replaceSessionSamples(sessionId: string, samples: Sample[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('samples', 'readwrite');
  const index = tx.store.index('by-session');
  let cursor = await index.openCursor(sessionId);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  for (const sample of samples) {
    await tx.store.put({
      ...sample,
      sessionId,
      labelId: sample.label,
    });
  }
  await tx.done;
}

export async function appendJournalEntry(entry: DesignJournalEntry): Promise<void> {
  const db = await getDb();
  await db.put('journals', entry);
}

export async function clearAllDeviceData(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['sessions', 'samples', 'journals'], 'readwrite');
  await Promise.all([
    tx.objectStore('sessions').clear(),
    tx.objectStore('samples').clear(),
    tx.objectStore('journals').clear(),
  ]);
  await tx.done;
}
