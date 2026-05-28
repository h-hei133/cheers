import type { Session } from "../schema/sessionRecord.js";
import type { SessionStateSnapshot } from "../schema/sessionStateSnapshot.js";
import { normalizeLegacyPermissionWorkingMemory } from "../projectRootRebaseProjection.js";

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

  let normalizedSnapshot: SessionStateSnapshot = {
    ...input.snapshot,
    projectRoot: input.session.projectRoot,
    workingMemory: normalizedWorkingMemory,
  };

  input.withStateLock(input.session.id, () => {
    const latest = input.readLatestSnapshot();
    if (!latest?.workingMemory) {
      input.writeSnapshot(normalizedSnapshot);
      return;
    }
    const rebasedLatestWorkingMemory = normalizeLegacyPermissionWorkingMemory({
      workingMemory: latest.workingMemory,
      sessionProjectRoot: input.session.projectRoot,
    });
    if (rebasedLatestWorkingMemory === latest.workingMemory) {
      normalizedSnapshot = {
        ...latest,
        projectRoot: input.session.projectRoot,
      };
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
