import {
  buildContextPlanningSummary,
  type ContextPlanningSummary,
} from "./contextPlan.js";
import type { TargetedContextPacket } from "./contextPacket.js";
import type { ContextGraph } from "./contextGraph.js";
import type { ContextGraphScore } from "./contextGraphScore.js";
import type { TestImpactPlan } from "./testImpactPlan.js";
import type { CodeGraphTrace } from "./codeGraphTrace.js";
import type { CodeGraphImpact } from "./codeGraphImpact.js";
import type { AnalysisBrief } from "./analysisBrief.js";
import type { TaskExecutionPlan } from "./taskExecutionPlan.js";
import type { TaskLifecycle } from "./taskLifecycle.js";
import type {
  AgentPlanConfidence,
  AgentPlanContextCompleteness,
  AgentPlanExecutionReadiness,
} from "./agentPlan.js";

export interface AgentPlanContextProjection {
  readonly packetId: string;
  readonly contextPacketIds: readonly string[];
  readonly taskLifecycleId?: string;
  readonly taskLifecycleCurrentStage?: string;
  readonly analysisBriefId?: string;
  readonly taskExecutionPlanId?: string;
  readonly taskLifecycleReadiness?: string;
  readonly taskLifecycleMissingFacts?: readonly string[];
  readonly suggestedNextTaskStage?: string;
  readonly contextGraphIds: readonly string[];
  readonly codeGraphTraceIds: readonly string[];
  readonly impactQueryId?: string;
  readonly impactReadiness?: string;
  readonly likelyAffectedFiles: readonly string[];
  readonly likelyAffectedTests: readonly string[];
  readonly graphReadiness?: string;
  readonly contextCoverageScore?: number;
  readonly testImpactSummary?: string;
  readonly contextCompleteness: AgentPlanContextCompleteness;
  readonly confidence: AgentPlanConfidence;
  readonly executionReadiness: AgentPlanExecutionReadiness;
  readonly knownFacts: readonly string[];
  readonly missingFacts: readonly string[];
  readonly suggestedReads: readonly string[];
  readonly suggestedVerification: readonly string[];
  readonly replaySafeEvidence: readonly string[];
  readonly redactionStatus: "redacted-and-budgeted";
  readonly mutationAuthority: "not-granted";
  readonly contextSummary: ContextPlanningSummary;
}

