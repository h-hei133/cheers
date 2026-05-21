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

export interface ContextGraphPlanningBundle {
  readonly packet: TargetedContextPacket;
  readonly packetResult: ContextPacketResultProjection;
  readonly graph: ContextGraph;
  readonly graphScore: ContextGraphScore;
  readonly testImpact: TestImpactPlan;
  readonly graphResult: ContextGraphResultProjection;
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
  const agentPlan = projectWorkflowTaskPlanToAgentPlan({
    workflowPlan: input.workflowPlan,
    context: projectContextPacketToAgentPlanContext(packet, {
      graph,
      score: graphScore,
      testImpact,
    }),
  });

  return {
    packet,
    packetResult,
    graph,
    graphScore,
    testImpact,
    graphResult,
    agentPlan,
  };
}
