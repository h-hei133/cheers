import type { AgentPlan } from "./agentPlan.js";
import type { ContextGraph } from "./contextGraph.js";
import type { ContextGraphScore } from "./contextGraphScore.js";
import type { TargetedContextPacket } from "./contextPacket.js";
import type { TestImpactPlan } from "./testImpactPlan.js";
import type { CodeGraphImpact } from "../context/acquisition/code/impact.js";
import type { AnalysisBrief } from "./analysisBrief.js";
import type { AnalysisQualityGateResult } from "./analysisQualityGate.js";
import type { TaskContextSufficiency } from "./taskContextSufficiency.js";
import type { TaskExecutionPlan } from "./taskExecutionPlan.js";
import type { TaskLifecycle } from "./taskLifecycle.js";
import { redactProviderEditText } from "./providerEditContext.js";

export type ContextAwareProviderProposalMode = "provider-edit-proposal";
export type ContextAwareProviderInputStatus =
  | "ready"
  | "missing-context"
  | "missing-analysis-brief"
  | "context-over-budget"
  | "plan-needs-more-context";

export interface ContextAwareProviderEditInput {
  readonly requestId: string;
  readonly proposalMode: ContextAwareProviderProposalMode;
  readonly status: ContextAwareProviderInputStatus;
  readonly targetSummary: string;
  readonly targetLabels: readonly string[];
  readonly contextPacketId?: string;
  readonly contextGraphId?: string;
  readonly contextGraphReadiness?: string;
  readonly contextCoverageScore?: number;
  readonly testImpactSummary?: string;
  readonly codeGraphTraceId?: string;
  readonly impactQueryId?: string;
  readonly impactReadiness?: string;
  readonly impactSummary?: string;
  readonly agentPlanId?: string;
  readonly taskLifecycleId?: string;
  readonly taskLifecycleStage?: string;
  readonly analysisBriefId?: string;
  readonly contextSufficiencyId?: string;
  readonly contextSufficiencyState?: string;
  readonly analysisQualityGateId?: string;
  readonly analysisQualityGateDecision?: string;
  readonly planQualityId?: string;
  readonly planQualityLevel?: string;
  readonly taskExecutionPlanId?: string;
  readonly analysisBriefSummary?: string;
  readonly executionPlanConstraints?: readonly string[];
  readonly contextCompleteness: AgentPlan["contextCompleteness"];
  readonly planConfidence: AgentPlan["confidence"];
  readonly missingFacts: readonly string[];
  readonly suggestedReads: readonly string[];
  readonly suggestedVerification: readonly string[];
  readonly targetLabelsFromPlan: readonly string[];
  readonly providerReadinessState: string;
  readonly redactionStatus: "redacted-and-budgeted";
  readonly omittedContentReasons: readonly string[];
  readonly mutationAuthority: "not-granted";
  readonly reason?: string;
  readonly nextAction?: string;
  readonly evidence: readonly string[];
}

