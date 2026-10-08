import { messageToText } from "../../model-adapters/multimodal.js";
import type {
  TerminalClassification,
  TerminalReason,
} from "../../result/types.js";
import type { RecoverySnapshot } from "../recovery/sessionRecoverySnapshot.js";
import type { RecoveryTrustBoundaryBlock } from "../recovery/recoveryTrustBoundary.js";
import type { SessionResumeEligibility } from "../recovery/sessionResumeEligibility.js";
import type { Session } from "../schema/sessionRecord.js";
import type { SessionContinuitySnapshot } from "../sessionContinuityTypes.js";

export interface SessionReentrySummary {
  readonly id: string;
  readonly title?: string;
  readonly status: Session["status"];
  readonly projectRoot: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly pendingPrompt?: string;
  readonly runPhase?: "idle" | "prompt-persisted" | "turn-active";
  readonly lastError?: string;
  readonly durableStatus?: "success" | "stopped" | "error";
  readonly terminalReason?: TerminalReason;
  readonly terminalClassification?: TerminalClassification;
  readonly lastUserMessage?: string;
  readonly lastAssistantMessage?: string;
  readonly recoverable: boolean;
  readonly resumeDisposition:
    | "fully-resumable"
    | "partially-resumable"
    | "not-resumable";
  readonly autoResumeReady: boolean;
  readonly resumeDetail: string;
  readonly stagedRepairStepCount?: number;
  readonly stagedRepairCompletedStep?: number;
  readonly stagedRepairBlockedStep?: number;
  readonly stagedRepairNextStep?: number;
  readonly blockedReason?: RecoveryTrustBoundaryBlock["reason"];
  readonly blockedDetail?: string;
  /**
   * Whether anything was ever said in this session.
   *
   * A run that only used slash commands leaves a session record but no
   * conversation; those are not worth offering to return to, and are not worth
   * keeping. This is what tells the two apart.
   */
  readonly hasConversation: boolean;
  readonly hasReportHistory?: boolean;
}

export function projectSessionReentrySummary(input: {
  readonly session: Session;
  readonly trustBoundary: SessionResumeEligibility;
  readonly recoverySnapshot: RecoverySnapshot;
  readonly continuitySnapshot: SessionContinuitySnapshot;
}): SessionReentrySummary {
  const { session, trustBoundary, recoverySnapshot, continuitySnapshot } = input;
  return {
    id: session.id,
    title: session.title?.trim() || session.id,
    status: session.status,
    projectRoot: session.projectRoot,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    pendingPrompt: recoverySnapshot.pendingPrompt,
    runPhase: recoverySnapshot.runPhase,
    lastError: recoverySnapshot.lastError,
    durableStatus: recoverySnapshot.durableStatus,
    terminalReason: recoverySnapshot.terminalReason,
    terminalClassification: recoverySnapshot.terminalClassification,
    lastUserMessage: messageToText(recoverySnapshot.lastUserMessage?.content),
    lastAssistantMessage: messageToText(recoverySnapshot.lastAssistantMessage?.content),
    recoverable: trustBoundary.recoverable,
    resumeDisposition: trustBoundary.disposition,
    autoResumeReady: trustBoundary.autoResumeReady,
    resumeDetail: trustBoundary.detail,
    ...(continuitySnapshot.lastStagedRepairStepCount !== undefined
      ? { stagedRepairStepCount: continuitySnapshot.lastStagedRepairStepCount }
      : {}),
    ...(continuitySnapshot.lastStagedRepairCompletedStep !== undefined
      ? {
          stagedRepairCompletedStep:
            continuitySnapshot.lastStagedRepairCompletedStep,
        }
      : {}),
    ...(continuitySnapshot.lastStagedRepairBlockedStep !== undefined
      ? { stagedRepairBlockedStep: continuitySnapshot.lastStagedRepairBlockedStep }
      : {}),
    ...(continuitySnapshot.lastStagedRepairNextStep !== undefined
      ? { stagedRepairNextStep: continuitySnapshot.lastStagedRepairNextStep }
      : {}),
    blockedReason: trustBoundary.block?.reason,
    blockedDetail: trustBoundary.block?.detail,
    hasConversation: sessionHasConversation(session),
    ...(session.hasReportHistory ? { hasReportHistory: true } : {}),
  };
}

/** Whether a session holds a real exchange rather than only command bookkeeping. */
export function sessionHasConversation(session: Session): boolean {
  return session.turns.some(
    (turn) => (turn.role === "user" || turn.role === "assistant") && messageToText(turn.content).trim().length > 0,
  );
}

/**
 * Whether a session is worth offering to return to.
 *
 * A real exchange qualifies. So does a run that was interrupted with a prompt
 * still pending, or one that ended in a terminal state — both are unfinished or
 * diagnosable work, which is exactly what re-entry exists for. A freshly opened
 * session with nothing said and nothing pending is not.
 */
export function sessionHasReentrySurface(session: Session): boolean {
  if (session.hasPlanningState) return true;
  if (session.hasReportHistory) return true;
  if (sessionHasConversation(session)) return true;
  if (session.pendingPrompt?.trim()) return true;
  return session.status !== "active";
}

export function scoreSessionReentrySummary(input: {
  readonly summary: SessionReentrySummary;
  readonly preferredProjectRoot?: string;
}): number {
  const { summary, preferredProjectRoot } = input;
  let score = 0;

  if (summary.resumeDisposition === "fully-resumable") {
    score += 200;
  } else if (summary.resumeDisposition === "partially-resumable") {
    score += 120;
  }

  if (
    preferredProjectRoot &&
    preferredProjectRoot === summary.projectRoot.trim()
  ) {
    score += 90;
  }

  if (summary.pendingPrompt?.trim()) {
    score += 30;
  }

  if (summary.terminalClassification === "success") {
    score -= 10;
  }

  const updatedAt = new Date(summary.updatedAt).getTime();
  if (Number.isFinite(updatedAt)) {
    score += Math.floor(updatedAt / 1000);
  }

  return score;
}
