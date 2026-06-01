import {
  projectProductVerdictFromClaims,
  type ProductVerdict,
} from "../../../evidence/verdictFacade.js";
import type { RepairVerdictProofInput } from "../../../evidence/projection/repair/verdict.js";

export type RepairVerdictTerminalStatus =
  | "verified_with_repair"
  | "partial"
  | "blocked"
  | "failed"
  | "not_proven";

export interface RepairVerdictTerminalProjection {
  readonly projectionId: string;
  readonly sourceProofInputId: string;
  readonly status: RepairVerdictTerminalStatus;
  readonly terminalClassification: "success" | "stopped";
  readonly productVerdict: ProductVerdict;
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
  readonly missingProofItems: readonly string[];
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export function projectRepairVerdictTerminal(input: {
  readonly proofInput: RepairVerdictProofInput;
  readonly notProvenClaims?: readonly string[];
}): RepairVerdictTerminalProjection {
  const status = terminalStatusFor(input.proofInput);
  const productVerdict = projectProductVerdictFromClaims({
    claims: claimsFor(input.proofInput),
    provenance: {
      source: "product-runtime",
      adapter: "repair-verdict",
    },
    redaction: "raw-content-excluded",
    cleanup: "not-applicable",
    successClaim: status === "verified_with_repair",
    successReason: "Evidence and result owners verified completion with repair.",
  });

  return deepFreeze({
    projectionId: `${input.proofInput.proofInputId}:result-projection`,
    sourceProofInputId: input.proofInput.proofInputId,
    status,
    terminalClassification: status === "verified_with_repair" ? "success" : "stopped",
    productVerdict,
    originalVerificationFailureId: input.proofInput.originalVerificationFailureId,
    originalFailureClass: input.proofInput.originalFailureClass,
    originalFailureStatus: input.proofInput.originalFailureStatus,
    originalReceiptIds: [...input.proofInput.originalReceiptIds],
    repairProposalId: input.proofInput.repairProposalId,
    repairAuthorityState: input.proofInput.repairAuthorityState,
    repairApplyState: input.proofInput.repairApplyState,
    repairTouchedTargetSummaries: [...input.proofInput.repairTouchedTargetSummaries],
    repairApplyReceiptIds: [...input.proofInput.repairApplyReceiptIds],
    postRepairVerificationState: input.proofInput.postRepairVerificationState,
    postRepairRelevanceStatus: input.proofInput.postRepairRelevanceStatus,
    postRepairCoverageStatus: input.proofInput.postRepairCoverageStatus,
    postRepairReceiptIds: [...input.proofInput.postRepairReceiptIds],
    missingProofItems: [...input.proofInput.missingProofItems],
    notProvenClaims: unique([
      "verdict-candidate-is-not-terminal-result",
      "evidence-input-is-not-terminal-result",
      "post-repair-verification-passed-alone-is-not-terminal-result",
      "repair-applied-alone-is-not-repair-success",
      "incomplete-proof-cannot-be-verified",
      "rendered-output-is-not-success",
      ...input.proofInput.notProvenClaims,
      ...(input.notProvenClaims ?? []),
    ]),
    terminalSuccessClaim: false,
  });
}

function terminalStatusFor(proofInput: RepairVerdictProofInput): RepairVerdictTerminalStatus {
  if (proofInput.proofStatus === "complete") return "verified_with_repair";
  if (proofInput.proofStatus === "blocked") return "blocked";
  if (proofInput.proofStatus === "failed") return "failed";
  if (proofInput.proofStatus === "not_proven") return "not_proven";
  return "partial";
}

function claimsFor(proofInput: RepairVerdictProofInput) {
  return [
    {
      group: "verification" as const,
      status: proofInput.originalFailurePreserved ? "proven" as const : "not-proven" as const,
      reason: "Original verification failure is preserved.",
      blocker: proofInput.originalFailurePreserved ? undefined : "original-failure",
    },
    {
      group: "proposal" as const,
      status: proofInput.repairProposalId ? "proven" as const : "not-proven" as const,
      reason: "Repair proposal is present.",
      blocker: proofInput.repairProposalId ? undefined : "repair-proposal",
    },
    {
      group: "authority" as const,
      status: proofInput.repairAuthorityState === "granted"
        ? "proven" as const
        : "blocked" as const,
      reason: "Repair authority must be granted.",
      blocker: proofInput.repairAuthorityState === "granted" ? undefined : "repair-authority",
    },
    {
      group: "mutation" as const,
      status: proofInput.repairApplyState === "applied"
        ? "proven" as const
        : "not-run" as const,
      reason: "Repair apply must be applied.",
      blocker: proofInput.repairApplyState === "applied" ? undefined : "repair-apply",
    },
    {
      group: "verification" as const,
      status: proofInput.postRepairVerificationState === "passed"
        ? "proven" as const
        : proofInput.postRepairVerificationState === "blocked"
          ? "blocked" as const
          : proofInput.postRepairVerificationState === "failed"
            ? "failed" as const
            : "not-proven" as const,
      reason: "Post repair verification must pass.",
      blocker: proofInput.postRepairVerificationState === "passed"
        ? undefined
        : "post-repair-verification",
    },
    {
      group: "verification" as const,
      status: proofInput.postRepairRelevanceStatus === "task_relevant"
        ? "proven" as const
        : "not-proven" as const,
      reason: "Post repair verification must be task relevant.",
      blocker: proofInput.postRepairRelevanceStatus === "task_relevant"
        ? undefined
        : "post-repair-relevance",
    },
    {
      group: "verification" as const,
      status: proofInput.postRepairCoverageStatus === "covered"
        ? "proven" as const
        : "not-proven" as const,
      reason: "Post repair verification must cover the repaired task.",
      blocker: proofInput.postRepairCoverageStatus === "covered"
        ? undefined
        : "post-repair-coverage",
    },
    {
      group: "verification" as const,
      status: proofInput.missingProofItems.length === 0
        ? "proven" as const
        : "not-proven" as const,
      reason: "No blocking proof items may remain.",
      blocker: proofInput.missingProofItems.length === 0
        ? undefined
        : proofInput.missingProofItems.join(","),
    },
  ];
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
