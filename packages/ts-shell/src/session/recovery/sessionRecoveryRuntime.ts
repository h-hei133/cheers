import type { QueryEvent } from "../../core/query/events.js";
import type {
  DurableLifecycleIndex,
} from "../../core/tools/toolResultLifecycle.js";
import type { TranscriptEvent } from "../sessionEventCodec.js";
import type { Session } from "../schema/sessionRecord.js";
import type { SessionStateSnapshot } from "../schema/sessionStateSnapshot.js";
import type { RecoveryTrustBoundaryBlock } from "./recoveryTrustBoundary.js";
import { projectRecoveryTrustBoundaryBlock } from "./recoveryTrustBoundary.js";
import {
  findCompensatedLifecycleEvent,
} from "./sessionLifecycleReadModel.js";
import { reconcileSessionPendingLifecycle } from "./sessionLifecycleReconciliation.js";
import {
  buildSessionRecoverySnapshot,
  type RecoverySnapshot,
} from "./sessionRecoverySnapshot.js";
import {
  evaluateSessionResumeEligibility,
  type SessionResumeEligibility,
} from "./sessionResumeEligibility.js";

export interface BuildRecoverySnapshotInput {
  readonly sessionId: string;
  readonly session: Session;
  readonly state: SessionStateSnapshot;
  readonly transcriptEvents: readonly TranscriptEvent[];
}

export function buildRecoverySnapshotForSession(
  input: BuildRecoverySnapshotInput,
): RecoverySnapshot {
  return buildSessionRecoverySnapshot({
    sessionId: input.sessionId,
    session: input.session,
    state: input.state,
    transcriptEvents: input.transcriptEvents,
  });
}

export function projectRecoveryTrustBoundaryBlockForSession(input: {
  readonly sessionId: string;
  readonly sessionDir: string;
  readonly reason: RecoveryTrustBoundaryBlock["reason"];
  readonly detail: string;
}): RecoveryTrustBoundaryBlock {
  return projectRecoveryTrustBoundaryBlock(input);
}

export function evaluateRecoveryTrustBoundaryForSession(input: {
  readonly session: Session;
  readonly loadRecoverySnapshot: (sessionId: string) => RecoverySnapshot;
  readonly createBlock: (
    session: Session,
    reason: RecoveryTrustBoundaryBlock["reason"],
    detail: string,
  ) => RecoveryTrustBoundaryBlock;
}): SessionResumeEligibility {
  return evaluateSessionResumeEligibility({
    session: input.session,
    loadRecoverySnapshot: input.loadRecoverySnapshot,
    createBlock: input.createBlock,
  });
}

export function reconcilePendingLifecycleForSession(input: {
  readonly snapshot: RecoverySnapshot;
  readonly transcriptEvents: readonly TranscriptEvent[];
  readonly applyQueryEventToState: (event: QueryEvent) => void;
  readonly appendQueryEvent: (event: QueryEvent) => void;
  readonly readPendingLifecycle: () => RecoverySnapshot["pendingLifecycle"];
}): DurableLifecycleIndex {
  return reconcileSessionPendingLifecycle({
    snapshot: input.snapshot,
    findCompensatedLifecycleEvent: (candidate) =>
      findCompensatedLifecycleEvent(input.transcriptEvents, candidate),
    applyQueryEventToState: input.applyQueryEventToState,
    appendQueryEvent: input.appendQueryEvent,
    readPendingLifecycle: input.readPendingLifecycle,
  });
}
