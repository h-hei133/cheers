import crypto from "node:crypto";

import { classifyHarnessFailure, type HarnessFailureTaxonomyEntry } from "./harnessFailureTaxonomy.js";

export type HarnessTraceLifecycleStage =
  | "read"
  | "analyze"
  | "plan"
  | "proposal"
  | "edit"
  | "verification"
  | "repair"
  | "result";

export interface HarnessTrace {
  readonly traceId: string;
  readonly routeId?: string;
  readonly taskId?: string;
  readonly taskLifecycleId?: string;
  readonly analysisBriefId?: string;
  readonly taskExecutionPlanId?: string;
  readonly contextPacketId?: string;
  readonly contextGraphId?: string;
  readonly agentPlanId?: string;
  readonly planQualityId?: string;
  readonly contextSufficiencyState?: string;
  readonly analysisConfidence?: string;
  readonly underEvidencedClaimsCount?: number;
  readonly missingRequiredContextCount?: number;
  readonly staleContext?: boolean;
  readonly budgetLimitedContext?: boolean;
  readonly downstreamReadiness?: string;
  readonly providerProposalId?: string;
  readonly verificationCommandPlanId?: string;
  readonly runtimeReceiptMarkers: readonly string[];
  readonly repairContextId?: string;
  readonly repairProposalId?: string;
  readonly resultStatus?: string;
  readonly lifecycleStages: readonly HarnessTraceLifecycleStage[];
  readonly failureTaxonomy: HarnessFailureTaxonomyEntry;
  readonly redactionStatus: "redacted-and-budgeted";
  readonly mutationAuthority: "not-granted";
  readonly replaySafeSummary: string;
  readonly evidence: readonly string[];
}

