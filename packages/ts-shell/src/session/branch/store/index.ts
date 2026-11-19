import { createSessionStoreLayout, validateSessionId } from '../../store/sessionFileLayout.js';
import { withFileLock } from '../../store/sessionFileStore.js';
import { assertNoPromptIntent } from '../../store/prompt/intent.js';
import { createTranscriptEntryId, type CodemodeStoreTranscriptEntry } from '../../sessionEventCodec.js';
import { appendTranscriptEvent, TranscriptAppendError } from '../../transcript/sessionTranscript.js';
import { sameValue } from '../../../config/values.js';
import { assertBranchStoreState, readBranchStoreState } from './state.js';
import { assertRevisionBudget, assertStoreBudget, assertStoreRevisions, captureStoreKeys, captureStoreWrites, replayBranchStore } from './replay.js';
import { BranchStoreError, CODEMODE_STORE_NAMESPACE, isBranchStoreNamespace,
  type BranchStoreHandle, type BranchStoreInput, type BranchStoreReason, type BranchStoreStatus, type BranchStoreTranscriptEntry,
  type BranchStoreWrites } from './contract.js';

export { BranchStoreError, CODEMODE_STORE_NAMESPACE, MAX_STORE_TOTAL_CHARS, MAX_STORE_VALUE_CHARS } from './contract.js';
export type { BranchStoreHandle, BranchStoreInput, BranchStoreReason, BranchStoreStatus, BranchStoreWrites } from './contract.js';

/** One host-owned namespace and immutable before-await branch lease, backed by the session transcript. */
export function captureBranchStore(input: BranchStoreInput): BranchStoreHandle {
  const { sessionId, cwd, namespace, admission: ownerAdmission } = input;
  const requestedLimits = input.limits;
  const limits = requestedLimits === undefined ? undefined : Object.freeze({
    metadataBytes: requestedLimits.metadataBytes, stateBytes: requestedLimits.stateBytes,
    transcriptBytes: requestedLimits.transcriptBytes, transcriptLines: requestedLimits.transcriptLines, entries: requestedLimits.entries,
  });
  if (limits && Object.values(limits).some(limit => !Number.isSafeInteger(limit) || limit < 0)) throw new BranchStoreError('invalid');
  if (namespace !== CODEMODE_STORE_NAMESPACE && !isBranchStoreNamespace(namespace)) throw new BranchStoreError('invalid');
  let store: ReturnType<typeof createSessionStoreLayout>;
  let captured: ReturnType<typeof readBranchStoreState>;
  try {
    if (validateSessionId(sessionId) !== sessionId || sessionId === '.' || sessionId === '..') throw new BranchStoreError('invalid');
    ownerAdmission?.();
    store = createSessionStoreLayout(); captured = readBranchStoreState(store, sessionId, cwd, undefined, limits);
    ownerAdmission?.();
  } catch (error) { throw error instanceof BranchStoreError ? error : new BranchStoreError('unavailable'); }
  const replayed = replayBranchStore(captured.events, namespace, captured.activeEntryIds);
  let retired: { readonly reason: BranchStoreReason; readonly status: BranchStoreStatus } | undefined;
  let transacting = false;
  const assertLive = () => { if (retired) throw new BranchStoreError(retired.reason, retired.status); };
  const transact = (writes: BranchStoreWrites | undefined, admission?: () => void, readKeys?: readonly string[]): BranchStoreStatus => {
    assertLive();
    if (transacting) {
      retired = Object.freeze({ reason: 'conflict', status: 'unchanged' });
      throw new BranchStoreError(retired.reason, retired.status);
    }
    const accepted = writes === undefined ? undefined : captureStoreWrites(writes, namespace !== CODEMODE_STORE_NAMESPACE);
    const keys = accepted ? Object.keys(accepted) : [];
    const comparedKeys = accepted ? keys.length ? keys : undefined : captureStoreKeys(readKeys);
    let status: BranchStoreStatus = 'unchanged'; let reason: BranchStoreReason = 'lock-failed';
    transacting = true;
    try {
      withFileLock(captured.bound.layout.stateLockPath, () => {
        assertNoPromptIntent(captured.bound.layout);
        ownerAdmission?.(); assertLive(); admission?.(); assertLive(); reason = 'unavailable';
        const current = readBranchStoreState(store, sessionId, cwd, captured.transcriptPrefix, limits);
        assertBranchStoreState(current, captured);
        const latest = replayBranchStore(current.events, namespace, current.activeEntryIds);
        assertStoreRevisions(latest, replayed, comparedKeys);
        if (accepted) {
          assertStoreBudget(latest.values, accepted);
          if (namespace !== CODEMODE_STORE_NAMESPACE) assertRevisionBudget(latest.revisions, accepted);
        }
        ownerAdmission?.(); assertLive(); admission?.(); assertLive();
        const beforeWrite = readBranchStoreState(store, sessionId, cwd, captured.transcriptPrefix, limits);
        assertBranchStoreState(beforeWrite, captured);
        if (beforeWrite.version !== current.version) throw new BranchStoreError('conflict');
        if (!accepted || !keys.length) return;
        const entry: CodemodeStoreTranscriptEntry | BranchStoreTranscriptEntry = namespace === CODEMODE_STORE_NAMESPACE
          ? { type: 'codemode-store', id: createTranscriptEntryId('cm'), sourceEntryId: captured.activeLeafId,
            entries: accepted, timestamp: new Date().toISOString() }
          : { type: 'branch-store', id: createTranscriptEntryId('store'), namespace, sourceEntryId: captured.activeLeafId,
            entries: accepted, timestamp: new Date().toISOString() };
        status = 'unknown'; reason = 'write-failed';
        appendTranscriptEvent(captured.bound.layout.transcriptPath, entry, undefined,
          { requireExisting: true, expectedIdentity: captured.transcriptIdentity, expectedPrefix: captured.transcriptPrefix, durable: true });
        reason = 'verification-failed';
        const confirmed = readBranchStoreState(store, sessionId, cwd, captured.transcriptPrefix, limits);
        assertBranchStoreState(confirmed, captured);
        if (!sameValue(confirmed.events.find(event => event.id === entry.id), entry)) throw new BranchStoreError('verification-failed', 'unknown');
        status = 'persisted'; reason = 'lock-failed';
      }, { createParent: false, recovery: 'local-dead' });
      return status;
    } catch (error) {
      if (error instanceof TranscriptAppendError) status = error.persistence;
      retired = Object.freeze({ reason: error instanceof BranchStoreError ? error.reason : reason, status });
      throw new BranchStoreError(retired.reason, retired.status);
    } finally { transacting = false; }
  };
  const handle: BranchStoreHandle = { initial: Object.freeze(Object.fromEntries(replayed.values)),
    assertCurrent: (keys, admission) => { transact(undefined, admission, keys); },
    commit: (writes, admission) => transact(writes, admission),
  };
  return Object.freeze(handle);
}
