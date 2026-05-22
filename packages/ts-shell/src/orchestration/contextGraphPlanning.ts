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
import { calibrateAnalysisBrief, type AnalysisBriefCalibration } from "./analysisBriefCalibration.js";
import { evaluateAnalysisQualityGate, type AnalysisQualityGateResult } from "./analysisQualityGate.js";
import { buildTaskExecutionPlan, type TaskExecutionPlan } from "./taskExecutionPlan.js";
import { buildTaskContextAcquisition, type TaskContextAcquisition } from "./taskContextAcquisition.js";
import { buildTaskContextNeeds, type TaskContextNeedSet } from "./taskContextNeed.js";
import { buildTaskContextResult, type TaskContextResult } from "./taskContextResult.js";
import { evaluateTaskContextSufficiency, type TaskContextSufficiency } from "./taskContextSufficiency.js";
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
