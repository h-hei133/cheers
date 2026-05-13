import type {
  CodingActionResultSeed,
  CodingTaskKind,
  TerminalClassification,
  TerminalReason,
} from "./types.js";

export type GroundedDeliverableMode = "read" | "summary" | "explain";

export interface MutationVerificationContinuityLineage {
  readonly actionKind?: "edit-file" | "write-file";
  readonly changedFiles?: readonly string[];
  readonly verifiedFiles?: readonly string[];
  readonly verification?: {
    readonly status?: string;
    readonly command?: string;
    readonly reason?: string;
    readonly blockerKind?: string;
  };
}

export interface ApprovalAuditHistoryLike {
  readonly decision: "deny" | "allow-once" | "allow-always";
  readonly decisionSource?: string;
  readonly persistent?: boolean;
  readonly cacheEffect?: string;
  readonly projectRoot?: string;
  readonly cacheKey?: string;
  readonly scopeLabel?: string;
  readonly lineage?: string;
  readonly stopReason?: string;
  readonly channel?: "interactive" | "non-interactive";
  readonly inputKey?: "y" | "a" | "n" | "other";
  readonly recordedAt?: string;
}

export interface ContinuityStateLike {
  projectRoot?: string;
  lastTaskKind?: CodingTaskKind;
  lastFailure?: string;
  lastTaskSatisfactionVerdict?: string;
  lastGroundedDeliverableMode?: GroundedDeliverableMode;
  lastReadDeliveredLines?: number;
  lastReadWindowStart?: number;
  lastReadWindowEnd?: number;
  lastReadWindowSize?: number;
  lastReadFragmentStart?: number;
  lastReadFragmentEnd?: number;
  lastReadFragmentLineIndexes?: readonly number[];
  lastReadFragmentRanges?: readonly string[];
  lastReadFragmentSourceWindowStart?: number;
  lastReadFragmentSourceWindowEnd?: number;
  lastReadFragmentFingerprint?: string;
  lastReadFilter?: "none" | "function-definitions";
  lastStagedRepairStepCount?: number;
  lastStagedRepairCompletedStep?: number;
  lastStagedRepairBlockedStep?: number;
  lastStagedRepairNextStep?: number;
  lastAnswerDefect?: string;
  lastUserIntent?: string;
  lastAssistantOutput?: string;
  recentTargetFiles?: readonly string[];
  recentChangedFiles?: readonly string[];
  recentFailedFiles?: ReadonlyArray<{ path: string; reason: string }>;
  recentVerifiedFiles?: readonly string[];
  lastMutationVerificationLineage?: MutationVerificationContinuityLineage;
  lastActionResultSeed?: CodingActionResultSeed;
  lastFailureHandoffDiagnostic?: string;
  lastSuccessHandoffDiagnostic?: string;
  lastVerificationStatus?: string;
  lastVerificationCommand?: string;
  lastVerificationReason?: string;
  lastVerificationBlockerKind?: string;
  lastVerificationNextAction?: string;
  lastVerificationResumeEligible?: boolean;
  lastApprovalDecision?: "deny" | "allow-once" | "allow-always";
  lastApprovalDecisionSource?: string;
  lastApprovalPersistent?: boolean;
  lastApprovalCacheEffect?: string;
  lastApprovalProjectRoot?: string;
  lastApprovalCacheKey?: string;
  lastApprovalScope?: string;
  lastApprovalLineage?: string;
  lastApprovalStopReason?: string;
  lastApprovalChannel?: "interactive" | "non-interactive";
  lastApprovalInputKey?: "y" | "a" | "n" | "other";
  lastApprovalRecordedAt?: string;
  lastApprovalHistory?: readonly ApprovalAuditHistoryLike[];
  lastPermissionRequestToolName?: string;
  lastPermissionRequestOperation?: string;
  lastPermissionRequestTarget?: string;
  lastPermissionRequestProcess?: string;
  lastPermissionRequestScopeKey?: string;
  lastPermissionRequestScopeLabel?: string;
  lastPermissionRequestCacheKey?: string;
  lastPermissionRequestProjectRoot?: string;
  lastPermissionRequestSource?: "verification-command" | "approval-request";
  lastPermissionRequestLineage?: string;
  lastRequestScopeCacheKey?: string;
  lastRequestScopeLabel?: string;
  lastRequestScopeProjectRoot?: string;
  lastRequestScopeSource?: "verification-command" | "approval-request";
  lastRepairStatus?: string;
  lastContinuationStatus?: string;
  lastTerminalClassification?: TerminalClassification;
  lastTerminalReason?: TerminalReason;
  lastContinuationEvidence?: readonly string[];
  unresolvedItems?: readonly string[];
  freshnessHistoryCount?: number;
}

