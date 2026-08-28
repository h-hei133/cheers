import crypto from "node:crypto";

import type { AgentPlan } from "../../orchestration/agentPlan.js";
import type { ContextGraph } from "../../orchestration/contextGraph.js";
import type { ContextGraphScore } from "../../orchestration/contextGraphScore.js";
import { buildContextGraphReadinessFacts, type ContextGraphReadinessFacts } from "../../orchestration/contextGraphReadiness.js";
import type { TargetedContextPacket } from "../../orchestration/contextPacket.js";
import type { TestImpactPlan } from "../../orchestration/testImpactPlan.js";

export interface VerificationCommandPlanLike {
  readonly verificationPlanId?: string;
  readonly state?: string;
}
import type { VerificationRepairContext } from "../../orchestration/verificationRepairContext.js";
import type { CodeGraphTrace } from "../../context/acquisition/code/trace.js";
import type { CodeGraphImpact } from "../../context/acquisition/code/impact.js";
import type { AnalysisBrief } from "../../orchestration/analysisBrief.js";
import type { TaskExecutionPlan } from "../../orchestration/taskExecutionPlan.js";
import type { TaskLifecycle } from "../../orchestration/taskLifecycle.js";
import type { AnalysisBriefCalibration } from "../../orchestration/analysisBriefCalibration.js";
import type { AnalysisQualityGateResult } from "../../orchestration/analysisQualityGate.js";
import type { TaskContextSufficiency } from "../../orchestration/taskContextSufficiency.js";
import type { ProviderAnchoredProposalManifest } from "../../orchestration/providerAnchoredProposal.js";
import type { ProviderAnchoringResult } from "../../orchestration/providerAnchoringResult.js";

export type PlanQualityLevel =
  | "ready"
  | "needs-more-context"
  | "budget-limited"
  | "low-confidence"
  | "blocked"
  | "unsupported";

export interface PlanQualityDimensions {
  readonly targetConfidence: number;
  readonly contextPacketCompleteness: number;
  readonly contextGraphCoverage: number;
  readonly importCallSiteCoverage: number;
  readonly testImpactCoverage: number;
  readonly codeGraphTraceFreshness: number;
  readonly codeGraphImpactCoverage: number;
  readonly docsCoverage: number;
  readonly omittedRisk: number;
  readonly providerReadiness: number;
  readonly verificationReadiness: number;
  readonly repairLoopReadiness: number;
  readonly applyReadiness: number;
}

export interface PlanQuality {
  readonly qualityId: string;
  readonly sourceAgentPlanId: string;
  readonly contextPacketId?: string;
  readonly contextGraphId?: string;
  readonly testImpactPlanId?: string;
  readonly codeGraphTraceId?: string;
  readonly impactQueryId?: string;
  readonly taskLifecycleId?: string;
  readonly analysisBriefId?: string;
  readonly taskExecutionPlanId?: string;
  readonly analysisConfidence?: AnalysisBrief["confidence"];
  readonly contextSufficiencyId?: string;
  readonly contextSufficiencyState?: string;
  readonly analysisCalibrationId?: string;
  readonly analysisRiskLevel?: string;
  readonly analysisQualityGateId?: string;
  readonly analysisQualityGateDecision?: string;
  readonly verificationPlanId?: string;
  readonly repairLoopId?: string;
  readonly providerAnchoredProposalId?: string;
  readonly providerAnchorQualityLevel?: string;
  readonly providerAnchoringOutcome?: string;
  readonly providerAnchoringHandoffReadiness?: string;
  readonly score: number;
  readonly level: PlanQualityLevel;
  readonly dimensions: PlanQualityDimensions;
  readonly graphReadiness?: ContextGraphReadinessFacts;
  readonly missingFacts: readonly string[];
  readonly suggestedReads: readonly string[];
  readonly suggestedVerification: readonly string[];
  readonly suggestedNextAction: string;
  readonly redactionStatus: "redacted-and-budgeted";
  readonly mutationAuthority: "not-granted";
  readonly replaySafeSummary: string;
  readonly evidence: readonly string[];
}

