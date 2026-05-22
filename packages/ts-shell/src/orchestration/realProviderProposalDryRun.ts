import type { ContextAwareProviderPromptContext } from "./contextAwareProviderPrompt.js";
import type { ProviderAnchorQuality } from "./providerAnchorQuality.js";
import { classifyProviderAnchorQuality } from "./providerAnchorQuality.js";
import type { ProviderPromptAudit } from "./providerPromptAudit.js";
import { auditProviderPrompt } from "./providerPromptAudit.js";
import {
  normalizeProviderEditProposal,
  type ProviderEditProposalManifest,
  type ProviderEditRawProposal,
} from "./providerEditProposal.js";
import type { ProviderEditAvailability } from "./providerEditPlanner.js";
import type { ProviderOutputValidation } from "./providerOutputValidator.js";
import { validateProviderOutput } from "./providerOutputValidator.js";
import type { RealProviderProposalGateResult } from "./realProviderProposalGate.js";
import { evaluateRealProviderProposalGate } from "./realProviderProposalGate.js";

export type RealProviderProposalDryRunStatus =
  | "dry-run-proposal-created"
  | "dry-run-review-required"
  | "dry-run-exact-ready-no-write"
  | "dry-run-stopped-no-opt-in"
  | "dry-run-provider-not-configured"
  | "dry-run-provider-unsupported"
  | "dry-run-missing-lifecycle"
  | "dry-run-missing-analysis"
  | "dry-run-low-analysis-quality"
  | "dry-run-low-plan-quality"
  | "dry-run-missing-context"
  | "dry-run-context-over-budget"
  | "dry-run-redaction-risk"
  | "dry-run-prompt-audit-failed"
  | "dry-run-provider-invalid-output"
  | "dry-run-anchor-quality-low"
  | "dry-run-unsupported";

export interface RealProviderProposalDryRunProvider {
  readonly proposeEdit: (
    context: ContextAwareProviderPromptContext,
  ) => ProviderEditRawProposal | Promise<ProviderEditRawProposal>;
}

export type RealProviderProposalDryRunResult =
  | {
      readonly status:
        | "dry-run-proposal-created"
        | "dry-run-review-required"
        | "dry-run-exact-ready-no-write";
      readonly dryRunId: string;
      readonly providerSafeLabel: string;
      readonly gate: RealProviderProposalGateResult;
      readonly promptAudit: ProviderPromptAudit;
      readonly outputValidation: ProviderOutputValidation;
      readonly anchorQuality: ProviderAnchorQuality;
      readonly manifest: ProviderEditProposalManifest;
      readonly providerCalled: true;
      readonly changedFiles: readonly [];
      readonly mutationAuthority: "not-granted";
      readonly mutation: "not-run";
      readonly reason: string;
      readonly nextAction: string;
      readonly evidence: readonly string[];
    }
  | {
      readonly status: Exclude<
        RealProviderProposalDryRunStatus,
        | "dry-run-proposal-created"
        | "dry-run-review-required"
        | "dry-run-exact-ready-no-write"
      >;
      readonly dryRunId: string;
      readonly providerSafeLabel?: string;
      readonly gate: RealProviderProposalGateResult;
      readonly promptAudit?: ProviderPromptAudit;
      readonly outputValidation?: ProviderOutputValidation;
      readonly anchorQuality?: ProviderAnchorQuality;
      readonly providerCalled: boolean;
      readonly changedFiles: readonly [];
      readonly mutationAuthority: "not-granted";
      readonly mutation: "not-run";
      readonly reason: string;
      readonly nextAction: string;
      readonly evidence: readonly string[];
    };

