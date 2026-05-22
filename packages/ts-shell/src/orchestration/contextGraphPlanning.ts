import type { WorkflowTaskPlan } from "./workflowTaskPlanner.js";
import { projectContextPacketToAgentPlanContext } from "./agentPlanContext.js";
import {
  projectWorkflowTaskPlanToAgentPlan,
} from "./agentPlanProjection.js";
import type { AgentPlan } from "./agentPlan.js";
import { buildContextGraphResult, type ContextGraphResultProjection } from "./contextGraphResult.js";
import { discoverContextGraph } from "./contextGraphDiscovery.js";
import { scoreContextGraph, type ContextGraphScore } from "./contextGraphScore.js";
import {
  buildContextPacketResult,
  type ContextPacketResultProjection,
} from "./contextPacketResult.js";
import {
  buildTargetedContextPacket,
  type TargetedContextPacket,
} from "./contextPacket.js";
import { buildTestImpactPlan, type TestImpactPlan } from "./testImpactPlan.js";
import type { ContextGraph } from "./contextGraph.js";
import {
  attachPlanQualityToAgentPlan,
  buildPlanQuality,
  type PlanQuality,
} from "./planQuality.js";
import { buildHarnessTrace, type HarnessTrace } from "./harnessTrace.js";
import { buildHarnessScorecard, type HarnessScorecard } from "./harnessScorecard.js";
import { normalizeCodeGraphFacts, type CodeGraphFacts } from "./codeGraphFacts.js";
import { buildCodeGraphTrace, type CodeGraphTrace } from "./codeGraphTrace.js";
import { checkCodeGraphStaleness, type CodeGraphStalenessCheck } from "./codeGraphStaleness.js";
import { buildCodeGraphImpact, type CodeGraphImpact } from "./codeGraphImpact.js";
import { buildCodeGraphResult, type CodeGraphResultProjection } from "./codeGraphResult.js";
import { buildAnalysisBrief, type AnalysisBrief } from "./analysisBrief.js";
import { buildTaskExecutionPlan, type TaskExecutionPlan } from "./taskExecutionPlan.js";
import { buildTaskIntent, type TaskIntent } from "./taskIntent.js";
import { buildTaskLifecycle, type TaskLifecycle } from "./taskLifecycle.js";
import { buildTaskLifecycleResult, type TaskLifecycleResultProjection } from "./taskLifecycleResult.js";
import { buildTaskLifecycleTrace, type TaskLifecycleTrace } from "./taskLifecycleTrace.js";
import { buildTaskReadPlan, type TaskReadPlan } from "./taskReadPlan.js";
import { buildTaskStage } from "./taskStage.js";

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
  readonly analysisBrief: AnalysisBrief;
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
  const analysisBrief = buildAnalysisBrief({
    intent: taskIntent,
    readPlan: taskReadPlan,
    agentPlan: baseAgentPlan,
  });
  const taskLifecycle = buildTaskLifecycle({
    intent: taskIntent,
    stages: [
      buildTaskStage({
        kind: "read",
        readiness: packet.completenessStatus === "missing-context" ? "needs-evidence" : "complete",
        outputEvidenceIds: [packet.packetId, graph.graphId, testImpact.impactPlanId, codeGraphTrace.traceId],
        missingFacts: packet.completenessStatus === "missing-context" ? taskReadPlan.suggestedNextReads : [],
        verifierMarker: "task-stage:read:context-packet-code-graph",
      }),
      buildTaskStage({
        kind: "analyze",
        readiness: analysisBrief.missingFacts.length > 0 ? "needs-evidence" : "complete",
        inputEvidenceIds: [taskReadPlan.readPlanId],
        outputEvidenceIds: [analysisBrief.briefId],
        missingFacts: analysisBrief.missingFacts,
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
      replaySafeEvidence: [
        ...contextProjection.replaySafeEvidence,
        taskLifecycle.replaySafeSummary,
        analysisBrief.replaySafeSummary,
        taskExecutionPlan.replaySafeSummary,
        ...taskLifecycle.evidence,
        ...analysisBrief.evidence,
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
    taskExecutionPlan,
  });
  const agentPlan = attachPlanQualityToAgentPlan({
    agentPlan: agentPlanWithLifecycle,
    planQuality,
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
    status: planQuality.level,
    reason: planQuality.missingFacts.join("; "),
    evidence: planQuality.evidence,
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
    analysisBrief,
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
