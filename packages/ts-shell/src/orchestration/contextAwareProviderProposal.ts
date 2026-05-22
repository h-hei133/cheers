import type { AgentPlan } from "./agentPlan.js";
import type { ContextGraph } from "./contextGraph.js";
import type { ContextGraphScore } from "./contextGraphScore.js";
import type { TargetedContextPacket } from "./contextPacket.js";
import type { TestImpactPlan } from "./testImpactPlan.js";
import type { PlanQuality } from "./planQuality.js";
import type { CodeGraphImpact } from "./codeGraphImpact.js";
import { evaluatePlanQualityGate } from "./planQualityGate.js";
import {
  buildContextAwareProviderEditInput,
  type ContextAwareProviderEditInput,
} from "./contextAwareProviderEdit.js";
import {
  buildContextAwareProviderPrompt,
  type ContextAwareProviderPromptContext,
} from "./contextAwareProviderPrompt.js";
import type { ProviderEditAvailability } from "./providerEditPlanner.js";
import {
  normalizeProviderEditProposal,
  type ProviderEditProposalManifest,
  type ProviderEditRawProposal,
} from "./providerEditProposal.js";

export type ContextAwareProviderProposalStatus =
  | "context-ready-proposal"
  | "context-missing-stopped"
  | "context-over-budget-stopped"
  | "provider-not-configured"
  | "provider-opt-in-required"
  | "provider-unsupported"
  | "provider-request-blocked"
  | "provider-quality-blocked"
  | "provider-invalid-proposal"
  | "review-required-proposal"
  | "handoff-ready-proposal";

export interface ContextAwareProviderFakeProvider {
  readonly proposeEdit: (
    context: ContextAwareProviderPromptContext,
  ) => ProviderEditRawProposal | Promise<ProviderEditRawProposal>;
}

export type ContextAwareProviderProposalPlan =
  | {
      readonly status:
        | "context-ready-proposal"
        | "review-required-proposal"
        | "handoff-ready-proposal";
      readonly input: ContextAwareProviderEditInput;
      readonly promptContext: ContextAwareProviderPromptContext;
      readonly manifest: ProviderEditProposalManifest;
      readonly changedFiles: readonly [];
      readonly mutationAuthority: "not-granted";
      readonly mutation: "not-run";
      readonly reason: string;
      readonly nextAction: string;
      readonly evidence: readonly string[];
    }
  | {
      readonly status: Exclude<
        ContextAwareProviderProposalStatus,
        | "context-ready-proposal"
        | "review-required-proposal"
        | "handoff-ready-proposal"
      >;
      readonly input: ContextAwareProviderEditInput;
      readonly promptContext?: ContextAwareProviderPromptContext;
      readonly changedFiles: readonly [];
      readonly mutationAuthority: "not-granted";
      readonly mutation: "not-run";
      readonly reason: string;
      readonly nextAction: string;
      readonly evidence: readonly string[];
    };

