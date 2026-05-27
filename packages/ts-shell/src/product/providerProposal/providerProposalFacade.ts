import type { ProductRedactionStatus } from "../evidence/verdictFacade.js";

export const PRODUCT_PROVIDER_PROPOSAL_FACADE_VERSION = "v1";

export type ProductProviderMode =
  | "default-safe"
  | "fake-provider"
  | "live-provider"
  | "not-proven";

export type ProductProviderReadiness =
  | "ready"
  | "not-configured"
  | "auth-failed"
  | "network-blocked"
  | "provider-error"
  | "unsupported"
  | "not-run"
  | "unknown";

export type ProductProviderFallbackDecision =
  | "not-needed"
  | "allowed"
  | "used"
  | "skipped-disabled"
  | "skipped-not-retryable";

export type ProductProviderRetryStatus =
  | "not-run"
  | "not-needed"
  | "attempted"
  | "exhausted";

export type ProductRawOutputStatus =
  | "excluded"
  | "redacted"
  | "not-produced"
  | "unknown";

export type ProductProposalSource =
  | "manual-proposal-json"
  | "focused-deterministic-proposal"
  | "planning-runtime-deterministic"
  | "planning-handoff-summary"
  | "live-provider-proposal";

export type ProductProposalExactness =
  | "exact-ready"
  | "review-only"
  | "invalid"
  | "not-run"
  | "blocked";

export type ProductProposalReviewState =
  | "review-required"
  | "confirmation-required"
  | "review-only"
  | "unsupported"
  | "not-requested";

export type ProductProposalAnchorReadiness =
  | "exact-ready"
  | "review-only"
  | "missing-exact-mapping"
  | "blocked"
  | "not-run";

export interface ProductProviderReceipt {
  readonly facadeVersion: typeof PRODUCT_PROVIDER_PROPOSAL_FACADE_VERSION;
  readonly mode: ProductProviderMode;
  readonly providerCalled: boolean;
  readonly readiness: ProductProviderReadiness;
  readonly failureClass?: string;
  readonly retryStatus: ProductProviderRetryStatus;
  readonly fallbackDecision: ProductProviderFallbackDecision;
  readonly redactionStatus: ProductRedactionStatus;
  readonly rawOutputStatus: ProductRawOutputStatus;
  readonly evidenceSource: ProductProviderMode;
}

export interface ProductProposalContract {
  readonly facadeVersion: typeof PRODUCT_PROVIDER_PROPOSAL_FACADE_VERSION;
  readonly source: ProductProposalSource;
  readonly exactness: ProductProposalExactness;
  readonly reviewState: ProductProposalReviewState;
  readonly anchorReadiness: ProductProposalAnchorReadiness;
  readonly targetFiles: readonly string[];
  readonly mutationAuthority: "not-granted";
  readonly applyState: "not-run";
  readonly verificationState: "not-run";
  readonly redactionStatus: ProductRedactionStatus;
  readonly rawOutputStatus: ProductRawOutputStatus;
  readonly unsupportedReason?: string;
}

export interface ProductProviderProposalBoundary {
  readonly facadeVersion: typeof PRODUCT_PROVIDER_PROPOSAL_FACADE_VERSION;
  readonly provider: ProductProviderReceipt;
  readonly proposal: ProductProposalContract;
  readonly providerCalledIsProposalSuccess: false;
  readonly proposalExactReadyIsAuthority: false;
  readonly reviewOnlyIsApplyReady: false;
}

export function projectProviderReceipt(input: {
  readonly mode: ProductProviderMode;
  readonly providerCalled: boolean;
  readonly readiness?: ProductProviderReadiness;
  readonly failureClass?: string;
  readonly retryStatus?: ProductProviderRetryStatus;
  readonly fallbackDecision?: ProductProviderFallbackDecision;
  readonly redactionStatus?: ProductRedactionStatus;
  readonly rawOutputStatus?: ProductRawOutputStatus;
}): ProductProviderReceipt {
  return {
    facadeVersion: PRODUCT_PROVIDER_PROPOSAL_FACADE_VERSION,
    mode: input.mode,
    providerCalled: input.providerCalled,
    readiness: input.readiness ?? (input.providerCalled ? "ready" : "not-run"),
    ...(input.failureClass ? { failureClass: input.failureClass } : {}),
    retryStatus: input.retryStatus ?? "not-run",
    fallbackDecision: input.fallbackDecision ?? "not-needed",
    redactionStatus: input.redactionStatus ?? "raw-content-excluded",
    rawOutputStatus: input.rawOutputStatus ?? "excluded",
    evidenceSource: input.mode,
  };
}

