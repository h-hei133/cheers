// Reset compatibility facade. Final ownership should move toward the durable
// evidence/result domain once Route221/227/228 report compatibility is retired.
export { projectHistoricalReportVerdict } from "./compatibility/historicalReportVerdict.js";

export * from "./types.js";
import {
  PRODUCT_EVIDENCE_VERDICT_FACADE_VERSION,
  type ProductClaimGroup,
  type ProductClaimInput,
  type ProductClaimStatus,
  type ProductCleanupStatus,
  type ProductEvidenceLevel,
  type ProductEvidenceProvenance,
  type ProductEvidenceRow,
  type ProductEvidenceRowKind,
  type ProductEvidenceRowSource,
  type ProductEvidenceSource,
  type ProductRedactionStatus,
  type ProductTerminalClassification,
  type ProductVerdict,
  type ProductVerdictStatus,
} from "./types.js";

export interface ProductReportSafeProjection {
  readonly facadeVersion: typeof PRODUCT_EVIDENCE_VERDICT_FACADE_VERSION;
  readonly finalStatus: ProductVerdictStatus;
  readonly terminalClassification: ProductTerminalClassification;
  readonly notProvenReasons: readonly string[];
  readonly partialReasons: readonly string[];
  readonly blockedReasons: readonly string[];
  readonly provenance: ProductEvidenceProvenance;
  readonly redactionStatus: ProductRedactionStatus;
  readonly cleanupStatus: ProductCleanupStatus;
}

export function projectRuntimeTerminalVerdict(input: {
  readonly terminalStatus: string;
  readonly resultStatus: string;
  readonly liveSuccess: boolean;
  readonly reason: string;
  readonly blocker?: string;
  readonly provenance: ProductEvidenceProvenance;
  readonly redaction: ProductRedactionStatus;
  readonly cleanup: ProductCleanupStatus;
  readonly notProvenReasons?: readonly string[];
}): ProductVerdict {
  if (input.liveSuccess) {
    return productVerdict({
      status: "COMPLETE",
      terminalClassification: "success",
      reason: input.reason,
      provenance: input.provenance,
      redaction: input.redaction,
      cleanup: input.cleanup,
      notProvenReasons: [],
      partialReasons: [],
      blockedReasons: [],
    });
  }

  const notProvenReasons =
    input.notProvenReasons && input.notProvenReasons.length > 0
      ? input.notProvenReasons
      : input.blocker
        ? [input.blocker]
        : [input.reason];
  const blocked = isBlockedRuntimeTerminal(input.terminalStatus);
  const partial = isPartialRuntimeTerminal(input.terminalStatus);

  return productVerdict({
    status: blocked ? "BLOCKED" : partial ? "PARTIAL" : "NOT_PROVEN",
    terminalClassification: "stopped",
    reason: input.reason,
    provenance: input.provenance,
    redaction: input.redaction,
    cleanup: input.cleanup,
    notProvenReasons: blocked || partial ? [] : notProvenReasons,
    partialReasons: partial ? notProvenReasons : [],
    blockedReasons: blocked ? notProvenReasons : [],
  });
}

export function buildProductEvidenceRow(
  input: Omit<ProductEvidenceRow, "id"> & { readonly id?: string },
): ProductEvidenceRow {
  return {
    ...input,
    id:
      input.id ??
      [
        "evidence",
        input.provenance.routeId ?? input.source,
        input.kind,
        input.level,
      ].join(":"),
  };
}