export async function planContextAwareProviderProposal(input: {
  readonly requestId: string;
  readonly targetSummary: string;
  readonly contextPacket?: TargetedContextPacket;
  readonly contextGraph?: ContextGraph;
  readonly contextGraphScore?: ContextGraphScore;
  readonly testImpactPlan?: TestImpactPlan;
  readonly codeGraphImpact?: CodeGraphImpact;
  readonly agentPlan?: AgentPlan;
  readonly planQuality?: PlanQuality;
  readonly userRequest: string;
  readonly constraints?: readonly string[];
  readonly nonGoals?: readonly string[];
  readonly availability: ProviderEditAvailability;
  readonly provider?: ContextAwareProviderFakeProvider;
  readonly allowReviewOnlyWithMissingContext?: boolean;
}): Promise<ContextAwareProviderProposalPlan> {
  const editInput = buildContextAwareProviderEditInput({
    requestId: input.requestId,
    targetSummary: input.targetSummary,
    contextPacket: input.contextPacket,
    contextGraph: input.contextGraph,
    contextGraphScore: input.contextGraphScore,
    testImpactPlan: input.testImpactPlan,
    codeGraphImpact: input.codeGraphImpact,
    agentPlan: input.agentPlan,
    providerReadinessState: input.availability.kind,
    allowReviewOnlyWithMissingContext: input.allowReviewOnlyWithMissingContext,
  });

  if (editInput.status !== "ready" || !input.contextPacket || !input.agentPlan) {
    return stoppedPlan({
      status: mapInputStoppedStatus(editInput.status),
      input: editInput,
      reason: editInput.reason ?? "Provider proposal context is not ready.",
      nextAction: editInput.nextAction ?? "Build context before provider proposal.",
      evidence: editInput.evidence,
    });
  }

  if (input.planQuality) {
    const qualityGate = evaluatePlanQualityGate({
      planQuality: input.planQuality,
      action: "provider-proposal",
    });
    if (!qualityGate.allowed) {
      return stoppedPlan({
        status: "provider-quality-blocked",
        input: editInput,
        reason: qualityGate.reason,
        nextAction: qualityGate.nextAction,
        evidence: [...editInput.evidence, ...input.planQuality.evidence, ...qualityGate.evidence],
      });
    }
  }

  const unavailable = classifyAvailability(input.availability);
  if (unavailable) {
    return stoppedPlan({
      ...unavailable,
      input: editInput,
      evidence: editInput.evidence,
    });
  }

  const promptContext = buildContextAwareProviderPrompt({
    editInput,
    contextPacket: input.contextPacket,
    userRequest: input.userRequest,
    constraints: input.constraints,
    nonGoals: input.nonGoals,
  });

  if (!input.provider) {
    return stoppedPlan({
      status: "provider-opt-in-required",
      input: editInput,
      promptContext,
      reason:
        "Context-aware provider proposal requires an explicit fake/stub or opt-in provider boundary.",
      nextAction: "Use a deterministic fake provider or an isolated opt-in provider gate.",
      evidence: [...editInput.evidence, ...promptContext.evidence],
    });
  }
  if (input.availability.kind !== "available") {
    return stoppedPlan({
      status: "provider-request-blocked",
      input: editInput,
      promptContext,
      reason: "Provider availability changed before context-aware proposal call.",
      nextAction: "Resolve provider readiness before retrying.",
      evidence: [...editInput.evidence, ...promptContext.evidence],
    });
  }

  const rawProposal = await input.provider.proposeEdit(promptContext);
  const normalized = normalizeProviderEditProposal({
    providerKindLabel: input.availability.providerKindLabel,
    rawProposal,
    explicitTargetLabels: editInput.targetLabels,
    contextPacketId: input.contextPacket.packetId,
    agentPlanId: input.agentPlan.planId,
    contextConfidence: input.agentPlan.confidence,
    contextReadiness: input.agentPlan.executionReadiness === "ready" ? "ready" : "needs-more-context",
  });
  if (normalized.ok === false) {
    return stoppedPlan({
      status: "provider-invalid-proposal",
      input: editInput,
      promptContext,
      reason: normalized.reason,
      nextAction:
        "Ask for a bounded exact target proposal tied to the context packet and Agent Plan.",
      evidence: [
        ...editInput.evidence,
        ...promptContext.evidence,
        ...normalized.evidence,
      ],
    });
  }

  const status =
    normalized.manifest.handoffReadiness === "exact-single-target" ||
    normalized.manifest.handoffReadiness === "exact-target-set"
      ? "handoff-ready-proposal"
      : normalized.manifest.reviewRequired
        ? "review-required-proposal"
        : "context-ready-proposal";
  return {
    status,
    input: editInput,
    promptContext,
    manifest: normalized.manifest,
    changedFiles: [],
    mutationAuthority: "not-granted",
    mutation: "not-run",
    reason:
      status === "handoff-ready-proposal"
        ? "Context-aware provider proposal is exact and ready for explicit review handoff."
        : "Context-aware provider proposal was created for review; mutation did not run.",
    nextAction:
      status === "handoff-ready-proposal"
        ? "Confirm exact target mapping before handing off to existing edit lanes."
        : "Review the context-aware provider proposal before any handoff.",
    evidence: [
      ...editInput.evidence,
      ...promptContext.evidence,
      ...normalized.manifest.evidence,
      `context-aware-provider-proposal:status:${status}`,
      "context-aware-provider-proposal:provider-call:fake-or-opt-in",
      "context-aware-provider-proposal:mutation:not-run",
      "context-aware-provider-proposal:mutation-authority:not-granted",
      "context-aware-provider-proposal:raw-content-excluded",
    ],
  };
}

