import type { AnalysisBrief } from "./analysisBrief.js";
import type { AnalysisQualityGateResult } from "./analysisQualityGate.js";
import type { PlanQuality } from "./planQuality.js";
import type { TaskContextSufficiency } from "./taskContextSufficiency.js";
import type { TaskExecutionPlan } from "./taskExecutionPlan.js";
import type { TaskLifecycle } from "./taskLifecycle.js";
import type { TaskLifecycleActivation } from "./taskLifecycleActivation.js";
import type { CodingVerificationSummary } from "./types.js";
import {
  buildVerificationCommandPlan,
  type VerificationCommandPlan,
} from "../verification/command/plan.js";
import {
  buildVerificationRepairContext,
  type VerificationRepairContext,
} from "./verificationRepairContext.js";

export type TaskLifecycleProviderHandoffStatus =
  | "provider-proposal-ready"
  | "provider-proposal-blocked-missing-analysis"
  | "provider-proposal-blocked-low-confidence"
  | "provider-proposal-blocked-execution-plan"
  | "provider-proposal-blocked-analysis-quality";

export interface TaskLifecycleProviderHandoff {
  readonly status: TaskLifecycleProviderHandoffStatus;
  readonly lifecycleId: string;
  readonly analysisBriefId?: string;
  readonly taskExecutionPlanId?: string;
  readonly planQualityId?: string;
  readonly reason: string;
  readonly nextAction: string;
  readonly mutationAuthority: "not-granted";
  readonly providerCall: "not-run";
  readonly evidence: readonly string[];
}

export interface TaskLifecycleHandoff {
  readonly providerProposal: TaskLifecycleProviderHandoff;
  readonly verificationCommandPlan: VerificationCommandPlan;
  readonly repairContext?: VerificationRepairContext;
  readonly evidence: readonly string[];
}

export function buildTaskLifecycleHandoff(input: {
  readonly activation: TaskLifecycleActivation;
  readonly verification?: CodingVerificationSummary;
  readonly failedFiles?: ReadonlyArray<{ readonly path: string; readonly reason?: string }>;
  readonly changedFiles?: readonly string[];
  readonly runtimeReceiptMarkers?: readonly string[];
  readonly failureExcerpt?: string;
}): TaskLifecycleHandoff {
  const providerProposal = buildProviderHandoff({
    lifecycle: input.activation.taskLifecycle,
    analysisBrief: input.activation.analysisBrief,
    taskExecutionPlan: input.activation.taskExecutionPlan,
    planQuality: input.activation.planQuality,
    taskContextSufficiency: input.activation.taskContextSufficiency,
    analysisQualityGate: input.activation.analysisQualityGate,
  });
  const verificationCommandPlan = buildVerificationCommandPlan({
    agentPlan: input.activation.agentPlan,
    testImpactPlan: input.activation.contextBundle?.testImpact,
    codeGraphImpact: input.activation.contextBundle?.codeGraphImpact,
    planQuality: input.activation.planQuality,
    taskContextSufficiency: input.activation.taskContextSufficiency,
    analysisQualityGate: input.activation.analysisQualityGate,
    taskLifecycle: input.activation.taskLifecycle,
    taskExecutionPlan: input.activation.taskExecutionPlan,
    explicitCommand: input.activation.agentPlan.suggestedVerification[0],
    sourceContextPacketId: input.activation.contextBundle?.packet.packetId,
    requireContext: Boolean(input.activation.contextBundle),
    expectedEvidence: [
      "task lifecycle verification intent",
      "runtime receipt marker",
      "verification command outcome",
    ],
  });
  const repairContext = input.verification
    ? buildVerificationRepairContext({
        contextPacket: input.activation.contextBundle?.packet,
        agentPlan: input.activation.agentPlan,
        taskLifecycle: input.activation.taskLifecycle,
        analysisBrief: input.activation.analysisBrief,
        taskExecutionPlan: input.activation.taskExecutionPlan,
        taskContextSufficiency: input.activation.taskContextSufficiency,
        analysisQualityGate: input.activation.analysisQualityGate,
        verification: input.verification,
        failedFiles: input.failedFiles,
        changedFiles: input.changedFiles,
        runtimeReceiptMarkers: input.runtimeReceiptMarkers,
        failureExcerpt: input.failureExcerpt,
      })
    : undefined;
  const evidence = [
    ...providerProposal.evidence,
    ...verificationCommandPlan.evidence,
    ...(repairContext?.evidence ?? []),
    "task-lifecycle-handoff:mutation-authority:not-granted",
    "task-lifecycle-handoff:provider-call:not-run",
    "task-lifecycle-handoff:command-dispatch:not-run",
  ];

  return {
    providerProposal,
    verificationCommandPlan,
    ...(repairContext ? { repairContext } : {}),
    evidence,
  };
}

