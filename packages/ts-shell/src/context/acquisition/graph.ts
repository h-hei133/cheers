import type { WorkflowTaskPlan } from "../../orchestration/workflowTaskPlanner.js";
import { projectContextPacketToAgentPlanContext } from "../../planning/task/agentPlanContext.js";
import {
  projectWorkflowTaskPlanToAgentPlan,
} from "../../planning/task/agentPlanProjection.js";
import type { AgentPlan } from "../../planning/task/agentPlan.js";
import { buildContextGraphResult, type ContextGraphResultProjection } from "../graph/contextGraphResult.js";
import { discoverContextGraph } from "../graph/contextGraphDiscovery.js";
import { scoreContextGraph, type ContextGraphScore } from "../graph/contextGraphScore.js";
import {
  buildContextPacketResult,
  type ContextPacketResultProjection,
} from "../graph/contextPacketResult.js";
import {
  buildTargetedContextPacket,
  type TargetedContextPacket,
} from "../graph/contextPacket.js";
import { buildTestImpactPlan, type TestImpactPlan } from "../../orchestration/testImpactPlan.js";
import type { ContextGraph } from "../graph/contextGraph.js";
import {
  attachPlanQualityToAgentPlan,
  buildPlanQuality,
  type PlanQuality,
} from "../../planning/quality/model.js";
import { buildHarnessTrace, type HarnessTrace } from "../../evidence/harness/harnessTrace.js";
import { buildHarnessScorecard, type HarnessScorecard } from "../../evidence/harness/harnessScorecard.js";
import { normalizeCodeGraphFacts, type CodeGraphFacts } from "./code/facts.js";
import { buildCodeGraphTrace, type CodeGraphTrace } from "./code/trace.js";
import { checkCodeGraphStaleness, type CodeGraphStalenessCheck } from "./code/staleness.js";
import { buildCodeGraphImpact, type CodeGraphImpact } from "./code/impact.js";
import { buildCodeGraphResult, type CodeGraphResultProjection } from "./code/result.js";
import { buildAnalysisBrief, type AnalysisBrief } from "../../planning/task/analysisBrief.js";
import { calibrateAnalysisBrief, type AnalysisBriefCalibration } from "../../planning/task/analysisBriefCalibration.js";
import { evaluateAnalysisQualityGate, type AnalysisQualityGateResult } from "../../planning/task/analysisQualityGate.js";
import { buildTaskExecutionPlan, type TaskExecutionPlan } from "../../planning/task/taskExecutionPlan.js";
import { buildTaskContextAcquisition, type TaskContextAcquisition } from "../../planning/task/taskContextAcquisition.js";
import { buildTaskContextNeeds, type TaskContextNeedSet } from "../../planning/task/taskContextNeed.js";
import { buildTaskContextResult, type TaskContextResult } from "../../planning/task/taskContextResult.js";
import { evaluateTaskContextSufficiency, type TaskContextSufficiency } from "../../planning/task/taskContextSufficiency.js";
import { buildTaskIntent, type TaskIntent } from "../../planning/task/taskIntent.js";
import { buildTaskLifecycle, type TaskLifecycle } from "../../planning/task/taskLifecycle.js";
import { buildTaskLifecycleResult, type TaskLifecycleResultProjection } from "../../planning/task/taskLifecycleResult.js";
import { buildTaskLifecycleTrace, type TaskLifecycleTrace } from "../../planning/task/taskLifecycleTrace.js";
import { buildTaskReadPlan, type TaskReadPlan } from "../../planning/task/taskReadPlan.js";
import { buildTaskStage } from "../../planning/task/taskStage.js";

export interface ContextGraphPlanningBundle {
  readonly packet: TargetedContextPacket;
  readonly packetResult: ContextPacketResultProjection;
  readonly graph: ContextGraph;
  readonly graphScore: ContextGraphScore;
  readonly testImpact: TestImpactPlan;
  readonly codeGraphStaleness: CodeGraphStalenessCheck;
  readonly codeGraphFacts: CodeGraphFacts;
  readonly codeGraphTrace: CodeGraphTrace;
  readonly codeGraphImpact: CodeGraphImpact;
  readonly codeGraphResult: CodeGraphResultProjection;
  readonly taskIntent: TaskIntent;
  readonly taskReadPlan: TaskReadPlan;
  readonly stagedContextAcquisition: StagedContextAcquisitionFacts;
  readonly taskContextNeeds: TaskContextNeedSet;
  readonly taskContextAcquisition: TaskContextAcquisition;
  readonly taskContextSufficiency: TaskContextSufficiency;
  readonly analysisBrief: AnalysisBrief;
  readonly analysisCalibration: AnalysisBriefCalibration;
  readonly analysisQualityGate: AnalysisQualityGateResult;
  readonly taskContextResult: TaskContextResult;
  readonly taskLifecycle: TaskLifecycle;
  readonly taskExecutionPlan: TaskExecutionPlan;
  readonly taskLifecycleResult: TaskLifecycleResultProjection;
  readonly taskLifecycleTrace: TaskLifecycleTrace;
  readonly graphResult: ContextGraphResultProjection;
  readonly planQuality: PlanQuality;
  readonly harnessTrace: HarnessTrace;
  readonly harnessScorecard: HarnessScorecard;
  readonly agentPlan: AgentPlan;
}

