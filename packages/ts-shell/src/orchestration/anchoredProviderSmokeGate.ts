import type { ProviderEditAvailability } from "./providerEditPlanner.js";

export type AnchoredProviderSmokeMode = "fake-corpus" | "real-provider";
export type AnchoredProviderSmokeGateDecision =
  | "allow-real-provider-smoke"
  | "allow-fake-provider-corpus"
  | "skip-no-opt-in"
  | "skip-provider-not-configured"
  | "skip-provider-unsupported"
  | "skip-provider-not-ready"
  | "stop-missing-lifecycle"
  | "stop-missing-analysis"
  | "stop-low-analysis-quality"
  | "stop-low-plan-quality"
  | "stop-prompt-audit-failed"
  | "stop-redaction-risk"
  | "stop-unsupported";

export interface AnchoredProviderSmokeGate {
  readonly gateId: string;
  readonly mode: AnchoredProviderSmokeMode;
  readonly decision: AnchoredProviderSmokeGateDecision;
  readonly allowed: boolean;
  readonly providerSafeLabel: string;
  readonly skipReason?: string;
  readonly reason: string;
  readonly nextAction: string;
  readonly mutationAuthority: "not-granted";
  readonly providerCall: "not-run";
  readonly evidence: readonly string[];
}

export function evaluateAnchoredProviderSmokeGate(input: {
  readonly requestId: string;
  readonly mode: AnchoredProviderSmokeMode;
  readonly explicitSmokeOptIn?: boolean;
  readonly providerAvailability?: ProviderEditAvailability;
  readonly lifecycleId?: string;
  readonly analysisBriefId?: string;
  readonly analysisQualityId?: string;
  readonly analysisQualityDecision?: "allow" | "stop" | string;
  readonly planQualityId?: string;
  readonly planQualityLevel?: string;
  readonly promptAuditStatus?: "pass" | "fail" | string;
  readonly dryRunMode?: "no-write" | "apply" | "none" | string;
  readonly redactionStatus?: string;
  readonly supported?: boolean;
}): AnchoredProviderSmokeGate {
  const providerSafeLabel = providerLabel(input.mode, input.providerAvailability);
  const decision = selectDecision(input);
  const allowed = decision === "allow-fake-provider-corpus" || decision === "allow-real-provider-smoke";
  const gateId = [
    "anchored_provider_smoke_gate",
    input.requestId,
    input.mode,
    decision,
    input.lifecycleId ?? "no-lifecycle",
    input.analysisBriefId ?? "no-analysis",
    input.planQualityId ?? "no-plan-quality",
  ].join("_").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
  const { reason, nextAction, skipReason } = describeDecision(decision, input.providerAvailability);

  return {
    gateId,
    mode: input.mode,
    decision,
    allowed,
    providerSafeLabel,
    ...(skipReason ? { skipReason } : {}),
    reason,
    nextAction,
    mutationAuthority: "not-granted",
    providerCall: "not-run",
    evidence: [
      `anchored-provider-smoke-gate:id:${gateId}`,
      `anchored-provider-smoke-gate:mode:${input.mode}`,
      `anchored-provider-smoke-gate:decision:${decision}`,
      `anchored-provider-smoke-gate:provider:${providerSafeLabel}`,
      ...(input.lifecycleId ? [`anchored-provider-smoke-gate:lifecycle:${input.lifecycleId}`] : []),
      ...(input.analysisBriefId ? [`anchored-provider-smoke-gate:analysis-brief:${input.analysisBriefId}`] : []),
      ...(input.analysisQualityId ? [`anchored-provider-smoke-gate:analysis-quality:${input.analysisQualityId}`] : []),
      ...(input.planQualityId ? [`anchored-provider-smoke-gate:plan-quality:${input.planQualityId}`] : []),
      ...(input.promptAuditStatus ? [`anchored-provider-smoke-gate:prompt-audit:${input.promptAuditStatus}`] : []),
      ...(input.redactionStatus ? [`anchored-provider-smoke-gate:redaction:${input.redactionStatus}`] : []),
      ...(skipReason ? [`anchored-provider-smoke-gate:skip-reason:${skipReason}`] : []),
      "anchored-provider-smoke-gate:provider-call:not-run",
      "anchored-provider-smoke-gate:mutation-authority:not-granted",
      "anchored-provider-smoke-gate:no-apply",
      "anchored-provider-smoke-gate:raw-content-excluded",
    ],
  };
}