export function buildActionResultSeedDecisionTrace(
  continuity: ContinuityStateLike,
): string[] {
  const seed = continuity.lastActionResultSeed;
  if (!seed) {
    return [];
  }

  const parts = ["seed=action-result"];
  if (seed.actionKind) {
    parts.push(`seedAction=${seed.actionKind}`);
  }
  if (seed.target?.trim()) {
    parts.push(`seedTarget=${normalizePathLike(seed.target)}`);
  }
  if (seed.changedFiles?.length) {
    parts.push(`seedChangedFiles=${seed.changedFiles.length}`);
  }
  if (seed.verifiedFiles?.length) {
    parts.push(`seedVerifiedFiles=${seed.verifiedFiles.length}`);
  }
  if (seed.writerStarted) {
    parts.push("seedWriterStarted=yes");
  }
  if (seed.writeEffect?.trim()) {
    parts.push(`seedWriteEffect=${seed.writeEffect.trim().toLowerCase()}`);
  }
  if (seed.requiresUserInspection) {
    parts.push("seedRequiresUserInspection=yes");
  }
  const verificationStatus = seed.verification?.status?.trim();
  if (verificationStatus) {
    parts.push(
      `seedVerifyStatus=${verificationStatus
        .toLowerCase()
        .replace(/\s+/g, "-")}`,
    );
  }
  if (seed.verification?.command?.trim()) {
    parts.push("seedVerifyCommandInherited=yes");
  }
  const blockerKind =
    seed.blockerKind?.trim() || seed.verification?.blockerKind?.trim();
  if (blockerKind) {
    parts.push(`seedBlocker=${blockerKind}`);
  }
  if (seed.reason?.trim() || seed.verification?.reason?.trim()) {
    parts.push("seedReason=yes");
  }

  return [`decision-trace: ${parts.join(" ")}`];
}

export function buildPostEditVerifyContinuationLineage(
  continuity: ContinuityStateLike,
): string[] | undefined {
  const lineageFacts = getMutationVerificationLineageFacts(continuity);
  const changedFileCount = lineageFacts.changedFiles.length;
  if (changedFileCount <= 0) {
    return undefined;
  }

  const verifiedFileCount = lineageFacts.verifiedFiles.length;
  const verificationStatus = lineageFacts.verificationStatus?.trim();
  const hasVerificationEvidence = Boolean(
    verificationStatus ||
      lineageFacts.verificationCommand?.trim() ||
      lineageFacts.verificationReason?.trim() ||
      lineageFacts.verificationBlockerKind?.trim() ||
      verifiedFileCount > 0,
  );
  if (!hasVerificationEvidence) {
    return undefined;
  }

  const lineage = [
    "lineage=mutation-verification",
    `changedFiles=${changedFileCount}`,
  ];
  if (verifiedFileCount > 0) {
    lineage.push(`verifiedFiles=${verifiedFileCount}`);
  }
  if (verificationStatus) {
    lineage.push(
      `verifyStatus=${verificationStatus.toLowerCase().replace(/\s+/g, "-")}`,
    );
  }
  if (lineageFacts.verificationCommand?.trim()) {
    lineage.push("verifyCommandInherited=yes");
  }
  return lineage;
}

export function hasPassedVerificationLineage(
  continuity: ContinuityStateLike,
): boolean {
  const lineageFacts = getMutationVerificationLineageFacts(continuity);
  if (lineageFacts.verificationStatus?.trim().toLowerCase() === "passed") {
    return true;
  }
  return (continuity.lastContinuationEvidence ?? []).some((entry) =>
    /(?:verifyStatus=passed|verify-status:passed|verify=passed)/i.test(entry),
  );
}