export type ContextAcquisitionSufficiencyStatus =
  | "sufficient_for_review_only_plan"
  | "insufficient_required_facts_missing"
  | "partial_optional_facts_missing"
  | "stale_context"
  | "ambiguous_context"
  | "budget_exhausted"
  | "no_readable_context"
  | "unsupported";

export interface StagedReadPlanFact {
  readonly target: string;
  readonly readStage: "initial-high-value-read" | "conditional-next-read";
  readonly readReason: string;
  readonly expectedEvidenceType: string;
  readonly fileRole: string;
  readonly readPriority: "high" | "medium" | "low";
  readonly readBudgetCostEstimate: number;
  readonly readBudgetRemaining: number;
  readonly rawContentPolicy: "raw-content-excluded";
  readonly required: boolean;
  readonly expectedDownstreamConsumer: string;
  readonly notProvenClaims: readonly string[];
}

export interface ReadBudgetAccountingFacts {
  readonly budgetKind: "bounded-context-packet";
  readonly maxFiles: number;
  readonly maxBytes: number;
  readonly filesPlanned: number;
  readonly filesRead: number;
  readonly filesSkipped: number;
  readonly skippedReasonCategories: readonly string[];
  readonly budgetExhausted: boolean;
  readonly partialContextReason?: string;
  readonly nextReadAvailable: boolean;
  readonly notProvenClaims: readonly string[];
}

export interface ContextPacketProvenanceFact {
  readonly packetId: string;
  readonly sourceFilePath: string;
  readonly candidateId?: string;
  readonly readReason: string;
  readonly readStage: "initial-high-value-read";
  readonly evidenceType: string;
  readonly freshnessHint: string;
  readonly stalenessHint: string;
  readonly rawContentRedactionStatus: "redacted-and-budgeted" | "raw-content-excluded";
  readonly derivedSummaryStatus: "summary-derived";
  readonly downstreamUse: string;
  readonly notProvenClaims: readonly string[];
}

export interface ContextGraphScoringFacts {
  readonly graphId: string;
  readonly components: {
    readonly directPathRelevance: number;
    readonly taskTokenRelevance: "unavailable";
    readonly symbolHintRelevance: "unavailable";
    readonly importAdjacency: number;
    readonly testAdjacency: number;
    readonly packageOrModuleProximity: "unavailable";
    readonly fileRole: "unavailable";
    readonly freshnessOrStalenessPenalty: number;
    readonly uncertaintyPenalty: number;
    readonly missingFactsPenalty: number;
  };
  readonly unavailableComponents: readonly string[];
  readonly notProvenClaims: readonly string[];
}

export interface CodeGraphImpactTraceFacts {
  readonly traceId: string;
  readonly impactQueryId: string;
  readonly factClassifications: readonly {
    readonly safeLabel: string;
    readonly kind: string;
    readonly classification: "observed" | "inferred" | "missing" | "stale" | "not-proven";
  }[];
  readonly notProvenClaims: readonly string[];
}

export interface ContextSufficiencyDecisionFacts {
  readonly decisionId: string;
  readonly status: ContextAcquisitionSufficiencyStatus;
  readonly requiredMissingFacts: readonly string[];
  readonly optionalMissingFacts: readonly string[];
  readonly staleFacts: readonly string[];
  readonly notProvenClaims: readonly string[];
}

export interface NextReadSuggestionFact {
  readonly target: string;
  readonly reason: string;
  readonly expectedEvidence: string;
  readonly priority: "high" | "medium" | "low";
  readonly required: boolean;
  readonly relatedMissingFacts: readonly string[];
  readonly budgetRequirement: string;
  readonly notProvenClaims: readonly string[];
}

