import type { ProviderEditAvailability } from "./providerEditPlanner.js";

export type LiveProviderAdapterApprovalDecision =
  | "approved-openai-compatible"
  | "skip-no-opt-in"
  | "skip-real-provider-smoke-not-enabled"
  | "skip-provider-not-configured"
  | "skip-provider-unsupported"
  | "skip-provider-not-ready"
  | "skip-provider-auth"
  | "skip-provider-network"
  | "stop-private-config-manual-read-risk"
  | "stop-redaction-risk"
  | "unsupported";

export type LiveProviderReadinessStatus =
  | "ready"
  | "missing-config"
  | "missing-key"
  | "unsupported"
  | "auth"
  | "network"
  | "not-ready"
  | "unknown";

export interface LiveProviderAdapterApproval {
  readonly decision: LiveProviderAdapterApprovalDecision;
  readonly approved: boolean;
  readonly providerKind: string;
  readonly providerSafeLabel: string;
  readonly providerConfigSource: string;
  readonly skipReason?: string;
  readonly providerErrorClass: string;
  readonly adapterApproved: boolean;
  readonly mutationAuthority: "not-granted";
  readonly evidence: readonly string[];
}

export function approveLiveProviderAdapter(input: {
  readonly explicitLiveSmokeOptIn: boolean;
  readonly realProviderSmokeOptIn: boolean;
  readonly providerReadinessStatus: LiveProviderReadinessStatus;
  readonly providerKind?: string;
  readonly providerSafeLabel?: string;
  readonly providerConfigSource?: string;
  readonly providerAvailability?: ProviderEditAvailability;
  readonly privateConfigManualRead: boolean;
  readonly fixtureSafetyStatus: "safe" | "unsafe";
  readonly redactionStatus?: string;
}): LiveProviderAdapterApproval {
  const providerKind = input.providerKind ?? "unknown";
  const providerSafeLabel =
    input.providerSafeLabel ?? providerLabel(input.providerAvailability) ?? providerKind;
  const providerConfigSource = input.providerConfigSource ?? "unknown";

  if (input.privateConfigManualRead) {
    return decision({
      input,
      providerKind,
      providerSafeLabel,
      providerConfigSource,
      decision: "stop-private-config-manual-read-risk",
      skipReason: "private-config-manual-read-risk",
      providerErrorClass: "none",
    });
  }

  if (input.redactionStatus && input.redactionStatus !== "redacted-and-budgeted") {
    return decision({
      input,
      providerKind,
      providerSafeLabel,
      providerConfigSource,
      decision: "stop-redaction-risk",
      skipReason: "redaction-risk",
      providerErrorClass: "none",
    });
  }

  if (input.fixtureSafetyStatus !== "safe") {
    return decision({
      input,
      providerKind,
      providerSafeLabel,
      providerConfigSource,
      decision: "unsupported",
      skipReason: "fixture-unsafe",
      providerErrorClass: "none",
    });
  }

  if (!input.explicitLiveSmokeOptIn) {
    return decision({
      input,
      providerKind,
      providerSafeLabel,
      providerConfigSource,
      decision: "skip-no-opt-in",
      skipReason: "no-opt-in",
      providerErrorClass: "none",
    });
  }

  if (!input.realProviderSmokeOptIn) {
    return decision({
      input,
      providerKind,
      providerSafeLabel,
      providerConfigSource,
      decision: "skip-real-provider-smoke-not-enabled",
      skipReason: "real-provider-smoke-not-enabled",
      providerErrorClass: "none",
    });
  }

  if (
    input.providerReadinessStatus === "missing-config" ||
    input.providerReadinessStatus === "missing-key" ||
    input.providerAvailability?.kind === "not-configured"
  ) {
    return decision({
      input,
      providerKind,
      providerSafeLabel,
      providerConfigSource,
      decision: "skip-provider-not-configured",
      skipReason: "provider-not-configured",
      providerErrorClass: "none",
    });
  }

  if (
    input.providerReadinessStatus === "unsupported" ||
    input.providerAvailability?.kind === "unsupported"
  ) {
    return decision({
      input,
      providerKind,
      providerSafeLabel,
      providerConfigSource,
      decision: "skip-provider-unsupported",
      skipReason: "provider-unsupported",
      providerErrorClass: "unsupported",
    });
  }

  if (input.providerReadinessStatus === "auth") {
    return decision({
      input,
      providerKind,
      providerSafeLabel,
      providerConfigSource,
      decision: "skip-provider-auth",
      skipReason: "provider-auth",
      providerErrorClass: "auth",
    });
  }

  if (input.providerReadinessStatus === "network") {
    return decision({
      input,
      providerKind,
      providerSafeLabel,
      providerConfigSource,
      decision: "skip-provider-network",
      skipReason: "provider-network",
      providerErrorClass: "network",
    });
  }

  if (input.providerReadinessStatus !== "ready") {
    return decision({
      input,
      providerKind,
      providerSafeLabel,
      providerConfigSource,
      decision: "skip-provider-not-ready",
      skipReason: "provider-not-ready",
      providerErrorClass: "none",
    });
  }

  if (providerKind !== "openai-compatible") {
    return decision({
      input,
      providerKind,
      providerSafeLabel,
      providerConfigSource,
      decision: "unsupported",
      skipReason: "provider-unsupported",
      providerErrorClass: "unsupported",
    });
  }

  return decision({
    input,
    providerKind,
    providerSafeLabel,
    providerConfigSource,
    decision: "approved-openai-compatible",
    providerErrorClass: "none",
  });
}

