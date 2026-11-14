import { createSessionStoreLayout, validateSessionId } from '../../../session/store/sessionFileLayout.js';
import { withFileLock } from '../../../session/store/sessionFileStore.js';
import { createTranscriptEntryId, type CodemodeStoreTranscriptEntry, type TranscriptEvent } from '../../../session/sessionEventCodec.js';
import { appendTranscriptEvent, TranscriptAppendError } from '../../../session/transcript/sessionTranscript.js';
import { sameValue } from '../../../config/values.js';
import { assertCodemodeState, CodemodeStoreError, readCodemodeState, type CodemodeStoreReason, type CodemodeStoreStatus } from './state.js';

export const MAX_STORE_VALUE_CHARS = 256 * 1024;
export const MAX_STORE_TOTAL_CHARS = 1024 * 1024;

/** Replay confirmed branch entries; unbound legacy entries apply to every descendant. */
export function replayCodemodeBranchStore(events: readonly TranscriptEvent[], activeEntryIds?: readonly string[]): Map<string, string> {
  const onBranch = activeEntryIds ? new Set(activeEntryIds) : undefined;
  const store = new Map<string, string>();
  for (const event of events) {
    if (event.type !== 'codemode-store' || onBranch && event.sourceEntryId && !onBranch.has(event.sourceEntryId)) continue;
    assertWrites(event.entries);
    for (const [key, value] of Object.entries(event.entries)) {
      if (value === null) store.delete(key);
      else store.set(key, value);
    }
  }
  assertStoreBudget(store, {});
  return store;
}

function assertWrites(writes: Readonly<Record<string, string | null>>): void {
  if (!writes || typeof writes !== 'object' || Array.isArray(writes)) throw new CodemodeStoreError('invalid');
  for (const [key, value] of Object.entries(writes)) {
    if (!key || value !== null && (typeof value !== 'string' || value.length > MAX_STORE_VALUE_CHARS)) throw new CodemodeStoreError('invalid');
    if (value !== null) { try { JSON.parse(value); } catch { throw new CodemodeStoreError('invalid'); } }
  }
}

function assertStoreBudget(base: ReadonlyMap<string, string>, writes: Readonly<Record<string, string | null>>): void {
  let total = 0;
  for (const [key, value] of base) if (!Object.hasOwn(writes, key)) total += key.length + value.length;
  for (const [key, value] of Object.entries(writes)) if (value !== null) total += key.length + value.length;
  if (total > MAX_STORE_TOTAL_CHARS) throw new CodemodeStoreError('budget');
}

export function loadCodemodeStore(sessionId: string | undefined, cwd?: string): {
  readonly initial: Record<string, string>;
  readonly commit: (writes: Readonly<Record<string, string | null>>, admission?: () => void) => CodemodeStoreStatus;
} {
  if (!sessionId) return { initial: {}, commit: writes => {
    if (Object.keys(writes).length) throw new CodemodeStoreError('unavailable'); return 'unchanged';
  } };
  let store: ReturnType<typeof createSessionStoreLayout>;
  let captured: ReturnType<typeof readCodemodeState>;
  try {
    if (validateSessionId(sessionId) !== sessionId || sessionId === '.' || sessionId === '..') throw new CodemodeStoreError('invalid');
    store = createSessionStoreLayout();
    captured = readCodemodeState(store, sessionId, cwd);
  } catch (error) { throw error instanceof CodemodeStoreError ? error : new CodemodeStoreError('unavailable'); }
  const replayed = replayCodemodeBranchStore(captured.events, captured.activeEntryIds);
  return {
    initial: Object.fromEntries(replayed),
    commit: (writes, admission) => {
      assertWrites(writes);
      if (!Object.keys(writes).length) return 'unchanged';
      const accepted = Object.freeze({ ...writes });
      let status: CodemodeStoreStatus = 'unchanged';
      let reason: CodemodeStoreReason = 'lock-failed';
      try {
        withFileLock(captured.bound.layout.stateLockPath, () => {
          admission?.(); reason = 'unavailable';
          const current = readCodemodeState(store, sessionId, cwd, captured.transcriptPrefix);
          assertCodemodeState(current, captured);
          const latest = replayCodemodeBranchStore(current.events, current.activeEntryIds);
          if (Object.keys(accepted).some(key => latest.get(key) !== replayed.get(key))) throw new CodemodeStoreError('conflict');
          assertStoreBudget(latest, accepted);
          const entry: CodemodeStoreTranscriptEntry = { type: 'codemode-store', id: createTranscriptEntryId('cm'),
            sourceEntryId: captured.activeLeafId, entries: accepted, timestamp: new Date().toISOString() };
          const beforeWrite = readCodemodeState(store, sessionId, cwd, captured.transcriptPrefix);
          assertCodemodeState(beforeWrite, captured);
          if (beforeWrite.version !== current.version) throw new CodemodeStoreError('conflict');
          admission?.(); status = 'unknown'; reason = 'write-failed';
          appendTranscriptEvent(captured.bound.layout.transcriptPath, entry, undefined,
            { requireExisting: true, expectedIdentity: captured.transcriptIdentity, expectedPrefix: captured.transcriptPrefix, durable: true });
          reason = 'verification-failed';
          const confirmed = readCodemodeState(store, sessionId, cwd, captured.transcriptPrefix);
          assertCodemodeState(confirmed, captured);
          if (!sameValue(confirmed.events.find(event => event.id === entry.id), entry)) throw new CodemodeStoreError('verification-failed', 'unknown');
          status = 'persisted'; reason = 'lock-failed';
        }, { createParent: false, recovery: 'local-dead' });
        return status;
      } catch (error) {
        if (error instanceof TranscriptAppendError) status = error.persistence;
        throw new CodemodeStoreError(error instanceof CodemodeStoreError ? error.reason : reason, status);
      }
    },
  };
}
