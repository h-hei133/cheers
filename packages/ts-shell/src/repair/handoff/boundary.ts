import type { VerificationResultObservation } from "../../verification/result/boundary.js";
import type { ProductRepairIterationProjection } from "../iteration/projection.js";

export type RepairabilityStatus =
  | "repair_required"
  | "repair_possible"
  | "repair_not_available"
  | "unsupported"
  | "not_proven";

export type RepairProposalSource =
  | "deterministic_from_failure_evidence"
  | "deterministic_from_product_read_evidence"
  | "existing_repair_owner_projection"
  | "fake_default_safe"
  | "unavailable";

export type RepairApplyObservationStatus =
  | "not_applied"
  | "authority_required"
  | "applied"
  | "failed"
  | "blocked"
  | "unsupported"
  | "not_proven";

export type PostRepairVerificationObservationStatus =
  | "not_run"
  | "passed"
  | "failed"
  | "blocked"
  | "unsupported"
  | "not_proven";

export type RepairBlocker =
  | "none"
  | "verification-not-failed"
  | "task-relevance-not-proven"
  | "coverage-not-proven"
  | "missing-authority"
  | "repair-not-eligible"
  | "unsupported-failure-class"
  | "unsafe-failure-class"
  | "not-proven";

export type RepairRisk = "low" | "medium" | "high" | "unknown";

export type RepairAuthorityDecision =
  | "required"
  | "missing"
  | "granted"
  | "denied"
  | "blocked"
  | "not_proven";

export type RepairAuthoritySource =
  | "explicit_repair_authority"
  | "edit_owner"
  | "prompt_text_only"
  | "none"
  | "unknown";

export type RepairApplyReadiness = "ready" | "blocked" | "not_ready" | "not_proven";

export type RepairApplyBlocker =
  | "none"
  | "authority-missing"
  | "authority-denied"
  | "authority-blocked"
  | "proposal-not-ready"
  | "proposal-unsupported"
  | "edit-owner-not-supplied"
  | "not-proven";

export type RepairExpectedEditOperationKind =
  | "single_target"
  | "target_set"
  | "hunk_set"
  | "unknown";

