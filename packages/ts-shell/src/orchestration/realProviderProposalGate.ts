import type { ProviderEditAvailability } from "./providerEditPlanner.js";

export type RealProviderProposalGateDecision =
  | "allow-dry-run"
  | "stop-no-opt-in"
  | "stop-provider-not-configured"
  | "stop-provider-unsupported"
  | "stop-missing-lifecycle"
  | "stop-missing-analysis"
  | "stop-low-analysis-quality"
  | "stop-low-plan-quality"
  | "stop-missing-context"
  | "stop-context-over-budget"
  | "stop-redaction-risk"
  | "stop-unsupported";

export interface RealProviderProposalGateResult {
  readonly gateId: string;
  readonly decision: RealProviderProposalGateDecision;
  readonly allowed: boolean;
  readonly providerSafeLabel?: string;
  readonly reason: string;
  readonly nextAction: string;
  readonly mutationAuthority: "not-granted";
  readonly evidence: readonly string[];
}

export function evaluateRealProviderProposalGate(input: {
  readonly requestId: string;
  readonly dryRunOptIn: boolean;
  readonly lifecycleId?: string;
  readonly analysisBriefId?: string;
  readonly analysisQualityId?: string;
  readonly analysisQualityDecision?: "allow" | "stop" | string;
  readonly planQualityId?: string;
  readonly planQualityLevel?: string;
  readonly contextPacketId?: string;
  readonly contextGraphId?: string;
  readonly codeGraphTraceId?: string;
  readonly taskExecutionPlanId?: string;
  readonly providerAvailability: ProviderEditAvailability;
  readonly redactionStatus?: string;
  readonly contextOverBudget?: boolean;
}): RealProviderProposalGateResult {
  const providerSafeLabel =
    input.providerAvailability.kind === "available"
      ? input.providerAvailability.providerKindLabel
      : input.providerAvailability.kind;
  const missingContext =
    !input.contextPacketId || !input.contextGraphId || !input.codeGraphTraceId;
  const decision = selectDecision({
    dryRunOptIn: input.dryRunOptIn,
    lifecycleId: input.lifecycleId,
    analysisBriefId: input.analysisBriefId,
    analysisQualityId: input.analysisQualityId,
    analysisQualityDecision: input.analysisQualityDecision,
    planQualityId: input.planQualityId,
    planQualityLevel: input.planQualityLevel,
    contextOverBudget: input.contextOverBudget,
    missingContext,
    redactionStatus: input.redactionStatus,
    providerAvailability: input.providerAvailability,
  });
  const allowed = decision === "allow-dry-run";
  const gateId = [
    "real_provider_proposal_gate",
    input.requestId,
    decision,
    input.lifecycleId ?? "no-lifecycle",
    input.analysisBriefId ?? "no-analysis",
    input.planQualityId ?? "no-plan-quality",
    input.contextPacketId ?? "no-context",
  ].join("_").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
  const { reason, nextAction } = describeDecision(decision, input.providerAvailability);

  return {
    gateId,
    decision,
    allowed,
    providerSafeLabel,
    reason,
    nextAction,
    mutationAuthority: "not-granted",
    evidence: [
      `real-provider-proposal-gate:id:${gateId}`,
      `real-provider-proposal-gate:decision:${decision}`,
      `real-provider-proposal-gate:provider:${providerSafeLabel}`,
      ...(input.lifecycleId ? [`real-provider-proposal-gate:lifecycle:${input.lifecycleId}`] : []),
      ...(input.analysisBriefId ? [`real-provider-proposal-gate:analysis-brief:${input.analysisBriefId}`] : []),
      ...(input.analysisQualityId ? [`real-provider-proposal-gate:analysis-quality:${input.analysisQualityId}`] : []),
      ...(input.planQualityId ? [`real-provider-proposal-gate:plan-quality:${input.planQualityId}`] : []),
      ...(input.contextPacketId ? [`real-provider-proposal-gate:context-packet:${input.contextPacketId}`] : []),
      ...(input.contextGraphId ? [`real-provider-proposal-gate:context-graph:${input.contextGraphId}`] : []),
      ...(input.codeGraphTraceId ? [`real-provider-proposal-gate:code-graph-trace:${input.codeGraphTraceId}`] : []),
      ...(input.taskExecutionPlanId ? [`real-provider-proposal-gate:execution-plan:${input.taskExecutionPlanId}`] : []),
      "real-provider-proposal-gate:mutation-authority:not-granted",
    ],
  };
}