export async function runRealProviderProposalDryRun(input: {
  readonly requestId: string;
  readonly dryRunOptIn: boolean;
  readonly promptContext?: ContextAwareProviderPromptContext;
  readonly explicitTargetLabels: readonly string[];
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
  readonly provider?: RealProviderProposalDryRunProvider;
  readonly maxPromptChars?: number;
}): Promise<RealProviderProposalDryRunResult> {
  const gate = evaluateRealProviderProposalGate({
    requestId: input.requestId,
    dryRunOptIn: input.dryRunOptIn,
    lifecycleId: input.lifecycleId,
    analysisBriefId: input.analysisBriefId,
    analysisQualityId: input.analysisQualityId,
    analysisQualityDecision: input.analysisQualityDecision,
    planQualityId: input.planQualityId,
    planQualityLevel: input.planQualityLevel,
    contextPacketId: input.contextPacketId,
    contextGraphId: input.contextGraphId,
    codeGraphTraceId: input.codeGraphTraceId,
    taskExecutionPlanId: input.taskExecutionPlanId,
    providerAvailability: input.providerAvailability,
    redactionStatus: input.redactionStatus,
    contextOverBudget: input.contextOverBudget,
  });
  const dryRunId = buildDryRunId(input.requestId, gate.gateId);
  if (!gate.allowed || !input.promptContext) {
    return stoppedDryRun({
      status: mapGateDecision(gate.decision),
      dryRunId,
      gate,
      providerCalled: false,
      reason: gate.reason,
      nextAction: input.promptContext ? gate.nextAction : "Build provider prompt context before dry-run.",
      evidence: gate.evidence,
    });
  }

  const promptAudit = auditProviderPrompt({
    requestId: input.requestId,
    promptContext: input.promptContext,
    maxPromptChars: input.maxPromptChars,
  });
  if (promptAudit.status !== "pass") {
    return stoppedDryRun({
      status: "dry-run-prompt-audit-failed",
      dryRunId,
      gate,
      promptAudit,
      providerCalled: false,
      reason: `Provider prompt audit failed: ${promptAudit.blockedReasons.join(", ")}.`,
      nextAction: "Redact, budget, and complete provider prompt context before dry-run.",
      evidence: [...gate.evidence, ...promptAudit.evidence],
    });
  }

  if (!input.provider) {
    return stoppedDryRun({
      status: "dry-run-provider-not-configured",
      dryRunId,
      gate,
      promptAudit,
      providerCalled: false,
      reason: "No explicit dry-run provider adapter was supplied.",
      nextAction: "Use a deterministic fake provider or an approved real-provider dry-run adapter.",
      evidence: [...gate.evidence, ...promptAudit.evidence],
    });
  }

  const rawOutput = await input.provider.proposeEdit(input.promptContext);
  const outputValidation = validateProviderOutput({
    requestId: input.requestId,
    rawOutput,
    explicitTargetLabels: input.explicitTargetLabels,
  });
  const anchorQuality = classifyProviderAnchorQuality({
    requestId: input.requestId,
    validation: outputValidation,
    verificationPlan: rawOutput.verificationPlan,
  });

  if (!outputValidation.validForManifest) {
    return stoppedDryRun({
      status:
        outputValidation.status === "unsafe-output"
          ? "dry-run-anchor-quality-low"
          : "dry-run-provider-invalid-output",
      dryRunId,
      gate,
      promptAudit,
      outputValidation,
      anchorQuality,
      providerCalled: true,
      reason: outputValidation.reason,
      nextAction: "Request a bounded target-bound proposal with exact anchors before review.",
      evidence: [
        ...gate.evidence,
        ...promptAudit.evidence,
        ...outputValidation.evidence,
        ...anchorQuality.evidence,
      ],
    });
  }

  const availability = input.providerAvailability;
  if (availability.kind !== "available") {
    return stoppedDryRun({
      status: "dry-run-unsupported",
      dryRunId,
      gate,
      promptAudit,
      outputValidation,
      anchorQuality,
      providerCalled: true,
      reason: "Provider availability changed after gate evaluation.",
      nextAction: "Retry only through a fresh dry-run gate.",
      evidence: [
        ...gate.evidence,
        ...promptAudit.evidence,
        ...outputValidation.evidence,
        ...anchorQuality.evidence,
      ],
    });
  }

  const normalized = normalizeProviderEditProposal({
    providerKindLabel: availability.providerKindLabel,
    rawProposal: rawOutput,
    explicitTargetLabels: input.explicitTargetLabels,
    contextPacketId: input.contextPacketId,
    agentPlanId: input.promptContext.agentPlanId,
    taskLifecycleId: input.lifecycleId,
    analysisBriefId: input.analysisBriefId,
    planQualityId: input.planQualityId,
    taskExecutionPlanId: input.taskExecutionPlanId,
    dryRunId,
    promptAuditId: promptAudit.auditId,
    outputValidationId: outputValidation.validationId,
    anchorQualityId: anchorQuality.qualityId,
    contextReadiness: "ready",
  });
  if (normalized.ok === false) {
    return stoppedDryRun({
      status: "dry-run-provider-invalid-output",
      dryRunId,
      gate,
      promptAudit,
      outputValidation,
      anchorQuality,
      providerCalled: true,
      reason: normalized.reason,
      nextAction: "Request a normalized target-bound proposal before review.",
      evidence: [
        ...gate.evidence,
        ...promptAudit.evidence,
        ...outputValidation.evidence,
        ...anchorQuality.evidence,
        ...normalized.evidence,
      ],
    });
  }

  const status =
    anchorQuality.level === "exact-ready"
      ? "dry-run-exact-ready-no-write"
      : normalized.manifest.reviewRequired
        ? "dry-run-review-required"
        : "dry-run-proposal-created";
  return {
    status,
    dryRunId,
    providerSafeLabel: availability.providerKindLabel,
    gate,
    promptAudit,
    outputValidation,
    anchorQuality,
    manifest: normalized.manifest,
    providerCalled: true,
    changedFiles: [],
    mutationAuthority: "not-granted",
    mutation: "not-run",
    reason:
      status === "dry-run-exact-ready-no-write"
        ? "Provider dry-run produced an exact-ready no-write proposal."
        : "Provider dry-run produced a review-required no-write proposal.",
    nextAction:
      status === "dry-run-exact-ready-no-write"
        ? "Review and explicitly confirm exact hunks before any existing apply lane."
        : "Review and anchor provider output before any existing apply lane.",
    evidence: [
      ...gate.evidence,
      ...promptAudit.evidence,
      ...outputValidation.evidence,
      ...anchorQuality.evidence,
      ...normalized.manifest.evidence,
      `real-provider-proposal-dry-run:id:${dryRunId}`,
      `real-provider-proposal-dry-run:status:${status}`,
      "real-provider-proposal-dry-run:provider-called:explicit-dry-run",
      "real-provider-proposal-dry-run:mutation:not-run",
      "real-provider-proposal-dry-run:mutation-authority:not-granted",
      "real-provider-proposal-dry-run:raw-content-excluded",
    ],
  };
}