export function projectProductVerdictFromClaims(input: {
  readonly claims: readonly ProductClaimInput[];
  readonly provenance: ProductEvidenceProvenance;
  readonly redaction: ProductRedactionStatus;
  readonly cleanup: ProductCleanupStatus;
  readonly successClaim?: boolean;
  readonly successReason?: string;
}): ProductVerdict {
  const notProvenReasons = collectClaimReasons(input.claims, [
    "not-proven",
    "not-run",
    "invalid",
  ]);
  const blockedReasons = collectClaimReasons(input.claims, ["blocked"]);
  const failedReasons = collectClaimReasons(input.claims, ["failed"]);

  if (blockedReasons.length > 0) {
    return productVerdict({
      status: "BLOCKED",
      terminalClassification: "stopped",
      reason: blockedReasons[0] ?? "Required evidence is blocked.",
      provenance: input.provenance,
      redaction: input.redaction,
      cleanup: input.cleanup,
      notProvenReasons,
      partialReasons: failedReasons,
      blockedReasons,
    });
  }

  if (notProvenReasons.length > 0) {
    return productVerdict({
      status: "NOT_PROVEN",
      terminalClassification: "stopped",
      reason: notProvenReasons[0] ?? "Required evidence is not proven.",
      provenance: input.provenance,
      redaction: input.redaction,
      cleanup: input.cleanup,
      notProvenReasons,
      partialReasons: failedReasons,
      blockedReasons,
    });
  }

  if (failedReasons.length > 0) {
    return productVerdict({
      status: "PARTIAL",
      terminalClassification: "stopped",
      reason: failedReasons[0] ?? "Required evidence failed.",
      provenance: input.provenance,
      redaction: input.redaction,
      cleanup: input.cleanup,
      notProvenReasons,
      partialReasons: failedReasons,
      blockedReasons,
    });
  }

  if (input.successClaim === true) {
    return productVerdict({
      status: "COMPLETE",
      terminalClassification: "success",
      reason: input.successReason ?? "All required claims are proven.",
      provenance: input.provenance,
      redaction: input.redaction,
      cleanup: input.cleanup,
      notProvenReasons,
      partialReasons: failedReasons,
      blockedReasons,
    });
  }

  return productVerdict({
    status: "NOT_PROVEN",
    terminalClassification: "stopped",
    reason: "No explicit success claim was provided.",
    provenance: input.provenance,
    redaction: input.redaction,
    cleanup: input.cleanup,
    notProvenReasons: ["No explicit success claim was provided."],
    partialReasons: failedReasons,
    blockedReasons,
  });
}

export function toReportSafeProjection(
  verdict: ProductVerdict,
): ProductReportSafeProjection {
  return {
    facadeVersion: PRODUCT_EVIDENCE_VERDICT_FACADE_VERSION,
    finalStatus: verdict.status,
    terminalClassification: verdict.terminalClassification,
    notProvenReasons: verdict.notProvenReasons,
    partialReasons: verdict.partialReasons,
    blockedReasons: verdict.blockedReasons,
    provenance: verdict.provenance,
    redactionStatus: verdict.redaction,
    cleanupStatus: verdict.cleanup,
  };
}

export function assertNoProductVerdictSuccessUpgrade(input: {
  readonly legacyLiveSuccess: boolean;
  readonly legacyTerminalClassification?: ProductTerminalClassification;
  readonly verdict: ProductVerdict;
}): void {
  if (!input.legacyLiveSuccess && input.verdict.status === "COMPLETE") {
    throw new Error(
      "Product verdict facade attempted to upgrade a non-live-success legacy result to COMPLETE.",
    );
  }
  if (
    input.legacyTerminalClassification &&
    input.legacyTerminalClassification !== "success" &&
    input.verdict.terminalClassification === "success"
  ) {
    throw new Error(
      "Product verdict facade attempted to upgrade a non-success terminal classification.",
    );
  }
}

function collectClaimReasons(
  claims: readonly ProductClaimInput[],
  statuses: readonly ProductClaimStatus[],
): readonly string[] {
  return claims
    .filter((claim) => statuses.includes(claim.status))
    .map((claim) => claim.blocker ?? claim.reason);
}

function productVerdict(input: ProductVerdict): ProductVerdict {
  return input;
}

function isBlockedRuntimeTerminal(terminalStatus: string): boolean {
  return terminalStatus === "confirmation-required" ||
    terminalStatus === "repair-confirmation-required" ||
    terminalStatus === "provider-unavailable" ||
    terminalStatus === "skipped" ||
    terminalStatus.endsWith("-required");
}

function isPartialRuntimeTerminal(terminalStatus: string): boolean {
  return terminalStatus === "apply-succeeded" ||
    terminalStatus === "apply-stopped" ||
    terminalStatus === "repair-eligible" ||
    terminalStatus === "repair-proposed" ||
    terminalStatus === "repair-applied" ||
    terminalStatus === "review-required" ||
    terminalStatus.includes("not-live");
}