export function mergeContinuationState(
  structuredState: unknown,
  inlineState: ContinuityStateLike,
): ContinuityStateLike {
  const structured = continuityStateAsObject(structuredState);
  const actionResultSeed =
    structured.lastActionResultSeed ?? inlineState.lastActionResultSeed;
  const mutationVerificationLineage =
    structured.lastMutationVerificationLineage ??
    inlineState.lastMutationVerificationLineage ??
    actionResultSeedToMutationVerificationLineage(actionResultSeed);
  const actionResultTargetFiles = actionResultSeed?.target?.trim()
    ? [normalizePathLike(actionResultSeed.target)]
    : undefined;
  return {
    projectRoot: structured.projectRoot ?? inlineState.projectRoot,
    lastTaskKind: structured.lastTaskKind ?? inlineState.lastTaskKind,
    lastUserIntent: structured.lastUserIntent ?? inlineState.lastUserIntent,
    lastAssistantOutput:
      structured.lastAssistantOutput ?? inlineState.lastAssistantOutput,
    lastFailure: structured.lastFailure ?? inlineState.lastFailure,
    recentTargetFiles: structured.recentTargetFiles?.length
      ? structured.recentTargetFiles
      : inlineState.recentTargetFiles?.length
        ? inlineState.recentTargetFiles
        : actionResultTargetFiles,
    recentChangedFiles: structured.recentChangedFiles?.length
      ? structured.recentChangedFiles
      : inlineState.recentChangedFiles?.length
        ? inlineState.recentChangedFiles
        : mutationVerificationLineage?.changedFiles,
    recentFailedFiles: structured.recentFailedFiles?.length
      ? structured.recentFailedFiles
      : inlineState.recentFailedFiles,
    recentVerifiedFiles: structured.recentVerifiedFiles?.length
      ? structured.recentVerifiedFiles
      : inlineState.recentVerifiedFiles?.length
        ? inlineState.recentVerifiedFiles
        : mutationVerificationLineage?.verifiedFiles,
    lastMutationVerificationLineage: mutationVerificationLineage,
    lastActionResultSeed: actionResultSeed,
    lastFailureHandoffDiagnostic:
      structured.lastFailureHandoffDiagnostic ??
      inlineState.lastFailureHandoffDiagnostic,
    lastSuccessHandoffDiagnostic:
      structured.lastSuccessHandoffDiagnostic ??
      inlineState.lastSuccessHandoffDiagnostic,
    lastVerificationStatus:
      structured.lastVerificationStatus ??
      inlineState.lastVerificationStatus ??
      mutationVerificationLineage?.verification?.status ??
      actionResultSeed?.verification?.status,
    lastVerificationCommand:
      structured.lastVerificationCommand ??
      inlineState.lastVerificationCommand ??
      mutationVerificationLineage?.verification?.command ??
      actionResultSeed?.verification?.command,
    lastVerificationReason:
      structured.lastVerificationReason ??
      inlineState.lastVerificationReason ??
      mutationVerificationLineage?.verification?.reason ??
      actionResultSeed?.verification?.reason ??
      actionResultSeed?.reason,
    lastVerificationBlockerKind:
      structured.lastVerificationBlockerKind ??
      inlineState.lastVerificationBlockerKind ??
      mutationVerificationLineage?.verification?.blockerKind ??
      actionResultSeed?.verification?.blockerKind ??
      actionResultSeed?.blockerKind,
    lastVerificationNextAction:
      structured.lastVerificationNextAction ??
      inlineState.lastVerificationNextAction,
    lastVerificationResumeEligible:
      structured.lastVerificationResumeEligible ??
      inlineState.lastVerificationResumeEligible,
    lastApprovalDecision:
      structured.lastApprovalDecision ?? inlineState.lastApprovalDecision,
    lastApprovalDecisionSource:
      structured.lastApprovalDecisionSource ??
      inlineState.lastApprovalDecisionSource,
    lastApprovalPersistent:
      structured.lastApprovalPersistent ?? inlineState.lastApprovalPersistent,
    lastApprovalCacheEffect:
      structured.lastApprovalCacheEffect ?? inlineState.lastApprovalCacheEffect,
    lastApprovalProjectRoot:
      structured.lastApprovalProjectRoot ?? inlineState.lastApprovalProjectRoot,
    lastApprovalCacheKey:
      structured.lastApprovalCacheKey ?? inlineState.lastApprovalCacheKey,
    lastApprovalScope:
      structured.lastApprovalScope ?? inlineState.lastApprovalScope,
    lastApprovalLineage:
      structured.lastApprovalLineage ?? inlineState.lastApprovalLineage,
    lastApprovalStopReason:
      structured.lastApprovalStopReason ?? inlineState.lastApprovalStopReason,
    lastApprovalChannel:
      structured.lastApprovalChannel ?? inlineState.lastApprovalChannel,
    lastApprovalInputKey:
      structured.lastApprovalInputKey ?? inlineState.lastApprovalInputKey,
    lastApprovalRecordedAt:
      structured.lastApprovalRecordedAt ?? inlineState.lastApprovalRecordedAt,
    lastApprovalHistory: structured.lastApprovalHistory?.length
      ? structured.lastApprovalHistory
      : inlineState.lastApprovalHistory,
    lastPermissionRequestToolName:
      structured.lastPermissionRequestToolName ??
      inlineState.lastPermissionRequestToolName,
    lastPermissionRequestOperation:
      structured.lastPermissionRequestOperation ??
      inlineState.lastPermissionRequestOperation,
    lastPermissionRequestTarget:
      structured.lastPermissionRequestTarget ??
      inlineState.lastPermissionRequestTarget,
    lastPermissionRequestProcess:
      structured.lastPermissionRequestProcess ??
      inlineState.lastPermissionRequestProcess,
    lastPermissionRequestScopeKey:
      structured.lastPermissionRequestScopeKey ??
      inlineState.lastPermissionRequestScopeKey,
    lastPermissionRequestScopeLabel:
      structured.lastPermissionRequestScopeLabel ??
      inlineState.lastPermissionRequestScopeLabel,
    lastPermissionRequestCacheKey:
      structured.lastPermissionRequestCacheKey ??
      inlineState.lastPermissionRequestCacheKey,
    lastPermissionRequestProjectRoot:
      structured.lastPermissionRequestProjectRoot ??
      inlineState.lastPermissionRequestProjectRoot,
    lastPermissionRequestSource:
      structured.lastPermissionRequestSource ??
      inlineState.lastPermissionRequestSource,
    lastPermissionRequestLineage:
      structured.lastPermissionRequestLineage ??
      inlineState.lastPermissionRequestLineage,
    lastRequestScopeCacheKey:
      structured.lastRequestScopeCacheKey ??
      inlineState.lastRequestScopeCacheKey,
    lastRequestScopeLabel:
      structured.lastRequestScopeLabel ?? inlineState.lastRequestScopeLabel,
    lastRequestScopeProjectRoot:
      structured.lastRequestScopeProjectRoot ??
      inlineState.lastRequestScopeProjectRoot,
    lastRequestScopeSource:
      structured.lastRequestScopeSource ?? inlineState.lastRequestScopeSource,
    lastRepairStatus:
      structured.lastRepairStatus ?? inlineState.lastRepairStatus,
    lastContinuationStatus:
      structured.lastContinuationStatus ?? inlineState.lastContinuationStatus,
    lastTerminalClassification:
      structured.lastTerminalClassification ??
      inlineState.lastTerminalClassification,
    lastTerminalReason:
      structured.lastTerminalReason ?? inlineState.lastTerminalReason,
    lastContinuationEvidence: structured.lastContinuationEvidence?.length
      ? structured.lastContinuationEvidence
      : inlineState.lastContinuationEvidence,
    lastGroundedDeliverableMode:
      structured.lastGroundedDeliverableMode ??
      inlineState.lastGroundedDeliverableMode,
    lastReadDeliveredLines:
      structured.lastReadDeliveredLines ?? inlineState.lastReadDeliveredLines,
    lastReadWindowStart:
      structured.lastReadWindowStart ?? inlineState.lastReadWindowStart,
    lastReadWindowEnd:
      structured.lastReadWindowEnd ?? inlineState.lastReadWindowEnd,
    lastReadWindowSize:
      structured.lastReadWindowSize ?? inlineState.lastReadWindowSize,
    lastReadFragmentStart:
      structured.lastReadFragmentStart ?? inlineState.lastReadFragmentStart,
    lastReadFragmentEnd:
      structured.lastReadFragmentEnd ?? inlineState.lastReadFragmentEnd,
    lastReadFragmentLineIndexes: structured.lastReadFragmentLineIndexes?.length
      ? structured.lastReadFragmentLineIndexes
      : inlineState.lastReadFragmentLineIndexes,
    lastReadFragmentRanges: structured.lastReadFragmentRanges?.length
      ? structured.lastReadFragmentRanges
      : inlineState.lastReadFragmentRanges,
    lastReadFragmentSourceWindowStart:
      structured.lastReadFragmentSourceWindowStart ??
      inlineState.lastReadFragmentSourceWindowStart,
    lastReadFragmentSourceWindowEnd:
      structured.lastReadFragmentSourceWindowEnd ??
      inlineState.lastReadFragmentSourceWindowEnd,
    lastReadFilter: structured.lastReadFilter ?? inlineState.lastReadFilter,
    lastReadFragmentFingerprint:
      structured.lastReadFragmentFingerprint ??
      inlineState.lastReadFragmentFingerprint,
    lastStagedRepairStepCount:
      structured.lastStagedRepairStepCount ??
      inlineState.lastStagedRepairStepCount,
    lastStagedRepairCompletedStep:
      structured.lastStagedRepairCompletedStep ??
      inlineState.lastStagedRepairCompletedStep,
    lastStagedRepairBlockedStep:
      structured.lastStagedRepairBlockedStep ??
      inlineState.lastStagedRepairBlockedStep,
    lastStagedRepairNextStep:
      structured.lastStagedRepairNextStep ??
      inlineState.lastStagedRepairNextStep,
    lastAnswerDefect:
      structured.lastAnswerDefect ?? inlineState.lastAnswerDefect,
    unresolvedItems: structured.unresolvedItems?.length
      ? structured.unresolvedItems
      : inlineState.unresolvedItems,
    freshnessHistoryCount:
      structured.freshnessHistoryCount ?? inlineState.freshnessHistoryCount,
  };
}