function stoppedDryRun(input: {
  readonly status: Exclude<
    RealProviderProposalDryRunStatus,
    | "dry-run-proposal-created"
    | "dry-run-review-required"
    | "dry-run-exact-ready-no-write"
  >;
  readonly dryRunId: string;
  readonly gate: RealProviderProposalGateResult;
  readonly promptAudit?: ProviderPromptAudit;
  readonly outputValidation?: ProviderOutputValidation;
  readonly anchorQuality?: ProviderAnchorQuality;
  readonly providerCalled: boolean;
  readonly reason: string;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}): RealProviderProposalDryRunResult {
  return {
    status: input.status,
    dryRunId: input.dryRunId,
    ...(input.gate.providerSafeLabel ? { providerSafeLabel: input.gate.providerSafeLabel } : {}),
    gate: input.gate,
    ...(input.promptAudit ? { promptAudit: input.promptAudit } : {}),
    ...(input.outputValidation ? { outputValidation: input.outputValidation } : {}),
    ...(input.anchorQuality ? { anchorQuality: input.anchorQuality } : {}),
    providerCalled: input.providerCalled,
    changedFiles: [],
    mutationAuthority: "not-granted",
    mutation: "not-run",
    reason: input.reason,
    nextAction: input.nextAction,
    evidence: [
      ...input.evidence,
      `real-provider-proposal-dry-run:id:${input.dryRunId}`,
      `real-provider-proposal-dry-run:status:${input.status}`,
      `real-provider-proposal-dry-run:provider-called:${input.providerCalled ? "explicit-dry-run" : "not-run"}`,
      "real-provider-proposal-dry-run:mutation:not-run",
      "real-provider-proposal-dry-run:mutation-authority:not-granted",
      "real-provider-proposal-dry-run:raw-content-excluded",
    ],
  };
}

function mapGateDecision(
  decision: RealProviderProposalGateResult["decision"],
): Exclude<
  RealProviderProposalDryRunStatus,
  | "dry-run-proposal-created"
  | "dry-run-review-required"
  | "dry-run-exact-ready-no-write"
> {
  switch (decision) {
    case "allow-dry-run":
      return "dry-run-missing-context";
    case "stop-no-opt-in":
      return "dry-run-stopped-no-opt-in";
    case "stop-provider-not-configured":
      return "dry-run-provider-not-configured";
    case "stop-provider-unsupported":
      return "dry-run-provider-unsupported";
    case "stop-missing-lifecycle":
      return "dry-run-missing-lifecycle";
    case "stop-missing-analysis":
      return "dry-run-missing-analysis";
    case "stop-low-analysis-quality":
      return "dry-run-low-analysis-quality";
    case "stop-low-plan-quality":
      return "dry-run-low-plan-quality";
    case "stop-missing-context":
      return "dry-run-missing-context";
    case "stop-context-over-budget":
      return "dry-run-context-over-budget";
    case "stop-redaction-risk":
      return "dry-run-redaction-risk";
    case "stop-unsupported":
      return "dry-run-unsupported";
  }
}

function buildDryRunId(requestId: string, gateId: string): string {
  return `real_provider_proposal_dry_run_${[requestId, gateId]
    .join("_")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 96)}`;
}