export function projectProposalContract(input: {
  readonly source: ProductProposalSource;
  readonly exactness: ProductProposalExactness;
  readonly reviewState: ProductProposalReviewState;
  readonly anchorReadiness: ProductProposalAnchorReadiness;
  readonly targetFiles?: readonly string[];
  readonly redactionStatus?: ProductRedactionStatus;
  readonly rawOutputStatus?: ProductRawOutputStatus;
  readonly unsupportedReason?: string;
}): ProductProposalContract {
  return {
    facadeVersion: PRODUCT_PROVIDER_PROPOSAL_FACADE_VERSION,
    source: input.source,
    exactness: input.exactness,
    reviewState: input.reviewState,
    anchorReadiness: input.anchorReadiness,
    targetFiles: input.targetFiles ?? [],
    mutationAuthority: "not-granted",
    applyState: "not-run",
    verificationState: "not-run",
    redactionStatus: input.redactionStatus ?? "raw-content-excluded",
    rawOutputStatus: input.rawOutputStatus ?? "excluded",
    ...(input.unsupportedReason ? { unsupportedReason: input.unsupportedReason } : {}),
  };
}

export function buildProviderProposalBoundary(input: {
  readonly provider: ProductProviderReceipt;
  readonly proposal: ProductProposalContract;
}): ProductProviderProposalBoundary {
  return {
    facadeVersion: PRODUCT_PROVIDER_PROPOSAL_FACADE_VERSION,
    provider: input.provider,
    proposal: input.proposal,
    providerCalledIsProposalSuccess: false,
    proposalExactReadyIsAuthority: false,
    reviewOnlyIsApplyReady: false,
  };
}

export function projectProviderProposalBoundaryFromPreparation(input: {
  readonly source: ProductProposalSource;
  readonly status: string;
  readonly providerCalled: boolean;
  readonly liveOptIn: boolean;
  readonly liveEvidenceSource: ProductProviderMode;
  readonly targetFiles?: readonly string[];
  readonly evidence?: readonly string[];
  readonly reason?: string;
}): ProductProviderProposalBoundary {
  const provider = projectProviderReceipt({
    mode: input.liveOptIn ? input.liveEvidenceSource : "default-safe",
    providerCalled: input.providerCalled,
    readiness: input.liveOptIn || input.providerCalled
      ? providerReadinessFromPreparationStatus(input.status)
      : "not-run",
    failureClass: providerFailureClassFromPreparationStatus(input.status),
    retryStatus: retryStatusFromEvidence(input.evidence ?? []),
    fallbackDecision: fallbackDecisionFromEvidence(input.evidence ?? []),
    redactionStatus: "raw-content-excluded",
    rawOutputStatus: "excluded",
  });
  const proposal = projectProposalContract({
    source: input.source,
    exactness: proposalExactnessFromPreparationStatus(input.status),
    reviewState: proposalReviewStateFromPreparationStatus(input.status),
    anchorReadiness: proposalAnchorReadinessFromPreparationStatus(input.status),
    targetFiles: input.targetFiles,
    redactionStatus: "raw-content-excluded",
    rawOutputStatus: "excluded",
    unsupportedReason: unsupportedReasonFromPreparationStatus(input.status, input.reason),
  });

  const boundary = buildProviderProposalBoundary({ provider, proposal });
  assertNoProviderProposalSuccessUpgrade(boundary);
  return boundary;
}

export function projectProviderProposalBoundaryFromBridge(input: {
  readonly source: ProductProposalSource;
  readonly proposalState: "not-run" | "prepared" | "invalid";
  readonly anchorState:
    | "not-run"
    | "exact-ready"
    | "review-only"
    | "blocked"
    | "missing-exact-mapping";
  readonly confirmationState:
    | "not-requested"
    | "review-required"
    | "confirmation-required"
    | "unsupported";
  readonly targetFiles?: readonly string[];
  readonly reason?: string;
}): ProductProviderProposalBoundary {
  const proposal = projectProposalContract({
    source: input.source,
    exactness: proposalExactnessFromBridge(input.proposalState, input.anchorState),
    reviewState: proposalReviewStateFromBridge(input.confirmationState, input.anchorState),
    anchorReadiness: input.anchorState,
    targetFiles: input.targetFiles,
    redactionStatus: "raw-content-excluded",
    rawOutputStatus: "excluded",
    unsupportedReason: input.proposalState === "invalid" ? input.reason : undefined,
  });
  const boundary = buildProviderProposalBoundary({
    provider: projectProviderReceipt({
      mode: "default-safe",
      providerCalled: false,
      readiness: "not-run",
      retryStatus: "not-run",
      fallbackDecision: "not-needed",
      redactionStatus: "raw-content-excluded",
      rawOutputStatus: "not-produced",
    }),
    proposal,
  });
  assertNoProviderProposalSuccessUpgrade(boundary);
  return boundary;
}

