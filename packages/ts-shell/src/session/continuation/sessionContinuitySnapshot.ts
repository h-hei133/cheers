import { selectContinuityTerminalSource } from "../../result/terminal/truth.js";
import {
  decodeQueryRuntimeTaskState,
  projectQueryRuntimeTaskStateFromResult,
  continuationSafetyForRuntimeState,
} from "../../core/query/runtime/taskState.js";
import { deriveActionableFailureContinuity } from "../actionableFailureContinuity.js";
import {
  buildActionHandoffSummary,
  buildSeedInfluenceHandoffSummary,
  buildSuccessHandoffDiagnostic,
} from "../recovery/resumeContextBuilder.js";
import {
  collectRecentCodingResults,
  findLastCodingCompletionEvent,
  findLastLifecycleEvent,
  findLastQueryCompletionEvent,
  findLastTurnContent,
} from "../sessionContinuityModule.js";
import {
  selectContinuationEvidenceForSnapshot,
} from "../sessionContinuationProjection.js";
import type { TranscriptEvent } from "../sessionEventCodec.js";
import type { RecoverySnapshot } from "../recovery/sessionRecoverySnapshot.js";
import type { Session } from "../schema/sessionRecord.js";
import type { SessionStateSnapshot } from "../schema/sessionStateSnapshot.js";
import type { SessionContinuitySnapshot } from "../sessionContinuityTypes.js";
import { deriveStoppedSessionContinuitySurface } from "./stoppedSessionContinuity.js";
import {
  extractActionHandoffSummaryFromMemory,
  extractFailureHandoffDiagnosticFromMemory,
  extractSeedInfluenceFromMemory,
  extractSeedInfluenceHandoffSummaryFromMemory,
  extractSuccessHandoffDiagnosticFromMemory,
  extractWriteContinuityFromMemory,
} from "./legacyContinuityMemory.js";
import { projectSessionApprovalContinuity } from "../approval/sessionApprovalContinuity.js";
import { projectSessionMutationContinuity } from "./sessionMutationContinuity.js";
import { projectSessionReadContinuity } from "./sessionReadContinuity.js";
import { projectSessionRequestScopeContinuity } from "../approval/sessionRequestScopeMemory.js";
import { extractSeedInfluenceFromQueryResult } from "./sessionSeedInfluence.js";
import { projectSessionToolContinuity } from "./sessionToolContinuity.js";
import { projectSessionUnresolvedItems } from "./sessionUnresolvedItems.js";