export interface StagedContextAcquisitionFacts {
  readonly acquisitionFactsId: string;
  readonly stagedReadPlan: readonly StagedReadPlanFact[];
  readonly readBudget: ReadBudgetAccountingFacts;
  readonly packetProvenance: readonly ContextPacketProvenanceFact[];
  readonly graphScoring: ContextGraphScoringFacts;
  readonly impactTrace: CodeGraphImpactTraceFacts;
  readonly staleContext: {
    readonly status: "fresh" | "stale" | "unknown";
    readonly staleLabels: readonly string[];
    readonly warnings: readonly string[];
    readonly sufficiencyDowngrade: boolean;
    readonly notProvenClaims: readonly string[];
  };
  readonly requiredMissingFacts: readonly string[];
  readonly optionalMissingFacts: readonly string[];
  readonly nextReadSuggestions: readonly NextReadSuggestionFact[];
  readonly sufficiencyDecision: ContextSufficiencyDecisionFacts;
  readonly evidence: readonly string[];
  readonly notProvenClaims: readonly string[];
}

export async function buildContextGraphPlanningBundle(input: {
  readonly workspaceRoot: string;
  readonly targetPath: string;
  readonly workflowPlan: WorkflowTaskPlan;
}): Promise<ContextGraphPlanningBundle> {
  const packet = await buildTargetedContextPacket({
    workspaceRoot: input.workspaceRoot,
    targetPath: input.targetPath,
  });
  const graph = await discoverContextGraph({
    workspaceRoot: input.workspaceRoot,
    targetPath: input.targetPath,
    packet,
  });
  const graphScore = scoreContextGraph(graph);
  const testImpact = buildTestImpactPlan({ graph, score: graphScore });
  const codeGraphStaleness = await checkCodeGraphStaleness({
    workspaceRoot: input.workspaceRoot,
    graph,
  });
  const codeGraphFacts = normalizeCodeGraphFacts({
    graph,
    contextPacket: packet,
    testImpactPlan: testImpact,
    staleLabels: codeGraphStaleness.staleLabels,
  });
  const codeGraphTrace = buildCodeGraphTrace({
    graph,
    facts: codeGraphFacts,
    contextPacket: packet,
  });
  const codeGraphImpact = buildCodeGraphImpact({
    trace: codeGraphTrace,
    target: packet.targetSafeLabel,
  });
  const codeGraphResult = buildCodeGraphResult({
    trace: codeGraphTrace,
    impact: codeGraphImpact,
  });
  const packetResult = buildContextPacketResult(packet);
  const graphResult = buildContextGraphResult({ graph, score: graphScore, testImpact });
  const contextProjection = projectContextPacketToAgentPlanContext(packet, {
    graph,
    score: graphScore,
    testImpact,
    codeGraphTrace,
    codeGraphImpact,
  });
  const baseAgentPlan = projectWorkflowTaskPlanToAgentPlan({
    workflowPlan: input.workflowPlan,
    context: contextProjection,
  });
  const taskIntent = buildTaskIntent({
    userRequest: input.workflowPlan.reason,
    workflowPlan: input.workflowPlan,
    requestedActionKind: baseAgentPlan.requestedActionKind,
  });
  const taskReadPlan = buildTaskReadPlan({
    intent: taskIntent,
    contextPacket: packet,
    contextGraph: graph,
    testImpactPlan: testImpact,
    codeGraphImpact,
  });
  const taskContextNeeds = buildTaskContextNeeds({
    intent: taskIntent,
    contextPacket: packet,
    contextGraph: graph,
    testImpactPlan: testImpact,
    codeGraphImpact,
  });
  const taskContextAcquisition = buildTaskContextAcquisition({
    needSet: taskContextNeeds,
    contextPacket: packet,
    contextGraph: graph,
    testImpactPlan: testImpact,
    codeGraphImpact,
  });
  const taskContextSufficiency = evaluateTaskContextSufficiency({
    needSet: taskContextNeeds,
    acquisition: taskContextAcquisition,
    contextPacket: packet,
    contextGraphScore: graphScore,
    testImpactPlan: testImpact,
    codeGraphImpact,
    codeGraphStaleness,
  });
  const stagedContextAcquisition = buildStagedContextAcquisitionFacts({
    packet,
    graph,
    graphScore,
    codeGraphStaleness,
    codeGraphTrace,
    codeGraphImpact,
    taskReadPlan,
    taskContextAcquisition,
    taskContextSufficiency,
  });
  const analysisBrief = buildAnalysisBrief({
    intent: taskIntent,
    readPlan: taskReadPlan,
    agentPlan: baseAgentPlan,
    missingFacts: taskContextSufficiency.missingRequiredFacts,
  });
  const analysisCalibration = calibrateAnalysisBrief({
    analysisBrief,
    contextSufficiency: taskContextSufficiency,
    additionalEvidenceIds: [
      taskContextNeeds.needSetId,
      taskContextAcquisition.acquisitionId,
      taskContextSufficiency.sufficiencyId,
    ],
  });
  const analysisQualityGate = evaluateAnalysisQualityGate({
    action: "plan",
    calibration: analysisCalibration,
    contextSufficiency: taskContextSufficiency,
  });
  const taskLifecycle = buildTaskLifecycle({
    intent: taskIntent,
    stages: [
      buildTaskStage({
        kind: "read",
        readiness: taskContextSufficiency.analysisReadiness === "ready" ? "complete" : "needs-evidence",
        outputEvidenceIds: [
          packet.packetId,
          graph.graphId,
          testImpact.impactPlanId,
          codeGraphTrace.traceId,
          taskContextNeeds.needSetId,
          taskContextAcquisition.acquisitionId,
          taskContextSufficiency.sufficiencyId,
        ],
        missingFacts: [
          ...taskContextSufficiency.missingRequiredFacts,
          ...taskContextSufficiency.missingOptionalFacts,
        ],
        stopReason:
          taskContextSufficiency.state === "sufficient"
            ? undefined
            : taskContextSufficiency.readinessDowngrade,
        verifierMarker: "task-stage:read:context-packet-code-graph",
      }),
      buildTaskStage({
        kind: "analyze",
        readiness: analysisQualityGate.allowed ? "complete" : "needs-evidence",
        inputEvidenceIds: [taskReadPlan.readPlanId, taskContextSufficiency.sufficiencyId],
        outputEvidenceIds: [analysisBrief.briefId, analysisCalibration.calibrationId, analysisQualityGate.gateId],
        missingFacts: analysisCalibration.missingFacts,
        stopReason: analysisQualityGate.allowed ? undefined : analysisQualityGate.reason,
        verifierMarker: "task-stage:analyze:analysis-brief",
      }),
      buildTaskStage({
        kind: "plan",
        readiness: baseAgentPlan.executionReadiness === "ready" ? "ready" : "needs-evidence",
        inputEvidenceIds: [analysisBrief.briefId, baseAgentPlan.planId],
        outputEvidenceIds: [baseAgentPlan.planId],
        missingFacts: baseAgentPlan.missingFacts,
        verifierMarker: "task-stage:plan:agent-plan",
      }),
    ],
  });
  const taskExecutionPlan = buildTaskExecutionPlan({
    brief: analysisBrief,
    readPlan: taskReadPlan,
    lifecycle: taskLifecycle,
    agentPlan: baseAgentPlan,
  });
  const agentPlanWithLifecycle = projectWorkflowTaskPlanToAgentPlan({
    workflowPlan: input.workflowPlan,
    context: {
      ...contextProjection,
      taskLifecycleId: taskLifecycle.lifecycleId,
      taskLifecycleCurrentStage: taskLifecycle.currentStage,
      analysisBriefId: analysisBrief.briefId,
      taskExecutionPlanId: taskExecutionPlan.executionPlanId,
      taskLifecycleReadiness: taskLifecycle.overallStatus,
      taskLifecycleMissingFacts: taskLifecycle.missingFacts,
      suggestedNextTaskStage: taskLifecycle.nextRecommendedStage,
      taskContextNeedIds: taskContextNeeds.needs.map((need) => need.needId),
      taskContextSufficiencyState: taskContextSufficiency.state,
      analysisConfidence: analysisCalibration.confidence,
      analysisMissingFacts: analysisCalibration.missingFacts,
      analysisRiskLevel: analysisCalibration.riskLevel,
      analysisQualityGateId: analysisQualityGate.gateId,
      replaySafeEvidence: [
        ...contextProjection.replaySafeEvidence,
        taskContextNeeds.replaySafeSummary,
        taskContextAcquisition.replaySafeSummary,
        taskContextSufficiency.replaySafeSummary,
        taskLifecycle.replaySafeSummary,
        analysisBrief.replaySafeSummary,
        analysisCalibration.replaySafeSummary,
        taskExecutionPlan.replaySafeSummary,
        ...taskContextNeeds.evidence,
        ...taskContextAcquisition.evidence,
        ...taskContextSufficiency.evidence,
        ...taskLifecycle.evidence,
        ...analysisBrief.evidence,
        ...analysisCalibration.evidence,
        ...analysisQualityGate.evidence,
        ...taskExecutionPlan.evidence,
      ],
    },
  });
  const planQuality = buildPlanQuality({
    agentPlan: agentPlanWithLifecycle,
    contextPacket: packet,
    contextGraph: graph,
    contextGraphScore: graphScore,
    testImpactPlan: testImpact,
    codeGraphTrace,
    codeGraphImpact,
    taskLifecycle,
    analysisBrief,
    contextSufficiency: taskContextSufficiency,
    analysisCalibration,
    analysisQualityGate,
    taskExecutionPlan,
  });
  const agentPlan = attachPlanQualityToAgentPlan({
    agentPlan: agentPlanWithLifecycle,
    planQuality,
  });
  const taskContextResult = buildTaskContextResult({
    needSet: taskContextNeeds,
    acquisition: taskContextAcquisition,
    sufficiency: taskContextSufficiency,
    calibration: analysisCalibration,
    analysisQualityGate,
  });
  const taskLifecycleResult = buildTaskLifecycleResult({
    lifecycle: taskLifecycle,
    readPlan: taskReadPlan,
    analysisBrief,
    executionPlan: taskExecutionPlan,
  });
  const harnessTrace = buildHarnessTrace({
    routeId: "route188-plan-quality-harness-trace",
    taskId: `${input.workflowPlan.taskKind}:${input.targetPath}`,
    taskLifecycleId: taskLifecycle.lifecycleId,
    analysisBriefId: analysisBrief.briefId,
    taskExecutionPlanId: taskExecutionPlan.executionPlanId,
    contextPacketId: packet.packetId,
    contextGraphId: graph.graphId,
    agentPlanId: agentPlan.planId,
    planQualityId: planQuality.qualityId,
    contextSufficiencyState: taskContextSufficiency.state,
    analysisConfidence: analysisCalibration.confidence,
    underEvidencedClaimsCount: analysisCalibration.underEvidencedClaims.length,
    missingRequiredContextCount: taskContextSufficiency.missingRequiredFacts.length,
    staleContext: taskContextSufficiency.state === "stale-context",
    budgetLimitedContext: taskContextSufficiency.state === "budget-limited",
    downstreamReadiness: `provider=${taskContextSufficiency.providerProposalReadiness}; verification=${taskContextSufficiency.verificationPlanningReadiness}; repair=${taskContextSufficiency.repairProposalReadiness}`,
    status: planQuality.level,
    reason: planQuality.missingFacts.join("; "),
    evidence: [
      ...planQuality.evidence,
      ...taskContextSufficiency.evidence,
      ...analysisCalibration.evidence,
      ...analysisQualityGate.evidence,
    ],
  });
  const taskLifecycleTrace = buildTaskLifecycleTrace({
    lifecycle: taskLifecycle,
    readPlan: taskReadPlan,
    analysisBrief,
    executionPlan: taskExecutionPlan,
    harnessTrace,
    planQualityId: planQuality.qualityId,
    codeGraphTraceId: codeGraphTrace.traceId,
  });
  const harnessScorecard = buildHarnessScorecard({
    planQuality,
    trace: harnessTrace,
    resultTruthful: true,
    continuationReady: true,
  });

  return {
    packet,
    packetResult,
    graph,
    graphScore,
    testImpact,
    codeGraphStaleness,
    codeGraphFacts,
    codeGraphTrace,
    codeGraphImpact,
    codeGraphResult,
    taskIntent,
    taskReadPlan,
    stagedContextAcquisition,
    taskContextNeeds,
    taskContextAcquisition,
    taskContextSufficiency,
    analysisBrief,
    analysisCalibration,
    analysisQualityGate,
    taskContextResult,
    taskLifecycle,
    taskExecutionPlan,
    taskLifecycleResult,
    taskLifecycleTrace,
    graphResult,
    planQuality,
    harnessTrace,
    harnessScorecard,
    agentPlan,
  };
}

