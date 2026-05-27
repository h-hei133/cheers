import {
  projectProductVerdictFromClaims,
  type ProductClaimInput,
  type ProductVerdict,
} from "../evidence/verdictFacade.js";

export const PRODUCT_VERIFICATION_FACADE_VERSION = "v1";

export type ProductVerificationAuthorityStatus =
  | "explicitly-approved"
  | "not-granted";

export type ProductVerificationDispatchStatus = "dispatched" | "not-run";

export type ProductVerificationRuntimeStatus =
  | "success"
  | "failed"
  | "blocked"
  | "skipped"
  | "timeout"
  | "error"
  | "not-run";

export type ProductVerificationCoverageStatus =
  | "covered"
  | "partially-covered"
  | "uncovered";

export type ProductVerificationRelevanceStatus =
  | "relevant"
  | "unrelated"
  | "not-selected";

export type ProductVerificationVerdictStatus =
  | "verified"
  | "insufficient-evidence"
  | "verification-failed"
  | "blocked"
  | "approval-required";

export interface ProductVerificationReceipt {
  readonly facadeVersion: typeof PRODUCT_VERIFICATION_FACADE_VERSION;
  readonly selectedCommand?: string;
  readonly authority: ProductVerificationAuthorityStatus;
  readonly dispatchStatus: ProductVerificationDispatchStatus;
  readonly runtimeStatus: ProductVerificationRuntimeStatus;
  readonly relevanceStatus: ProductVerificationRelevanceStatus;
  readonly coverageStatus: ProductVerificationCoverageStatus;
  readonly coveredFiles: readonly string[];
  readonly uncoveredFiles: readonly string[];
  readonly failureClass?: string;
  readonly notProvenClaims: readonly string[];
  readonly verdictStatus: ProductVerificationVerdictStatus;
  readonly verdict: ProductVerdict;
  readonly selectedNotRunIsSuccess: false;
  readonly oneFileSuccessCanHideAnotherFailure: false;
  readonly mutationDuringVerification: "not-run";
  readonly providerCallDuringVerification: "not-run";
}

export function projectVerificationReceipt(input: {
  readonly selectedCommand?: string;
  readonly authority: ProductVerificationAuthorityStatus;
  readonly dispatchStatus: ProductVerificationDispatchStatus;
  readonly runtimeStatus?: ProductVerificationRuntimeStatus;
  readonly relevanceStatus: ProductVerificationRelevanceStatus;
  readonly coverageStatus: ProductVerificationCoverageStatus;
  readonly coveredFiles: readonly string[];
  readonly uncoveredFiles: readonly string[];
  readonly failureClass?: string;
  readonly notProvenClaims: readonly string[];
  readonly verdictStatus: ProductVerificationVerdictStatus;
}): ProductVerificationReceipt {
  const runtimeStatus = input.runtimeStatus ?? "not-run";
  const claims: ProductClaimInput[] = [
    {
      group: "authority",
      status: input.authority === "explicitly-approved" ? "proven" : "not-run",
      reason: "Verification dispatch requires explicit command authority.",
      blocker: input.authority === "explicitly-approved" ? undefined : "verification authority not granted",
    },
    {
      group: "verification",
      status: verificationClaimStatus(input, runtimeStatus),
      reason: "Task-relevant verification requires relevant covered runtime evidence.",
      blocker: verificationBlocker(input, runtimeStatus),
    },
  ];

  return {
    facadeVersion: PRODUCT_VERIFICATION_FACADE_VERSION,
    selectedCommand: input.selectedCommand,
    authority: input.authority,
    dispatchStatus: input.dispatchStatus,
    runtimeStatus,
    relevanceStatus: input.relevanceStatus,
    coverageStatus: input.coverageStatus,
    coveredFiles: input.coveredFiles,
    uncoveredFiles: input.uncoveredFiles,
    failureClass: input.failureClass,
    notProvenClaims: input.notProvenClaims,
    verdictStatus: input.verdictStatus,
    verdict: projectProductVerdictFromClaims({
      claims,
      provenance: { source: "product-runtime", adapter: "verification-facade" },
      redaction: "raw-content-excluded",
      cleanup: "not-applicable",
      successClaim: input.verdictStatus === "verified",
      successReason: "Task-relevant verification passed with full changed-file coverage.",
    }),
    selectedNotRunIsSuccess: false,
    oneFileSuccessCanHideAnotherFailure: false,
    mutationDuringVerification: "not-run",
    providerCallDuringVerification: "not-run",
  };
}

function verificationClaimStatus(
  input: Pick<
    Parameters<typeof projectVerificationReceipt>[0],
    "dispatchStatus" | "relevanceStatus" | "coverageStatus" | "verdictStatus"
  >,
  runtimeStatus: ProductVerificationRuntimeStatus,
): ProductClaimInput["status"] {
  if (input.verdictStatus === "verified" && runtimeStatus === "success") return "proven";
  if (input.verdictStatus === "blocked") return "blocked";
  if (input.verdictStatus === "verification-failed" || runtimeStatus === "failed") return "failed";
  if (input.dispatchStatus === "not-run") return "not-run";
  return "not-proven";
}

function verificationBlocker(
  input: Pick<
    Parameters<typeof projectVerificationReceipt>[0],
    "dispatchStatus" | "relevanceStatus" | "coverageStatus" | "verdictStatus" | "notProvenClaims"
  >,
  runtimeStatus: ProductVerificationRuntimeStatus,
): string | undefined {
  if (input.notProvenClaims.length > 0) return input.notProvenClaims[0];
  if (input.dispatchStatus === "not-run") return "selected verification was not run";
  if (input.relevanceStatus !== "relevant") return "verification command is not task-relevant";
  if (input.coverageStatus !== "covered") return "verification coverage is incomplete";
  if (runtimeStatus !== "success") return "verification runtime did not succeed";
  if (input.verdictStatus !== "verified") return "verification verdict is not verified";
  return undefined;
}
