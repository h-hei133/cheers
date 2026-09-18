import type { CodingTaskKind } from "../../result/types.js";
import type { BrowserAgentPlan } from "../../browser/browserAgent.js";
import type { GroundedDeliverableMode } from "../../result/projection/runtimeHandoffProjection.js";
import type {
  WorkflowActionGraph,
  WorkflowDependentTarget,
} from "../action/graph.js";

export type ReflectiveStateQueryKind =
  | "stop-reason"
  | "explain-scope"
  | "read-position"
  | "next-step"
  | "approval-memory"
  | "task-continuity";

export interface ContinuationTransform {
  readonly path: string;
  readonly from: string;
  readonly to: string;
}

export type SingleFileEditFailureReason =
  | "edit-target-missing"
  | "edit-transform-unclear"
  | "patch-from-not-found"
  | "patch-ambiguous"
  | "patch-target-missing";

export type SingleFileEditRepairPayloadKind =
  | "replace-directive"
  | "fenced-content"
  | "target-path-with-transform";

export interface GroundedDeliverableConstraints {
  summaryStyle?: "default" | "conclusion-with-evidence";
  summaryEvidenceCount?: number;
  includeKeyRisks?: boolean;
  avoidGenericLanguage?: boolean;
  explainScope?: "default" | "purpose-io-only";
  readFilter?: "none" | "function-definitions";
  preserveRecognizedHighlights?: boolean;
}

export interface GroundedRepairStage {
  readonly mode: GroundedDeliverableMode;
  readonly label: string;
  readonly constraints?: GroundedDeliverableConstraints;
  readonly readLineCount?: number;
  readonly continueFromPreviousRead?: boolean;
  readonly useLatestReadSnippet?: boolean;
  readonly summaryConclusionOnly?: boolean;
  readonly summaryEvidenceOnly?: boolean;
  readonly summaryEvidenceCount?: number;
  readonly appendRiskLine?: boolean;
}

export interface GroundedRepairInstruction {
  readonly operation: "continue" | "repair" | "switch" | "clarify";
  readonly targetMode?: GroundedDeliverableMode;
  readonly constraints?: GroundedDeliverableConstraints;
  readonly stagedSteps?: readonly GroundedRepairStage[];
  readonly stagedResumeCursor?: number;
  readonly reason: string;
  readonly clarificationPrompt?: string;
}

export interface WorkflowTaskPlan {
  readonly taskKind: CodingTaskKind;
  readonly reflectiveStateQueryKind?: ReflectiveStateQueryKind;
  readonly groundedDeliverableMode?: GroundedDeliverableMode;
  readonly readLineCount?: number;
  readonly readLineOffset?: number;
  readonly readFragmentLineIndexes?: readonly number[];
  readonly readFragmentRanges?: readonly string[];
  readonly readFragmentSourceWindowStart?: number;
  readonly readFragmentSourceWindowEnd?: number;
  readonly readFragmentFingerprint?: string;
  readonly readFilter?: "none" | "function-definitions";
  readonly repairInstruction?: GroundedRepairInstruction;
  readonly reason: string;
  readonly targetPath?: string;
  readonly replaceFrom?: string;
  readonly replaceTo?: string;
  readonly repairContextUsed?: boolean;
  readonly repairedFailureReason?: SingleFileEditFailureReason;
  readonly repairedTargetFile?: string;
  readonly repairPayloadKind?: SingleFileEditRepairPayloadKind;
  readonly repairContextAbandoned?: boolean;
  readonly repairContextAbandonedReason?: "multiple-failed-targets";
  readonly repairContextAbandonedFailureReason?: SingleFileEditFailureReason;
  readonly repairContextAbandonedTargetCount?: number;
  readonly contextPlanningRequested?: boolean;
  readonly contextPlanningReason?: "explicit-context-packet" | "missing-edit-context";
  readonly mutationScopeLineIndexes?: readonly number[];
  readonly mutationScopeRanges?: readonly string[];
  readonly mutationScopeSourceWindowStart?: number;
  readonly mutationScopeSourceWindowEnd?: number;
  readonly mutationScopeFingerprint?: string;
  readonly mutationScopeRequired?: boolean;
  readonly continuationRepairReplan?: boolean;
  readonly avoidPreviousDirection?: boolean;
  readonly failedTransforms?: readonly ContinuationTransform[];
  readonly crossFileRepair?: boolean;
  readonly additionalTargetPaths?: readonly string[];
  readonly dependentTargets?: readonly WorkflowDependentTarget[];
  readonly actionGraph?: WorkflowActionGraph;
  readonly crossFileConvergedNoop?: boolean;
  readonly previousRemainingTargets?: readonly string[];
  readonly previousFailedEntries?: ReadonlyArray<{
    path: string;
    failureCode: "read-failed" | "patch-generation-failed" | "write-failed";
    reason: string;
  }>;
  readonly continuationLineage?: readonly string[];
  readonly degradedReopen?: boolean;
  readonly degradedReopenReason?: string;
  readonly degradedReopenCandidates?: readonly string[];
  readonly degradedReopenCandidateSource?: string;
  readonly degradedReopenCandidatePruned?: readonly string[];
  readonly inspectFirst: boolean;
  readonly verifyAfterEdit: boolean;
  readonly verifyCommand?: string;
  readonly directCommand?: string;
  readonly browserPlan?: BrowserAgentPlan;
  readonly blockedReason?: string;
  readonly targetMissing?: boolean;
  readonly usedRestoredState?: boolean;
}

export function buildWorkflowDecisionTrace(plan: WorkflowTaskPlan): string[] {
  const parts = [
    `task=${plan.taskKind}`,
    `target=${plan.targetPath ?? "none"}`,
    `inspect=${plan.inspectFirst ? "yes" : "no"}`,
    `verify=${plan.verifyAfterEdit ? "yes" : "no"}`,
    `restored=${plan.usedRestoredState ? "yes" : "no"}`,
  ];

  if (plan.reflectiveStateQueryKind) {
    parts.push(`reflective=${plan.reflectiveStateQueryKind}`);
  }
  if (plan.verifyCommand) {
    parts.push(`verifyCommand=${plan.verifyCommand}`);
  }
  if (plan.repairContextUsed !== undefined) {
    parts.push(`repairContext=${plan.repairContextUsed ? "used" : "not-used"}`);
  }
  if (plan.previousRemainingTargets?.length) {
    parts.push(`remainingTargets=${plan.previousRemainingTargets.length}`);
  }
  if (plan.previousFailedEntries?.length) {
    parts.push(`failedEntries=${plan.previousFailedEntries.length}`);
  }
  if (plan.actionGraph) {
    parts.push(`actionGraph=${plan.actionGraph.graphId}`);
    parts.push(`actionNodes=${plan.actionGraph.orderedNodeIds.length}`);
  }
  if (plan.continuationLineage?.length) {
    parts.push(...plan.continuationLineage);
  }

  return [`decision-trace: ${parts.join(" ")}`];
}
