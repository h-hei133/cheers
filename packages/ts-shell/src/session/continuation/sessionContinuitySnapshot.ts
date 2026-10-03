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
import { isSessionContextMessage } from "../schema/sessionMessage.js";
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
import { readStoredResultSource, shouldReplaceStoredResult } from "./source.js";
import { continuityBranchScope, latestContinuityFailure, selectBranchResultMemory, storedResultIsNewer } from "./branch.js";
import { projectHistoricalWriteInspection } from "./inspection.js";

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
  const scope = continuityBranchScope(stateSnapshot?.thread, input.transcriptEvents);
  const transcriptEvents = input.transcriptEvents.filter(event => event.type === "query-event"
    ? scope.admitsEntry(event.sourceEntryId) : event.type !== "lifecycle" || scope.allowLegacy);
  const resultMemory = selectBranchResultMemory(stateSnapshot?.workingMemory, stateSnapshot?.thread, input.transcriptEvents);
  const allowGlobalFallback = scope.allowGlobalFallback && resultMemory === stateSnapshot?.workingMemory;
  const approvalMemory = allowGlobalFallback ? stateSnapshot?.workingMemory : undefined;
  const lastQueryCompletion = findLastQueryCompletionEvent(transcriptEvents);
  const codingCompletion = findLastCodingCompletionEvent(transcriptEvents);
  const candidateResult = codingCompletion?.event.result.codingResult;
  const storedCandidate = readStoredResultSource(resultMemory);
  const storedOrder = storedResultIsNewer(resultMemory, codingCompletion, stateSnapshot?.thread, transcriptEvents);
  const terminalOrder = storedResultIsNewer(resultMemory, lastQueryCompletion, stateSnapshot?.thread, transcriptEvents);
  const failure = latestContinuityFailure(transcriptEvents);
  const failureOrder = storedResultIsNewer(resultMemory, failure?.entry, stateSnapshot?.thread, transcriptEvents);
  const resultOrderUnknown = storedCandidate !== undefined && (
    (candidateResult !== undefined && shouldReplaceStoredResult(storedCandidate, candidateResult.taskKind) && storedOrder === undefined) ||
    (lastQueryCompletion !== undefined && lastQueryCompletion.event.result.terminalClassification !== "success" && terminalOrder === undefined) ||
    (failure !== undefined && failureOrder === undefined));
  const allowTerminalFallback = allowGlobalFallback && !storedCandidate && !lastQueryCompletion && !resultOrderUnknown;
  const lastRunErrorEvent = allowTerminalFallback ? findLastLifecycleEvent(transcriptEvents, "run-error") : undefined;
  const storedResult = resultOrderUnknown ? undefined : storedCandidate;
  const useStoredResult = storedResult !== undefined && (!candidateResult ||
    storedOrder === true ||
    !shouldReplaceStoredResult(storedResult, candidateResult.taskKind));
  const lastCodingCompletion = useStoredResult || resultOrderUnknown ? undefined : codingCompletion;
  const lastCodingResult = lastCodingCompletion?.event.result.codingResult;
  const recentCodingResults = resultOrderUnknown ? [] : collectRecentCodingResults(transcriptEvents, 4);
  const readContinuity = projectSessionReadContinuity(lastCodingResult);
  const requestScopeContinuity = projectSessionRequestScopeContinuity({
    evidence: lastCodingResult?.continuation.evidence,
    workingMemory: approvalMemory,
    sessionProjectRoot: session.projectRoot,
  });
  const approvalContinuity = projectSessionApprovalContinuity({
    workingMemory: approvalMemory,
    lastCodingResult,
    historyLimit: input.approvalHistoryLimit,
  });
  const lastStoppedSessionContinuity =
    deriveStoppedSessionContinuitySurface(lastCodingResult);
  // Select the complete result group before projecting optional fields. A chat
  // result cannot replace a retained coding checkpoint or unknown legacy result.
  const handoffMemory = lastCodingResult || !storedResult ? undefined : resultMemory;
  const lastWriteContinuity =
    lastStoppedSessionContinuity?.writeContinuity ??
    extractWriteContinuityFromMemory(handoffMemory);
  const lastActionHandoffSummary =
    buildActionHandoffSummary(lastCodingResult?.lastActionResultSeed) ??
    extractActionHandoffSummaryFromMemory(handoffMemory);
  const lastSeedInfluence =
    extractSeedInfluenceFromQueryResult(
      useStoredResult || resultOrderUnknown ? undefined : (lastCodingCompletion ?? lastQueryCompletion)?.event.result,
    ) ?? extractSeedInfluenceFromMemory(handoffMemory);
  const lastSeedInfluenceHandoffSummary =
    buildSeedInfluenceHandoffSummary(
      lastCodingResult?.lastActionResultSeed,
      lastSeedInfluence,
    ) ??
    extractSeedInfluenceHandoffSummaryFromMemory(handoffMemory);
  const lastFailureHandoffDiagnostic =
    lastStoppedSessionContinuity?.failureHandoffDiagnostic ??
    extractFailureHandoffDiagnosticFromMemory(handoffMemory);
  const lastActionableFailure =
    lastStoppedSessionContinuity?.actionableFailure ??
    deriveActionableFailureContinuity(lastCodingResult);
  const lastSuccessHandoffDiagnostic =
    buildSuccessHandoffDiagnostic(lastCodingResult) ??
    extractSuccessHandoffDiagnosticFromMemory(handoffMemory);
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
    : extractTaskStateFromMemory(handoffMemory);
  const queryFailure = storedCandidate && failureOrder === true ? undefined : failure?.error;
  const continuityTerminalSource = selectContinuityTerminalSource({
    query: resultOrderUnknown ? undefined : queryFailure ? { terminalClassification: "error", terminalReason: "stopped_error", stopReason: queryFailure }
      : useStoredResult && terminalOrder === true
        ? undefined : lastQueryCompletion?.event.result ?? (allowTerminalFallback ? recoverySnapshot : undefined),
    coding: useStoredResult ? storedResult.terminal : lastCodingCompletion?.event.result,
  });
  // Loaded turns already reflect the selected branch and compaction. Recovery
  // admits a pending prompt against the selected branch before repairing it.
  const selectedTurns = session.turns.filter((turn) => !isSessionContextMessage(turn));
  const repairedPrompt = recoverySnapshot.repairSummary.insertedPromptMessage
    ? recoverySnapshot.pendingPrompt
    : undefined;
  const lastUserIntent = repairedPrompt?.trim()
    ? repairedPrompt
    : findLastTurnContent(selectedTurns, "user");
  const mutationContinuity = projectSessionMutationContinuity({
    lastCodingResult,
    recentCodingResults,
    lastUserIntent,
  });
  const unresolvedProjection = projectSessionUnresolvedItems({
    sessionLastError: resultOrderUnknown ? undefined : queryFailure ?? (allowTerminalFallback ? session.lastError : undefined),
    lastRunErrorEvent,
    continuityTerminalSource,
    lastCodingResult,
  });
  const unresolvedItems = [...projectHistoricalWriteInspection(transcriptEvents), ...unresolvedProjection.unresolvedItems, ...(resultOrderUnknown
    ? ["Continuity result order unavailable; inspect current files before relying on historical verification."] : [])];
  const freshnessHistoryCount =
    recentCodingResults.length +
    mutationContinuity.recentFailedFiles.length +
    (lastCodingResult?.continuation.evidence.length ?? 0) +
    unresolvedItems.length;

  return {
    sessionId: session.id,
    projectRoot: session.projectRoot,
    lastUserIntent,
    lastAssistantOutput: findLastTurnContent(selectedTurns, "assistant"),
    lastTerminalClassification: continuityTerminalSource?.terminalClassification,
    lastTerminalReason: continuityTerminalSource?.terminalReason,
    lastFailure: unresolvedProjection.lastFailure,
    lastTaskKind: useStoredResult ? storedResult.taskKind : lastCodingResult?.taskKind,
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
    unresolvedItems,
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
