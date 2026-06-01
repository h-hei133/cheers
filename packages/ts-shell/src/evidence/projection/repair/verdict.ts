import type { PostRepairVerificationResultObservation } from "../../../verification/result/boundary.js";

export type RepairVerdictProofInputStatus =
  | "complete"
  | "incomplete"
  | "blocked"
  | "failed"
  | "not_proven";

export type RepairVerdictMissingProofItem =
  | "original-failure"
  | "repair-proposal"
  | "repair-authority"
  | "repair-apply"
  | "post-repair-verification"
  | "post-repair-relevance"
  | "post-repair-coverage"
  | "original-receipt"
  | "repair-apply-receipt"
  | "post-repair-receipt";

export interface RepairVerdictProofInput {
  readonly proofInputId: string;
  readonly verdictCandidateId?: string;
  readonly sourcePostRepairVerificationResultId: string;
  readonly originalVerificationFailureId: string;
  readonly originalFailureClass: string;
  readonly originalFailureStatus: "failed";
  readonly originalReceiptIds: readonly string[];
  readonly repairProposalId: string;
  readonly repairAuthorityState: string;
  readonly repairApplyState: string;
  readonly repairTouchedTargetSummaries: readonly string[];
  readonly repairApplyReceiptIds: readonly string[];
  readonly postRepairVerificationState: string;
  readonly postRepairRelevanceStatus: string;
  readonly postRepairCoverageStatus: string;
  readonly postRepairReceiptIds: readonly string[];
  readonly missingProofItems: readonly RepairVerdictMissingProofItem[];
  readonly proofStatus: RepairVerdictProofInputStatus;
  readonly originalFailurePreserved: true;
  readonly repairApplyPreserved: true;
  readonly evidenceInputOnly: true;
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export function buildRepairVerdictProofInput(input: {
  readonly postRepairVerification: PostRepairVerificationResultObservation;
  readonly notProvenClaims?: readonly string[];
}): RepairVerdictProofInput {
  const verification = input.postRepairVerification;
  const missingProofItems = missingProofItemsFor(verification);
  return deepFreeze({
    proofInputId: `${verification.resultId}:evidence-proof`,
    verdictCandidateId: verification.verdictCandidateInput?.candidateId,
    sourcePostRepairVerificationResultId: verification.resultId,
    originalVerificationFailureId: verification.sourceVerificationFailureId,
    originalFailureClass: verification.originalFailureClass,
    originalFailureStatus: verification.originalFailureStatus,
    originalReceiptIds: [...verification.originalRuntimeReceiptIds],
    repairProposalId: verification.sourceRepairProposalId,
    repairAuthorityState: verification.repairAuthorityState,
    repairApplyState: verification.repairApplyState,
    repairTouchedTargetSummaries: [...verification.touchedTargetSummaries],
    repairApplyReceiptIds: [...verification.repairApplyReceiptIds],
    postRepairVerificationState: verification.status,
    postRepairRelevanceStatus: verification.taskRelevanceStatus,
    postRepairCoverageStatus: verification.coverageStatus,
    postRepairReceiptIds: [...verification.receiptIds],
    missingProofItems,
    proofStatus: proofStatusFor(verification.status, missingProofItems),
    originalFailurePreserved: true,
    repairApplyPreserved: true,
    evidenceInputOnly: true,
    notProvenClaims: unique([
      "verdict-candidate-is-not-terminal-result",
      "evidence-input-is-not-terminal-result",
      "post-repair-verification-passed-alone-is-not-terminal-result",
      "repair-applied-alone-is-not-repair-success",
      "rendered-output-is-not-success",
      ...verification.notProvenClaims,
      ...(input.notProvenClaims ?? []),
    ]),
    terminalSuccessClaim: false,
  });
}

function missingProofItemsFor(
  verification: PostRepairVerificationResultObservation,
): readonly RepairVerdictMissingProofItem[] {
  const missing: RepairVerdictMissingProofItem[] = [];
  if (!verification.originalFailurePreserved) missing.push("original-failure");
  if (!verification.sourceRepairProposalId) missing.push("repair-proposal");
  if (verification.repairAuthorityState !== "granted") missing.push("repair-authority");
  if (verification.repairApplyState !== "applied") missing.push("repair-apply");
  if (verification.status !== "passed") missing.push("post-repair-verification");
  if (verification.taskRelevanceStatus !== "task_relevant") {
    missing.push("post-repair-relevance");
  }
  if (verification.coverageStatus !== "covered") missing.push("post-repair-coverage");
  if (verification.originalRuntimeReceiptIds.length === 0) missing.push("original-receipt");
  if (verification.repairApplyReceiptIds.length === 0) missing.push("repair-apply-receipt");
  if (verification.receiptIds.length === 0) missing.push("post-repair-receipt");
  return deepFreeze(missing);
}

function proofStatusFor(
  verificationStatus: PostRepairVerificationResultObservation["status"],
  missingProofItems: readonly RepairVerdictMissingProofItem[],
): RepairVerdictProofInputStatus {
  if (missingProofItems.length === 0) return "complete";
  if (verificationStatus === "blocked" || verificationStatus === "unavailable") return "blocked";
  if (
    verificationStatus === "failed" ||
    verificationStatus === "timed_out" ||
    verificationStatus === "cancelled"
  ) {
    return "failed";
  }
  if (verificationStatus === "not_run" || verificationStatus === "selected_not_run") {
    return "not_proven";
  }
  return "incomplete";
}

function unique(values: readonly string[]): readonly string[] {
  return deepFreeze(Array.from(new Set(values)).sort());
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}