export interface RepairRequiredHandoff {
  readonly handoffId: string;
  readonly sourceVerificationId: string;
  readonly failureClass: string;
  readonly originalFailureSummary: string;
  readonly originalFailurePreserved: true;
  readonly taskRelevanceStatus: VerificationResultObservation["relevanceStatus"];
  readonly coverageStatus: VerificationResultObservation["coverageStatus"];
  readonly authorityState: VerificationResultObservation["authorityRequirement"];
  readonly runtimeReceiptIds: readonly string[];
  readonly repairEligible: boolean;
  readonly repairabilityStatus: RepairabilityStatus;
  readonly repairBlocker: RepairBlocker;
  readonly repairRisk: RepairRisk;
  readonly suggestedRepairMode: "proposal_only" | "existing_owner" | "unsupported" | "unknown";
  readonly authorityRequirement: "required" | "not_required" | "unknown";
  readonly redactionStatus: "report-safe" | "redacted";
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface RepairProposalObservation {
  readonly proposalId: string;
  readonly sourceFailureId: string;
  readonly proposalSource: RepairProposalSource;
  readonly targetSummary: string;
  readonly sourceVerificationId: string;
  readonly originalFailureClass: string;
  readonly originalFailureSummary: string;
  readonly taskRelevanceStatus: RepairRequiredHandoff["taskRelevanceStatus"];
  readonly coverageStatus: RepairRequiredHandoff["coverageStatus"];
  readonly runtimeReceiptIds: readonly string[];
  readonly readinessStatus: "exact_ready" | "partial" | "not_ready" | "unknown";
  readonly proposalRisk: RepairRisk;
  readonly authorityRequirement: "required" | "not_required" | "unknown";
  readonly applyStatus: RepairApplyObservationStatus;
  readonly postRepairVerificationStatus: PostRepairVerificationObservationStatus;
  readonly redactionStatus: "report-safe" | "redacted";
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface RepairAuthorityObservation {
  readonly authorityId: string;
  readonly proposalId: string;
  readonly sourceFailureId: string;
  readonly sourceVerificationId: string;
  readonly authorityRequired: boolean;
  readonly authorityDecision: RepairAuthorityDecision;
  readonly authoritySource: RepairAuthoritySource;
  readonly authorityMissingReason: string;
  readonly authorityRisk: RepairRisk;
  readonly originalFailureClass: string;
  readonly originalFailureSummary: string;
  readonly taskRelevanceStatus: RepairProposalObservation["taskRelevanceStatus"];
  readonly coverageStatus: RepairProposalObservation["coverageStatus"];
  readonly runtimeReceiptIds: readonly string[];
  readonly redactionStatus: "report-safe" | "redacted";
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface RepairApplyRequestObservation {
  readonly requestId: string;
  readonly proposalId: string;
  readonly sourceFailureId: string;
  readonly sourceVerificationId: string;
  readonly targetSummary: string;
  readonly expectedEditOperationKind: RepairExpectedEditOperationKind;
  readonly authorityState: RepairAuthorityDecision;
  readonly authoritySource: RepairAuthoritySource;
  readonly applyReadiness: RepairApplyReadiness;
  readonly applyBlocker: RepairApplyBlocker;
  readonly risk: RepairRisk;
  readonly originalFailureClass: string;
  readonly originalFailureSummary: string;
  readonly taskRelevanceStatus: RepairProposalObservation["taskRelevanceStatus"];
  readonly coverageStatus: RepairProposalObservation["coverageStatus"];
  readonly runtimeReceiptIds: readonly string[];
  readonly postRepairVerificationStatus: "not_run";
  readonly redactionStatus: "report-safe" | "redacted";
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface RepairApplyObservation {
  readonly repairApplyId: string;
  readonly proposalId: string;
  readonly sourceFailureId: string;
  readonly sourceVerificationId: string;
  readonly targetSummary: string;
  readonly authorityState: RepairAuthorityDecision;
  readonly authoritySource: RepairAuthoritySource;
  readonly applyReadiness: RepairApplyReadiness;
  readonly applyBlocker: RepairApplyBlocker;
  readonly applyAttempted: boolean;
  readonly repairApplyStatus: RepairApplyObservationStatus;
  readonly repairAuthorityStatus: "required" | "granted" | "denied" | "not_required" | "unknown";
  readonly applyReceiptIds: readonly string[];
  readonly touchedTargetSummaries: readonly string[];
  readonly postRepairVerificationStatus: PostRepairVerificationObservationStatus;
  readonly originalFailureClass: string;
  readonly originalFailureSummary: string;
  readonly taskRelevanceStatus: RepairProposalObservation["taskRelevanceStatus"];
  readonly coverageStatus: RepairProposalObservation["coverageStatus"];
  readonly runtimeReceiptIds: readonly string[];
  readonly originalFailurePreserved: true;
  readonly redactionStatus: "report-safe" | "redacted";
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface EditOwnerApplyObservationInput {
  readonly status: string;
  readonly changedFiles?: readonly string[];
  readonly evidence?: readonly string[];
  readonly transcriptSummary?: string;
}

export function projectRepairRequiredHandoff(input: {
  readonly verification: VerificationResultObservation;
  readonly repairabilityStatus?: RepairabilityStatus;
  readonly repairBlocker?: RepairBlocker;
  readonly repairRisk?: RepairRisk;
  readonly suggestedRepairMode?: RepairRequiredHandoff["suggestedRepairMode"];
  readonly authorityRequirement?: RepairRequiredHandoff["authorityRequirement"];
  readonly notProvenClaims?: readonly string[];
}): RepairRequiredHandoff {
  const redactions = new Set<string>();
  const repairBlocker = input.repairBlocker ?? repairBlockerFromVerification(input.verification);
  return freeze({
    handoffId: sanitizeId(`${input.verification.verificationId}:repair-required`, redactions),
    sourceVerificationId: sanitizeText(input.verification.verificationId, redactions, 180),
    failureClass: sanitizeText(input.verification.failureClass ?? "verification-failed", redactions, 120),
    originalFailureSummary: sanitizeText(input.verification.safeSummary, redactions, 180),
    originalFailurePreserved: true,
    taskRelevanceStatus: input.verification.relevanceStatus,
    coverageStatus: input.verification.coverageStatus,
    authorityState: input.verification.authorityRequirement,
    runtimeReceiptIds: input.verification.runtimeReceiptIds.map((id) =>
      sanitizeText(id, redactions, 180)
    ),
    repairEligible: input.verification.repairEligible,
    repairabilityStatus: input.repairabilityStatus ??
      repairabilityStatusFromBlocker(input.verification, repairBlocker),
    repairBlocker,
    repairRisk: input.repairRisk ?? repairRiskFromVerification(input.verification, repairBlocker),
    suggestedRepairMode: input.suggestedRepairMode ?? "proposal_only",
    authorityRequirement: input.authorityRequirement ?? "required",
    redactionStatus:
      redactions.size > 0 || input.verification.redactionStatus === "redacted"
        ? "redacted"
        : "report-safe",
    notProvenClaims: unique([
      "terminal-success",
      "task-success",
      "repair-success",
      "verification-success",
      "repair-required-is-not-success",
      "original-failure-preserved",
      "repair-eligible-is-not-success",
      ...(input.verification.notProvenClaims ?? []),
      ...(input.notProvenClaims ?? []),
    ], redactions),
    terminalSuccessClaim: false,
  });
}

export function observeRepairProposal(input: {
  readonly handoff: RepairRequiredHandoff;
  readonly proposalSource?: RepairProposalSource;
  readonly targetSummary?: string;
  readonly readinessStatus?: RepairProposalObservation["readinessStatus"];
  readonly proposalRisk?: RepairRisk;
  readonly authorityRequirement?: RepairProposalObservation["authorityRequirement"];
  readonly applyStatus?: RepairApplyObservationStatus;
  readonly postRepairVerificationStatus?: PostRepairVerificationObservationStatus;
  readonly repairIteration?: ProductRepairIterationProjection;
  readonly notProvenClaims?: readonly string[];
}): RepairProposalObservation {
  const redactions = new Set<string>();
  const targetSummary = input.targetSummary ??
    (input.repairIteration?.changedFiles.length
      ? `changedFiles=${input.repairIteration.changedFiles.length}`
      : "proposal target not available");
  return freeze({
    proposalId: sanitizeId(`${input.handoff.handoffId}:proposal`, redactions),
    sourceFailureId: sanitizeText(input.handoff.handoffId, redactions, 180),
    proposalSource: input.proposalSource ??
      (input.repairIteration ? "existing_repair_owner_projection" : "unavailable"),
    targetSummary: sanitizeText(targetSummary, redactions, 180),
    sourceVerificationId: sanitizeText(input.handoff.sourceVerificationId, redactions, 180),
    originalFailureClass: sanitizeText(input.handoff.failureClass, redactions, 120),
    originalFailureSummary: sanitizeText(input.handoff.originalFailureSummary, redactions, 180),
    taskRelevanceStatus: input.handoff.taskRelevanceStatus,
    coverageStatus: input.handoff.coverageStatus,
    runtimeReceiptIds: input.handoff.runtimeReceiptIds.map((id) =>
      sanitizeText(id, redactions, 180)
    ),
    readinessStatus: input.readinessStatus ?? "unknown",
    proposalRisk: input.proposalRisk ?? input.handoff.repairRisk,
    authorityRequirement: input.authorityRequirement ?? input.handoff.authorityRequirement,
    applyStatus: input.applyStatus ?? applyStatusFromIteration(input.repairIteration),
    postRepairVerificationStatus: input.postRepairVerificationStatus ??
      postRepairStatusFromIteration(input.repairIteration),
    redactionStatus:
      redactions.size > 0 || input.handoff.redactionStatus === "redacted"
        ? "redacted"
        : "report-safe",
    notProvenClaims: unique([
      "terminal-success",
      "task-success",
      "repair-success",
      "repair-proposal-is-not-success",
      "repair-continuation-is-not-success",
      "proposal-ready-is-not-authority",
      "repair-proposal-is-not-apply",
      "repair-apply-not-run-is-not-success",
      "post-repair-verification-not-run-is-not-success",
      "original-failure-preserved",
      ...(input.handoff.notProvenClaims ?? []),
      ...(input.repairIteration?.notProvenClaims ?? []),
      ...(input.notProvenClaims ?? []),
    ], redactions),
    terminalSuccessClaim: false,
  });
}

export function observeRepairAuthority(input: {
  readonly proposal: RepairProposalObservation;
  readonly authorityDecision?: RepairAuthorityDecision;
  readonly authoritySource?: RepairAuthoritySource;
  readonly authorityMissingReason?: string;
  readonly authorityRisk?: RepairRisk;
  readonly notProvenClaims?: readonly string[];
}): RepairAuthorityObservation {
  const redactions = new Set<string>();
  const authoritySource = input.authoritySource ?? "none";
  const authorityDecision = normalizeAuthorityDecision({
    required: input.proposal.authorityRequirement === "required",
    decision: input.authorityDecision,
    source: authoritySource,
  });
  return freeze({
    authorityId: sanitizeId(`${input.proposal.proposalId}:authority`, redactions),
    proposalId: sanitizeText(input.proposal.proposalId, redactions, 180),
    sourceFailureId: sanitizeText(input.proposal.sourceFailureId, redactions, 180),
    sourceVerificationId: sanitizeText(input.proposal.sourceVerificationId, redactions, 180),
    authorityRequired: input.proposal.authorityRequirement === "required",
    authorityDecision,
    authoritySource,
    authorityMissingReason: sanitizeText(
      input.authorityMissingReason ??
        authorityMissingReason(authorityDecision, authoritySource),
      redactions,
      180,
    ),
    authorityRisk: input.authorityRisk ?? input.proposal.proposalRisk,
    originalFailureClass: sanitizeText(input.proposal.originalFailureClass, redactions, 120),
    originalFailureSummary: sanitizeText(input.proposal.originalFailureSummary, redactions, 180),
    taskRelevanceStatus: input.proposal.taskRelevanceStatus,
    coverageStatus: input.proposal.coverageStatus,
    runtimeReceiptIds: input.proposal.runtimeReceiptIds.map((id) =>
      sanitizeText(id, redactions, 180)
    ),
    redactionStatus:
      redactions.size > 0 || input.proposal.redactionStatus === "redacted"
        ? "redacted"
        : "report-safe",
    notProvenClaims: unique([
      "terminal-success",
      "task-success",
      "repair-success",
      "repair-authority-is-not-apply",
      "authority-requested-is-not-granted",
      "authority-granted-is-not-apply",
      "prompt-text-alone-is-not-repair-authority",
      "original-failure-preserved",
      ...(input.proposal.notProvenClaims ?? []),
      ...(input.notProvenClaims ?? []),
    ], redactions),
    terminalSuccessClaim: false,
  });
}

export function createRepairApplyRequest(input: {
  readonly proposal: RepairProposalObservation;
  readonly authority: RepairAuthorityObservation;
  readonly expectedEditOperationKind?: RepairExpectedEditOperationKind;
  readonly applyReadiness?: RepairApplyReadiness;
  readonly applyBlocker?: RepairApplyBlocker;
  readonly risk?: RepairRisk;
  readonly notProvenClaims?: readonly string[];
}): RepairApplyRequestObservation {
  const redactions = new Set<string>();
  const applyBlocker = input.applyBlocker ??
    applyBlockerFromProposalAndAuthority(input.proposal, input.authority);
  return freeze({
    requestId: sanitizeId(`${input.proposal.proposalId}:apply-request`, redactions),
    proposalId: sanitizeText(input.proposal.proposalId, redactions, 180),
    sourceFailureId: sanitizeText(input.proposal.sourceFailureId, redactions, 180),
    sourceVerificationId: sanitizeText(input.proposal.sourceVerificationId, redactions, 180),
    targetSummary: sanitizeText(input.proposal.targetSummary, redactions, 180),
    expectedEditOperationKind: input.expectedEditOperationKind ?? "unknown",
    authorityState: input.authority.authorityDecision,
    authoritySource: input.authority.authoritySource,
    applyReadiness: input.applyReadiness ??
      (applyBlocker === "none" ? "ready" : "blocked"),
    applyBlocker,
    risk: input.risk ?? input.proposal.proposalRisk,
    originalFailureClass: sanitizeText(input.proposal.originalFailureClass, redactions, 120),
    originalFailureSummary: sanitizeText(input.proposal.originalFailureSummary, redactions, 180),
    taskRelevanceStatus: input.proposal.taskRelevanceStatus,
    coverageStatus: input.proposal.coverageStatus,
    runtimeReceiptIds: input.proposal.runtimeReceiptIds.map((id) =>
      sanitizeText(id, redactions, 180)
    ),
    postRepairVerificationStatus: "not_run",
    redactionStatus:
      redactions.size > 0 ||
        input.proposal.redactionStatus === "redacted" ||
        input.authority.redactionStatus === "redacted"
        ? "redacted"
        : "report-safe",
    notProvenClaims: unique([
      "terminal-success",
      "task-success",
      "repair-success",
      "apply-request-is-not-apply-attempted",
      "authority-granted-is-not-apply",
      "repair-proposal-is-not-apply",
      "post-repair-verification-not-run-is-not-success",
      "original-failure-preserved",
      ...(input.proposal.notProvenClaims ?? []),
      ...(input.authority.notProvenClaims ?? []),
      ...(input.notProvenClaims ?? []),
    ], redactions),
    terminalSuccessClaim: false,
  });
}

function repairBlockerFromVerification(
  verification: VerificationResultObservation,
): RepairBlocker {
  if (verification.status !== "failed") return "verification-not-failed";
  if (
    verification.authorityRequirement === "required" ||
    verification.authorityRequirement === "unknown"
  ) {
    return "missing-authority";
  }
  if (
    verification.relevanceStatus !== "task_relevant" &&
    verification.relevanceStatus !== "probably_relevant"
  ) {
    return "task-relevance-not-proven";
  }
  if (
    verification.coverageStatus !== "covered" &&
    verification.coverageStatus !== "partially_covered"
  ) {
    return "coverage-not-proven";
  }
  if (verification.failureClass === "command-blocked-by-policy") {
    return "unsafe-failure-class";
  }
  if (
    verification.failureClass === "environment-failed" ||
    verification.failureClass === "invalid-runtime-receipt" ||
    verification.failureClass === "no-verification-command" ||
    verification.failureClass === "command-unavailable"
  ) {
    return "unsupported-failure-class";
  }
  if (!verification.repairEligible) return "repair-not-eligible";
  return "none";
}

function repairabilityStatusFromBlocker(
  verification: VerificationResultObservation,
  blocker: RepairBlocker,
): RepairabilityStatus {
  if (blocker === "none") return "repair_required";
  if (blocker === "verification-not-failed") return "not_proven";
  if (blocker === "repair-not-eligible" || blocker === "unsupported-failure-class") {
    return "unsupported";
  }
  if (blocker === "unsafe-failure-class") return "repair_not_available";
  if (verification.status === "failed") return "repair_possible";
  return "not_proven";
}

function repairRiskFromVerification(
  verification: VerificationResultObservation,
  blocker: RepairBlocker,
): RepairRisk {
  if (blocker === "unsafe-failure-class") return "high";
  if (blocker === "unsupported-failure-class" || blocker === "repair-not-eligible") {
    return "medium";
  }
  if (
    verification.relevanceStatus === "task_relevant" &&
    verification.coverageStatus === "covered" &&
    verification.repairEligible
  ) {
    return "low";
  }
  return "unknown";
}

export function observeRepairApply(input: {
  readonly proposal: RepairProposalObservation;
  readonly authority?: RepairAuthorityObservation;
  readonly request?: RepairApplyRequestObservation;
  readonly repairApplyStatus?: RepairApplyObservationStatus;
  readonly repairAuthorityStatus?: RepairApplyObservation["repairAuthorityStatus"];
  readonly applyReceiptIds?: readonly string[];
  readonly touchedTargetSummaries?: readonly string[];
  readonly postRepairVerificationStatus?: PostRepairVerificationObservationStatus;
  readonly editApplyObservation?: EditOwnerApplyObservationInput;
  readonly repairIteration?: ProductRepairIterationProjection;
  readonly notProvenClaims?: readonly string[];
}): RepairApplyObservation {
  const redactions = new Set<string>();
  const repairApplyStatus = input.repairApplyStatus ??
    applyStatusFromEditOwner(input.editApplyObservation) ??
    applyStatusFromIteration(input.repairIteration);
  const postRepairVerificationStatus = input.postRepairVerificationStatus ??
    postRepairStatusFromIteration(input.repairIteration);
  const authorityState = input.request?.authorityState ??
    input.authority?.authorityDecision ??
    "not_proven";
  const applyBlocker = input.request?.applyBlocker ??
    applyBlockerFromAuthorityDecision(authorityState);
  const touchedTargetSummaries = input.touchedTargetSummaries ??
    input.editApplyObservation?.changedFiles ??
    input.repairIteration?.changedFiles ??
    [];
  return freeze({
    repairApplyId: sanitizeId(`${input.proposal.proposalId}:apply`, redactions),
    proposalId: sanitizeText(input.proposal.proposalId, redactions, 180),
    sourceFailureId: sanitizeText(input.proposal.sourceFailureId, redactions, 180),
    sourceVerificationId: sanitizeText(input.proposal.sourceVerificationId, redactions, 180),
    targetSummary: sanitizeText(input.request?.targetSummary ?? input.proposal.targetSummary, redactions, 180),
    authorityState,
    authoritySource: input.request?.authoritySource ?? input.authority?.authoritySource ?? "unknown",
    applyReadiness: input.request?.applyReadiness ??
      (repairApplyStatus === "not_applied" ? "not_ready" : "not_proven"),
    applyBlocker,
    applyAttempted: repairApplyStatus === "applied" || repairApplyStatus === "failed",
    repairApplyStatus,
    repairAuthorityStatus: input.repairAuthorityStatus ??
      repairAuthorityStatusFromAuthority(authorityState, repairApplyStatus),
    applyReceiptIds: (input.applyReceiptIds ?? receiptIdsFromEditOwner(input.editApplyObservation))
      .map((id) => sanitizeText(id, redactions, 180)),
    touchedTargetSummaries: touchedTargetSummaries.map((target) =>
      sanitizeText(target, redactions, 180)
    ),
    postRepairVerificationStatus,
    originalFailureClass: sanitizeText(input.proposal.originalFailureClass, redactions, 120),
    originalFailureSummary: sanitizeText(input.proposal.originalFailureSummary, redactions, 180),
    taskRelevanceStatus: input.proposal.taskRelevanceStatus,
    coverageStatus: input.proposal.coverageStatus,
    runtimeReceiptIds: input.proposal.runtimeReceiptIds.map((id) =>
      sanitizeText(id, redactions, 180)
    ),
    originalFailurePreserved: true,
    redactionStatus:
      redactions.size > 0 || input.proposal.redactionStatus === "redacted"
        ? "redacted"
        : "report-safe",
    notProvenClaims: unique([
      "terminal-success",
      "task-success",
      "repair-success",
      "verification-success",
      "repair-proposal-is-not-apply",
      "authority-requested-is-not-granted",
      "authority-granted-is-not-apply",
      "apply-request-is-not-apply-attempted",
      "apply-attempted-is-not-success",
      "apply-applied-is-not-repair-success",
      "readback-is-not-post-repair-verification",
      "repair-apply-without-post-repair-verification-is-not-success",
      "post-repair-verification-observed-is-not-terminal-success",
      "post-repair-verification-not-run-is-not-success",
      "original-failure-preserved",
      ...(input.authority?.notProvenClaims ?? []),
      ...(input.request?.notProvenClaims ?? []),
      ...(input.editApplyObservation?.evidence ?? []),
      ...(input.repairIteration?.notProvenClaims ?? []),
      ...(input.notProvenClaims ?? []),
    ], redactions),
    terminalSuccessClaim: false,
  });
}

function normalizeAuthorityDecision(input: {
  readonly required: boolean;
  readonly decision?: RepairAuthorityDecision;
  readonly source: RepairAuthoritySource;
}): RepairAuthorityDecision {
  if (input.source === "prompt_text_only" && input.decision === "granted") {
    return "blocked";
  }
  if (input.decision) return input.decision;
  if (input.required) return "missing";
  return "not_proven";
}

function authorityMissingReason(
  decision: RepairAuthorityDecision,
  source: RepairAuthoritySource,
): string {
  if (source === "prompt_text_only") return "prompt text alone is not repair authority";
  if (decision === "missing") return "explicit repair authority is missing";
  if (decision === "denied") return "explicit repair authority was denied";
  if (decision === "blocked") return "repair authority is blocked";
  if (decision === "required") return "repair authority is required";
  if (decision === "not_proven") return "repair authority is not proven";
  return "none";
}

function applyBlockerFromProposalAndAuthority(
  proposal: RepairProposalObservation,
  authority: RepairAuthorityObservation,
): RepairApplyBlocker {
  if (proposal.readinessStatus !== "exact_ready") return "proposal-not-ready";
  return applyBlockerFromAuthorityDecision(authority.authorityDecision);
}

function applyBlockerFromAuthorityDecision(
  decision: RepairAuthorityDecision,
): RepairApplyBlocker {
  if (decision === "granted") return "none";
  if (decision === "denied") return "authority-denied";
  if (decision === "blocked") return "authority-blocked";
  if (decision === "missing" || decision === "required") return "authority-missing";
  return "not-proven";
}

function repairAuthorityStatusFromAuthority(
  decision: RepairAuthorityDecision,
  applyStatus: RepairApplyObservationStatus,
): RepairApplyObservation["repairAuthorityStatus"] {
  if (decision === "granted") return "granted";
  if (decision === "denied") return "denied";
  if (decision === "missing" || decision === "required" || applyStatus === "authority_required") {
    return "required";
  }
  return "unknown";
}

function applyStatusFromEditOwner(
  observation?: EditOwnerApplyObservationInput,
): RepairApplyObservationStatus | undefined {
  if (!observation) return undefined;
  if (
    observation.status === "hunk-set-applied" ||
    observation.status === "single-target-applied" ||
    observation.status === "target-set-applied"
  ) {
    return "applied";
  }
  if (observation.status.includes("failed") || observation.status.includes("partial-failure")) {
    return "failed";
  }
  if (
    observation.status.includes("stopped") ||
    observation.status === "unconfirmed-no-write" ||
    observation.status === "invalid-selection"
  ) {
    return "blocked";
  }
  if (observation.status === "unsupported-for-apply") return "unsupported";
  return "not_proven";
}

function receiptIdsFromEditOwner(
  observation?: EditOwnerApplyObservationInput,
): readonly string[] {
  return (observation?.evidence ?? []).filter((item) =>
    item.includes("receipt:") || item.includes("receipt-")
  );
}

function applyStatusFromIteration(
  iteration?: ProductRepairIterationProjection,
): RepairApplyObservationStatus {
  if (!iteration) return "not_applied";
  if (
    iteration.applyStatus === "hunk-set-applied" ||
    iteration.applyStatus === "single-target-applied" ||
    iteration.applyStatus === "target-set-applied"
  ) {
    return "applied";
  }
  if (iteration.applyStatus.includes("blocked")) return "blocked";
  if (iteration.applyStatus.includes("failed")) return "failed";
  return "not_proven";
}

function postRepairStatusFromIteration(
  iteration?: ProductRepairIterationProjection,
): PostRepairVerificationObservationStatus {
  if (!iteration) return "not_run";
  if (iteration.postRepairVerificationStatus === "passed") return "passed";
  if (iteration.postRepairVerificationStatus === "failed") return "failed";
  if (iteration.postRepairVerificationStatus === "blocked") return "blocked";
  return "not_proven";
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
