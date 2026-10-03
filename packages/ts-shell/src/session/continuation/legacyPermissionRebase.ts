import type { Session } from "../schema/sessionRecord.js";
import type { SessionStateSnapshot } from "../schema/sessionStateSnapshot.js";
import { normalizeLegacyPermissionWorkingMemory } from "./projectRootRebaseProjection.js";

/**
 * One-time repair of a session state snapshot that still carries permission
 * continuity from a previous machine or project root. The first snapshot build
 * after such a session is loaded rewrites the stored state so every later read
 * sees normalized, current-root-scoped cache keys.
 *
 * Restored from the same-named module it was inlined from: snapshot building
 * must not hand legacy roots through to approval-memory lookups, and the repair
 * must persist, not just correct one read.
 */
export function normalizeLegacyPermissionStateForSession(input: {
  readonly session: Session;
  readonly snapshot: SessionStateSnapshot | undefined;
  readonly withStateLock: (sessionId: string, update: () => void) => void;
  readonly readLatestSnapshot: () => SessionStateSnapshot | undefined;
  readonly writeSnapshot: (snapshot: SessionStateSnapshot) => void;
}): SessionStateSnapshot | undefined {
  if (!input.snapshot?.workingMemory) {
    return input.snapshot;
  }
  const normalizedWorkingMemory = normalizeLegacyPermissionWorkingMemory({
    workingMemory: input.snapshot.workingMemory,
    sessionProjectRoot: input.session.projectRoot,
  });
  if (normalizedWorkingMemory === input.snapshot.workingMemory) {
    return input.snapshot;
  }

  let normalizedSnapshot: SessionStateSnapshot | undefined = input.snapshot;

  input.withStateLock(input.session.id, () => {
    const latest = input.readLatestSnapshot();
    normalizedSnapshot = latest;
    if (!latest?.workingMemory || latest.projectRoot !== input.snapshot?.projectRoot) {
      return;
    }
    const rebasedLatestWorkingMemory = normalizeLegacyPermissionWorkingMemory({
      workingMemory: latest.workingMemory,
      sessionProjectRoot: input.session.projectRoot,
    });
    if (rebasedLatestWorkingMemory === latest.workingMemory) {
      return;
    }
    normalizedSnapshot = {
      ...latest,
      projectRoot: input.session.projectRoot,
      workingMemory: rebasedLatestWorkingMemory,
    };
    input.writeSnapshot(normalizedSnapshot);
  });

  return normalizedSnapshot;
}