export function projectContextPacketToAgentPlanContext(
  packet: TargetedContextPacket,
  graphFacts?: {
    readonly graph: ContextGraph;
    readonly score: ContextGraphScore;
    readonly testImpact: TestImpactPlan;
    readonly codeGraphTrace?: CodeGraphTrace;
    readonly codeGraphImpact?: CodeGraphImpact;
  },
  lifecycleFacts?: {
    readonly lifecycle: TaskLifecycle;
    readonly analysisBrief?: AnalysisBrief;
    readonly executionPlan?: TaskExecutionPlan;
  },
): AgentPlanContextProjection {
  const contextSummary = buildContextPlanningSummary(packet);
  const packetReadiness =
    contextSummary.executionReadiness === "ready"
      ? "ready"
      : "needs-more-context";
  const executionReadiness =
    graphFacts &&
    graphFacts.score.planningReadiness !== "context-ready" &&
    graphFacts.score.planningReadiness !== "needs-more-context"
      ? "needs-more-context"
      : packetReadiness;

  return {
    packetId: packet.packetId,
    contextPacketIds: [packet.packetId],
    ...(lifecycleFacts
      ? {
          taskLifecycleId: lifecycleFacts.lifecycle.lifecycleId,
          taskLifecycleCurrentStage: lifecycleFacts.lifecycle.currentStage,
          taskLifecycleReadiness: lifecycleFacts.lifecycle.overallStatus,
          taskLifecycleMissingFacts: lifecycleFacts.lifecycle.missingFacts,
        }
      : {}),
    ...(lifecycleFacts?.analysisBrief ? { analysisBriefId: lifecycleFacts.analysisBrief.briefId } : {}),
    ...(lifecycleFacts?.executionPlan ? { taskExecutionPlanId: lifecycleFacts.executionPlan.executionPlanId } : {}),
    ...(lifecycleFacts?.lifecycle.nextRecommendedStage
      ? { suggestedNextTaskStage: lifecycleFacts.lifecycle.nextRecommendedStage }
      : {}),
    contextGraphIds: graphFacts ? [graphFacts.graph.graphId] : [],
    codeGraphTraceIds: graphFacts?.codeGraphTrace ? [graphFacts.codeGraphTrace.traceId] : [],
    ...(graphFacts?.codeGraphImpact ? { impactQueryId: graphFacts.codeGraphImpact.impactQueryId } : {}),
    ...(graphFacts?.codeGraphImpact ? { impactReadiness: graphFacts.codeGraphImpact.readiness } : {}),
    likelyAffectedFiles: graphFacts?.codeGraphImpact
      ? Array.from(
          new Set([
            ...graphFacts.codeGraphImpact.likelyCallSites,
            ...graphFacts.codeGraphImpact.docsReferences,
          ]),
        )
      : [],
    likelyAffectedTests: graphFacts?.codeGraphImpact?.likelyTests ?? [],
    ...(graphFacts ? { graphReadiness: graphFacts.score.planningReadiness } : {}),
    ...(graphFacts ? { contextCoverageScore: graphFacts.score.coverageScore } : {}),
    ...(graphFacts
      ? {
          testImpactSummary: `tests=${graphFacts.testImpact.likelyTestFiles.length}; commands=${graphFacts.testImpact.likelyVerificationCommandCandidates.length}; readiness=${graphFacts.testImpact.commandReadiness}`,
        }
      : {}),
    contextCompleteness: packet.completenessStatus,
    confidence: contextSummary.confidence,
    executionReadiness,
    knownFacts: contextSummary.known,
    missingFacts: [
      ...contextSummary.missing,
      ...(graphFacts?.testImpact.missingTestContext ?? []),
      ...(graphFacts?.codeGraphImpact?.staleContext.length
        ? ["code graph impact has stale context"]
        : []),
      ...(graphFacts?.codeGraphImpact?.omittedContext.length
        ? ["code graph impact omitted context"]
        : []),
      ...(graphFacts?.score.planningReadiness === "budget-limited"
        ? ["context graph budget limited"]
        : []),
      ...(lifecycleFacts?.lifecycle.missingFacts ?? []),
      ...(lifecycleFacts?.analysisBrief?.missingFacts ?? []),
    ],
    suggestedReads: Array.from(
      new Set([
        ...contextSummary.suggestedNextReads,
        ...(graphFacts?.testImpact.suggestedReads ?? []),
        ...(graphFacts?.codeGraphImpact?.suggestedReads ?? []),
      ]),
    ),
    suggestedVerification: Array.from(
      new Set([
        ...contextSummary.suggestedVerificationCandidates,
        ...(graphFacts?.testImpact.likelyVerificationCommandCandidates
          .filter((candidate) => candidate.readiness === "ready")
          .map((candidate) => candidate.command) ?? []),
        ...(graphFacts?.codeGraphImpact?.suggestedVerification ?? []),
      ]),
    ),
    replaySafeEvidence: [
      packet.replaySafeSummary,
      contextSummary.replaySafeSummary,
      ...packet.evidence,
      ...contextSummary.evidence,
      ...(graphFacts
        ? [
            graphFacts.graph.replaySafeSummary,
            graphFacts.testImpact.replaySafeSummary,
            ...graphFacts.graph.evidence,
            ...graphFacts.score.evidence,
            ...graphFacts.testImpact.evidence,
            ...(graphFacts.codeGraphTrace?.evidence ?? []),
            ...(graphFacts.codeGraphImpact?.evidence ?? []),
          ]
        : []),
      ...(lifecycleFacts
        ? [
            lifecycleFacts.lifecycle.replaySafeSummary,
            ...lifecycleFacts.lifecycle.evidence,
            ...(lifecycleFacts.analysisBrief
              ? [
                  lifecycleFacts.analysisBrief.replaySafeSummary,
                  ...lifecycleFacts.analysisBrief.evidence,
                ]
              : []),
            ...(lifecycleFacts.executionPlan
              ? [
                  lifecycleFacts.executionPlan.replaySafeSummary,
                  ...lifecycleFacts.executionPlan.evidence,
                ]
              : []),
          ]
        : []),
    ],
    redactionStatus: packet.redactionStatus,
    mutationAuthority: "not-granted",
    contextSummary,
  };
}