export function buildContextAwareProviderEditInput(input: {
  readonly requestId: string;
  readonly targetSummary: string;
  readonly contextPacket?: TargetedContextPacket;
  readonly contextGraph?: ContextGraph;
  readonly contextGraphScore?: ContextGraphScore;
  readonly testImpactPlan?: TestImpactPlan;
  readonly codeGraphImpact?: CodeGraphImpact;
  readonly agentPlan?: AgentPlan;
  readonly taskLifecycle?: TaskLifecycle;
  readonly analysisBrief?: AnalysisBrief;
  readonly taskContextSufficiency?: TaskContextSufficiency;
  readonly analysisQualityGate?: AnalysisQualityGateResult;
  readonly taskExecutionPlan?: TaskExecutionPlan;
  readonly providerReadinessState: string;
  readonly proposalMode?: ContextAwareProviderProposalMode;
  readonly allowReviewOnlyWithMissingContext?: boolean;
}): ContextAwareProviderEditInput {
  const packet = input.contextPacket;
  const plan = input.agentPlan;
  const contextGraphId = input.contextGraph?.graphId ?? plan?.contextGraphIds?.[0];
  const graphReadiness = input.contextGraphScore?.planningReadiness ?? plan?.graphReadiness;
  const graphLowReadiness =
    graphReadiness === "budget-limited" ||
    graphReadiness === "low-confidence" ||
    graphReadiness === "unsupported";
  const targetLabels = packet ? [packet.targetSafeLabel] : [];
  const omittedContentReasons = packet
    ? Array.from(
        new Set(
          packet.omittedCandidateSummaries.map(
            (source) => source.reason ?? source.kind,
          ),
        ),
      )
    : ["missing-context-packet"];
  const overBudget = packet?.omittedCandidateSummaries.some(
    (source) => source.kind === "omitted-over-budget-candidate",
  ) ?? false;
  const planNeedsMoreContext =
    plan?.executionReadiness === "needs-more-context" &&
    input.allowReviewOnlyWithMissingContext !== true;
  const lifecycleId = input.taskLifecycle?.lifecycleId ?? plan?.taskLifecycleId;
  const analysisBriefId = input.analysisBrief?.briefId ?? plan?.analysisBriefId;
  const contextSufficiencyBlocked =
    input.taskContextSufficiency?.providerProposalReadiness === "blocked";
  const analysisQualityBlocked =
    input.analysisQualityGate && !input.analysisQualityGate.allowed;
  const executionPlanId =
    input.taskExecutionPlan?.executionPlanId ?? plan?.taskExecutionPlanId;

  const status: ContextAwareProviderInputStatus =
    !packet || !plan || packet.completenessStatus === "missing-context"
      ? "missing-context"
      : lifecycleId && !analysisBriefId
        ? "missing-analysis-brief"
      : overBudget
        ? "context-over-budget"
        : contextSufficiencyBlocked || analysisQualityBlocked
          ? "plan-needs-more-context"
        : graphLowReadiness
          ? "plan-needs-more-context"
        : planNeedsMoreContext
          ? "plan-needs-more-context"
          : "ready";
  const reason = buildStoppedReason(status, omittedContentReasons, plan);
  const nextAction = buildNextAction(status, plan);

  return {
    requestId: redactProviderEditText(input.requestId),
    proposalMode: input.proposalMode ?? "provider-edit-proposal",
    status,
    targetSummary: redactProviderEditText(input.targetSummary),
    targetLabels,
    ...(packet ? { contextPacketId: packet.packetId } : {}),
    ...(contextGraphId ? { contextGraphId } : {}),
    ...(graphReadiness ? { contextGraphReadiness: graphReadiness } : {}),
    ...(typeof input.contextGraphScore?.coverageScore === "number"
      ? { contextCoverageScore: input.contextGraphScore.coverageScore }
      : typeof plan?.contextCoverageScore === "number"
        ? { contextCoverageScore: plan.contextCoverageScore }
        : {}),
    ...(input.testImpactPlan
      ? {
          testImpactSummary: `tests=${input.testImpactPlan.likelyTestFiles.length}; commands=${input.testImpactPlan.likelyVerificationCommandCandidates.length}; readiness=${input.testImpactPlan.commandReadiness}`,
        }
      : plan?.testImpactSummary
        ? { testImpactSummary: plan.testImpactSummary }
        : {}),
    ...(input.codeGraphImpact
      ? {
          codeGraphTraceId: input.codeGraphImpact.traceId,
          impactQueryId: input.codeGraphImpact.impactQueryId,
          impactReadiness: input.codeGraphImpact.readiness,
          impactSummary: `tests=${input.codeGraphImpact.likelyTests.length}; callSites=${input.codeGraphImpact.likelyCallSites.length}; docs=${input.codeGraphImpact.docsReferences.length}; stale=${input.codeGraphImpact.staleContext.length}; confidence=${input.codeGraphImpact.confidence}`,
        }
      : plan?.impactQueryId
        ? {
            impactQueryId: plan.impactQueryId,
            impactReadiness: plan.impactReadiness,
            impactSummary: `readiness=${plan.impactReadiness ?? "unknown"}`,
          }
        : {}),
    ...(plan ? { agentPlanId: plan.planId } : {}),
    ...(lifecycleId ? { taskLifecycleId: lifecycleId } : {}),
    ...(input.taskLifecycle?.currentStage ?? plan?.taskLifecycleCurrentStage
      ? { taskLifecycleStage: input.taskLifecycle?.currentStage ?? plan?.taskLifecycleCurrentStage }
      : {}),
    ...(analysisBriefId ? { analysisBriefId } : {}),
    ...(input.taskContextSufficiency ? { contextSufficiencyId: input.taskContextSufficiency.sufficiencyId } : {}),
    ...(input.taskContextSufficiency ? { contextSufficiencyState: input.taskContextSufficiency.state } : {}),
    ...(input.analysisQualityGate ? { analysisQualityGateId: input.analysisQualityGate.gateId } : {}),
    ...(input.analysisQualityGate ? { analysisQualityGateDecision: input.analysisQualityGate.decision } : {}),
    ...(plan?.planQualityId ? { planQualityId: plan.planQualityId } : {}),
    ...(plan?.planQualityLevel ? { planQualityLevel: plan.planQualityLevel } : {}),
    ...(executionPlanId ? { taskExecutionPlanId: executionPlanId } : {}),
    ...(input.analysisBrief
      ? {
          analysisBriefSummary: redactProviderEditText(
            `${input.analysisBrief.confidence}; ${input.analysisBrief.recommendedStrategy}`,
          ),
        }
      : {}),
    ...(input.taskExecutionPlan
      ? {
          executionPlanConstraints: input.taskExecutionPlan.requiredConfirmation.map(
            redactProviderEditText,
          ),
        }
      : {}),
    contextCompleteness: plan?.contextCompleteness ?? "missing-context",
    planConfidence: plan?.confidence ?? "low",
    missingFacts: (plan?.missingFacts ?? ["context packet and Agent Plan are required"]).map(
      redactProviderEditText,
    ),
    suggestedReads: Array.from(
      new Set([
        ...(plan?.suggestedReads ?? []),
        ...(input.codeGraphImpact?.suggestedReads ?? []),
      ]),
    ).map(redactProviderEditText),
    suggestedVerification: (plan?.suggestedVerification ?? []).map(
      redactProviderEditText,
    ),
    targetLabelsFromPlan: plan?.targetSummary ? [redactProviderEditText(plan.targetSummary)] : [],
    providerReadinessState: redactProviderEditText(input.providerReadinessState),
    redactionStatus: "redacted-and-budgeted",
    omittedContentReasons,
    mutationAuthority: "not-granted",
    ...(reason ? { reason } : {}),
    ...(nextAction ? { nextAction } : {}),
    evidence: [
      `context-aware-provider-edit:status:${status}`,
      ...(packet ? [`context-aware-provider-edit:context-packet:${packet.packetId}`] : []),
      ...(contextGraphId ? [`context-aware-provider-edit:context-graph:${contextGraphId}`] : []),
      ...(graphReadiness ? [`context-aware-provider-edit:graph-readiness:${graphReadiness}`] : []),
      ...(input.codeGraphImpact
        ? [
            `context-aware-provider-edit:code-graph-trace:${input.codeGraphImpact.traceId}`,
            `context-aware-provider-edit:impact-query:${input.codeGraphImpact.impactQueryId}`,
            `context-aware-provider-edit:impact-readiness:${input.codeGraphImpact.readiness}`,
          ]
        : []),
      ...(plan ? [`context-aware-provider-edit:agent-plan:${plan.planId}`] : []),
      ...(lifecycleId ? [`context-aware-provider-edit:task-lifecycle:${lifecycleId}`] : []),
      ...(analysisBriefId ? [`context-aware-provider-edit:analysis-brief:${analysisBriefId}`] : []),
      ...(input.taskContextSufficiency ? [`context-aware-provider-edit:context-sufficiency:${input.taskContextSufficiency.sufficiencyId}`] : []),
      ...(input.analysisQualityGate ? [`context-aware-provider-edit:analysis-quality-gate:${input.analysisQualityGate.gateId}`] : []),
      ...(input.analysisQualityGate ? [`context-aware-provider-edit:analysis-quality-decision:${input.analysisQualityGate.decision}`] : []),
      ...(plan?.planQualityId ? [`context-aware-provider-edit:plan-quality:${plan.planQualityId}`] : []),
      ...(executionPlanId ? [`context-aware-provider-edit:execution-plan:${executionPlanId}`] : []),
      `context-aware-provider-edit:context-completeness:${plan?.contextCompleteness ?? "missing-context"}`,
      `context-aware-provider-edit:plan-confidence:${plan?.confidence ?? "low"}`,
      "context-aware-provider-edit:redacted-and-budgeted",
      "context-aware-provider-edit:mutation-authority:not-granted",
    ],
  };
}