export function attachProviderAnchoringToPlanQuality(input: {
  readonly planQuality: PlanQuality;
  readonly anchoredProposal: ProviderAnchoredProposalManifest;
  readonly anchoringResult: ProviderAnchoringResult;
}): PlanQuality {
  const applyReadiness =
    input.anchoredProposal.handoffReadiness === "exact-single-target" ||
    input.anchoredProposal.handoffReadiness === "exact-hunk-set"
      ? 85
      : input.anchoredProposal.handoffReadiness === "review-only"
        ? 45
        : 15;
  const missingFacts = Array.from(
    new Set([
      ...input.planQuality.missingFacts,
      ...input.anchoringResult.missingFacts,
      ...(input.anchoredProposal.reviewRequirement === "target-selection-required"
        ? ["provider anchor target selection required"]
        : []),
      ...(input.anchoredProposal.reviewRequirement === "context-refresh-required"
        ? ["provider anchor context refresh required"]
        : []),
      ...(input.anchoredProposal.reviewRequirement === "blocked"
        ? ["provider anchor handoff blocked"]
        : []),
    ]),
  );
  const suggestedReads = Array.from(
    new Set([...input.planQuality.suggestedReads, ...input.anchoringResult.suggestedReads]),
  );
  const suggestedNextAction =
    input.anchoredProposal.handoffReadiness === "exact-single-target" ||
    input.anchoredProposal.handoffReadiness === "exact-hunk-set"
      ? "Review and explicitly confirm anchored provider hunks before existing apply path."
      : input.anchoringResult.nextAction;
  const dimensions = {
    ...input.planQuality.dimensions,
    applyReadiness,
  };
  const score = Math.round(
    (
      dimensions.targetConfidence +
      dimensions.contextPacketCompleteness +
      dimensions.contextGraphCoverage +
      dimensions.importCallSiteCoverage +
      dimensions.testImpactCoverage +
      dimensions.codeGraphTraceFreshness +
      dimensions.codeGraphImpactCoverage +
      dimensions.docsCoverage +
      dimensions.omittedRisk +
      dimensions.providerReadiness +
      dimensions.verificationReadiness +
      dimensions.repairLoopReadiness +
      dimensions.applyReadiness
    ) / 13,
  );
  const level =
    input.planQuality.level === "ready" &&
    input.anchoredProposal.handoffReadiness === "blocked"
      ? "needs-more-context"
      : input.planQuality.level;

  return {
    ...input.planQuality,
    providerAnchoredProposalId: input.anchoredProposal.anchoredProposalId,
    providerAnchorQualityLevel: input.anchoredProposal.anchorQualityLevel,
    providerAnchoringOutcome: input.anchoringResult.status,
    providerAnchoringHandoffReadiness: input.anchoredProposal.handoffReadiness,
    score,
    level,
    dimensions,
    missingFacts,
    suggestedReads,
    suggestedNextAction,
    replaySafeSummary: [
      input.planQuality.replaySafeSummary,
      `providerAnchoredProposal=${input.anchoredProposal.anchoredProposalId}`,
      `providerAnchoring=${input.anchoringResult.status}`,
      `providerAnchorQuality=${input.anchoredProposal.anchorQualityLevel}`,
      `providerHandoff=${input.anchoredProposal.handoffReadiness}`,
    ].join("; "),
    evidence: [
      ...input.planQuality.evidence,
      `plan-quality:provider-anchored-proposal:${input.anchoredProposal.anchoredProposalId}`,
      `plan-quality:provider-anchoring:${input.anchoringResult.status}`,
      `plan-quality:provider-anchor-quality:${input.anchoredProposal.anchorQualityLevel}`,
      `plan-quality:provider-handoff:${input.anchoredProposal.handoffReadiness}`,
      "plan-quality:provider-anchoring-mutation-authority:not-granted",
      ...input.anchoringResult.evidence,
    ],
  };
}