function buildStagedContextAcquisitionFacts(input: {
  readonly packet: TargetedContextPacket;
  readonly graph: ContextGraph;
  readonly graphScore: ContextGraphScore;
  readonly codeGraphStaleness: CodeGraphStalenessCheck;
  readonly codeGraphTrace: CodeGraphTrace;
  readonly codeGraphImpact: CodeGraphImpact;
  readonly taskReadPlan: TaskReadPlan;
  readonly taskContextAcquisition: TaskContextAcquisition;
  readonly taskContextSufficiency: TaskContextSufficiency;
}): StagedContextAcquisitionFacts {
  const readBudget = buildReadBudgetAccounting(input);
  const sufficiencyDecision = buildContextSufficiencyDecision(input.taskContextSufficiency, readBudget);
  const nextReadSuggestions = buildNextReadSuggestions(input);
  const acquisitionFactsId = `staged_context_acquisition_${sanitizeId([
    input.packet.packetId,
    input.graph.graphId,
    input.taskContextSufficiency.sufficiencyId,
  ].join("_"))}`;

  return {
    acquisitionFactsId,
    stagedReadPlan: buildStagedReadPlan(input),
    readBudget,
    packetProvenance: buildPacketProvenance(input),
    graphScoring: buildGraphScoringFacts(input),
    impactTrace: buildImpactTraceFacts(input),
    staleContext: {
      status: input.codeGraphStaleness.status === "fresh" ? "fresh" : input.codeGraphStaleness.staleLabels.length > 0 ? "stale" : "unknown",
      staleLabels: input.codeGraphStaleness.staleLabels,
      warnings: input.codeGraphStaleness.warnings,
      sufficiencyDowngrade: input.taskContextSufficiency.state === "stale-context" ||
        input.codeGraphStaleness.staleLabels.length > 0,
      notProvenClaims: [
        "stale-context-cannot-be-fresh-context",
        "memory-reused-is-not-fresh-context",
      ],
    },
    requiredMissingFacts: input.taskContextSufficiency.missingRequiredFacts,
    optionalMissingFacts: input.taskContextSufficiency.missingOptionalFacts,
    nextReadSuggestions,
    sufficiencyDecision,
    evidence: [
      `staged-context-acquisition:id:${acquisitionFactsId}`,
      `staged-context-acquisition:packet:${input.packet.packetId}`,
      `staged-context-acquisition:graph:${input.graph.graphId}`,
      `staged-context-acquisition:read-budget:files-read:${readBudget.filesRead}`,
      `staged-context-acquisition:read-budget:files-skipped:${readBudget.filesSkipped}`,
      `staged-context-acquisition:sufficiency:${sufficiencyDecision.status}`,
      "staged-context-acquisition:mutation-authority:not-granted",
      "staged-context-acquisition:provider-call:not-run",
      "staged-context-acquisition:command-dispatch:not-run",
      "staged-context-acquisition:raw-content-excluded",
    ],
    notProvenClaims: [
      "read-planned-is-not-read-completed",
      "read-completed-is-not-enough-context",
      "context-packet-exists-is-not-repository-understanding",
      "graph-edge-observed-is-not-full-impact-proof",
      "next-read-suggestion-is-not-completed-read",
      "sufficient-for-review-only-planning-is-not-edit-authority",
      "sufficient-for-review-only-planning-is-not-task-success",
    ],
  };
}