export function buildHarnessTrace(input: {
  readonly routeId?: string;
  readonly taskId?: string;
  readonly taskLifecycleId?: string;
  readonly analysisBriefId?: string;
  readonly taskExecutionPlanId?: string;
  readonly contextPacketId?: string;
  readonly contextGraphId?: string;
  readonly agentPlanId?: string;
  readonly planQualityId?: string;
  readonly contextSufficiencyState?: string;
  readonly analysisConfidence?: string;
  readonly underEvidencedClaimsCount?: number;
  readonly missingRequiredContextCount?: number;
  readonly staleContext?: boolean;
  readonly budgetLimitedContext?: boolean;
  readonly downstreamReadiness?: string;
  readonly providerProposalId?: string;
  readonly verificationCommandPlanId?: string;
  readonly runtimeReceiptMarkers?: readonly string[];
  readonly repairContextId?: string;
  readonly repairProposalId?: string;
  readonly resultStatus?: string;
  readonly status?: string;
  readonly reason?: string;
  readonly evidence?: readonly string[];
}): HarnessTrace {
  const runtimeReceiptMarkers = input.runtimeReceiptMarkers ?? [];
  const lifecycleStages = deriveStages(input);
  const failureTaxonomy = classifyHarnessFailure({
    status: input.status ?? input.resultStatus,
    reason: input.reason,
    evidence: input.evidence,
  });
  const traceId = buildTraceId({ ...input, lifecycleStages, failureClass: failureTaxonomy.failureClass });
  const replaySafeSummary = [
    `harness-trace ${traceId}`,
    input.routeId ? `route=${input.routeId}` : undefined,
    input.taskId ? `task=${input.taskId}` : undefined,
    input.taskLifecycleId ? `taskLifecycle=${input.taskLifecycleId}` : undefined,
    input.analysisBriefId ? `analysisBrief=${input.analysisBriefId}` : undefined,
    input.taskExecutionPlanId ? `executionPlan=${input.taskExecutionPlanId}` : undefined,
    input.contextPacketId ? `contextPacket=${input.contextPacketId}` : undefined,
    input.contextGraphId ? `contextGraph=${input.contextGraphId}` : undefined,
    input.agentPlanId ? `agentPlan=${input.agentPlanId}` : undefined,
    input.planQualityId ? `planQuality=${input.planQualityId}` : undefined,
    input.contextSufficiencyState ? `contextSufficiency=${input.contextSufficiencyState}` : undefined,
    input.analysisConfidence ? `analysisConfidence=${input.analysisConfidence}` : undefined,
    typeof input.underEvidencedClaimsCount === "number" ? `underEvidenced=${input.underEvidencedClaimsCount}` : undefined,
    typeof input.missingRequiredContextCount === "number" ? `missingRequiredContext=${input.missingRequiredContextCount}` : undefined,
    input.staleContext ? "staleContext=true" : undefined,
    input.budgetLimitedContext ? "budgetLimitedContext=true" : undefined,
    input.downstreamReadiness ? `downstream=${input.downstreamReadiness}` : undefined,
    input.verificationCommandPlanId ? `verificationPlan=${input.verificationCommandPlanId}` : undefined,
    `stages=${lifecycleStages.join(",")}`,
    `failureClass=${failureTaxonomy.failureClass}`,
    "mutationAuthority=not-granted",
    "raw-content-excluded",
  ].filter(Boolean).join("; ");

  return {
    traceId,
    ...(input.routeId ? { routeId: input.routeId } : {}),
    ...(input.taskId ? { taskId: input.taskId } : {}),
    ...(input.taskLifecycleId ? { taskLifecycleId: input.taskLifecycleId } : {}),
    ...(input.analysisBriefId ? { analysisBriefId: input.analysisBriefId } : {}),
    ...(input.taskExecutionPlanId ? { taskExecutionPlanId: input.taskExecutionPlanId } : {}),
    ...(input.contextPacketId ? { contextPacketId: input.contextPacketId } : {}),
    ...(input.contextGraphId ? { contextGraphId: input.contextGraphId } : {}),
    ...(input.agentPlanId ? { agentPlanId: input.agentPlanId } : {}),
    ...(input.planQualityId ? { planQualityId: input.planQualityId } : {}),
    ...(input.contextSufficiencyState ? { contextSufficiencyState: input.contextSufficiencyState } : {}),
    ...(input.analysisConfidence ? { analysisConfidence: input.analysisConfidence } : {}),
    ...(typeof input.underEvidencedClaimsCount === "number" ? { underEvidencedClaimsCount: input.underEvidencedClaimsCount } : {}),
    ...(typeof input.missingRequiredContextCount === "number" ? { missingRequiredContextCount: input.missingRequiredContextCount } : {}),
    ...(typeof input.staleContext === "boolean" ? { staleContext: input.staleContext } : {}),
    ...(typeof input.budgetLimitedContext === "boolean" ? { budgetLimitedContext: input.budgetLimitedContext } : {}),
    ...(input.downstreamReadiness ? { downstreamReadiness: input.downstreamReadiness } : {}),
    ...(input.providerProposalId ? { providerProposalId: input.providerProposalId } : {}),
    ...(input.verificationCommandPlanId ? { verificationCommandPlanId: input.verificationCommandPlanId } : {}),
    runtimeReceiptMarkers,
    ...(input.repairContextId ? { repairContextId: input.repairContextId } : {}),
    ...(input.repairProposalId ? { repairProposalId: input.repairProposalId } : {}),
    ...(input.resultStatus ? { resultStatus: input.resultStatus } : {}),
    lifecycleStages,
    failureTaxonomy,
    redactionStatus: "redacted-and-budgeted",
    mutationAuthority: "not-granted",
    replaySafeSummary,
    evidence: [
      `harness-trace:id:${traceId}`,
      ...(input.contextPacketId ? [`harness-trace:context-packet:${input.contextPacketId}`] : []),
      ...(input.taskLifecycleId ? [`harness-trace:task-lifecycle:${input.taskLifecycleId}`] : []),
      ...(input.analysisBriefId ? [`harness-trace:analysis-brief:${input.analysisBriefId}`] : []),
      ...(input.taskExecutionPlanId ? [`harness-trace:execution-plan:${input.taskExecutionPlanId}`] : []),
      ...(input.contextGraphId ? [`harness-trace:context-graph:${input.contextGraphId}`] : []),
      ...(input.agentPlanId ? [`harness-trace:agent-plan:${input.agentPlanId}`] : []),
      ...(input.planQualityId ? [`harness-trace:plan-quality:${input.planQualityId}`] : []),
      ...(input.contextSufficiencyState ? [`harness-trace:context-sufficiency:${input.contextSufficiencyState}`] : []),
      ...(input.analysisConfidence ? [`harness-trace:analysis-confidence:${input.analysisConfidence}`] : []),
      ...(typeof input.underEvidencedClaimsCount === "number" ? [`harness-trace:under-evidenced:${input.underEvidencedClaimsCount}`] : []),
      ...(typeof input.missingRequiredContextCount === "number" ? [`harness-trace:missing-required-context:${input.missingRequiredContextCount}`] : []),
      ...(input.staleContext ? ["harness-trace:stale-context"] : []),
      ...(input.budgetLimitedContext ? ["harness-trace:budget-limited-context"] : []),
      ...(input.downstreamReadiness ? [`harness-trace:downstream-readiness:${input.downstreamReadiness}`] : []),
      ...(input.verificationCommandPlanId ? [`harness-trace:verification-plan:${input.verificationCommandPlanId}`] : []),
      `harness-trace:runtime-receipts:${runtimeReceiptMarkers.length}`,
      `harness-trace:failure-class:${failureTaxonomy.failureClass}`,
      failureTaxonomy.verifierMarker,
      "harness-trace:mutation-authority:not-granted",
      "harness-trace:redacted-and-budgeted",
      "harness-trace:raw-content-excluded",
    ],
  };
}

function deriveStages(input: {
  readonly contextPacketId?: string;
  readonly taskLifecycleId?: string;
  readonly analysisBriefId?: string;
  readonly taskExecutionPlanId?: string;
  readonly contextGraphId?: string;
  readonly agentPlanId?: string;
  readonly planQualityId?: string;
  readonly providerProposalId?: string;
  readonly verificationCommandPlanId?: string;
  readonly repairContextId?: string;
  readonly resultStatus?: string;
}): readonly HarnessTraceLifecycleStage[] {
  const stages: HarnessTraceLifecycleStage[] = [];
  if (input.contextPacketId || input.contextGraphId) stages.push("read");
  if (input.analysisBriefId) stages.push("analyze");
  if (input.agentPlanId || input.planQualityId) stages.push("plan");
  if (input.providerProposalId) stages.push("proposal");
  if (input.taskExecutionPlanId) stages.push("edit");
  if (input.verificationCommandPlanId) stages.push("verification");
  if (input.repairContextId) stages.push("repair");
  if (input.resultStatus) stages.push("result");
  return stages.length ? stages : ["plan"];
}

function buildTraceId(input: object): string {
  return `harness_trace_${crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 12)}`;
}