function selectDecision(input: {
  readonly mode: AnchoredProviderSmokeMode;
  readonly explicitSmokeOptIn?: boolean;
  readonly providerAvailability?: ProviderEditAvailability;
  readonly lifecycleId?: string;
  readonly analysisBriefId?: string;
  readonly analysisQualityId?: string;
  readonly analysisQualityDecision?: string;
  readonly planQualityId?: string;
  readonly planQualityLevel?: string;
  readonly promptAuditStatus?: string;
  readonly dryRunMode?: string;
  readonly redactionStatus?: string;
  readonly supported?: boolean;
}): AnchoredProviderSmokeGateDecision {
  if (input.supported === false) return "stop-unsupported";
  if (input.dryRunMode && input.dryRunMode !== "no-write") return "stop-unsupported";
  if (input.mode === "real-provider") {
    if (!input.explicitSmokeOptIn) return "skip-no-opt-in";
    if (input.providerAvailability?.kind === "not-configured") return "skip-provider-not-configured";
    if (input.providerAvailability?.kind === "unsupported") return "skip-provider-unsupported";
    if (input.providerAvailability?.kind !== "available") return "skip-provider-not-ready";
  }
  if (!input.lifecycleId) return "stop-missing-lifecycle";
  if (!input.analysisBriefId || !input.analysisQualityId) return "stop-missing-analysis";
  if (input.analysisQualityDecision && input.analysisQualityDecision !== "allow") return "stop-low-analysis-quality";
  if (!input.planQualityId || (input.planQualityLevel && input.planQualityLevel !== "ready")) {
    return "stop-low-plan-quality";
  }
  if (input.promptAuditStatus && input.promptAuditStatus !== "pass") return "stop-prompt-audit-failed";
  if (input.redactionStatus !== "redacted-and-budgeted") return "stop-redaction-risk";
  return input.mode === "fake-corpus" ? "allow-fake-provider-corpus" : "allow-real-provider-smoke";
}

function providerLabel(
  mode: AnchoredProviderSmokeMode,
  availability: ProviderEditAvailability | undefined,
): string {
  if (mode === "fake-corpus") return "fake-provider";
  if (availability?.kind === "available") return availability.providerKindLabel;
  return availability?.kind ?? "not-ready";
}

function describeDecision(
  decision: AnchoredProviderSmokeGateDecision,
  availability: ProviderEditAvailability | undefined,
): { readonly reason: string; readonly nextAction: string; readonly skipReason?: string } {
  switch (decision) {
    case "allow-real-provider-smoke":
      return {
        reason: "Anchored real-provider smoke is explicitly opted in and remains no-write.",
        nextAction: "Call the approved dry-run provider boundary only; do not apply output.",
      };
    case "allow-fake-provider-corpus":
      return {
        reason: "Deterministic fake-provider proposal corpus can run through anchored dry-run gates.",
        nextAction: "Run corpus cases through prompt audit, validation, anchoring, and report scoring.",
      };
    case "skip-no-opt-in":
      return {
        reason: "Anchored real-provider smoke was not explicitly opted in.",
        nextAction: "Run deterministic fake corpus or set the explicit smoke opt-in.",
        skipReason: "no-opt-in",
      };
    case "skip-provider-not-configured":
      return {
        reason: availabilityReason(availability) ?? "Provider is not configured for anchored smoke.",
        nextAction: "Configure provider credentials only through the approved opt-in gate.",
        skipReason: "provider-not-configured",
      };
    case "skip-provider-unsupported":
      return {
        reason: availabilityReason(availability) ?? "Provider is unsupported for anchored smoke.",
        nextAction: "Use fake corpus or a supported provider adapter.",
        skipReason: "provider-unsupported",
      };
    case "skip-provider-not-ready":
      return {
        reason: availabilityReason(availability) ?? "Provider readiness is unavailable for anchored smoke.",
        nextAction: "Run readiness checks through the approved isolated smoke path.",
        skipReason: "provider-not-ready",
      };
    case "stop-missing-lifecycle":
      return {
        reason: "Anchored provider smoke requires task lifecycle evidence.",
        nextAction: "Create lifecycle evidence before smoke.",
      };
    case "stop-missing-analysis":
      return {
        reason: "Anchored provider smoke requires analysis brief and analysis quality evidence.",
        nextAction: "Create evidence-grounded analysis before smoke.",
      };
    case "stop-low-analysis-quality":
      return {
        reason: "Analysis quality blocked anchored provider smoke.",
        nextAction: "Acquire missing context or improve analysis quality first.",
      };
    case "stop-low-plan-quality":
      return {
        reason: "Plan quality is not ready for anchored provider smoke.",
        nextAction: "Improve Plan Quality to ready before smoke.",
      };
    case "stop-prompt-audit-failed":
      return {
        reason: "Prompt audit failed before anchored provider smoke.",
        nextAction: "Redact, budget, and complete prompt context before smoke.",
      };
    case "stop-redaction-risk":
      return {
        reason: "Anchored provider smoke requires redacted and budgeted context.",
        nextAction: "Redact and budget prompt context before smoke.",
      };
    case "stop-unsupported":
      return {
        reason: "Anchored provider smoke is unsupported for this mode or runtime state.",
        nextAction: "Use the no-write fake corpus or a separate planned route.",
      };
  }
}

function availabilityReason(availability: ProviderEditAvailability | undefined): string | undefined {
  return availability?.kind === "available" ? undefined : availability?.reason;
}