export function buildSessionContinuitySnapshot(input: {
  readonly session: Session;
  readonly stateSnapshot: SessionStateSnapshot | undefined;
  readonly recoverySnapshot: RecoverySnapshot;
  readonly transcriptEvents: readonly TranscriptEvent[];
  readonly approvalHistoryLimit: number;
}): SessionContinuitySnapshot {
  const session = input.session;
  const stateSnapshot = input.stateSnapshot;
  const recoverySnapshot = input.recoverySnapshot;
  const transcriptEvents = input.transcriptEvents;
  const lastRunErrorEvent = findLastLifecycleEvent(
    transcriptEvents,
    "run-error",
  );
  const lastQueryCompletion = findLastQueryCompletionEvent(transcriptEvents);
  const lastCodingCompletion = findLastCodingCompletionEvent(transcriptEvents);
  const lastCodingResult = lastCodingCompletion?.event.result.codingResult;
  const recentCodingResults = collectRecentCodingResults(transcriptEvents, 4);
  const readContinuity = projectSessionReadContinuity(lastCodingResult);
  const requestScopeContinuity = projectSessionRequestScopeContinuity({
    evidence: lastCodingResult?.continuation.evidence,
    workingMemory: stateSnapshot?.workingMemory,
    sessionProjectRoot: session.projectRoot,
  });
  const approvalContinuity = projectSessionApprovalContinuity({
    workingMemory: stateSnapshot?.workingMemory,
    lastCodingResult,
    historyLimit: input.approvalHistoryLimit,
  });
  const lastStoppedSessionContinuity =
    deriveStoppedSessionContinuitySurface(lastCodingResult);
  const lastWriteContinuity =
    lastStoppedSessionContinuity?.writeContinuity ??
    extractWriteContinuityFromMemory(stateSnapshot?.workingMemory);
  const lastActionHandoffSummary =
    buildActionHandoffSummary(lastCodingResult?.lastActionResultSeed) ??
    extractActionHandoffSummaryFromMemory(stateSnapshot?.workingMemory);
  const lastSeedInfluence =
    extractSeedInfluenceFromQueryResult(lastQueryCompletion?.event.result) ??
    extractSeedInfluenceFromMemory(stateSnapshot?.workingMemory);
  const lastSeedInfluenceHandoffSummary =
    buildSeedInfluenceHandoffSummary(
      lastCodingResult?.lastActionResultSeed,
      lastSeedInfluence,
    ) ??
    extractSeedInfluenceHandoffSummaryFromMemory(stateSnapshot?.workingMemory);
  const lastFailureHandoffDiagnostic =
    lastStoppedSessionContinuity?.failureHandoffDiagnostic ??
    extractFailureHandoffDiagnosticFromMemory(stateSnapshot?.workingMemory);
  const lastActionableFailure =
    lastStoppedSessionContinuity?.actionableFailure ??
    deriveActionableFailureContinuity(lastCodingResult);
  const lastSuccessHandoffDiagnostic =
    buildSuccessHandoffDiagnostic(lastCodingResult) ??
    extractSuccessHandoffDiagnosticFromMemory(stateSnapshot?.workingMemory);
  const taskState = lastCodingResult
    ? projectQueryRuntimeTaskStateFromResult({
        source: "replay",
        result: lastCodingResult,
        continuationSafety: continuationSafetyForRuntimeState({
          source: "replay",
          safe: true,
          reasons: ["session continuity coding result accepted"],
        }),
      })
    : extractTaskStateFromMemory(stateSnapshot?.workingMemory);
  const continuityTerminalSource = selectContinuityTerminalSource({
    lastQueryCompletion,
    lastCodingCompletion,
  });
  const lastUserIntent =
    recoverySnapshot.lastUserMessage?.content ??
    findLastTurnContent(session.turns, "user");
  const mutationContinuity = projectSessionMutationContinuity({
    lastCodingResult,
    recentCodingResults,
    lastUserIntent,
  });
  const unresolvedProjection = projectSessionUnresolvedItems({
    sessionLastError: session.lastError,
    lastRunErrorEvent,
    continuityTerminalSource,
    lastCodingResult,
  });
  const freshnessHistoryCount =
    recentCodingResults.length +
    mutationContinuity.recentFailedFiles.length +
    (lastCodingResult?.continuation.evidence.length ?? 0) +
    unresolvedProjection.unresolvedItems.length;

  return {
    sessionId: session.id,
    projectRoot: session.projectRoot,
    lastUserIntent,
    lastAssistantOutput:
      recoverySnapshot.lastAssistantMessage?.content ??
      findLastTurnContent(session.turns, "assistant"),
    lastTerminalClassification:
      continuityTerminalSource?.event.result.terminalClassification ??
      recoverySnapshot.terminalClassification,
    lastTerminalReason:
      continuityTerminalSource?.event.result.terminalReason ??
      recoverySnapshot.terminalReason,
    lastFailure: unresolvedProjection.lastFailure,
    lastTaskKind: lastCodingResult?.taskKind,
    ...(lastCodingResult?.lastActionResultSeed
      ? { lastActionResultSeed: lastCodingResult.lastActionResultSeed }
      : {}),
    ...(lastWriteContinuity?.writerStarted !== undefined
      ? { lastWriterStarted: lastWriteContinuity.writerStarted }
      : {}),
    ...(lastWriteContinuity?.writeEffect
      ? { lastWriteEffect: lastWriteContinuity.writeEffect }
      : {}),
    ...(lastWriteContinuity?.requiresUserInspection !== undefined
      ? {
          lastWriteRequiresUserInspection:
            lastWriteContinuity.requiresUserInspection,
        }
      : {}),
    ...(lastWriteContinuity?.target
      ? { lastWriteEffectTarget: lastWriteContinuity.target }
      : {}),
    ...(lastActionHandoffSummary ? { lastActionHandoffSummary } : {}),
    ...(lastSeedInfluence ? { lastSeedInfluence } : {}),
    ...(lastSeedInfluenceHandoffSummary
      ? { lastSeedInfluenceHandoffSummary }
      : {}),
    ...(lastFailureHandoffDiagnostic
      ? { lastFailureHandoffDiagnostic }
      : {}),
    ...(lastSuccessHandoffDiagnostic
      ? { lastSuccessHandoffDiagnostic }
      : {}),
    ...(taskState ? { taskState } : {}),
    lastGroundedDeliverableMode: readContinuity.lastGroundedDeliverableMode,
    ...(readContinuity.lastReadDeliveredLines !== undefined
      ? { lastReadDeliveredLines: readContinuity.lastReadDeliveredLines }
      : {}),
    ...(readContinuity.lastReadWindow.start !== undefined
      ? { lastReadWindowStart: readContinuity.lastReadWindow.start }
      : {}),
    ...(readContinuity.lastReadWindow.end !== undefined
      ? { lastReadWindowEnd: readContinuity.lastReadWindow.end }
      : {}),
    ...(readContinuity.lastReadWindow.size !== undefined
      ? { lastReadWindowSize: readContinuity.lastReadWindow.size }
      : {}),
    ...(readContinuity.lastReadFragment.start !== undefined
      ? { lastReadFragmentStart: readContinuity.lastReadFragment.start }
      : {}),
    ...(readContinuity.lastReadFragment.end !== undefined
      ? { lastReadFragmentEnd: readContinuity.lastReadFragment.end }
      : {}),
    ...(readContinuity.lastReadFragment.lineIndexes?.length
      ? {
          lastReadFragmentLineIndexes:
            readContinuity.lastReadFragment.lineIndexes,
        }
      : {}),
    ...(readContinuity.lastReadFragment.ranges?.length
      ? { lastReadFragmentRanges: readContinuity.lastReadFragment.ranges }
      : {}),
    ...(readContinuity.lastReadFragment.sourceWindowStart !== undefined
      ? {
          lastReadFragmentSourceWindowStart:
            readContinuity.lastReadFragment.sourceWindowStart,
        }
      : {}),
    ...(readContinuity.lastReadFragment.sourceWindowEnd !== undefined
      ? {
          lastReadFragmentSourceWindowEnd:
            readContinuity.lastReadFragment.sourceWindowEnd,
        }
      : {}),
    ...(readContinuity.lastReadFragment.fingerprint
      ? {
          lastReadFragmentFingerprint:
            readContinuity.lastReadFragment.fingerprint,
        }
      : {}),
    ...(readContinuity.lastReadFragment.filter
      ? { lastReadFilter: readContinuity.lastReadFragment.filter }
      : {}),
    ...(readContinuity.stagedRepairProgress.stepCount !== undefined
      ? {
          lastStagedRepairStepCount:
            readContinuity.stagedRepairProgress.stepCount,
        }
      : {}),
    ...(readContinuity.stagedRepairProgress.completedStep !== undefined
      ? {
          lastStagedRepairCompletedStep:
            readContinuity.stagedRepairProgress.completedStep,
        }
      : {}),
    ...(readContinuity.stagedRepairProgress.blockedStep !== undefined
      ? {
          lastStagedRepairBlockedStep:
            readContinuity.stagedRepairProgress.blockedStep,
        }
      : {}),
    ...(readContinuity.stagedRepairProgress.nextStep !== undefined
      ? {
          lastStagedRepairNextStep:
            readContinuity.stagedRepairProgress.nextStep,
        }
      : {}),
    ...(readContinuity.lastAnswerDefect
      ? { lastAnswerDefect: readContinuity.lastAnswerDefect }
      : {}),
    recentChangedFiles: mutationContinuity.recentChangedFiles,
    recentTargetFiles: mutationContinuity.recentTargetFiles,
    recentFailedFiles: mutationContinuity.recentFailedFiles,
    recentVerifiedFiles: mutationContinuity.recentVerifiedFiles,
    lastVerificationStatus: lastCodingResult?.verification.status,
    lastVerificationCommand: lastCodingResult?.verification.command,
    lastVerificationReason: lastCodingResult?.verification.reason,
    lastVerificationBlockerKind:
      lastActionableFailure?.blockerKind ??
      lastCodingResult?.verification.blockerKind,
    lastVerificationNextAction:
      lastActionableFailure?.nextAction ??
      lastCodingResult?.verification.nextAction,
    ...(lastCodingResult?.verification.status === "blocked" &&
    lastCodingResult.verification.blockerKind === "approval-denied" &&
    Boolean(lastCodingResult.verification.command?.trim())
      ? { lastVerificationResumeEligible: true }
      : {}),
    ...approvalContinuity,
    ...projectSessionToolContinuity(lastCodingResult),
    ...requestScopeContinuity,
    lastRepairStatus: lastCodingResult?.repair.status,
    lastRepairNotes: (lastCodingResult?.repair.notes ?? []).slice(0, 6),
    lastContinuationStatus: lastCodingResult?.continuation.status,
    lastContinuationEvidence: selectContinuationEvidenceForSnapshot(
      lastCodingResult?.continuation.evidence ?? [],
    ),
    lastTaskSatisfactionVerdict: lastCodingResult?.taskSatisfaction.verdict,
    lastTaskSatisfactionReasons: (
      lastCodingResult?.taskSatisfaction.reasons ?? []
    ).slice(0, 6),
    unresolvedItems: unresolvedProjection.unresolvedItems,
    ...(freshnessHistoryCount > 0 ? { freshnessHistoryCount } : {}),
  };
}

function extractTaskStateFromMemory(workingMemory: unknown) {
  if (!workingMemory || typeof workingMemory !== "object" || Array.isArray(workingMemory)) {
    return undefined;
  }
  const continuity = (workingMemory as Record<string, unknown>).continuity;
  if (!continuity || typeof continuity !== "object" || Array.isArray(continuity)) {
    return undefined;
  }
  return decodeQueryRuntimeTaskState((continuity as Record<string, unknown>).taskState);
}
