import type { TranscriptEvent } from '../../../session/sessionEventCodec.js';
import { BranchStoreError, captureBranchStore, CODEMODE_STORE_NAMESPACE } from '../../../session/branch/store/index.js';
import { replayBranchStore } from '../../../session/branch/store/replay.js';
import { CodemodeStoreError, type CodemodeStoreStatus } from './state.js';

export { MAX_STORE_VALUE_CHARS, MAX_STORE_TOTAL_CHARS } from '../../../session/branch/store/contract.js';

function failure(error: unknown): never {
  throw error instanceof BranchStoreError ? new CodemodeStoreError(error.reason, error.status) : error;
}

/** Compatibility projection: workers receive only the legacy codemode namespace. */
export function replayCodemodeBranchStore(events: readonly TranscriptEvent[], activeEntryIds?: readonly string[]): Map<string, string> {
  try { return new Map(replayBranchStore(events, CODEMODE_STORE_NAMESPACE, activeEntryIds).values); }
  catch (error) { return failure(error); }
}

export function loadCodemodeStore(sessionId: string | undefined, cwd?: string): {
  readonly initial: Readonly<Record<string, string>>;
  readonly assertCurrent: (admission?: () => void) => void;
  readonly commit: (writes: Readonly<Record<string, string | null>>, admission?: () => void) => CodemodeStoreStatus;
} {
  if (!sessionId) return { initial: {}, assertCurrent: admission => admission?.(), commit: (writes, admission) => {
    admission?.();
    if (Object.keys(writes).length) throw new CodemodeStoreError('unavailable'); return 'unchanged';
  } };
  try {
    const handle = captureBranchStore({ sessionId, cwd, namespace: CODEMODE_STORE_NAMESPACE });
    return {
      initial: handle.initial,
      assertCurrent: admission => {
        try { handle.assertCurrent(undefined, admission); } catch (error) { return failure(error); }
      },
      commit: (writes, admission) => {
        try { return handle.commit(writes, admission); } catch (error) { return failure(error); }
      },
    };
  } catch (error) { return failure(error); }
}