function buildStagedReadPlan(input: {
  readonly packet: TargetedContextPacket;
  readonly taskReadPlan: TaskReadPlan;
}): readonly StagedReadPlanFact[] {
  const budgetRemaining = Math.max(0, input.packet.readBudget.maxTotalBytes - input.packet.readBudget.bytesUsed);
  const selected = input.packet.selectedCandidateSummaries.map((summary) => ({
    target: summary.pathLabel,
    readStage: "initial-high-value-read" as const,
    readReason: summary.relation,
    expectedEvidenceType: expectedEvidenceType(summary.kind),
    fileRole: summary.kind,
    readPriority: summary.kind === "target-file-summary" ? "high" as const : "medium" as const,
    readBudgetCostEstimate: summary.byteLength,
    readBudgetRemaining: budgetRemaining,
    rawContentPolicy: "raw-content-excluded" as const,
    required: input.taskReadPlan.requiredReads.includes(summary.pathLabel),
    expectedDownstreamConsumer: "context-graph-planning",
    notProvenClaims: [
      "read-planned-is-not-read-completed",
      "read-completed-is-not-enough-context",
    ],
  }));
  const suggested = input.taskReadPlan.suggestedNextReads.map((target) => ({
    target,
    readStage: "conditional-next-read" as const,
    readReason: "missing or omitted context",
    expectedEvidenceType: "next-read-evidence",
    fileRole: "unknown",
    readPriority: "low" as const,
    readBudgetCostEstimate: 0,
    readBudgetRemaining: budgetRemaining,
    rawContentPolicy: "raw-content-excluded" as const,
    required: false,
    expectedDownstreamConsumer: "future-context-acquisition",
    notProvenClaims: [
      "next-read-suggestion-is-not-completed-read",
      "read-planned-is-not-read-completed",
    ],
  }));
  return [...selected, ...suggested];
}

