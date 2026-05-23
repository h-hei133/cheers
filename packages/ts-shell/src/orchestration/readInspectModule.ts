import {
  inferDiagnosisEvidenceRole,
  inferRepoDiagnosisDisposition,
  parseGlobFileList,
  selectRepoExplainEvidenceTarget,
} from "./repoExplainEvidence.js";
import type {
  RepoDiagnosisDisposition,
  RepoDiagnosisEvidenceRole,
} from "./repoExplainEvidence.js";
import {
  classifyReadInspectIntent,
  isPathOnlyReadIntentPrompt,
  type ReadInspectIntentProjection,
} from "./readInspectIntent.js";
import {
  resolveReadContinuationTargetRecovery,
  type ReadContinuationTargetRecovery,
} from "./readContinuationTarget.js";
import type { ContinuityStateLike } from "./runtimeHandoffProjection.js";
import {
  projectAmbiguousTargetStoppedSummary,
  projectMissingTargetStoppedSummary,
  projectOutOfWorkspaceTargetStoppedSummary,
  type WorkspaceTargetStoppedSummary,
} from "./workspaceTargetProjection.js";
export {
  buildTargetedContextPacket,
  type TargetedContextPacket,
  type ContextPacketSourceSummary,
} from "./contextPacket.js";
export {
  buildContextPlanningSummary,
  type ContextPlanningSummary,
} from "./contextPlan.js";
export {
  buildContextPacketResult,
  projectContextPacketRuntimeOutcome,
  type ContextPacketResultProjection,
} from "./contextPacketResult.js";
export {
  buildContextGraph,
  type ContextGraph,
  type ContextGraphNode,
  type ContextGraphEdge,
} from "./contextGraph.js";
export {
  discoverContextGraph,
} from "./contextGraphDiscovery.js";
export {
  createContextGraphBudgetState,
  type ContextGraphBudgetLimits,
} from "./contextGraphBudget.js";
export {
  scoreContextGraph,
  type ContextGraphScore,
} from "./contextGraphScore.js";
export {
  buildTestImpactPlan,
  type TestImpactPlan,
} from "./testImpactPlan.js";
export {
  buildContextGraphResult,
  type ContextGraphResultProjection,
} from "./contextGraphResult.js";
export {
  buildContextGraphPlanningBundle,
  type ContextGraphPlanningBundle,
} from "./contextGraphPlanning.js";
export {
  buildRepoIntelligence,
  rankRepoCandidates,
  type RepoIntelligenceCandidate,
  type RepoIntelligenceFile,
  type RepoIntelligenceResult,
  type RepoIntelligenceSnapshot,
} from "./repoIntelligence.js";
export {
  buildContextWorkingMemory,
  canReuseContextMemory,
  evaluateContextMemoryFreshness,
  type ContextMemoryFileReceipt,
  type ContextWorkingMemory,
} from "./contextMemory.js";
export {
  runContextEngine,
  type ContextEngineResult,
} from "./contextEngine.js";
export {
  runPlanningRuntime,
  type PlanningRuntimeEditTarget,
  type PlanningRuntimeResult,
} from "./planningRuntime.js";
export {
  projectPlanningRuntimeSurface,
  type PlanningRuntimeSurface,
} from "./planningRuntimeSurface.js";
export {
  buildContextGraphReadinessFacts,
  type ContextGraphReadinessFacts,
} from "./contextGraphReadiness.js";
export {
  buildAgentPlan,
  type AgentPlan,
} from "./agentPlan.js";
export {
  buildPlanQuality,
  attachPlanQualityToAgentPlan,
  type PlanQuality,
} from "./planQuality.js";
export {
  evaluatePlanQualityGate,
  type PlanQualityGateResult,
} from "./planQualityGate.js";
export {
  buildHarnessTrace,
  type HarnessTrace,
} from "./harnessTrace.js";
export {
  buildHarnessScorecard,
  type HarnessScorecard,
} from "./harnessScorecard.js";
export {
  classifyHarnessFailure,
  getHarnessFailureTaxonomyEntry,
  type HarnessFailureTaxonomyEntry,
} from "./harnessFailureTaxonomy.js";
export {
  buildPlanQualityCodingResult,
} from "./planQualityResult.js";
export {
  projectContextPacketToAgentPlanContext,
  type AgentPlanContextProjection,
} from "./agentPlanContext.js";
export {
  projectWorkflowTaskPlanToAgentPlan,
  type AgentPlanProjectionInput,
} from "./agentPlanProjection.js";
export {
  buildAgentPlanResult,
  projectAgentPlanRuntimeOutcome,
  type AgentPlanResultProjection,
} from "./agentPlanResult.js";

export type {
  ReadContinuationTargetRecovery,
  ReadInspectIntentProjection,
  WorkspaceTargetStoppedSummary,
};

export function classifyReadInspectRequest(
  groundedIntentPrompt: string,
): ReadInspectIntentProjection {
  return classifyReadInspectIntent(groundedIntentPrompt);
}

export function isPathOnlyReadRequest(prompt: string): boolean {
  return isPathOnlyReadIntentPrompt(prompt);
}

export function recoverReadContinuationTarget(input: {
  readonly candidatePath?: string;
  readonly continuity: ContinuityStateLike;
  readonly workspaceRoot: string;
}): ReadContinuationTargetRecovery {
  return resolveReadContinuationTargetRecovery(input);
}

export function parseRepoCandidateFiles(globOutput: string): string[] {
  return parseGlobFileList(globOutput);
}

export function selectRepoExplainTarget(input: {
  readonly prompt: string;
  readonly candidates: readonly { path: string; content: string }[];
}): { path: string; content: string } | undefined {
  return selectRepoExplainEvidenceTarget(input);
}

export function inferRepoDiagnosis(input: {
  readonly prompt: string;
}): RepoDiagnosisDisposition {
  return inferRepoDiagnosisDisposition(input.prompt);
}

export function inferRepoEvidenceRole(input: {
  readonly targetPath: string;
}): RepoDiagnosisEvidenceRole {
  return inferDiagnosisEvidenceRole(input.targetPath);
}

export function projectReadMissingTargetStop(input: {
  readonly targetHint?: string;
  readonly reason?: string;
  readonly doNext?: string;
}): WorkspaceTargetStoppedSummary {
  return projectMissingTargetStoppedSummary(input);
}

export function projectReadAmbiguousTargetStop(input: {
  readonly candidates: readonly string[];
  readonly reason?: string;
  readonly doNext?: string;
}): WorkspaceTargetStoppedSummary {
  return projectAmbiguousTargetStoppedSummary(input);
}

export function projectReadOutOfWorkspaceTargetStop(input: {
  readonly targetPath?: string;
  readonly reason?: string;
  readonly doNext?: string;
}): WorkspaceTargetStoppedSummary {
  return projectOutOfWorkspaceTargetStoppedSummary(input);
}
