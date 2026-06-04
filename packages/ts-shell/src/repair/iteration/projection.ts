import {
  projectProductVerdictFromClaims,
  type ProductClaimInput,
  type ProductVerdict,
} from "../../evidence/verdictFacade.js";

// Reset compatibility facade. Final ownership should live with repair
// iteration and repair evidence modules.
export const PRODUCT_REPAIR_FACADE_VERSION = "v1";

export type ProductRepairApplyStatus =
  | "hunk-set-applied"
  | "single-target-applied"
  | "target-set-applied"
  | string;

export type ProductRepairVerificationStatus = "passed" | "failed" | "blocked";

export type ProductRepairFinalVerdict =
  | "verified-success-with-repair"
  | "repair-failed"
  | "repair-blocked"
  | "repair-partial"
  | "repair-not-proven";

export interface ProductRepairIterationProjection {
  readonly facadeVersion: typeof PRODUCT_REPAIR_FACADE_VERSION;
  readonly originalFailurePreserved: boolean;
  readonly repairProposalSource: string;
  readonly confirmationSource: string;
  readonly applyStatus: ProductRepairApplyStatus;
  readonly postRepairVerificationStatus: ProductRepairVerificationStatus;
  readonly sameVerificationCommandRerun: boolean;
  readonly retryCount: number;
  readonly maxRepairAttempts: number;
  readonly changedFiles: readonly string[];
  readonly notProvenClaims: readonly string[];
  readonly finalRepairVerdict: ProductRepairFinalVerdict;
  readonly verificationFailureSummary?: string;
  readonly failureOutputUsedForRetry: boolean;
  readonly failureDiagnosis?: string;
  readonly repairAction?: string;
  readonly reverifyAction?: string;
  readonly verdict: ProductVerdict;
  readonly repairProposalIsSuccess: false;
  readonly repairApplyWithoutReverifyIsSuccess: false;
}

export function projectRepairIteration(input: {
  readonly originalFailurePreserved: boolean;
  readonly repairProposalSource: string;
  readonly confirmationSource: string;
  readonly applyStatus: ProductRepairApplyStatus;
  readonly postRepairVerificationStatus: ProductRepairVerificationStatus;
  readonly sameVerificationCommandRerun: boolean;
  readonly retryCount: number;
  readonly maxRepairAttempts: number;
  readonly changedFiles: readonly string[];
  readonly notProvenClaims: readonly string[];
  readonly finalRepairVerdict: ProductRepairFinalVerdict;
  readonly verificationFailureSummary?: string;
}): ProductRepairIterationProjection {
  const applySucceeded = isRepairApplySuccess(input.applyStatus);
  const failureDiagnosis = input.verificationFailureSummary?.trim()
    ? sanitizeSummary(input.verificationFailureSummary)
    : undefined;
  const failureOutputUsedForRetry =
    input.retryCount <= 0 || Boolean(failureDiagnosis);
  const claims: ProductClaimInput[] = [
    {
      group: "verification",
      status: input.originalFailurePreserved ? "proven" : "not-proven",
      reason: "Repair must preserve the original verification failure.",
      blocker: input.originalFailurePreserved ? undefined : "original verification failure not preserved",
    },
    {
      group: "repair",
      status: input.repairProposalSource && failureOutputUsedForRetry ? "proven" : "not-run",
      reason: "Repair proposal source must be explicit and retry must use verification failure output.",
      blocker: input.repairProposalSource
        ? failureOutputUsedForRetry
          ? undefined
          : "verification failure output not used for retry"
        : "repair proposal not proven",
    },
    {
      group: "authority",
      status: input.confirmationSource ? "proven" : "not-run",
      reason: "Repair apply requires explicit confirmation.",
      blocker: input.confirmationSource ? undefined : "repair confirmation missing",
    },
    {
      group: "mutation",
      status: applySucceeded ? "proven" : "not-proven",
      reason: "Repair apply must succeed before re-verification can prove success.",
      blocker: applySucceeded ? undefined : "repair apply not proven",
    },
    {
      group: "verification",
      status: postRepairClaimStatus(input),
      reason: "Repair success requires post-repair re-verification.",
      blocker: postRepairBlocker(input),
    },
  ];

  return {
    facadeVersion: PRODUCT_REPAIR_FACADE_VERSION,
    originalFailurePreserved: input.originalFailurePreserved,
    repairProposalSource: input.repairProposalSource,
    confirmationSource: input.confirmationSource,
    applyStatus: input.applyStatus,
    postRepairVerificationStatus: input.postRepairVerificationStatus,
    sameVerificationCommandRerun: input.sameVerificationCommandRerun,
    retryCount: input.retryCount,
    maxRepairAttempts: input.maxRepairAttempts,
    changedFiles: input.changedFiles,
    notProvenClaims: input.notProvenClaims,
    finalRepairVerdict: input.finalRepairVerdict,
    ...(failureDiagnosis
      ? {
          verificationFailureSummary: failureDiagnosis,
          failureDiagnosis,
          repairAction: "generate bounded repair from failure diagnosis",
          reverifyAction: "rerun same verification command after repair",
        }
      : {}),
    failureOutputUsedForRetry,
    verdict: projectProductVerdictFromClaims({
      claims,
      provenance: { source: "product-runtime", adapter: "repair-facade" },
      redaction: "raw-content-excluded",
      cleanup: "clean",
      successClaim: input.finalRepairVerdict === "verified-success-with-repair",
      successReason: "Repair applied and the same relevant verification command passed.",
    }),
    repairProposalIsSuccess: false,
    repairApplyWithoutReverifyIsSuccess: false,
  };
}

function sanitizeSummary(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 240);
}

function isRepairApplySuccess(status: string): boolean {
  return status === "hunk-set-applied" ||
    status === "single-target-applied" ||
    status === "target-set-applied";
}

function postRepairClaimStatus(input: {
  readonly postRepairVerificationStatus: ProductRepairVerificationStatus;
  readonly sameVerificationCommandRerun: boolean;
}): ProductClaimInput["status"] {
  if (input.postRepairVerificationStatus === "passed" && input.sameVerificationCommandRerun) {
    return "proven";
  }
  if (input.postRepairVerificationStatus === "blocked") return "blocked";
  if (input.postRepairVerificationStatus === "failed") return "failed";
  return "not-proven";
}

function postRepairBlocker(input: {
  readonly postRepairVerificationStatus: ProductRepairVerificationStatus;
  readonly sameVerificationCommandRerun: boolean;
}): string | undefined {
  if (input.postRepairVerificationStatus === "passed" && input.sameVerificationCommandRerun) {
    return undefined;
  }
  if (!input.sameVerificationCommandRerun) return "same verification command was not rerun";
  if (input.postRepairVerificationStatus === "blocked") return "post-repair verification blocked";
  return "post-repair verification failed";
}