export function buildPlanQuality(input: {
  readonly agentPlan: AgentPlan;
  readonly contextPacket?: TargetedContextPacket;
  readonly contextGraph?: ContextGraph;
  readonly contextGraphScore?: ContextGraphScore;
  readonly testImpactPlan?: TestImpactPlan;
  readonly codeGraphTrace?: CodeGraphTrace;
  readonly codeGraphImpact?: CodeGraphImpact;
  readonly taskLifecycle?: TaskLifecycle;
  readonly analysisBrief?: AnalysisBrief;
  readonly contextSufficiency?: TaskContextSufficiency;
  readonly analysisCalibration?: AnalysisBriefCalibration;
  readonly analysisQualityGate?: AnalysisQualityGateResult;
  readonly taskExecutionPlan?: TaskExecutionPlan;
  readonly verificationCommandPlan?: VerificationCommandPlanLike;
  readonly repairContext?: VerificationRepairContext;
  readonly providerReadiness?: "ready" | "missing" | "blocked" | "unsupported";
}): PlanQuality {
  const graphReadiness =
    input.contextGraph && input.contextGraphScore
      ? buildContextGraphReadinessFacts({
          graph: input.contextGraph,
          score: input.contextGraphScore,
          testImpactPlan: input.testImpactPlan,
        })
      : undefined;
  const dimensions = buildDimensions({ ...input, graphReadiness });
  const score = Math.round(
    (
      dimensions.targetConfidence +
      dimensions.contextPacketCompleteness +
      dimensions.contextGraphCoverage +
      dimensions.importCallSiteCoverage +
      dimensions.testImpactCoverage +
      dimensions.codeGraphTraceFreshness +
      dimensions.codeGraphImpactCoverage +
      dimensions.docsCoverage +
      dimensions.omittedRisk +
      dimensions.providerReadiness +
      dimensions.verificationReadiness +
      dimensions.repairLoopReadiness +
      dimensions.applyReadiness
    ) / 13,
  );
  const missingFacts = Array.from(
    new Set([
      ...input.agentPlan.missingFacts,
      ...(graphReadiness?.missingFacts ?? []),
      ...(!input.contextPacket ? ["context packet missing"] : []),
      ...(!input.contextGraph ? ["context graph missing"] : []),
      ...(!input.testImpactPlan ? ["test-impact plan missing"] : []),
      ...(input.codeGraphTrace?.stalenessSummary.status === "stale"
        ? ["code graph trace has stale facts"]
        : []),
      ...(input.codeGraphImpact?.readiness === "stale-warning"
        ? ["code graph impact stale warning"]
        : []),
      ...(input.codeGraphImpact?.readiness === "no-impact-candidates"
        ? ["code graph impact has no candidates"]
        : []),
      ...(input.taskLifecycle?.missingFacts ?? input.agentPlan.taskLifecycleMissingFacts ?? []),
      ...(input.agentPlan.taskLifecycleId && !input.analysisBrief && !input.agentPlan.analysisBriefId
        ? ["analysis brief missing for lifecycle task"]
        : []),
      ...(input.analysisBrief?.missingFacts ?? []),
      ...(input.contextSufficiency?.missingRequiredFacts ?? []),
      ...(input.contextSufficiency?.state === "stale-context" ? ["task context is stale"] : []),
      ...(input.contextSufficiency?.state === "budget-limited" ? ["task context budget limited"] : []),
      ...(input.analysisCalibration?.underEvidencedClaims.length
        ? [`analysis under-evidenced claims ${input.analysisCalibration.underEvidencedClaims.length}`]
        : []),
      ...(input.analysisCalibration?.missingFacts ?? []),
      ...(input.analysisQualityGate && !input.analysisQualityGate.allowed
        ? [`analysis quality gate ${input.analysisQualityGate.decision}`]
        : []),
      ...(input.analysisBrief?.verificationExpectation.startsWith("attach an explicit")
        ? ["analysis brief missing verification expectation"]
        : []),
      ...(input.taskExecutionPlan?.stopConditions ?? []),
      ...(input.verificationCommandPlan?.state && input.verificationCommandPlan.state !== "ready"
        ? [`verification command plan ${input.verificationCommandPlan.state}`]
        : []),
      ...(input.repairContext?.status && input.repairContext.status !== "repair-loop-context-created"
        ? [`repair loop ${input.repairContext.status}`]
        : []),
    ]),
  );
  const level = classifyLevel({
    agentPlan: input.agentPlan,
    graphReadiness,
    testImpactPlan: input.testImpactPlan,
    codeGraphTrace: input.codeGraphTrace,
    codeGraphImpact: input.codeGraphImpact,
    taskLifecycle: input.taskLifecycle,
    analysisBrief: input.analysisBrief,
    contextSufficiency: input.contextSufficiency,
    analysisCalibration: input.analysisCalibration,
    analysisQualityGate: input.analysisQualityGate,
    taskExecutionPlan: input.taskExecutionPlan,
    verificationCommandPlan: input.verificationCommandPlan,
    repairContext: input.repairContext,
    score,
  });
  const qualityId = buildQualityId({
    agentPlanId: input.agentPlan.planId,
    contextPacketId: input.contextPacket?.packetId,
    contextGraphId: input.contextGraph?.graphId,
    testImpactPlanId: input.testImpactPlan?.impactPlanId,
    codeGraphTraceId: input.codeGraphTrace?.traceId,
    impactQueryId: input.codeGraphImpact?.impactQueryId,
    taskLifecycleId: input.taskLifecycle?.lifecycleId ?? input.agentPlan.taskLifecycleId,
    analysisBriefId: input.analysisBrief?.briefId ?? input.agentPlan.analysisBriefId,
    contextSufficiencyId: input.contextSufficiency?.sufficiencyId,
    contextSufficiencyState: input.contextSufficiency?.state,
    analysisCalibrationId: input.analysisCalibration?.calibrationId,
    analysisRiskLevel: input.analysisCalibration?.riskLevel,
    analysisQualityGateId: input.analysisQualityGate?.gateId,
    analysisQualityGateDecision: input.analysisQualityGate?.decision,
    taskExecutionPlanId: input.taskExecutionPlan?.executionPlanId ?? input.agentPlan.taskExecutionPlanId,
    analysisConfidence: input.analysisBrief?.confidence,
    score,
    level,
    missingFacts,
  });
  const suggestedReads = Array.from(
    new Set([
      ...input.agentPlan.suggestedReads,
      ...(graphReadiness?.suggestedReads ?? []),
      ...(input.testImpactPlan?.suggestedReads ?? []),
      ...(input.codeGraphImpact?.suggestedReads ?? []),
    ]),
  );
  const suggestedVerification = Array.from(
    new Set([
      ...input.agentPlan.suggestedVerification,
      ...(input.testImpactPlan?.likelyVerificationCommandCandidates
        .filter((candidate) => candidate.readiness === "ready")
        .map((candidate) => candidate.command) ?? []),
      ...(input.codeGraphImpact?.suggestedVerification ?? []),
    ]),
  );
  const suggestedNextAction = buildSuggestedNextAction({
    level,
    missingFacts,
    suggestedReads,
    suggestedVerification,
  });
  const replaySafeSummary = [
    `plan-quality ${qualityId}`,
    `agentPlan=${input.agentPlan.planId}`,
    input.contextPacket ? `contextPacket=${input.contextPacket.packetId}` : undefined,
    input.contextGraph ? `contextGraph=${input.contextGraph.graphId}` : undefined,
    input.testImpactPlan ? `testImpact=${input.testImpactPlan.impactPlanId}` : undefined,
    input.codeGraphTrace ? `codeGraphTrace=${input.codeGraphTrace.traceId}` : undefined,
    input.codeGraphImpact ? `impact=${input.codeGraphImpact.impactQueryId}` : undefined,
    input.taskLifecycle ? `taskLifecycle=${input.taskLifecycle.lifecycleId}` : input.agentPlan.taskLifecycleId ? `taskLifecycle=${input.agentPlan.taskLifecycleId}` : undefined,
    input.analysisBrief ? `analysisBrief=${input.analysisBrief.briefId}` : input.agentPlan.analysisBriefId ? `analysisBrief=${input.agentPlan.analysisBriefId}` : undefined,
    input.taskExecutionPlan ? `executionPlan=${input.taskExecutionPlan.executionPlanId}` : input.agentPlan.taskExecutionPlanId ? `executionPlan=${input.agentPlan.taskExecutionPlanId}` : undefined,
    `level=${level}`,
    `score=${score}`,
    input.contextSufficiency ? `contextSufficiency=${input.contextSufficiency.state}` : undefined,
    input.analysisCalibration ? `analysisCalibration=${input.analysisCalibration.calibrationId}` : undefined,
    input.analysisCalibration ? `analysisConfidence=${input.analysisCalibration.confidence}` : undefined,
    input.analysisCalibration ? `analysisRisk=${input.analysisCalibration.riskLevel}` : undefined,
    input.analysisQualityGate ? `analysisGate=${input.analysisQualityGate.decision}` : undefined,
    `missingFacts=${missingFacts.length}`,
    "mutationAuthority=not-granted",
    "raw-content-excluded",
  ].filter(Boolean).join("; ");

  return {
    qualityId,
    sourceAgentPlanId: input.agentPlan.planId,
    ...(input.contextPacket ? { contextPacketId: input.contextPacket.packetId } : {}),
    ...(input.contextGraph ? { contextGraphId: input.contextGraph.graphId } : {}),
    ...(input.testImpactPlan ? { testImpactPlanId: input.testImpactPlan.impactPlanId } : {}),
    ...(input.codeGraphTrace ? { codeGraphTraceId: input.codeGraphTrace.traceId } : {}),
    ...(input.codeGraphImpact ? { impactQueryId: input.codeGraphImpact.impactQueryId } : {}),
    ...(input.taskLifecycle?.lifecycleId ?? input.agentPlan.taskLifecycleId
      ? { taskLifecycleId: input.taskLifecycle?.lifecycleId ?? input.agentPlan.taskLifecycleId }
      : {}),
    ...(input.analysisBrief?.briefId ?? input.agentPlan.analysisBriefId
      ? { analysisBriefId: input.analysisBrief?.briefId ?? input.agentPlan.analysisBriefId }
      : {}),
    ...(input.taskExecutionPlan?.executionPlanId ?? input.agentPlan.taskExecutionPlanId
      ? { taskExecutionPlanId: input.taskExecutionPlan?.executionPlanId ?? input.agentPlan.taskExecutionPlanId }
      : {}),
    ...(input.analysisBrief ? { analysisConfidence: input.analysisBrief.confidence } : {}),
    ...(input.contextSufficiency ? { contextSufficiencyId: input.contextSufficiency.sufficiencyId } : {}),
    ...(input.contextSufficiency ? { contextSufficiencyState: input.contextSufficiency.state } : {}),
    ...(input.analysisCalibration ? { analysisCalibrationId: input.analysisCalibration.calibrationId } : {}),
    ...(input.analysisCalibration ? { analysisRiskLevel: input.analysisCalibration.riskLevel } : {}),
    ...(input.analysisQualityGate ? { analysisQualityGateId: input.analysisQualityGate.gateId } : {}),
    ...(input.analysisQualityGate ? { analysisQualityGateDecision: input.analysisQualityGate.decision } : {}),
    ...(input.verificationCommandPlan ? { verificationPlanId: input.verificationCommandPlan.verificationPlanId } : {}),
    ...(input.repairContext ? { repairLoopId: input.repairContext.repairLoopId } : {}),
    score,
    level,
    dimensions,
    ...(graphReadiness ? { graphReadiness } : {}),
    missingFacts,
    suggestedReads,
    suggestedVerification,
    suggestedNextAction,
    redactionStatus: "redacted-and-budgeted",
    mutationAuthority: "not-granted",
    replaySafeSummary,
    evidence: [
      `plan-quality:id:${qualityId}`,
      `plan-quality:agent-plan:${input.agentPlan.planId}`,
      ...(input.contextPacket ? [`plan-quality:context-packet:${input.contextPacket.packetId}`] : []),
      ...(input.contextGraph ? [`plan-quality:context-graph:${input.contextGraph.graphId}`] : []),
      ...(input.testImpactPlan ? [`plan-quality:test-impact:${input.testImpactPlan.impactPlanId}`] : []),
      ...(input.codeGraphTrace ? [`plan-quality:code-graph-trace:${input.codeGraphTrace.traceId}`] : []),
      ...(input.codeGraphImpact ? [`plan-quality:impact-query:${input.codeGraphImpact.impactQueryId}`] : []),
      ...(input.taskLifecycle ? [`plan-quality:task-lifecycle:${input.taskLifecycle.lifecycleId}`] : input.agentPlan.taskLifecycleId ? [`plan-quality:task-lifecycle:${input.agentPlan.taskLifecycleId}`] : []),
      ...(input.analysisBrief ? [`plan-quality:analysis-brief:${input.analysisBrief.briefId}`] : input.agentPlan.analysisBriefId ? [`plan-quality:analysis-brief:${input.agentPlan.analysisBriefId}`] : []),
      ...(input.contextSufficiency ? [`plan-quality:context-sufficiency:${input.contextSufficiency.sufficiencyId}`] : []),
      ...(input.analysisCalibration ? [`plan-quality:analysis-calibration:${input.analysisCalibration.calibrationId}`] : []),
      ...(input.analysisQualityGate ? [`plan-quality:analysis-quality-gate:${input.analysisQualityGate.gateId}`] : []),
      ...(input.analysisQualityGate ? [`plan-quality:analysis-quality-decision:${input.analysisQualityGate.decision}`] : []),
      ...(input.taskExecutionPlan ? [`plan-quality:execution-plan:${input.taskExecutionPlan.executionPlanId}`] : input.agentPlan.taskExecutionPlanId ? [`plan-quality:execution-plan:${input.agentPlan.taskExecutionPlanId}`] : []),
      `plan-quality:level:${level}`,
      `plan-quality:score:${score}`,
      `plan-quality:missing-facts:${missingFacts.length}`,
      "plan-quality:mutation-authority:not-granted",
      "plan-quality:redacted-and-budgeted",
      "plan-quality:raw-content-excluded",
      ...(graphReadiness?.evidence ?? []),
      ...(input.codeGraphTrace?.evidence ?? []),
      ...(input.codeGraphImpact?.evidence ?? []),
    ],
  };
}