function buildReadBudgetAccounting(input: {
  readonly packet: TargetedContextPacket;
  readonly taskReadPlan: TaskReadPlan;
}): ReadBudgetAccountingFacts {
  const skippedReasonCategories = Array.from(new Set(
    input.packet.omittedCandidateSummaries.map((summary) => summary.reason ?? summary.kind),
  ));
  const budgetExhausted = input.packet.readBudget.filesRead >= input.packet.readBudget.maxFilesRead ||
    input.packet.readBudget.bytesUsed >= input.packet.readBudget.maxTotalBytes ||
    skippedReasonCategories.some((reason) => reason.includes("budget"));
  return {
    budgetKind: "bounded-context-packet",
    maxFiles: input.packet.readBudget.maxFilesRead,
    maxBytes: input.packet.readBudget.maxTotalBytes,
    filesPlanned: new Set([
      ...input.taskReadPlan.requiredReads,
      ...input.taskReadPlan.optionalReads,
      ...input.taskReadPlan.suggestedNextReads,
    ]).size,
    filesRead: input.packet.readBudget.filesRead,
    filesSkipped: input.packet.omittedCandidateSummaries.length,
    skippedReasonCategories,
    budgetExhausted,
    ...(input.packet.completenessStatus !== "complete"
      ? { partialContextReason: input.packet.completenessStatus }
      : {}),
    nextReadAvailable: input.taskReadPlan.suggestedNextReads.length > 0,
    notProvenClaims: [
      "read-budget-accounting-is-not-context-success",
      "budget-not-exhausted-is-not-enough-context",
    ],
  };
}