function decision(input: {
  readonly input: {
    readonly explicitLiveSmokeOptIn: boolean;
    readonly realProviderSmokeOptIn: boolean;
    readonly providerReadinessStatus: LiveProviderReadinessStatus;
    readonly privateConfigManualRead: boolean;
    readonly fixtureSafetyStatus: "safe" | "unsafe";
    readonly redactionStatus?: string;
  };
  readonly providerKind: string;
  readonly providerSafeLabel: string;
  readonly providerConfigSource: string;
  readonly decision: LiveProviderAdapterApprovalDecision;
  readonly skipReason?: string;
  readonly providerErrorClass: string;
}): LiveProviderAdapterApproval {
  const approved = input.decision === "approved-openai-compatible";
  return {
    decision: input.decision,
    approved,
    adapterApproved: approved,
    providerKind: input.providerKind,
    providerSafeLabel: input.providerSafeLabel,
    providerConfigSource: input.providerConfigSource,
    ...(input.skipReason ? { skipReason: input.skipReason } : {}),
    providerErrorClass: input.providerErrorClass,
    mutationAuthority: "not-granted",
    evidence: [
      `live-provider-adapter-approval:decision:${input.decision}`,
      `live-provider-adapter-approval:adapter-approved:${approved}`,
      `live-provider-adapter-approval:provider-kind:${input.providerKind}`,
      `live-provider-adapter-approval:provider:${input.providerSafeLabel}`,
      `live-provider-adapter-approval:config-source:${input.providerConfigSource}`,
      `live-provider-adapter-approval:readiness:${input.input.providerReadinessStatus}`,
      `live-provider-adapter-approval:live-opt-in:${input.input.explicitLiveSmokeOptIn}`,
      `live-provider-adapter-approval:real-provider-smoke-opt-in:${input.input.realProviderSmokeOptIn}`,
      `live-provider-adapter-approval:private-config-manual-read:${input.input.privateConfigManualRead}`,
      `live-provider-adapter-approval:fixture:${input.input.fixtureSafetyStatus}`,
      `live-provider-adapter-approval:redaction:${input.input.redactionStatus ?? "unknown"}`,
      `live-provider-adapter-approval:provider-error-class:${input.providerErrorClass}`,
      ...(input.skipReason ? [`live-provider-adapter-approval:skip-reason:${input.skipReason}`] : []),
      "live-provider-adapter-approval:mutation-authority:not-granted",
      "live-provider-adapter-approval:no-apply",
    ],
  };
}

function providerLabel(availability: ProviderEditAvailability | undefined): string | undefined {
  if (!availability) return undefined;
  if (availability.kind === "available") return availability.providerKindLabel;
  return availability.kind;
}
