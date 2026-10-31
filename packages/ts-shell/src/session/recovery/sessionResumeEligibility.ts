import { messageHasContent, messageToText } from "../../model-adapters/multimodal.js";
import {
  findLastQueryCompletionEvent,
} from "../sessionContinuityModule.js";
import {
  hasContinuationEvidence as snapshotHasContinuationEvidence,
  hasDeterministicTerminalEvidence as snapshotHasDeterministicTerminalEvidence,
} from "../sessionContinuationProjection.js";
import type { Session } from "../schema/sessionRecord.js";
import type { RecoverySnapshot } from "./sessionRecoverySnapshot.js";
import type { RecoveryTrustBoundaryBlock } from "./recoveryTrustBoundary.js";

export interface SessionResumeEligibility {
  readonly recoverable: boolean;
  readonly disposition:
    | "fully-resumable"
    | "partially-resumable"
    | "not-resumable";
  readonly autoResumeReady: boolean;
  readonly detail: string;
  readonly block?: RecoveryTrustBoundaryBlock;
}

export function evaluateSessionResumeEligibility(input: {
  readonly session: Session;
  readonly loadRecoverySnapshot: (sessionId: string) => RecoverySnapshot;
  readonly createBlock: (
    session: Session,
    reason: RecoveryTrustBoundaryBlock["reason"],
    detail: string,
  ) => RecoveryTrustBoundaryBlock;
}): SessionResumeEligibility {
  const { session } = input;
  // A process killed without a clean shutdown never writes `interrupted`: the
  // prompt barrier left it `active`. Refusing on the status alone would turn
  // away exactly the sessions bootstrap adopts as unfinished work, so the
  // evidence decides — a clean, finished session still has none.
  const unclean = session.status !== "interrupted" && session.status !== "error";
  if (unclean && session.status !== "active") {
    return {
      recoverable: false,
      disposition: "not-resumable",
      autoResumeReady: false,
      detail: "Session is not in interrupted/error state",
      block: input.createBlock(
        session,
        "continuation-evidence-missing",
        "session is not interrupted or error",
      ),
    };
  }

  let snapshot: RecoverySnapshot;
  try {
    snapshot = input.loadRecoverySnapshot(session.id);
  } catch (error) {
    return {
      recoverable: false,
      disposition: "not-resumable",
      autoResumeReady: false,
      detail: "Session data is unreadable",
      block: input.createBlock(
        session,
        "session-corrupt",
        `session data is unreadable (${error instanceof Error ? error.message : String(error)})`,
      ),
    };
  }

  const hasContinuationEvidence = snapshotHasContinuationEvidence(snapshot);
  const hasResumeContextEvidence = hasSessionResumeContextEvidence(snapshot);
  const hasInterruptedLifecycleEvidence =
    snapshot.lastLifecycleEvent?.event === "run-interrupted";
  const hasPendingPrompt =
    typeof snapshot.pendingPrompt === "string" &&
    (snapshot.pendingPrompt.trim().length > 0 || messageToText(snapshot.lastUserMessage?.content) === snapshot.pendingPrompt
      && messageHasContent(snapshot.lastUserMessage?.content));
  const hasPendingLifecycle =
    Object.keys(snapshot.pendingLifecycle.pendingApprovals).length > 0 ||
    Object.keys(snapshot.pendingLifecycle.pendingTools).length > 0;
  const hasTurnRecoverySignal =
    snapshot.interruptedKind === "turn" ||
    snapshot.runPhase === "turn-active" ||
    hasPendingLifecycle ||
    hasInterruptedLifecycleEvidence;
  const hasPromptRecoverySignal =
    snapshot.interruptedKind === "prompt" ||
    snapshot.runPhase === "prompt-persisted";

  if (session.status === "interrupted") {
    if (hasPendingPrompt && (hasTurnRecoverySignal || hasPromptRecoverySignal)) {
      return {
        recoverable: true,
        disposition: "fully-resumable",
        autoResumeReady: true,
        detail: "Pending prompt and interruption evidence are available",
      };
    }

    if (hasTurnRecoverySignal || hasContinuationEvidence || hasResumeContextEvidence) {
      return {
        recoverable: true,
        disposition: "partially-resumable",
        autoResumeReady: false,
        detail:
          "Context can be resumed, but no pending prompt exists for automatic continuation",
      };
    }

    return {
      recoverable: false,
      disposition: "not-resumable",
      autoResumeReady: false,
      detail: "Interrupted state has no continuation evidence",
      block: input.createBlock(
        session,
        "continuation-evidence-missing",
        "interrupted state has no continuation evidence",
      ),
    };
  }

  // An `active` session with live evidence is a run that never finished writing
  // its terminal state — the shape a killed process leaves. It is resumable for
  // exactly the reason bootstrap adopts it, and only for that reason.
  if (session.status === "active") {
    if (hasPendingPrompt && (hasTurnRecoverySignal || hasPromptRecoverySignal)) {
      return {
        recoverable: true,
        disposition: "fully-resumable",
        autoResumeReady: true,
        detail: "An unfinished run left a pending prompt and interruption evidence",
      };
    }
    if (hasTurnRecoverySignal || hasContinuationEvidence || hasResumeContextEvidence) {
      return {
        recoverable: true,
        disposition: "partially-resumable",
        autoResumeReady: false,
        detail: "An unfinished run left context, but no pending prompt to continue",
      };
    }
    return {
      recoverable: false,
      disposition: "not-resumable",
      autoResumeReady: false,
      detail: "Active session has no unfinished work",
      block: input.createBlock(
        session,
        "continuation-evidence-missing",
        "active session has no continuation evidence",
      ),
    };
  }

  if (snapshot.durableStatus === "stopped") {
    return {
      recoverable: false,
      disposition: "not-resumable",
      autoResumeReady: false,
      detail: "Durable status is stopped",
      block: input.createBlock(
        session,
        "continuation-evidence-missing",
        "durable status is stopped and cannot continue",
      ),
    };
  }

  if (!snapshotHasDeterministicTerminalEvidence(snapshot)) {
    return {
      recoverable: false,
      disposition: "not-resumable",
      autoResumeReady: false,
      detail: "Terminal evidence is indeterminate",
      block: input.createBlock(
        session,
        "terminal-evidence-indeterminate",
        "terminal evidence is indeterminate",
      ),
    };
  }

  if (!hasContinuationEvidence) {
    return {
      recoverable: false,
      disposition: "not-resumable",
      autoResumeReady: false,
      detail: "Error state has no continuation evidence",
      block: input.createBlock(
        session,
        "continuation-evidence-missing",
        "error state has no continuation evidence",
      ),
    };
  }

  return {
    recoverable: true,
    disposition: "partially-resumable",
    autoResumeReady: false,
    detail:
      "Error-session context is resumable for follow-up, but not auto-resumable",
  };
}

export function hasSessionResumeContextEvidence(
  snapshot: RecoverySnapshot,
): boolean {
  const hasLastMessages =
    messageHasContent(snapshot.lastUserMessage?.content) ||
    messageHasContent(snapshot.lastAssistantMessage?.content);
  const hasCompletedTurn =
    findLastQueryCompletionEvent(snapshot.transcriptEvents) !== undefined;
  const hasRepairEvidence =
    snapshot.repairSummary.insertedPromptMessage ||
    snapshot.repairSummary.insertedQueryStarted ||
    snapshot.repairSummary.insertedRunInterrupted ||
    snapshot.repairSummary.ignoredDuplicateTurnStarts > 0 ||
    snapshot.repairSummary.ignoredUnpairedTurnCompletions > 0 ||
    snapshot.repairSummary.ignoredRoleMismatchedTurnCompletions > 0;
  return hasLastMessages || hasCompletedTurn || hasRepairEvidence;
}
