import type { ProviderEditAvailability } from "./providerEditPlanner.js";

export type AnchoredProposalDryRunMode = "fake" | "real-opt-in" | "none";

export type AnchoredProposalActivationDecision =
  | "activate-fake-dry-run"
  | "activate-real-dry-run-if-opted-in"
  | "stop-missing-lifecycle"
  | "stop-missing-analysis"
  | "stop-low-analysis-quality"
  | "stop-low-plan-quality"
  | "stop-no-dry-run-mode"
  | "stop-provider-not-configured"
  | "stop-redaction-risk"
  | "stop-unsupported";

export interface AnchoredProposalActivation {
  readonly activationId: string;
  readonly decision: AnchoredProposalActivationDecision;
  readonly activated: boolean;
  readonly dryRunMode: AnchoredProposalDryRunMode;
  readonly taskLifecycleId?: string;
  readonly taskIntentId?: string;
  readonly contextPacketId?: string;
  readonly contextGraphId?: string;
  readonly codeGraphTraceId?: string;
  readonly analysisBriefId?: string;
  readonly analysisQualityId?: string;
  readonly taskExecutionPlanId?: string;
  readonly planQualityId?: string;
  readonly providerSafeLabel?: string;
  readonly redactionStatus?: string;
  readonly reason: string;
  readonly nextAction: string;
  readonly mutationAuthority: "not-granted";
  readonly providerCall: "not-run";
  readonly evidence: readonly string[];
}

export function activateAnchoredProposal(input: {
  readonly requestId: string;
  readonly dryRunMode: AnchoredProposalDryRunMode;
  readonly taskLifecycleId?: string;
  readonly taskIntentId?: string;
  readonly contextPacketId?: string;
  readonly contextGraphId?: string;
  readonly codeGraphTraceId?: string;
  readonly analysisBriefId?: string;
  readonly analysisQualityId?: string;
  readonly analysisQualityDecision?: "allow" | "stop" | string;
  readonly taskExecutionPlanId?: string;
  readonly planQualityId?: string;
  readonly planQualityLevel?: string;
  readonly providerAvailability?: ProviderEditAvailability;
  readonly redactionStatus?: string;
  readonly supported?: boolean;
}): AnchoredProposalActivation {
  const providerSafeLabel = providerLabel(input.providerAvailability, input.dryRunMode);
  const decision = selectDecision(input);
  const activated = decision === "activate-fake-dry-run" || decision === "activate-real-dry-run-if-opted-in";
  const activationId = [
    "anchored_proposal_activation",
    input.requestId,
    decision,
    input.taskLifecycleId ?? "no-lifecycle",
    input.analysisBriefId ?? "no-analysis",
    input.planQualityId ?? "no-plan-quality",
  ].join("_").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
  const { reason, nextAction } = describeDecision(decision);

  return {
    activationId,
    decision,
    activated,
    dryRunMode: input.dryRunMode,
    ...(input.taskLifecycleId ? { taskLifecycleId: input.taskLifecycleId } : {}),
    ...(input.taskIntentId ? { taskIntentId: input.taskIntentId } : {}),
    ...(input.contextPacketId ? { contextPacketId: input.contextPacketId } : {}),
    ...(input.contextGraphId ? { contextGraphId: input.contextGraphId } : {}),
    ...(input.codeGraphTraceId ? { codeGraphTraceId: input.codeGraphTraceId } : {}),
    ...(input.analysisBriefId ? { analysisBriefId: input.analysisBriefId } : {}),
    ...(input.analysisQualityId ? { analysisQualityId: input.analysisQualityId } : {}),
    ...(input.taskExecutionPlanId ? { taskExecutionPlanId: input.taskExecutionPlanId } : {}),
    ...(input.planQualityId ? { planQualityId: input.planQualityId } : {}),
    providerSafeLabel,
    ...(input.redactionStatus ? { redactionStatus: input.redactionStatus } : {}),
    reason,
    nextAction,
    mutationAuthority: "not-granted",
    providerCall: "not-run",
    evidence: [
      `anchored-proposal-activation:id:${activationId}`,
      `anchored-proposal-activation:decision:${decision}`,
      `anchored-proposal-activation:dry-run-mode:${input.dryRunMode}`,
      `anchored-proposal-activation:provider:${providerSafeLabel}`,
      ...(input.taskLifecycleId ? [`anchored-proposal-activation:lifecycle:${input.taskLifecycleId}`] : []),
      ...(input.taskIntentId ? [`anchored-proposal-activation:task-intent:${input.taskIntentId}`] : []),
      ...(input.contextPacketId ? [`anchored-proposal-activation:context-packet:${input.contextPacketId}`] : []),
      ...(input.contextGraphId ? [`anchored-proposal-activation:context-graph:${input.contextGraphId}`] : []),
      ...(input.codeGraphTraceId ? [`anchored-proposal-activation:code-graph-trace:${input.codeGraphTraceId}`] : []),
      ...(input.analysisBriefId ? [`anchored-proposal-activation:analysis-brief:${input.analysisBriefId}`] : []),
      ...(input.analysisQualityId ? [`anchored-proposal-activation:analysis-quality:${input.analysisQualityId}`] : []),
      ...(input.taskExecutionPlanId ? [`anchored-proposal-activation:execution-plan:${input.taskExecutionPlanId}`] : []),
      ...(input.planQualityId ? [`anchored-proposal-activation:plan-quality:${input.planQualityId}`] : []),
      "anchored-proposal-activation:provider-call:not-run",
      "anchored-proposal-activation:mutation-authority:not-granted",
      "anchored-proposal-activation:raw-content-excluded",
    ],
  };
}