export function assertNoProviderProposalSuccessUpgrade(
  boundary: ProductProviderProposalBoundary,
): void {
  if (
    boundary.proposal.exactness === "exact-ready" &&
    (boundary.proposal.mutationAuthority !== "not-granted" ||
      boundary.proposal.applyState !== "not-run" ||
      boundary.proposal.verificationState !== "not-run")
  ) {
    throw new Error("Provider proposal facade cannot upgrade exact-ready to authority/apply success.");
  }

  if (
    boundary.proposal.exactness === "review-only" &&
    (boundary.proposal.reviewState === "confirmation-required" ||
      boundary.proposal.applyState !== "not-run")
  ) {
    throw new Error("Provider proposal facade cannot upgrade review-only to apply-ready.");
  }

  if (
    boundary.provider.providerCalled &&
    boundary.proposal.exactness !== "exact-ready" &&
    boundary.proposal.reviewState === "confirmation-required"
  ) {
    throw new Error("Provider receipt facade cannot upgrade provider-called to proposal success.");
  }
}

function providerReadinessFromPreparationStatus(status: string): ProductProviderReadiness {
  if (status === "live-provider-config-failed") return "not-configured";
  if (status === "live-provider-auth-failed") return "auth-failed";
  if (status === "live-provider-network-blocked") return "network-blocked";
  if (status === "live-provider-failed") return "provider-error";
  if (status === "unsupported") return "unsupported";
  if (status.startsWith("live-provider-")) return "provider-error";
  return status === "not-run" ? "not-run" : "ready";
}

function providerFailureClassFromPreparationStatus(status: string): string | undefined {
  if (!status.startsWith("live-provider-")) return undefined;
  if (status === "live-provider-config-failed") return "config-failed";
  if (status === "live-provider-auth-failed") return "auth-failed";
  if (status === "live-provider-network-blocked") return "network-blocked";
  return status.replace(/^live-provider-/, "");
}

function retryStatusFromEvidence(evidence: readonly string[]): ProductProviderRetryStatus {
  if (evidence.some((item) => item.includes(":contract-retry:finished"))) {
    return "attempted";
  }
  if (evidence.some((item) => item.includes(":contract-retry:started"))) {
    return "exhausted";
  }
  return "not-run";
}

function fallbackDecisionFromEvidence(
  evidence: readonly string[],
): ProductProviderFallbackDecision {
  if (evidence.some((item) => item.includes(":skipped-no-fallback-policy"))) {
    return "skipped-disabled";
  }
  if (evidence.some((item) => item.includes(":skipped-after-"))) {
    return "skipped-not-retryable";
  }
  if (
    evidence.some((item) => item.includes(":live-provider-attempt:fallback")) ||
    evidence.some((item) => item.includes(":live-provider-selected-attempt:fallback"))
  ) {
    return "used";
  }
  if (evidence.some((item) => item.endsWith(":live-provider-fallback-policy:enabled"))) {
    return "allowed";
  }
  return "not-needed";
}

function proposalExactnessFromPreparationStatus(status: string): ProductProposalExactness {
  if (status === "prepared-exact") return "exact-ready";
  if (status === "review-only") return "review-only";
  if (status === "not-run") return "not-run";
  if (status === "live-provider-config-failed" || status === "live-provider-auth-failed" || status === "live-provider-network-blocked") {
    return "blocked";
  }
  return "invalid";
}

function proposalReviewStateFromPreparationStatus(status: string): ProductProposalReviewState {
  if (status === "prepared-exact") return "confirmation-required";
  if (status === "review-only") return "review-only";
  if (status === "not-run") return "not-requested";
  return "unsupported";
}

function proposalAnchorReadinessFromPreparationStatus(
  status: string,
): ProductProposalAnchorReadiness {
  if (status === "prepared-exact") return "exact-ready";
  if (status === "review-only") return "review-only";
  if (status === "not-run") return "not-run";
  if (status === "live-provider-config-failed" || status === "live-provider-auth-failed" || status === "live-provider-network-blocked") {
    return "blocked";
  }
  return "blocked";
}

function unsupportedReasonFromPreparationStatus(
  status: string,
  reason: string | undefined,
): string | undefined {
  return status === "prepared-exact" || status === "review-only" || status === "not-run"
    ? undefined
    : reason;
}

function proposalExactnessFromBridge(
  proposalState: "not-run" | "prepared" | "invalid",
  anchorState: ProductProposalAnchorReadiness,
): ProductProposalExactness {
  if (proposalState === "not-run") return "not-run";
  if (proposalState === "invalid") return "invalid";
  if (anchorState === "exact-ready") return "exact-ready";
  if (anchorState === "blocked") return "blocked";
  return "review-only";
}

function proposalReviewStateFromBridge(
  confirmationState:
    | "not-requested"
    | "review-required"
    | "confirmation-required"
    | "unsupported",
  anchorState: ProductProposalAnchorReadiness,
): ProductProposalReviewState {
  if (confirmationState === "confirmation-required") return "confirmation-required";
  if (confirmationState === "unsupported") return "unsupported";
  if (confirmationState === "not-requested") return "not-requested";
  return anchorState === "review-only" || anchorState === "missing-exact-mapping"
    ? "review-only"
    : "review-required";
}