function selectDecision(input: {
  readonly dryRunOptIn: boolean;
  readonly lifecycleId?: string;
  readonly analysisBriefId?: string;
  readonly analysisQualityId?: string;
  readonly analysisQualityDecision?: string;
  readonly planQualityId?: string;
  readonly planQualityLevel?: string;
  readonly contextOverBudget?: boolean;
  readonly missingContext: boolean;
  readonly redactionStatus?: string;
  readonly providerAvailability: ProviderEditAvailability;
}): RealProviderProposalGateDecision {
  if (!input.dryRunOptIn) return "stop-no-opt-in";
  if (input.providerAvailability.kind === "not-configured") return "stop-provider-not-configured";
  if (input.providerAvailability.kind === "unsupported") return "stop-provider-unsupported";
  if (input.providerAvailability.kind !== "available") return "stop-unsupported";
  if (!input.lifecycleId) return "stop-missing-lifecycle";
  if (!input.analysisBriefId || !input.analysisQualityId) return "stop-missing-analysis";
  if (input.analysisQualityDecision && input.analysisQualityDecision !== "allow") return "stop-low-analysis-quality";
  if (!input.planQualityId) return "stop-low-plan-quality";
  if (input.planQualityLevel && input.planQualityLevel !== "ready") return "stop-low-plan-quality";
  if (input.missingContext) return "stop-missing-context";
  if (input.contextOverBudget) return "stop-context-over-budget";
  if (input.redactionStatus !== "redacted-and-budgeted") return "stop-redaction-risk";
  return "allow-dry-run";
}

function describeDecision(
  decision: RealProviderProposalGateDecision,
  availability: ProviderEditAvailability,
): { readonly reason: string; readonly nextAction: string } {
  switch (decision) {
    case "allow-dry-run":
      return {
        reason: "Real-provider proposal dry-run gate passed; mutation authority remains closed.",
        nextAction: "Audit the prompt before invoking the explicit dry-run provider boundary.",
      };
    case "stop-no-opt-in":
      return {
        reason: "Real-provider proposal dry-run was not explicitly opted in.",
        nextAction: "Use deterministic fake-provider coverage or pass an explicit dry-run opt-in.",
      };
    case "stop-provider-not-configured":
      return {
        reason: availabilityReason(availability) ?? "Provider is not configured for proposal dry-run.",
        nextAction: "Configure provider credentials only through the approved opt-in readiness flow.",
      };
    case "stop-provider-unsupported":
      return {
        reason: availabilityReason(availability) ?? "Provider is unsupported for proposal dry-run.",
        nextAction: "Use a supported provider proposal adapter or deterministic fake provider.",
      };
    case "stop-missing-lifecycle":
      return {
        reason: "Provider proposal dry-run requires a task lifecycle id.",
        nextAction: "Create lifecycle evidence before provider dry-run.",
      };
    case "stop-missing-analysis":
      return {
        reason: "Provider proposal dry-run requires analysis brief and analysis quality ids.",
        nextAction: "Create evidence-grounded analysis and quality gate evidence first.",
      };
    case "stop-low-analysis-quality":
      return {
        reason: "Analysis quality blocked provider proposal dry-run.",
        nextAction: "Acquire missing context or strengthen analysis evidence before provider dry-run.",
      };
    case "stop-low-plan-quality":
      return {
        reason: "Plan quality is not ready for provider proposal dry-run.",
        nextAction: "Improve Plan Quality to ready before provider dry-run.",
      };
    case "stop-missing-context":
      return {
        reason: "Provider proposal dry-run requires context packet, context graph, and code graph trace ids.",
        nextAction: "Build bounded context and code graph evidence before provider dry-run.",
      };
    case "stop-context-over-budget":
      return {
        reason: "Provider proposal dry-run context is over budget.",
        nextAction: "Reduce or summarize context before provider dry-run.",
      };
    case "stop-redaction-risk":
      return {
        reason: "Provider proposal dry-run prompt context is not redacted and budgeted.",
        nextAction: "Redact and budget provider prompt context before provider dry-run.",
      };
    case "stop-unsupported":
      return {
        reason: availabilityReason(availability) ?? "Provider proposal dry-run is unsupported by the current boundary.",
        nextAction: "Use deterministic fake-provider tests or an approved supported provider boundary.",
      };
  }
}

function availabilityReason(availability: ProviderEditAvailability): string | undefined {
  return availability.kind === "available" ? undefined : availability.reason;
}