export function attachPlanQualityToAgentPlan(input: {
  readonly agentPlan: AgentPlan;
  readonly planQuality: PlanQuality;
}): AgentPlan {
  return {
    ...input.agentPlan,
    planQualityId: input.planQuality.qualityId,
    planQualityLevel: input.planQuality.level,
    planQualityScore: input.planQuality.score,
    safeEvidenceMarkers: [
      ...input.agentPlan.safeEvidenceMarkers,
      ...input.planQuality.evidence,
    ],
    replaySafeSummary: `${input.agentPlan.replaySafeSummary}; planQuality=${input.planQuality.qualityId}; qualityLevel=${input.planQuality.level}; qualityScore=${input.planQuality.score}`,
  };
}

function buildDimensions(input: {
  readonly agentPlan: AgentPlan;
  readonly contextPacket?: TargetedContextPacket;
  readonly contextGraphScore?: ContextGraphScore;
  readonly testImpactPlan?: TestImpactPlan;
  readonly codeGraphTrace?: CodeGraphTrace;
  readonly codeGraphImpact?: CodeGraphImpact;
  readonly taskLifecycle?: TaskLifecycle;
  readonly analysisBrief?: AnalysisBrief;
  readonly contextSufficiency?: TaskContextSufficiency;
  readonly analysisCalibration?: AnalysisBriefCalibration;
  readonly analysisQualityGate?: AnalysisQualityGateResult;
  readonly taskExecutionPlan?: TaskExecutionPlan;
  readonly verificationCommandPlan?: VerificationCommandPlanLike;
  readonly repairContext?: VerificationRepairContext;
  readonly providerReadiness?: "ready" | "missing" | "blocked" | "unsupported";
  readonly graphReadiness?: ContextGraphReadinessFacts;
}): PlanQualityDimensions {
  return {
    targetConfidence: input.agentPlan.confidence === "high" ? 100 : input.agentPlan.confidence === "medium" ? 70 : 30,
    contextPacketCompleteness: input.contextPacket?.completenessStatus === "complete" ? 100 : input.contextPacket ? 55 : 0,
    contextGraphCoverage: input.contextGraphScore?.coverageScore ?? 0,
    importCallSiteCoverage: Math.round((((input.contextGraphScore?.importCoverage ?? 0) + (input.contextGraphScore?.callSiteCoverage ?? 0)) / 2) * 100),
    testImpactCoverage: input.testImpactPlan?.commandReadiness === "ready" ? (input.testImpactPlan.confidence === "high" ? 100 : 75) : input.testImpactPlan ? 35 : 0,
    codeGraphTraceFreshness: input.codeGraphTrace
      ? input.codeGraphTrace.stalenessSummary.status === "fresh"
        ? 100
        : input.codeGraphTrace.stalenessSummary.status === "unknown"
          ? 60
          : 20
      : 0,
    codeGraphImpactCoverage: input.codeGraphImpact
      ? input.codeGraphImpact.planQualityContribution.impactConfidenceScore
      : 0,
    docsCoverage: Math.round((input.contextGraphScore?.docsCoverage ?? 0) * 100),
    omittedRisk: input.contextGraphScore?.omittedRiskLevel === "none" ? 100 : input.contextGraphScore?.omittedRiskLevel === "low" ? 80 : input.contextGraphScore?.omittedRiskLevel === "medium" ? 50 : 20,
    providerReadiness: input.providerReadiness === "blocked" || input.providerReadiness === "unsupported" ? 0 : input.providerReadiness === "missing" ? 40 : 100,
    verificationReadiness: input.verificationCommandPlan ? (input.verificationCommandPlan.state === "ready" ? 100 : 20) : input.testImpactPlan?.commandReadiness === "ready" ? 85 : 20,
    repairLoopReadiness: input.repairContext ? (input.repairContext.status === "repair-loop-context-created" ? 100 : 20) : 65,
    applyReadiness: input.agentPlan.targetSummary.trim() ? 65 : 0,
  };
}