function selectDecision(input: {
  readonly dryRunMode: AnchoredProposalDryRunMode;
  readonly taskLifecycleId?: string;
  readonly analysisBriefId?: string;
  readonly analysisQualityId?: string;
  readonly analysisQualityDecision?: string;
  readonly planQualityId?: string;
  readonly planQualityLevel?: string;
  readonly providerAvailability?: ProviderEditAvailability;
  readonly redactionStatus?: string;
  readonly supported?: boolean;
}): AnchoredProposalActivationDecision {
  if (input.supported === false) return "stop-unsupported";
  if (input.dryRunMode === "none") return "stop-no-dry-run-mode";
  if (!input.taskLifecycleId) return "stop-missing-lifecycle";
  if (!input.analysisBriefId || !input.analysisQualityId) return "stop-missing-analysis";
  if (input.analysisQualityDecision && input.analysisQualityDecision !== "allow") return "stop-low-analysis-quality";
  if (!input.planQualityId || (input.planQualityLevel && input.planQualityLevel !== "ready")) {
    return "stop-low-plan-quality";
  }
  if (input.redactionStatus !== "redacted-and-budgeted") return "stop-redaction-risk";
  if (input.dryRunMode === "real-opt-in") {
    if (input.providerAvailability?.kind !== "available") return "stop-provider-not-configured";
    return "activate-real-dry-run-if-opted-in";
  }
  return "activate-fake-dry-run";
}

function providerLabel(
  availability: ProviderEditAvailability | undefined,
  mode: AnchoredProposalDryRunMode,
): string {
  if (mode === "fake") return "fake-provider";
  if (availability?.kind === "available") return availability.providerKindLabel;
  return availability?.kind ?? "none";
}

function describeDecision(
  decision: AnchoredProposalActivationDecision,
): { readonly reason: string; readonly nextAction: string } {
  switch (decision) {
    case "activate-fake-dry-run":
      return {
        reason: "Anchored proposal runtime can use deterministic fake-provider dry-run.",
        nextAction: "Run fake provider dry-run, validate output, anchor it, and keep mutation closed.",
      };
    case "activate-real-dry-run-if-opted-in":
      return {
        reason: "Anchored proposal runtime can use the existing explicit real-provider dry-run boundary.",
        nextAction: "Run only the approved dry-run boundary; do not apply provider output.",
      };
    case "stop-missing-lifecycle":
      return {
        reason: "Anchored proposal activation requires task lifecycle evidence.",
        nextAction: "Build lifecycle evidence before provider proposal dry-run.",
      };
    case "stop-missing-analysis":
      return {
        reason: "Anchored proposal activation requires analysis brief and analysis quality evidence.",
        nextAction: "Create evidence-grounded analysis and quality gate facts first.",
      };
    case "stop-low-analysis-quality":
      return {
        reason: "Analysis quality is not sufficient for provider proposal dry-run.",
        nextAction: "Acquire missing context or strengthen the analysis before dry-run.",
      };
    case "stop-low-plan-quality":
      return {
        reason: "Plan quality is not ready for anchored provider proposal dry-run.",
        nextAction: "Improve Plan Quality to ready before dry-run.",
      };
    case "stop-no-dry-run-mode":
      return {
        reason: "No anchored proposal dry-run mode was selected.",
        nextAction: "Select deterministic fake dry-run or an existing explicit real-provider dry-run.",
      };
    case "stop-provider-not-configured":
      return {
        reason: "Real-provider anchored proposal dry-run is not configured or not available.",
        nextAction: "Use fake-provider eval or an approved opt-in real-provider dry-run setup.",
      };
    case "stop-redaction-risk":
      return {
        reason: "Anchored proposal activation requires redacted and budgeted context.",
        nextAction: "Redact and budget provider prompt context before dry-run.",
      };
    case "stop-unsupported":
      return {
        reason: "Anchored proposal activation is unsupported for this prompt or runtime state.",
        nextAction: "Use the existing lifecycle surface or a supported proposal dry-run route.",
      };
  }
}
