import type { ProductVerificationReceipt } from "../verificationFacade.js";

export type VerificationIntentDispatchStatus =
  | "planned"
  | "selected"
  | "selected_not_run"
  | "authority_required"
  | "dispatched"
  | "passed"
  | "failed"
  | "timed_out"
  | "cancelled"
  | "blocked"
  | "skipped"
  | "unavailable"
  | "unsupported"
  | "not_run";

export type VerificationIntentRelevanceStatus =
  | "task_relevant"
  | "probably_relevant"
  | "unrelated"
  | "unknown"
  | "not_proven";

export type VerificationResultObservationStatus =
  | "passed"
  | "failed"
  | "blocked"
  | "timed_out"
  | "cancelled"
  | "skipped"
  | "unavailable"
  | "not_run"
  | "unsupported"
  | "selected_not_run"
  | "relevance_rejected";

export type RepairApplyObservationStatus =
  | "not_applied"
  | "authority_required"
  | "applied"
  | "failed"
  | "blocked"
  | "unsupported"
  | "not_proven";

export interface RepairApplyObservationLike {
  readonly repairApplyId?: string;
  readonly proposalId?: string;
  readonly sourceFailureId?: string;
  readonly sourceVerificationId?: string;
  readonly targetSummary?: string;
  readonly repairApplyStatus: RepairApplyObservationStatus;
  readonly repairAuthorityStatus?: "required" | "granted" | "denied" | "not_required" | "unknown";
  readonly applyReceiptIds?: readonly string[];
  readonly touchedTargetSummaries?: readonly string[];
  readonly originalFailureClass?: string;
  readonly originalFailureSummary?: string;
  readonly originalRuntimeReceiptIds?: readonly string[];
  readonly runtimeReceiptIds?: readonly string[];
  readonly taskRelevanceStatus?: VerificationIntentRelevanceStatus;
  readonly coverageStatus?: VerificationCoverageObservationStatus;
  readonly originalFailurePreserved?: true;
  readonly notProvenClaims?: readonly string[];
  readonly redactionStatus?: "report-safe" | "redacted";
}

export type VerificationCoverageObservationStatus =
  | "covered"
  | "partially_covered"
  | "uncovered"
  | "not_proven";

export type PostRepairVerificationRequirementStatus =
  | "required"
  | "blocked"
  | "not_required"
  | "unavailable"
  | "not_proven";

export type PostRepairVerificationBlocker =
  | "none"
  | "repair-not-applied"
  | "original-failure-missing"
  | "verification-unavailable"
  | "unsupported"
  | "not-proven";

export type PostRepairVerificationDispatchStatus =
  | "selected"
  | "selected_not_run"
  | "blocked"
  | "dispatched"
  | "passed"
  | "failed"
  | "timed_out"
  | "cancelled"
  | "unavailable"
  | "skipped"
  | "not_run";

export type PostRepairVerificationResultStatus =
  | "passed"
  | "failed"
  | "blocked"
  | "timed_out"
  | "cancelled"
  | "unavailable"
  | "skipped"
  | "not_run"
  | "selected_not_run";