function buildStoppedReason(
  status: ContextAwareProviderInputStatus,
  omittedContentReasons: readonly string[],
  plan: AgentPlan | undefined,
): string | undefined {
  switch (status) {
    case "ready":
      return undefined;
    case "missing-context":
      return "Provider proposal requires a complete targeted context packet and Agent Plan before provider invocation.";
    case "missing-analysis-brief":
      return "Provider proposal requires a lifecycle analysis brief before provider invocation.";
    case "context-over-budget":
      return `Provider proposal context exceeded budget: ${omittedContentReasons.join(", ") || "over budget"}.`;
    case "plan-needs-more-context":
      return plan?.missingFacts.length
        ? `Agent Plan needs more context: ${plan.missingFacts.join("; ")}.`
        : "Agent Plan needs more context before provider invocation.";
  }
}

function buildNextAction(
  status: ContextAwareProviderInputStatus,
  plan: AgentPlan | undefined,
): string | undefined {
  switch (status) {
    case "ready":
      return undefined;
    case "missing-context":
      return "Build a targeted context packet and Agent Plan for the explicit target first.";
    case "missing-analysis-brief":
      return "Create an evidence-grounded lifecycle analysis brief before provider proposal.";
    case "context-over-budget":
      return "Reduce or summarize context sources before requesting a provider proposal.";
    case "plan-needs-more-context":
      return plan?.suggestedReads.length
        ? `Read suggested context before provider proposal: ${plan.suggestedReads.join(", ")}.`
        : "Read the Agent Plan suggested context before provider proposal.";
  }
}