export function actionResultSeedToMutationVerificationLineage(
  seed: CodingActionResultSeed | undefined,
): MutationVerificationContinuityLineage | undefined {
  if (
    !seed ||
    (seed.actionKind !== "edit-file" && seed.actionKind !== "write-file")
  ) {
    return undefined;
  }

  const changedFiles = seed.changedFiles?.length
    ? seed.changedFiles
    : seed.target?.trim()
      ? [normalizePathLike(seed.target)]
      : [];
  const hasVerificationEvidence = Boolean(
    seed.verification?.status?.trim() ||
      seed.verification?.command?.trim() ||
      seed.verification?.reason?.trim() ||
      seed.verification?.blockerKind?.trim() ||
      seed.verifiedFiles?.length,
  );
  if (changedFiles.length <= 0 || !hasVerificationEvidence) {
    return undefined;
  }

  return {
    actionKind: seed.actionKind,
    changedFiles,
    verifiedFiles: seed.verifiedFiles,
    verification: seed.verification,
  };
}

function getMutationVerificationLineageFacts(continuity: ContinuityStateLike): {
  readonly changedFiles: readonly string[];
  readonly verifiedFiles: readonly string[];
  readonly verificationStatus?: string;
  readonly verificationCommand?: string;
  readonly verificationReason?: string;
  readonly verificationBlockerKind?: string;
} {
  const lineage = continuity.lastMutationVerificationLineage;
  return {
    changedFiles: lineage?.changedFiles?.length
      ? lineage.changedFiles
      : (continuity.recentChangedFiles ?? []),
    verifiedFiles: lineage?.verifiedFiles?.length
      ? lineage.verifiedFiles
      : (continuity.recentVerifiedFiles ?? []),
    verificationStatus:
      lineage?.verification?.status ?? continuity.lastVerificationStatus,
    verificationCommand:
      lineage?.verification?.command ?? continuity.lastVerificationCommand,
    verificationReason:
      lineage?.verification?.reason ?? continuity.lastVerificationReason,
    verificationBlockerKind:
      lineage?.verification?.blockerKind ??
      continuity.lastVerificationBlockerKind,
  };
}

export function continuityStateAsObject(value: unknown): ContinuityStateLike {
  if (!value || typeof value !== "object") {
    return {};
  }
  return value as ContinuityStateLike;
}

function normalizePathLike(value: string): string {
  return value
    .replace(/\\/g, "/")
    .replace(/^\.\/+/g, "")
    .trim();
}