function classifyLevel(input: {
  readonly agentPlan: AgentPlan;
  readonly graphReadiness?: ContextGraphReadinessFacts;
  readonly testImpactPlan?: TestImpactPlan;
  readonly codeGraphTrace?: CodeGraphTrace;
  readonly codeGraphImpact?: CodeGraphImpact;
  readonly taskLifecycle?: TaskLifecycle;
  readonly analysisBrief?: AnalysisBrief;
  readonly contextSufficiency?: TaskContextSufficiency;
  readonly analysisCalibration?: AnalysisBriefCalibration;
  readonly analysisQualityGate?: AnalysisQualityGateResult;
  readonly taskExecutionPlan?: TaskExecutionPlan;
  readonly verificationCommandPlan?: VerificationCommandPlanLike;
  readonly repairContext?: VerificationRepairContext;
  readonly score: number;
}): PlanQualityLevel {
  if (!input.agentPlan.targetSummary.trim()) {
    return "blocked";
  }
  if (input.graphReadiness?.graphReadiness === "unsupported") {
    return "unsupported";
  }
  if (input.graphReadiness?.graphReadiness === "budget-limited") {
    return "budget-limited";
  }
  if (
    input.codeGraphTrace?.stalenessSummary.status === "stale" ||
    input.codeGraphImpact?.readiness === "stale-warning" ||
      input.analysisBrief?.confidence === "low"
  ) {
    return "low-confidence";
  }
  if (
    input.contextSufficiency?.state === "stale-context" ||
    input.contextSufficiency?.state === "budget-limited" ||
    input.contextSufficiency?.state === "unsupported" ||
    input.analysisCalibration?.readiness === "stale-context" ||
    input.analysisCalibration?.readiness === "unsupported" ||
    (input.analysisQualityGate && !input.analysisQualityGate.allowed)
  ) {
    return input.contextSufficiency?.state === "budget-limited"
      ? "budget-limited"
      : input.contextSufficiency?.state === "unsupported" || input.analysisCalibration?.readiness === "unsupported"
        ? "unsupported"
        : "low-confidence";
  }
  if (
    input.agentPlan.executionReadiness !== "ready" ||
    (input.agentPlan.taskLifecycleId && !input.analysisBrief && !input.agentPlan.analysisBriefId) ||
    (input.analysisBrief?.missingFacts.length ?? 0) > 0 ||
    (input.contextSufficiency?.missingRequiredFacts.length ?? 0) > 0 ||
    (input.analysisCalibration?.missingFacts.length ?? 0) > 0 ||
    input.analysisBrief?.verificationExpectation.startsWith("attach an explicit") ||
    input.graphReadiness?.graphReadiness === "partial" ||
    !input.testImpactPlan ||
    input.testImpactPlan.commandReadiness === "missing-verification" ||
    input.codeGraphImpact?.readiness === "needs-more-context" ||
    input.codeGraphImpact?.readiness === "no-impact-candidates" ||
    input.verificationCommandPlan?.state === "context-missing" ||
    input.repairContext?.status === "repair-loop-missing-context"
  ) {
    return "needs-more-context";
  }
  if (
    input.graphReadiness?.graphReadiness === "low-confidence" ||
    input.agentPlan.confidence === "low" ||
    input.score < 45
  ) {
    return "low-confidence";
  }
  if (
    input.verificationCommandPlan?.state &&
    input.verificationCommandPlan.state !== "ready"
  ) {
    return "blocked";
  }
  if (
    input.repairContext?.status &&
    input.repairContext.status !== "repair-loop-context-created"
  ) {
    return "blocked";
  }
  return input.score >= 70 ? "ready" : "needs-more-context";
}

