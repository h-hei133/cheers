import type {
  TerminalClassification,
  TerminalReason,
} from "../../orchestration/types.js";
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
    title: session.title,
    status: session.status,
    projectRoot: session.projectRoot,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    pendingPrompt: recoverySnapshot.pendingPrompt,
    runPhase: recoverySnapshot.runPhase,
    lastError: session.lastError,
    durableStatus: recoverySnapshot.durableStatus,
    terminalReason: recoverySnapshot.terminalReason,
    terminalClassification: recoverySnapshot.terminalClassification,
    lastUserMessage: recoverySnapshot.lastUserMessage?.content,
    lastAssistantMessage: recoverySnapshot.lastAssistantMessage?.content,
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
  };
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
