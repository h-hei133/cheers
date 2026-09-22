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
