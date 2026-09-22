import { freezeDeep } from "../../core/values/freeze.js";
import type { RepairVerdictProofInput } from "../../evidence/projection/repair/verdict.js";
import type { RepairVerdictTerminalProjection } from "../../result/projection/repair/verdict.js";
import type {
  PostRepairVerificationRequestObservation,
  PostRepairVerificationRequirementObservation,
  PostRepairVerificationResultObservation,
  VerificationResultObservation,
} from "../../verification/result/boundary.js";
import type {
  RepairApplyObservation,
  RepairApplyRequestObservation,
  RepairAuthorityObservation,
  RepairProposalObservation,
  RepairRequiredHandoff,
} from "./boundary.js";

export type RepairReadinessStatus =
  | "not_proven"
  | "repair_required"
  | "awaiting_proposal"
  | "awaiting_authority"
  | "ready_to_apply"
  | "awaiting_post_repair_verification"
  | "ready_for_verdict"
  | "verdict_projected"
  | "blocked";

export interface RepairReadinessProjection {
  readonly readinessId: string;
  readonly status: RepairReadinessStatus;
  readonly sourceVerificationId?: string;
  readonly repairRequiredFact?: string;
  readonly repairProposalFact?: string;
  readonly explicitAuthorityFact?: string;
  readonly applyAttemptFact?: string;
  readonly postRepairVerificationFact?: string;
  readonly verdictFact?: string;
  readonly nextAction: string;
  readonly missingProofItems: readonly string[];
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export function projectRepairReadiness(input: {
  readonly verification?: VerificationResultObservation;
  readonly repairRequired?: RepairRequiredHandoff;
  readonly repairProposal?: RepairProposalObservation;
  readonly repairAuthority?: RepairAuthorityObservation;
  readonly repairApplyRequest?: RepairApplyRequestObservation;
  readonly repairApply?: RepairApplyObservation;
  readonly postRepairVerificationRequirement?: PostRepairVerificationRequirementObservation;
  readonly postRepairVerificationRequest?: PostRepairVerificationRequestObservation;
  readonly postRepairVerificationResult?: PostRepairVerificationResultObservation;
  readonly repairVerdictProofInput?: RepairVerdictProofInput;
  readonly repairVerdictTerminalProjection?: RepairVerdictTerminalProjection;
  readonly notProvenClaims?: readonly string[];
}): RepairReadinessProjection {
  const missingProofItems = repairReadinessMissingProof(input);
  const status = repairReadinessStatus(input, missingProofItems);
  const sourceVerificationId = input.verification?.verificationId ??
    input.repairRequired?.sourceVerificationId ??
    input.repairProposal?.sourceVerificationId ??
    input.repairApply?.sourceVerificationId ??
    input.postRepairVerificationResult?.sourceVerificationId ??
    input.repairVerdictTerminalProjection?.originalVerificationFailureId;

  return freezeDeep({
    readinessId: `repair-readiness:${sourceVerificationId ?? "not-proven"}`,
    status,
    ...(sourceVerificationId ? { sourceVerificationId } : {}),
    ...(input.repairRequired
      ? {
          repairRequiredFact:
            `repairRequired=${input.repairRequired.repairabilityStatus}; blocker=${input.repairRequired.repairBlocker}`,
        }
      : {}),
    ...(input.repairProposal
      ? {
          repairProposalFact:
            `proposal=${input.repairProposal.proposalId}; readiness=${input.repairProposal.readinessStatus}`,
        }
      : {}),
    ...(input.repairAuthority
      ? {
          explicitAuthorityFact:
            `authority=${input.repairAuthority.authorityDecision}; source=${input.repairAuthority.authoritySource}`,
        }
      : {}),
    ...(input.repairApply
      ? {
          applyAttemptFact:
            `applyAttempted=${input.repairApply.applyAttempted}; status=${input.repairApply.repairApplyStatus}`,
        }
      : {}),
    ...(input.postRepairVerificationResult
      ? {
          postRepairVerificationFact:
            `postRepair=${input.postRepairVerificationResult.status}; receipts=${input.postRepairVerificationResult.receiptIds.length}`,
        }
      : {}),
    ...(input.repairVerdictTerminalProjection
      ? {
          verdictFact:
            `resultStatus=${input.repairVerdictTerminalProjection.status}; missingProof=${input.repairVerdictTerminalProjection.missingProofItems.join(",") || "none"}`,
        }
      : {}),
    nextAction: repairReadinessNextAction(status, missingProofItems),
    missingProofItems,
    notProvenClaims: unique([
      "terminal-success",
      "task-success",
      "repair-success",
      "verification-success",
      "repair-readiness-is-not-terminal-truth",
      "repair-proposal-is-not-success",
      "repair-apply-without-post-repair-verification-is-not-success",
      "missing-proof-remains-not-proven",
      ...(status === "verdict_projected" ? [] : ["repair-chain-incomplete"]),
      ...(input.verification?.notProvenClaims ?? []),
      ...(input.repairRequired?.notProvenClaims ?? []),
      ...(input.repairProposal?.notProvenClaims ?? []),
      ...(input.repairAuthority?.notProvenClaims ?? []),
      ...(input.repairApplyRequest?.notProvenClaims ?? []),
      ...(input.repairApply?.notProvenClaims ?? []),
      ...(input.postRepairVerificationRequirement?.notProvenClaims ?? []),
      ...(input.postRepairVerificationRequest?.notProvenClaims ?? []),
      ...(input.postRepairVerificationResult?.notProvenClaims ?? []),
      ...(input.repairVerdictProofInput?.notProvenClaims ?? []),
      ...(input.repairVerdictTerminalProjection?.notProvenClaims ?? []),
      ...(input.notProvenClaims ?? []),
    ]),
    terminalSuccessClaim: false,
  });
}

function repairReadinessStatus(
  input: Parameters<typeof projectRepairReadiness>[0],
  missingProofItems: readonly string[],
): RepairReadinessStatus {
  if (
    input.repairVerdictTerminalProjection?.status === "verified_with_repair" &&
    missingProofItems.length === 0
  ) {
    return "verdict_projected";
  }
  if (input.repairVerdictProofInput?.proofStatus === "complete") {
    return "ready_for_verdict";
  }
  if (input.postRepairVerificationResult) {
    return input.postRepairVerificationResult.status === "passed"
      ? "ready_for_verdict"
      : "blocked";
  }
  if (input.repairApply?.applyAttempted) {
    return "awaiting_post_repair_verification";
  }
  if (input.repairApplyRequest?.applyReadiness === "ready") {
    return "ready_to_apply";
  }
  if (input.repairAuthority?.authorityDecision === "granted") {
    return input.repairAuthority.authoritySource === "explicit_repair_authority"
      ? "ready_to_apply"
      : "awaiting_authority";
  }
  if (input.repairProposal) {
    return "awaiting_authority";
  }
  if (input.repairRequired) {
    return input.repairRequired.repairabilityStatus === "repair_required" ||
        input.repairRequired.repairabilityStatus === "repair_possible"
      ? "awaiting_proposal"
      : "blocked";
  }
  if (input.verification?.status === "failed") {
    return "repair_required";
  }
  return "not_proven";
}

function repairReadinessMissingProof(
  input: Parameters<typeof projectRepairReadiness>[0],
): readonly string[] {
  const missing = [
    ...(input.verification?.status === "failed" ? [] : ["failed-verification"]),
    ...(input.repairRequired ? [] : ["repair-required"]),
    ...(input.repairProposal ? [] : ["repair-proposal"]),
    ...(input.repairAuthority?.authorityDecision === "granted" &&
        input.repairAuthority.authoritySource === "explicit_repair_authority"
      ? []
      : ["explicit-authority"]),
    ...(input.repairApply?.applyAttempted ? [] : ["repair-apply-attempt"]),
    ...(input.postRepairVerificationResult?.status === "passed"
      ? []
      : ["post-repair-verification"]),
    ...(input.repairVerdictProofInput?.proofStatus === "complete"
      ? []
      : ["complete-evidence-proof"]),
    ...(input.repairVerdictTerminalProjection?.status === "verified_with_repair"
      ? []
      : ["result-owned-verdict"]),
    ...(input.repairVerdictProofInput?.missingProofItems ?? []),
    ...(input.repairVerdictTerminalProjection?.missingProofItems ?? []),
  ];
  return unique(missing);
}

function repairReadinessNextAction(
  status: RepairReadinessStatus,
  missingProofItems: readonly string[],
): string {
  switch (status) {
    case "repair_required":
      return "project repair-required handoff from failed verification";
    case "awaiting_proposal":
      return "prepare repair proposal from preserved failure facts";
    case "awaiting_authority":
      return "obtain explicit repair authority before apply";
    case "ready_to_apply":
      return "request repair apply through the edit owner";
    case "awaiting_post_repair_verification":
      return "run post-repair verification before verdict";
    case "ready_for_verdict":
      return "project result verdict from complete evidence proof";
    case "verdict_projected":
      return "use result-owned verdict; do not infer success from readiness";
    case "blocked":
      return `resolve blocked repair proof: ${missingProofItems.join(",") || "unknown"}`;
    case "not_proven":
      return "collect failed verification evidence before repair behavior";
  }
}

function unique(values: readonly string[]): readonly string[] {
  return freezeDeep(Array.from(new Set(values)).sort());
}