export interface VerificationLoopIntent {
  readonly intentId: string;
  readonly sourceTurnId: string;
  readonly targetSummary: string;
  readonly verificationKind: "command" | "readback" | "owner_projection" | "unknown";
  readonly commandCandidateSummary?: string;
  readonly ownerDomain: "verification";
  readonly authorityRequirement: "not_required" | "required" | "granted" | "denied" | "unknown";
  readonly dispatchStatus: VerificationIntentDispatchStatus;
  readonly relevanceStatus: VerificationIntentRelevanceStatus;
  readonly coverageStatus: VerificationCoverageObservationStatus;
  readonly selectedNotRun: boolean;
  readonly redactionStatus: "report-safe" | "redacted";
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface VerificationResultObservation {
  readonly verificationId: string;
  readonly intentId: string;
  readonly executionReceiptId?: string;
  readonly runtimeReceiptIds: readonly string[];
  readonly status: VerificationResultObservationStatus;
  readonly relevanceStatus: VerificationIntentRelevanceStatus;
  readonly coverageStatus: VerificationCoverageObservationStatus;
  readonly authorityRequirement: VerificationLoopIntent["authorityRequirement"];
  readonly failureClass?: string;
  readonly repairEligible: boolean;
  readonly selectedNotRun: boolean;
  readonly verdictStatus?: ProductVerificationReceipt["verdictStatus"];
  readonly safeSummary: string;
  readonly redactionStatus: "report-safe" | "redacted";
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface PostRepairVerificationRequirementObservation {
  readonly requirementId: string;
  readonly sourceRepairApplyId: string;
  readonly sourceRepairProposalId: string;
  readonly sourceVerificationFailureId: string;
  readonly sourceVerificationId: string;
  readonly originalFailureClass: string;
  readonly originalFailureStatus: "failed";
  readonly repairApplyState: RepairApplyObservationStatus;
  readonly repairAuthorityState: "required" | "granted" | "denied" | "not_required" | "unknown" | undefined;
  readonly verificationRequired: boolean;
  readonly requirementStatus: PostRepairVerificationRequirementStatus;
  readonly verificationBlocker: PostRepairVerificationBlocker;
  readonly taskRelevanceExpectation: VerificationIntentRelevanceStatus;
  readonly coverageExpectation: VerificationCoverageObservationStatus;
  readonly originalRuntimeReceiptIds: readonly string[];
  readonly repairApplyReceiptIds: readonly string[];
  readonly touchedTargetSummaries: readonly string[];
  readonly originalFailurePreserved: true;
  readonly repairApplyPreserved: true;
  readonly redactionStatus: "report-safe" | "redacted";
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface PostRepairVerificationRequestObservation {
  readonly requestId: string;
  readonly requirementId: string;
  readonly sourceRepairApplyId: string;
  readonly sourceRepairProposalId: string;
  readonly sourceVerificationFailureId: string;
  readonly selectedCommandSummary?: string;
  readonly selectedNotRun: boolean;
  readonly dispatchStatus: PostRepairVerificationDispatchStatus;
  readonly receiptIds: readonly string[];
  readonly taskRelevanceStatus: VerificationIntentRelevanceStatus;
  readonly coverageStatus: VerificationCoverageObservationStatus;
  readonly originalFailurePreserved: true;
  readonly repairApplyPreserved: true;
  readonly redactionStatus: "report-safe" | "redacted";
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface PostRepairVerificationVerdictCandidateInput {
  readonly candidateId: string;
  readonly sourcePostRepairVerificationResultId: string;
  readonly sourceRepairApplyId: string;
  readonly sourceVerificationFailureId: string;
  readonly resultStatus: "passed";
  readonly taskRelevanceStatus: VerificationIntentRelevanceStatus;
  readonly coverageStatus: VerificationCoverageObservationStatus;
  readonly originalFailurePreserved: true;
  readonly repairApplyPreserved: true;
  readonly terminalSuccessClaim: false;
}

export interface PostRepairVerificationResultObservation {
  readonly resultId: string;
  readonly requestId?: string;
  readonly requirementId: string;
  readonly sourceRepairApplyId: string;
  readonly sourceRepairProposalId: string;
  readonly sourceVerificationFailureId: string;
  readonly sourceVerificationId: string;
  readonly originalFailureStatus: "failed";
  readonly originalFailureClass: string;
  readonly originalFailureSummary: string;
  readonly originalTaskRelevanceStatus: VerificationIntentRelevanceStatus;
  readonly originalCoverageStatus: VerificationCoverageObservationStatus;
  readonly originalRuntimeReceiptIds: readonly string[];
  readonly repairApplyState: RepairApplyObservationStatus;
  readonly repairAuthorityState: "required" | "granted" | "denied" | "not_required" | "unknown" | undefined;
  readonly repairApplyReceiptIds: readonly string[];
  readonly touchedTargetSummaries: readonly string[];
  readonly status: PostRepairVerificationResultStatus;
  readonly receiptIds: readonly string[];
  readonly failureClass?: string;
  readonly taskRelevanceStatus: VerificationIntentRelevanceStatus;
  readonly coverageStatus: VerificationCoverageObservationStatus;
  readonly verdictCandidateInput?: PostRepairVerificationVerdictCandidateInput;
  readonly originalFailurePreserved: true;
  readonly repairApplyPreserved: true;
  readonly redactionStatus: "report-safe" | "redacted";
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export function projectVerificationIntent(input: {
  readonly sourceTurnId: string;
  readonly targetSummary: string;
  readonly verificationKind?: VerificationLoopIntent["verificationKind"];
  readonly commandCandidateSummary?: string;
  readonly authorityRequirement?: VerificationLoopIntent["authorityRequirement"];
  readonly dispatchStatus?: VerificationIntentDispatchStatus;
  readonly relevanceStatus?: VerificationIntentRelevanceStatus;
  readonly coverageStatus?: VerificationCoverageObservationStatus;
  readonly receipt?: ProductVerificationReceipt;
  readonly notProvenClaims?: readonly string[];
}): VerificationLoopIntent {
  const redactions = new Set<string>();
  const dispatchStatus = input.dispatchStatus ??
    dispatchFromReceipt(input.receipt) ??
    "not_run";
  const relevanceStatus = input.relevanceStatus ??
    relevanceFromReceipt(input.receipt) ??
    "not_proven";
  const coverageStatus = input.coverageStatus ??
    coverageFromReceipt(input.receipt) ??
    "not_proven";
  const commandSummary = input.commandCandidateSummary ??
    input.receipt?.selectedCommand;
  const selectedNotRun = dispatchStatus === "selected_not_run" ||
    (dispatchStatus === "not_run" && Boolean(commandSummary));
  return freeze({
    intentId: sanitizeId(`verification-intent:${input.sourceTurnId}`, redactions),
    sourceTurnId: sanitizeText(input.sourceTurnId, redactions, 160),
    targetSummary: sanitizeText(input.targetSummary, redactions, 180),
    verificationKind: input.verificationKind ?? "owner_projection",
    ...(commandSummary
      ? { commandCandidateSummary: sanitizeText(commandSummary, redactions, 180) }
      : {}),
    ownerDomain: "verification",
    authorityRequirement: input.authorityRequirement ??
      (input.receipt?.authority === "explicitly-approved"
        ? "granted"
        : input.receipt?.authority === "not-granted"
          ? "required"
          : "unknown"),
    dispatchStatus,
    relevanceStatus,
    coverageStatus,
    selectedNotRun,
    redactionStatus: redactions.size > 0 ? "redacted" : "report-safe",
    notProvenClaims: unique([
      "terminal-success",
      "task-success",
      "verification-success",
      "verification-selected-is-not-success",
      "command-exit-zero-is-not-task-success",
      ...(input.receipt?.notProvenClaims ?? []),
      ...(input.notProvenClaims ?? []),
    ], redactions),
    terminalSuccessClaim: false,
  });
}

export function observeVerificationResult(input: {
  readonly intent: VerificationLoopIntent;
  readonly status?: VerificationResultObservationStatus;
  readonly executionReceiptId?: string;
  readonly runtimeReceiptIds?: readonly string[];
  readonly failureClass?: string;
  readonly repairEligible?: boolean;
  readonly safeSummary?: string;
  readonly receipt?: ProductVerificationReceipt;
  readonly notProvenClaims?: readonly string[];
}): VerificationResultObservation {
  const redactions = new Set<string>();
  const status = input.status ??
    resultStatusFromReceipt(input.receipt, input.intent) ??
    (input.intent.dispatchStatus === "selected" ? "selected_not_run" : "not_run");
  const failureClass = input.failureClass ?? input.receipt?.failureClass;
  const runtimeReceiptIds = input.runtimeReceiptIds ?? input.receipt?.runtimeReceiptIds ?? [];
  const repairEligible = input.repairEligible ?? input.receipt?.repairEligible ?? false;
  const selectedNotRun = status === "selected_not_run" || input.intent.selectedNotRun;
  return freeze({
    verificationId: sanitizeId(`${input.intent.intentId}:result`, redactions),
    intentId: sanitizeText(input.intent.intentId, redactions, 180),
    ...(input.executionReceiptId
      ? { executionReceiptId: sanitizeText(input.executionReceiptId, redactions, 180) }
      : {}),
    runtimeReceiptIds: runtimeReceiptIds.map((id) => sanitizeText(id, redactions, 180)),
    status,
    relevanceStatus: input.intent.relevanceStatus,
    coverageStatus: input.intent.coverageStatus,
    authorityRequirement: input.intent.authorityRequirement,
    ...(failureClass ? { failureClass: sanitizeText(failureClass, redactions, 120) } : {}),
    repairEligible,
    selectedNotRun,
    ...(input.receipt?.verdictStatus
      ? { verdictStatus: input.receipt.verdictStatus }
      : {}),
    safeSummary: sanitizeText(
      input.safeSummary ??
        summaryFromStatus({
          status,
          relevanceStatus: input.intent.relevanceStatus,
          coverageStatus: input.intent.coverageStatus,
          authorityRequirement: input.intent.authorityRequirement,
          runtimeReceiptCount: runtimeReceiptIds.length,
          repairEligible,
        }),
      redactions,
      180,
    ),
    redactionStatus:
      redactions.size > 0 || input.intent.redactionStatus === "redacted"
        ? "redacted"
        : "report-safe",
    notProvenClaims: unique([
      "terminal-success",
      "task-success",
      "verification-success",
      "verification-result-observed-is-not-terminal-success",
      "command-exit-zero-is-not-task-success",
      ...(input.receipt?.notProvenClaims ?? []),
      ...(input.notProvenClaims ?? []),
    ], redactions),
    terminalSuccessClaim: false,
  });
}

export function projectVerificationObservationFromReceipt(input: {
  readonly sourceTurnId: string;
  readonly targetSummary: string;
  readonly receipt: ProductVerificationReceipt;
  readonly runtimeReceiptIds?: readonly string[];
  readonly notProvenClaims?: readonly string[];
}): {
  readonly intent: VerificationLoopIntent;
  readonly result: VerificationResultObservation;
} {
  const intent = projectVerificationIntent({
    sourceTurnId: input.sourceTurnId,
    targetSummary: input.targetSummary,
    verificationKind: input.receipt.selectedCommand ? "command" : "unknown",
    receipt: input.receipt,
    notProvenClaims: input.notProvenClaims,
  });
  const result = observeVerificationResult({
    intent,
    receipt: input.receipt,
    runtimeReceiptIds: input.runtimeReceiptIds ?? input.receipt.runtimeReceiptIds,
    notProvenClaims: input.notProvenClaims,
  });
  return freeze({ intent, result });
}

export function requirePostRepairVerification(input: {
  readonly repairApply: RepairApplyObservationLike;
  readonly requirementStatus?: PostRepairVerificationRequirementStatus;
  readonly verificationBlocker?: PostRepairVerificationBlocker;
  readonly taskRelevanceExpectation?: VerificationIntentRelevanceStatus;
  readonly coverageExpectation?: VerificationCoverageObservationStatus;
  readonly notProvenClaims?: readonly string[];
}): PostRepairVerificationRequirementObservation {
  const redactions = new Set<string>();
  const requirementStatus = input.requirementStatus ??
    requirementStatusFromRepairApply(input.repairApply);
  const verificationBlocker = input.verificationBlocker ??
    blockerFromRequirement(requirementStatus, input.repairApply);
  return freeze({
    requirementId: sanitizeId(`${input.repairApply.repairApplyId}:post-verification`, redactions),
    sourceRepairApplyId: sanitizeText(input.repairApply.repairApplyId, redactions, 180),
    sourceRepairProposalId: sanitizeText(input.repairApply.proposalId, redactions, 180),
    sourceVerificationFailureId: sanitizeText(input.repairApply.sourceFailureId, redactions, 180),
    sourceVerificationId: sanitizeText(input.repairApply.sourceVerificationId, redactions, 180),
    originalFailureClass: sanitizeText(input.repairApply.originalFailureClass, redactions, 120),
    originalFailureStatus: "failed",
    repairApplyState: input.repairApply.repairApplyStatus,
    repairAuthorityState: input.repairApply.repairAuthorityStatus,
    verificationRequired: requirementStatus === "required",
    requirementStatus,
    verificationBlocker,
    taskRelevanceExpectation: input.taskRelevanceExpectation ??
      input.repairApply.taskRelevanceStatus,
    coverageExpectation: input.coverageExpectation ?? input.repairApply.coverageStatus,
    originalRuntimeReceiptIds: input.repairApply.runtimeReceiptIds.map((id) =>
      sanitizeText(id, redactions, 180)
    ),
    repairApplyReceiptIds: input.repairApply.applyReceiptIds.map((id) =>
      sanitizeText(id, redactions, 180)
    ),
    touchedTargetSummaries: input.repairApply.touchedTargetSummaries.map((target) =>
      sanitizeText(target, redactions, 180)
    ),
    originalFailurePreserved: true,
    repairApplyPreserved: true,
    redactionStatus:
      redactions.size > 0 || input.repairApply.redactionStatus === "redacted"
        ? "redacted"
        : "report-safe",
    notProvenClaims: unique([
      "terminal-success",
      "task-success",
      "verification-success",
      "repair-success",
      "post-repair-verification-required-is-not-run",
      "repair-applied-is-not-repair-success",
      "readback-is-not-post-repair-verification",
      "original-failure-preserved",
      ...input.repairApply.notProvenClaims,
      ...(input.notProvenClaims ?? []),
    ], redactions),
    terminalSuccessClaim: false,
  });
}

export function requestPostRepairVerification(input: {
  readonly requirement: PostRepairVerificationRequirementObservation;
  readonly selectedCommandSummary?: string;
  readonly dispatchStatus?: PostRepairVerificationDispatchStatus;
  readonly receiptIds?: readonly string[];
  readonly taskRelevanceStatus?: VerificationIntentRelevanceStatus;
  readonly coverageStatus?: VerificationCoverageObservationStatus;
  readonly notProvenClaims?: readonly string[];
}): PostRepairVerificationRequestObservation {
  const redactions = new Set<string>();
  const dispatchStatus = input.dispatchStatus ??
    (input.selectedCommandSummary ? "selected_not_run" : "not_run");
  return freeze({
    requestId: sanitizeId(`${input.requirement.requirementId}:request`, redactions),
    requirementId: sanitizeText(input.requirement.requirementId, redactions, 180),
    sourceRepairApplyId: sanitizeText(input.requirement.sourceRepairApplyId, redactions, 180),
    sourceRepairProposalId: sanitizeText(
      input.requirement.sourceRepairProposalId,
      redactions,
      180,
    ),
    sourceVerificationFailureId: sanitizeText(
      input.requirement.sourceVerificationFailureId,
      redactions,
      180,
    ),
    ...(input.selectedCommandSummary
      ? {
          selectedCommandSummary: sanitizeText(
            input.selectedCommandSummary,
            redactions,
            180,
          ),
        }
      : {}),
    selectedNotRun: dispatchStatus === "selected_not_run" ||
      (dispatchStatus === "not_run" && Boolean(input.selectedCommandSummary)),
    dispatchStatus,
    receiptIds: (input.receiptIds ?? []).map((id) => sanitizeText(id, redactions, 180)),
    taskRelevanceStatus: input.taskRelevanceStatus ??
      input.requirement.taskRelevanceExpectation,
    coverageStatus: input.coverageStatus ?? input.requirement.coverageExpectation,
    originalFailurePreserved: true,
    repairApplyPreserved: true,
    redactionStatus:
      redactions.size > 0 || input.requirement.redactionStatus === "redacted"
        ? "redacted"
        : "report-safe",
    notProvenClaims: unique([
      "terminal-success",
      "task-success",
      "verification-success",
      "repair-success",
      "selected-command-is-not-passed",
      "selected-not-run-is-not-success",
      "dispatched-is-not-passed",
      "exit-zero-is-not-task-success",
      "post-repair-verification-request-is-not-result",
      ...input.requirement.notProvenClaims,
      ...(input.notProvenClaims ?? []),
    ], redactions),
    terminalSuccessClaim: false,
  });
}

export function observePostRepairVerificationResult(input: {
  readonly requirement: PostRepairVerificationRequirementObservation;
  readonly request?: PostRepairVerificationRequestObservation;
  readonly status?: PostRepairVerificationResultStatus;
  readonly receipt?: ProductVerificationReceipt;
  readonly receiptIds?: readonly string[];
  readonly failureClass?: string;
  readonly taskRelevanceStatus?: VerificationIntentRelevanceStatus;
  readonly coverageStatus?: VerificationCoverageObservationStatus;
  readonly notProvenClaims?: readonly string[];
}): PostRepairVerificationResultObservation {
  const redactions = new Set<string>();
  const status = input.status ??
    postRepairStatusFromReceipt(input.receipt, input.request) ??
    "not_run";
  const receiptIds = input.receiptIds ?? input.receipt?.runtimeReceiptIds ?? [];
  const taskRelevanceStatus = input.taskRelevanceStatus ??
    relevanceFromReceipt(input.receipt) ??
    input.request?.taskRelevanceStatus ??
    input.requirement.taskRelevanceExpectation;
  const coverageStatus = input.coverageStatus ??
    coverageFromReceipt(input.receipt) ??
    input.request?.coverageStatus ??
    input.requirement.coverageExpectation;
  const resultId = sanitizeId(`${input.requirement.requirementId}:result`, redactions);
  const verdictCandidateInput = status === "passed"
    ? {
        candidateId: sanitizeId(`${resultId}:verdict-candidate`, redactions),
        sourcePostRepairVerificationResultId: resultId,
        sourceRepairApplyId: sanitizeText(input.requirement.sourceRepairApplyId, redactions, 180),
        sourceVerificationFailureId: sanitizeText(
          input.requirement.sourceVerificationFailureId,
          redactions,
          180,
        ),
        resultStatus: "passed" as const,
        taskRelevanceStatus,
        coverageStatus,
        originalFailurePreserved: true as const,
        repairApplyPreserved: true as const,
        terminalSuccessClaim: false as const,
      }
    : undefined;
  return freeze({
    resultId,
    ...(input.request
      ? { requestId: sanitizeText(input.request.requestId, redactions, 180) }
      : {}),
    requirementId: sanitizeText(input.requirement.requirementId, redactions, 180),
    sourceRepairApplyId: sanitizeText(input.requirement.sourceRepairApplyId, redactions, 180),
    sourceRepairProposalId: sanitizeText(
      input.requirement.sourceRepairProposalId,
      redactions,
      180,
    ),
    sourceVerificationFailureId: sanitizeText(
      input.requirement.sourceVerificationFailureId,
      redactions,
      180,
    ),
    sourceVerificationId: sanitizeText(input.requirement.sourceVerificationId, redactions, 180),
    originalFailureStatus: "failed",
    originalFailureClass: sanitizeText(input.requirement.originalFailureClass, redactions, 120),
    originalFailureSummary: "preserved from source verification failure",
    originalTaskRelevanceStatus: input.requirement.taskRelevanceExpectation,
    originalCoverageStatus: input.requirement.coverageExpectation,
    originalRuntimeReceiptIds: input.requirement.originalRuntimeReceiptIds.map((id) =>
      sanitizeText(id, redactions, 180)
    ),
    repairApplyState: input.requirement.repairApplyState,
    repairAuthorityState: input.requirement.repairAuthorityState,
    repairApplyReceiptIds: input.requirement.repairApplyReceiptIds.map((id) =>
      sanitizeText(id, redactions, 180)
    ),
    touchedTargetSummaries: input.requirement.touchedTargetSummaries.map((target) =>
      sanitizeText(target, redactions, 180)
    ),
    status,
    receiptIds: receiptIds.map((id) => sanitizeText(id, redactions, 180)),
    ...(input.failureClass ?? input.receipt?.failureClass
      ? {
          failureClass: sanitizeText(
            (input.failureClass ?? input.receipt?.failureClass)!,
            redactions,
            120,
          ),
        }
      : {}),
    taskRelevanceStatus,
    coverageStatus,
    ...(verdictCandidateInput ? { verdictCandidateInput } : {}),
    originalFailurePreserved: true,
    repairApplyPreserved: true,
    redactionStatus:
      redactions.size > 0 ||
        input.requirement.redactionStatus === "redacted" ||
        input.request?.redactionStatus === "redacted"
        ? "redacted"
        : "report-safe",
    notProvenClaims: unique([
      "terminal-success",
      "task-success",
      "verification-success",
      "repair-success",
      "repair-applied-is-not-repair-success",
      "exit-zero-is-not-task-success",
      "post-repair-verification-passed-is-verdict-input-only",
      "model-response-complete-is-not-task-success",
      "original-failure-preserved",
      ...input.requirement.notProvenClaims,
      ...(input.request?.notProvenClaims ?? []),
      ...(input.receipt?.notProvenClaims ?? []),
      ...(input.notProvenClaims ?? []),
    ], redactions),
    terminalSuccessClaim: false,
  });
}

function dispatchFromReceipt(
  receipt?: ProductVerificationReceipt,
): VerificationIntentDispatchStatus | undefined {
  if (!receipt) return undefined;
  if (receipt.dispatchStatus === "not-run" && receipt.selectedCommand) {
    return "selected_not_run";
  }
  if (receipt.dispatchStatus === "not-run") return "not_run";
  if (receipt.runtimeStatus === "success") return "passed";
  if (receipt.runtimeStatus === "failed") return "failed";
  if (receipt.runtimeStatus === "blocked") return "blocked";
  if (receipt.runtimeStatus === "timeout") return "timed_out";
  if (receipt.runtimeStatus === "skipped") return "skipped";
  if (receipt.runtimeStatus === "error" && receipt.failureClass === "command-unavailable") {
    return "unavailable";
  }
  if (receipt.runtimeStatus === "error") return "unsupported";
  return "dispatched";
}

function relevanceFromReceipt(
  receipt?: ProductVerificationReceipt,
): VerificationIntentRelevanceStatus | undefined {
  if (!receipt) return undefined;
  if (receipt.relevanceStatus === "relevant") return "task_relevant";
  if (receipt.relevanceStatus === "unrelated") return "unrelated";
  return "not_proven";
}

function coverageFromReceipt(
  receipt?: ProductVerificationReceipt,
): VerificationCoverageObservationStatus | undefined {
  if (!receipt) return undefined;
  if (receipt.coverageStatus === "covered") return "covered";
  if (receipt.coverageStatus === "partially-covered") return "partially_covered";
  return "uncovered";
}

function resultStatusFromReceipt(
  receipt: ProductVerificationReceipt | undefined,
  intent: VerificationLoopIntent,
): VerificationResultObservationStatus | undefined {
  if (!receipt) return undefined;
  if (intent.relevanceStatus === "unrelated") return "relevance_rejected";
  if (receipt.dispatchStatus === "not-run" && receipt.selectedCommand) {
    return "selected_not_run";
  }
  if (receipt.dispatchStatus === "not-run") return "not_run";
  if (receipt.runtimeStatus === "success") return "passed";
  if (receipt.runtimeStatus === "failed") return "failed";
  if (receipt.runtimeStatus === "blocked") return "blocked";
  if (receipt.runtimeStatus === "timeout") return "timed_out";
  if (receipt.runtimeStatus === "skipped") return "skipped";
  if (receipt.runtimeStatus === "error" && receipt.failureClass === "command-unavailable") {
    return "unavailable";
  }
  return "unsupported";
}

function requirementStatusFromRepairApply(
  repairApply: RepairApplyObservationLike,
): PostRepairVerificationRequirementStatus {
  if (repairApply.repairApplyStatus === "applied") return "required";
  if (
    repairApply.repairApplyStatus === "blocked" ||
    repairApply.repairApplyStatus === "authority_required"
  ) {
    return "blocked";
  }
  if (repairApply.repairApplyStatus === "unsupported") return "unavailable";
  if (repairApply.repairApplyStatus === "not_applied") return "not_required";
  return "not_proven";
}

function blockerFromRequirement(
  status: PostRepairVerificationRequirementStatus,
  repairApply: RepairApplyObservationLike,
): PostRepairVerificationBlocker {
  if (status === "required") return "none";
  if (repairApply.repairApplyStatus !== "applied") return "repair-not-applied";
  if (!repairApply.originalFailurePreserved) return "original-failure-missing";
  if (status === "unavailable") return "verification-unavailable";
  if (status === "blocked") return "unsupported";
  return "not-proven";
}

function postRepairStatusFromReceipt(
  receipt: ProductVerificationReceipt | undefined,
  request: PostRepairVerificationRequestObservation | undefined,
): PostRepairVerificationResultStatus | undefined {
  if (!receipt) {
    if (request?.dispatchStatus === "selected_not_run") return "selected_not_run";
    if (request?.dispatchStatus === "blocked") return "blocked";
    if (request?.dispatchStatus === "cancelled") return "cancelled";
    if (request?.dispatchStatus === "skipped") return "skipped";
    if (request?.dispatchStatus === "unavailable") return "unavailable";
    return undefined;
  }
  if (receipt.dispatchStatus === "not-run" && receipt.selectedCommand) {
    return "selected_not_run";
  }
  if (receipt.dispatchStatus === "not-run") return "not_run";
  if (receipt.runtimeStatus === "success") return "passed";
  if (receipt.runtimeStatus === "failed") return "failed";
  if (receipt.runtimeStatus === "blocked") return "blocked";
  if (receipt.runtimeStatus === "timeout") return "timed_out";
  if (receipt.runtimeStatus === "skipped") return "skipped";
  if (receipt.runtimeStatus === "error" && receipt.failureClass === "command-unavailable") {
    return "unavailable";
  }
  return "failed";
}

function summaryFromStatus(input: {
  readonly status: VerificationResultObservationStatus;
  readonly relevanceStatus: VerificationIntentRelevanceStatus;
  readonly coverageStatus: VerificationCoverageObservationStatus;
  readonly authorityRequirement: VerificationLoopIntent["authorityRequirement"];
  readonly runtimeReceiptCount: number;
  readonly repairEligible: boolean;
}): string {
  return [
    `status=${input.status}`,
    `relevance=${input.relevanceStatus}`,
    `coverage=${input.coverageStatus}`,
    `authority=${input.authorityRequirement}`,
    `runtimeReceipts=${input.runtimeReceiptCount}`,
    `repairEligible=${input.repairEligible ? "yes" : "no"}`,
    "terminalSuccessClaim=false",
  ].join("; ");
}

function unique(values: readonly string[], redactions: Set<string>): readonly string[] {
  return freeze(Array.from(new Set(values.map((value) => sanitizeText(value, redactions, 120)))).sort());
}

function sanitizeId(value: string, redactions: Set<string>): string {
  return sanitizeText(value, redactions, 180)
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sanitizeText(value: string, redactions: Set<string>, maxLength: number): string {
  let sanitized = value
    .replace(/\/home\/wang\/\.private-agents-real[^\s"'`]*/g, "[redacted-real-provider-home]")
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [redacted]")
    .replace(/\b(api[_-]?key|token|secret|cookie|authorization|password)\b\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .replace(/\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "[secret-redacted]")
    .replace(/\bprovider\.env\b[^\n\r]*/gi, "provider.env=[redacted]")
    .replace(/\boldText[:=][\s\S]*?(?=\snewText[:=]|$)/gi, "oldText=[raw-content-excluded]")
    .replace(/\bnewText[:=][^\n\r]*/gi, "newText=[raw-content-excluded]")
    .replace(/\braw provider output[:=][^\n\r]*/gi, "raw-provider-output=[raw-content-excluded]")
    .replace(/\bhidden reasoning[:=]?[^\n\r]*/gi, "hidden-reasoning=[raw-content-excluded]")
    .replace(/<html[\s\S]*?<\/html>/gi, "[raw-content-excluded]")
    .replace(/\s+/g, " ")
    .trim();
  if (sanitized !== value.trim()) {
    redactions.add("unsafe-content");
  }
  if (sanitized.length > maxLength) {
    sanitized = `${sanitized.slice(0, maxLength)}...`;
    redactions.add("truncated");
  }
  return sanitized;
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      freeze(child);
    }
  }
  return value;
}