function buildPacketProvenance(input: {
  readonly packet: TargetedContextPacket;
  readonly codeGraphStaleness: CodeGraphStalenessCheck;
}): readonly ContextPacketProvenanceFact[] {
  return input.packet.selectedCandidateSummaries.map((summary) => ({
    packetId: input.packet.packetId,
    sourceFilePath: summary.pathLabel,
    readReason: summary.relation,
    readStage: "initial-high-value-read",
    evidenceType: expectedEvidenceType(summary.kind),
    freshnessHint: input.packet.freshnessFacts.join("; "),
    stalenessHint: input.codeGraphStaleness.staleLabels.includes(summary.pathLabel)
      ? "stale"
      : input.codeGraphStaleness.status,
    rawContentRedactionStatus: summary.redactionApplied ? "redacted-and-budgeted" : "raw-content-excluded",
    derivedSummaryStatus: "summary-derived",
    downstreamUse: "context-graph-planning",
    notProvenClaims: [
      "context-packet-exists-is-not-repository-understanding",
      "derived-summary-is-not-raw-content",
    ],
  }));
}

function buildGraphScoringFacts(input: {
  readonly graph: ContextGraph;
  readonly graphScore: ContextGraphScore;
  readonly taskContextSufficiency: TaskContextSufficiency;
  readonly codeGraphStaleness: CodeGraphStalenessCheck;
}): ContextGraphScoringFacts {
  const missingCount = input.taskContextSufficiency.missingRequiredFacts.length +
    input.taskContextSufficiency.missingOptionalFacts.length;
  return {
    graphId: input.graph.graphId,
    components: {
      directPathRelevance: confidenceScore(input.graphScore.rootTargetConfidence),
      taskTokenRelevance: "unavailable",
      symbolHintRelevance: "unavailable",
      importAdjacency: input.graphScore.importCoverage,
      testAdjacency: input.graphScore.testCoverage,
      packageOrModuleProximity: "unavailable",
      fileRole: "unavailable",
      freshnessOrStalenessPenalty: input.codeGraphStaleness.staleLabels.length > 0 ? -25 : 0,
      uncertaintyPenalty: input.graphScore.omittedRiskLevel === "high" ? -25 : input.graphScore.omittedRiskLevel === "medium" ? -10 : 0,
      missingFactsPenalty: missingCount > 0 ? -Math.min(30, missingCount * 5) : 0,
    },
    unavailableComponents: [
      "task-token-relevance",
      "symbol-hint-relevance",
      "package-or-module-proximity",
      "file-role",
    ],
    notProvenClaims: [
      "context-graph-score-is-not-repository-understanding",
      "graph-edge-observed-is-not-full-impact-proof",
    ],
  };
}