function mapInputStoppedStatus(
  status: ContextAwareProviderEditInput["status"],
): Exclude<
  ContextAwareProviderProposalStatus,
  | "context-ready-proposal"
  | "review-required-proposal"
  | "handoff-ready-proposal"
  | "provider-not-configured"
  | "provider-opt-in-required"
  | "provider-unsupported"
  | "provider-request-blocked"
  | "provider-quality-blocked"
  | "provider-invalid-proposal"
> {
  switch (status) {
    case "context-over-budget":
      return "context-over-budget-stopped";
    case "missing-context":
    case "plan-needs-more-context":
      return "context-missing-stopped";
    case "ready":
      return "context-missing-stopped";
  }
}

function classifyAvailability(
  availability: ProviderEditAvailability,
):
  | {
      readonly status:
        | "provider-not-configured"
        | "provider-opt-in-required"
        | "provider-unsupported"
        | "provider-request-blocked";
      readonly reason: string;
      readonly nextAction: string;
    }
  | undefined {
  switch (availability.kind) {
    case "available":
      return undefined;
    case "not-configured":
      return {
        status: "provider-not-configured",
        reason: availability.reason ?? "Provider is not configured for proposal generation.",
        nextAction: "Configure provider credentials through an approved opt-in flow.",
      };
    case "opt-in-required":
      return {
        status: "provider-opt-in-required",
        reason: availability.reason ?? "Provider proposal generation was not explicitly opted in.",
        nextAction: "Use a deterministic fake provider or explicit provider gate.",
      };
    case "unsupported":
      return {
        status: "provider-unsupported",
        reason: availability.reason ?? "Provider is unsupported for proposal generation.",
        nextAction: "Use a supported provider proposal adapter or fake provider.",
      };
    case "request-blocked":
      return {
        status: "provider-request-blocked",
        reason: availability.reason ?? "Provider proposal request was blocked.",
        nextAction: "Resolve provider readiness before retrying.",
      };
  }
}

function stoppedPlan(input: {
  readonly status: Exclude<
    ContextAwareProviderProposalStatus,
    | "context-ready-proposal"
    | "review-required-proposal"
    | "handoff-ready-proposal"
  >;
  readonly input: ContextAwareProviderEditInput;
  readonly promptContext?: ContextAwareProviderPromptContext;
  readonly reason: string;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}): ContextAwareProviderProposalPlan {
  return {
    status: input.status,
    input: input.input,
    ...(input.promptContext ? { promptContext: input.promptContext } : {}),
    changedFiles: [],
    mutationAuthority: "not-granted",
    mutation: "not-run",
    reason: input.reason,
    nextAction: input.nextAction,
    evidence: [
      ...input.evidence,
      `context-aware-provider-proposal:status:${input.status}`,
      "context-aware-provider-proposal:provider-call:not-run-or-invalid",
      "context-aware-provider-proposal:mutation:not-run",
      "context-aware-provider-proposal:mutation-authority:not-granted",
      "context-aware-provider-proposal:raw-content-excluded",
    ],
  };
}