function buildProviderHandoff(input: {
  readonly lifecycle: TaskLifecycle;
  readonly analysisBrief?: AnalysisBrief;
  readonly taskExecutionPlan?: TaskExecutionPlan;
  readonly planQuality?: PlanQuality;
  readonly taskContextSufficiency?: TaskContextSufficiency;
  readonly analysisQualityGate?: AnalysisQualityGateResult;
}): TaskLifecycleProviderHandoff {
  const status = classifyProviderHandoff(input);
  const reason = buildProviderReason(status);
  const nextAction = buildProviderNextAction(status);
  return {
    status,
    lifecycleId: input.lifecycle.lifecycleId,
    ...(input.analysisBrief ? { analysisBriefId: input.analysisBrief.briefId } : {}),
    ...(input.taskExecutionPlan ? { taskExecutionPlanId: input.taskExecutionPlan.executionPlanId } : {}),
    ...(input.planQuality ? { planQualityId: input.planQuality.qualityId } : {}),
    reason,
    nextAction,
    mutationAuthority: "not-granted",
    providerCall: "not-run",
    evidence: [
      `task-lifecycle-provider-handoff:status:${status}`,
      `task-lifecycle-provider-handoff:lifecycle:${input.lifecycle.lifecycleId}`,
      ...(input.analysisBrief ? [`task-lifecycle-provider-handoff:analysis-brief:${input.analysisBrief.briefId}`] : []),
      ...(input.taskExecutionPlan ? [`task-lifecycle-provider-handoff:execution-plan:${input.taskExecutionPlan.executionPlanId}`] : []),
      ...(input.planQuality ? [`task-lifecycle-provider-handoff:plan-quality:${input.planQuality.qualityId}`] : []),
      ...(input.analysisQualityGate ? [`task-lifecycle-provider-handoff:analysis-quality-gate:${input.analysisQualityGate.gateId}`] : []),
      ...(input.taskContextSufficiency ? [`task-lifecycle-provider-handoff:context-sufficiency:${input.taskContextSufficiency.sufficiencyId}`] : []),
      "task-lifecycle-provider-handoff:provider-call:not-run",
      "task-lifecycle-provider-handoff:mutation-authority:not-granted",
      "task-lifecycle-provider-handoff:raw-content-excluded",
    ],
  };
}

function classifyProviderHandoff(input: {
  readonly analysisBrief?: AnalysisBrief;
  readonly taskExecutionPlan?: TaskExecutionPlan;
  readonly taskContextSufficiency?: TaskContextSufficiency;
  readonly analysisQualityGate?: AnalysisQualityGateResult;
}): TaskLifecycleProviderHandoffStatus {
  if (!input.analysisBrief) {
    return "provider-proposal-blocked-missing-analysis";
  }
  if (input.analysisQualityGate && !input.analysisQualityGate.allowed) {
    return "provider-proposal-blocked-analysis-quality";
  }
  if (
    input.taskContextSufficiency &&
    input.taskContextSufficiency.providerProposalReadiness === "blocked"
  ) {
    return "provider-proposal-blocked-analysis-quality";
  }
  if (input.analysisBrief.confidence === "low" || input.analysisBrief.missingFacts.length > 0) {
    return "provider-proposal-blocked-low-confidence";
  }
  if (input.taskExecutionPlan?.proposalReadiness !== "ready") {
    return "provider-proposal-blocked-execution-plan";
  }
  return "provider-proposal-ready";
}

function buildProviderReason(status: TaskLifecycleProviderHandoffStatus): string {
  switch (status) {
    case "provider-proposal-ready":
      return "Lifecycle, analysis brief, and execution plan are ready for existing provider proposal preflight.";
    case "provider-proposal-blocked-missing-analysis":
      return "Provider proposal requires a lifecycle analysis brief.";
    case "provider-proposal-blocked-low-confidence":
      return "Provider proposal is blocked until analysis confidence and missing facts are resolved.";
    case "provider-proposal-blocked-execution-plan":
      return "Provider proposal is blocked until execution plan proposal readiness is ready.";
    case "provider-proposal-blocked-analysis-quality":
      return "Provider proposal is blocked until analysis quality gate allows provider preflight.";
  }
}

function buildProviderNextAction(status: TaskLifecycleProviderHandoffStatus): string {
  switch (status) {
    case "provider-proposal-ready":
      return "Use existing provider proposal gate; do not mutate without review confirmation.";
    case "provider-proposal-blocked-missing-analysis":
      return "Create an evidence-grounded analysis brief first.";
    case "provider-proposal-blocked-low-confidence":
      return "Read missing evidence and rebuild the analysis brief.";
    case "provider-proposal-blocked-execution-plan":
      return "Rebuild execution plan readiness before provider proposal.";
    case "provider-proposal-blocked-analysis-quality":
      return "Acquire missing context or strengthen analysis evidence before provider proposal.";
  }
}