function buildImpactTraceFacts(input: {
  readonly codeGraphTrace: CodeGraphTrace;
  readonly codeGraphImpact: CodeGraphImpact;
}): CodeGraphImpactTraceFacts {
  const observed = input.codeGraphTrace.facts.slice(0, 12).map((fact) => ({
    safeLabel: fact.safeLabel,
    kind: fact.kind,
    classification: fact.freshness === "stale" ? "stale" as const : "observed" as const,
  }));
  const missing = input.codeGraphImpact.omittedContext.map((label) => ({
    safeLabel: label,
    kind: "omitted-context",
    classification: "missing" as const,
  }));
  const inferred = [
    ...input.codeGraphImpact.likelyTests.map((label) => ({
      safeLabel: label,
      kind: "likely-test",
      classification: "inferred" as const,
    })),
    ...input.codeGraphImpact.likelyCallSites.map((label) => ({
      safeLabel: label,
      kind: "likely-call-site",
      classification: "inferred" as const,
    })),
  ];
  const notProven = input.codeGraphTrace.facts.length === 0
    ? [{
      safeLabel: input.codeGraphTrace.rootTarget,
      kind: "graph-evidence",
      classification: "not-proven" as const,
    }]
    : [];
  return {
    traceId: input.codeGraphTrace.traceId,
    impactQueryId: input.codeGraphImpact.impactQueryId,
    factClassifications: [...observed, ...inferred, ...missing, ...notProven],
    notProvenClaims: [
      "code-graph-impact-is-not-full-impact-proof",
      "impact-trace-is-not-verification-success",
    ],
  };
}

function buildContextSufficiencyDecision(
  sufficiency: TaskContextSufficiency,
  budget: ReadBudgetAccountingFacts,
): ContextSufficiencyDecisionFacts {
  const status = mapSufficiencyStatus(sufficiency, budget);
  return {
    decisionId: `context_sufficiency_decision_${sanitizeId(sufficiency.sufficiencyId)}`,
    status,
    requiredMissingFacts: sufficiency.missingRequiredFacts,
    optionalMissingFacts: sufficiency.missingOptionalFacts,
    staleFacts: sufficiency.staleFacts,
    notProvenClaims: [
      "sufficient-for-review-only-planning-is-not-edit-authority",
      "sufficient-for-review-only-planning-is-not-apply-authority",
      "sufficient-for-review-only-planning-is-not-verification-success",
      "sufficient-for-review-only-planning-is-not-task-success",
    ],
  };
}

function buildNextReadSuggestions(input: {
  readonly taskContextSufficiency: TaskContextSufficiency;
  readonly taskReadPlan: TaskReadPlan;
}): readonly NextReadSuggestionFact[] {
  const missingFacts = [
    ...input.taskContextSufficiency.missingRequiredFacts,
    ...input.taskContextSufficiency.missingOptionalFacts,
  ];
  return Array.from(new Set([
    ...input.taskContextSufficiency.suggestedReads,
    ...input.taskReadPlan.suggestedNextReads,
  ])).map((target, index) => ({
    target,
    reason: missingFacts[index] ?? "partial context requires another bounded read",
    expectedEvidence: target.includes("test")
      ? "test-adjacency"
      : target.includes("docs") || target.includes("README")
        ? "docs-context"
        : "source-context",
    priority: index === 0 ? "high" : index < 3 ? "medium" : "low",
    required: input.taskContextSufficiency.missingRequiredFacts.some((fact) => target.includes(fact.split(":")[0] ?? "")),
    relatedMissingFacts: missingFacts,
    budgetRequirement: "requires remaining bounded read budget",
    notProvenClaims: ["next-read-suggestion-is-not-completed-read"],
  }));
}

function mapSufficiencyStatus(
  sufficiency: TaskContextSufficiency,
  budget: ReadBudgetAccountingFacts,
): ContextAcquisitionSufficiencyStatus {
  if (sufficiency.state === "unsupported") return "unsupported";
  if (budget.filesRead === 0) return "no_readable_context";
  if (sufficiency.state === "stale-context" || sufficiency.staleFacts.length > 0) return "stale_context";
  if (budget.budgetExhausted || sufficiency.state === "budget-limited") return "budget_exhausted";
  if (sufficiency.missingRequiredFacts.length > 0 || sufficiency.state === "needs-required-context") {
    return "insufficient_required_facts_missing";
  }
  if (sufficiency.state === "low-confidence") return "ambiguous_context";
  if (sufficiency.missingOptionalFacts.length > 0 || sufficiency.state === "needs-optional-context") {
    return "partial_optional_facts_missing";
  }
  return "sufficient_for_review_only_plan";
}

function expectedEvidenceType(kind: string): string {
  if (kind.includes("test")) return "test-adjacency";
  if (kind.includes("docs")) return "docs-context";
  if (kind.includes("import")) return "dependency-adjacency";
  if (kind.includes("call")) return "call-site-context";
  return "source-context";
}

function confidenceScore(confidence: "high" | "medium" | "low"): number {
  return confidence === "high" ? 1 : confidence === "medium" ? 0.5 : 0;
}

function sanitizeId(value: string): string {
  return value.replace(/[^A-Za-z0-9_]+/g, "_").slice(0, 120);
}
