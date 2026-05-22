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

export interface ContextGraphPlanningBundle {
  readonly packet: TargetedContextPacket;
  readonly packetResult: ContextPacketResultProjection;
  readonly graph: ContextGraph;
  readonly graphScore: ContextGraphScore;
  readonly testImpact: TestImpactPlan;
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
  const packetResult = buildContextPacketResult(packet);
  const graphResult = buildContextGraphResult({ graph, score: graphScore, testImpact });
  const baseAgentPlan = projectWorkflowTaskPlanToAgentPlan({
    workflowPlan: input.workflowPlan,
    context: projectContextPacketToAgentPlanContext(packet, {
      graph,
      score: graphScore,
      testImpact,
    }),
  });
  const planQuality = buildPlanQuality({
    agentPlan: baseAgentPlan,
    contextPacket: packet,
    contextGraph: graph,
    contextGraphScore: graphScore,
    testImpactPlan: testImpact,
  });
  const agentPlan = attachPlanQualityToAgentPlan({
    agentPlan: baseAgentPlan,
    planQuality,
  });
  const harnessTrace = buildHarnessTrace({
    routeId: "route188-plan-quality-harness-trace",
    taskId: `${input.workflowPlan.taskKind}:${input.targetPath}`,
    contextPacketId: packet.packetId,
    contextGraphId: graph.graphId,
    agentPlanId: agentPlan.planId,
    planQualityId: planQuality.qualityId,
    status: planQuality.level,
    reason: planQuality.missingFacts.join("; "),
    evidence: planQuality.evidence,
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
    graphResult,
    planQuality,
    harnessTrace,
    harnessScorecard,
    agentPlan,
  };
}