function buildSuggestedNextAction(input: {
  readonly level: PlanQualityLevel;
  readonly missingFacts: readonly string[];
  readonly suggestedReads: readonly string[];
  readonly suggestedVerification: readonly string[];
}): string {
  switch (input.level) {
    case "ready":
      return input.suggestedVerification[0] ?? "Proceed to the next gated proposal or verification step.";
    case "budget-limited":
      return "Reduce or summarize context graph candidates before provider, verification, or repair planning.";
    case "low-confidence":
      return input.suggestedReads[0]
        ? `Read suggested context first: ${input.suggestedReads[0]}.`
        : "Add higher-confidence target, import, test, or call-site context.";
    case "needs-more-context":
      return input.suggestedReads[0]
        ? `Read missing context first: ${input.suggestedReads[0]}.`
        : "Build the missing context packet, graph, and test-impact facts.";
    case "blocked":
      return input.missingFacts[0] ?? "Resolve blocked planning facts before continuing.";
    case "unsupported":
      return "Use a supported explicit in-workspace code target.";
  }
}

function buildQualityId(input: {
  readonly agentPlanId: string;
  readonly contextPacketId?: string;
  readonly contextGraphId?: string;
  readonly testImpactPlanId?: string;
  readonly codeGraphTraceId?: string;
  readonly impactQueryId?: string;
  readonly taskLifecycleId?: string;
  readonly analysisBriefId?: string;
  readonly contextSufficiencyId?: string;
  readonly contextSufficiencyState?: string;
  readonly analysisCalibrationId?: string;
  readonly analysisRiskLevel?: string;
  readonly analysisQualityGateId?: string;
  readonly analysisQualityGateDecision?: string;
  readonly taskExecutionPlanId?: string;
  readonly analysisConfidence?: AnalysisBrief["confidence"];
  readonly score: number;
  readonly level: PlanQualityLevel;
  readonly missingFacts: readonly string[];
}): string {
  return `plan_quality_${crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 12)}`;
}
