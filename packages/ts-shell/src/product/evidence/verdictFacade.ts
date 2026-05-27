export const PRODUCT_EVIDENCE_VERDICT_FACADE_VERSION = "v1";

export type ProductEvidenceSource =
  | "default-safe"
  | "fake-provider"
  | "fake-ready"
  | "live-provider"
  | "focused-tests"
  | "unknown";

export type ProductEvidenceLevel =
  | "product-proven"
  | "live-provider-proven"
  | "selected-workspace-proven"
  | "frozen-task-proven"
  | "benchmark-proven"
  | "route-local-benchmark"
  | "focused-only"
  | "fake/focused-only"
  | "deterministic-only"
  | "review-only"
  | "partial"
  | "blocked"
  | "not-proven";

export type ProductEvidenceRowSource =
  | "product-runtime"
  | "route-gate"
  | "historical-report"
  | "focused-test"
  | "adapter";

export type ProductEvidenceRowKind =
  | "receipt"
  | "claim"
  | "verdict"
  | "redaction"
  | "cleanup"
  | "provenance";

export type ProductClaimGroup =
  | "provider"
  | "proposal"
  | "anchor"
  | "authority"
  | "mutation"
  | "verification"
  | "recovery"
  | "repair";

export type ProductClaimStatus =
  | "proven"
  | "not-proven"
  | "not-required"
  | "not-run"
  | "blocked"
  | "failed"
  | "invalid";

export type ProductVerdictStatus =
  | "COMPLETE"
  | "PARTIAL"
  | "BLOCKED"
  | "NOT_PROVEN";

export type ProductTerminalClassification = "success" | "stopped" | "error";

export type ProductRedactionStatus =
  | "raw-content-excluded"
  | "redacted"
  | "not-applicable"
  | "unknown";

export type ProductCleanupStatus =
  | "clean"
  | "not-run"
  | "not-applicable"
  | "unknown";

export interface ProductEvidenceProvenance {
  readonly source: ProductEvidenceRowSource;
  readonly routeId?: string;
  readonly reportPath?: string;
  readonly adapter?: string;
}

export interface ProductEvidenceRow {
  readonly id: string;
  readonly source: ProductEvidenceRowSource;
  readonly level: ProductEvidenceLevel;
  readonly kind: ProductEvidenceRowKind;
  readonly summary: string;
  readonly provenance: ProductEvidenceProvenance;
  readonly redaction: ProductRedactionStatus;
  readonly cleanup: ProductCleanupStatus;
}

export interface ProductClaimInput {
  readonly group: ProductClaimGroup;
  readonly status: ProductClaimStatus;
  readonly reason: string;
  readonly blocker?: string;
  readonly evidence?: readonly ProductEvidenceRow[];
}

export interface ProductVerdict {
  readonly status: ProductVerdictStatus;
  readonly terminalClassification: ProductTerminalClassification;
  readonly reason: string;
  readonly provenance: ProductEvidenceProvenance;
  readonly redaction: ProductRedactionStatus;
  readonly cleanup: ProductCleanupStatus;
  readonly notProvenReasons: readonly string[];
  readonly partialReasons: readonly string[];
  readonly blockedReasons: readonly string[];
}

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

export function projectHistoricalReportVerdict(input: {
  readonly routeId?: string;
  readonly reportPath?: string;
  readonly finalStatus?: string;
  readonly independentAuditResult?: string;
  readonly independentPassRerunResult?: string;
  readonly redaction?: ProductRedactionStatus;
  readonly cleanup?: ProductCleanupStatus;
}): ProductVerdict {
  const provenance: ProductEvidenceProvenance = {
    source: "historical-report",
    ...(input.routeId ? { routeId: input.routeId } : {}),
    ...(input.reportPath ? { reportPath: input.reportPath } : {}),
    adapter: "historical-report-verdict",
  };
  const finalStatus = input.finalStatus;
  const auditPartialWithoutPass =
    input.independentAuditResult === "PARTIAL" &&
    finalStatus === "COMPLETE" &&
    input.independentPassRerunResult !== "PASS";

  if (auditPartialWithoutPass) {
    return productVerdict({
      status: "PARTIAL",
      terminalClassification: "stopped",
      reason:
        "Historical report audit was PARTIAL and has no independent PASS rerun.",
      provenance,
      redaction: input.redaction ?? "unknown",
      cleanup: input.cleanup ?? "unknown",
      notProvenReasons: [],
      partialReasons: [
        "Audit PARTIAL cannot be projected as COMPLETE without independent PASS rerun.",
      ],
      blockedReasons: [],
    });
  }

  if (finalStatus === "COMPLETE") {
    return productVerdict({
      status: "COMPLETE",
      terminalClassification: "success",
      reason: "Historical report finalStatus is COMPLETE.",
      provenance,
      redaction: input.redaction ?? "unknown",
      cleanup: input.cleanup ?? "unknown",
      notProvenReasons: [],
      partialReasons: [],
      blockedReasons: [],
    });
  }

  if (finalStatus === "BLOCKED") {
    return productVerdict({
      status: "BLOCKED",
      terminalClassification: "stopped",
      reason: "Historical report finalStatus is BLOCKED.",
      provenance,
      redaction: input.redaction ?? "unknown",
      cleanup: input.cleanup ?? "unknown",
      notProvenReasons: [],
      partialReasons: [],
      blockedReasons: ["Historical report finalStatus is BLOCKED."],
    });
  }

  if (finalStatus === "PARTIAL") {
    return productVerdict({
      status: "PARTIAL",
      terminalClassification: "stopped",
      reason: "Historical report finalStatus is PARTIAL.",
      provenance,
      redaction: input.redaction ?? "unknown",
      cleanup: input.cleanup ?? "unknown",
      notProvenReasons: [],
      partialReasons: ["Historical report finalStatus is PARTIAL."],
      blockedReasons: [],
    });
  }

  return productVerdict({
    status: "NOT_PROVEN",
    terminalClassification: "stopped",
    reason: "Historical report finalStatus is missing or unknown.",
    provenance,
    redaction: input.redaction ?? "unknown",
    cleanup: input.cleanup ?? "unknown",
    notProvenReasons: ["Historical report finalStatus is missing or unknown."],
    partialReasons: [],
    blockedReasons: [],
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
