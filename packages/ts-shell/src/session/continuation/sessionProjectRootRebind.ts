import type { Session } from "../schema/sessionRecord.js";
import type { SessionStateSnapshot } from "../schema/sessionStateSnapshot.js";
import {
  projectRebasedSessionRoot,
  projectSessionRootRebase,
} from "./sessionRootRebase.js";

export function rebindSessionProjectRootContinuity(input: {
  readonly session: Session;
  readonly nextProjectRoot: string;
  readonly updatedAt: string;
  readonly writeSessionMetadata: (session: Session) => void;
  readonly withStateLock: (sessionId: string, update: () => void) => void;
  readonly readStateSnapshot: () => SessionStateSnapshot | undefined;
  readonly buildStateSnapshot: (
    session: Session,
    current: SessionStateSnapshot | undefined,
  ) => SessionStateSnapshot;
  readonly writeStateSnapshot: (snapshot: SessionStateSnapshot) => void;
}): Session {
  const previousRoot = input.session.projectRoot;
  const normalizedRoot = projectRebasedSessionRoot(input.nextProjectRoot);
  input.session.projectRoot = normalizedRoot;
  input.session.updatedAt = input.updatedAt;
  input.writeSessionMetadata(input.session);
  input.withStateLock(input.session.id, () => {
    const current = input.readStateSnapshot();
    if (!current) {
      input.writeStateSnapshot(
        input.buildStateSnapshot(input.session, undefined),
      );
      return;
    }

    const currentRebaseProjection = projectSessionRootRebase({
      workingMemory: current.workingMemory,
      previousRoot,
      nextProjectRoot: input.nextProjectRoot,
    });

    input.writeStateSnapshot({
      ...current,
      projectRoot: currentRebaseProjection.projectRoot,
      ...(currentRebaseProjection.workingMemory !== undefined
        ? {
            workingMemory: currentRebaseProjection.workingMemory,
          }
        : {}),
    } satisfies SessionStateSnapshot);
  });
  return input.session;
}
