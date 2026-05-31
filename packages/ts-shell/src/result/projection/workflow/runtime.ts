import type { WorkflowGitDiagnostics } from "../../../workflow/gitContext.js";
import { attributeGitChangeSet } from "../../../orchestration/gitChangeSetAttribution.js";
import {
  projectWorkflowTurnHandoff,
  type TurnResultHandoffInput,
} from "../../../orchestration/resultSurfaceModule.js";
import type {
  CodingPatchRecord,
  CodingResultProvenanceSummary,
  CodingResultSummary,
  CodingVerificationSummary,
} from "../../../orchestration/types.js";
import type { WorkflowTaskPlan } from "../../../orchestration/workflowTaskPlanner.js";

export function truncateText(value: string, maxLength = 220): string {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}

export function projectWorkflowRuntimeResultContract(input: {
  handoff: TurnResultHandoffInput;
  workspaceRoot: string;
  preRunGitChangeSet: WorkflowGitDiagnostics;
  attributeChangeSet: boolean;
}): {
  codingResult: CodingResultSummary;
  userFacingOutput: string;
} {
  const resultContract = projectWorkflowTurnHandoff(input.handoff);
  if (!input.attributeChangeSet) {
    return resultContract;
  }
  return {
    userFacingOutput: resultContract.userFacingOutput,
    codingResult: {
      ...resultContract.codingResult,
      changeSet: attributeGitChangeSet({
        workspaceRoot: input.workspaceRoot,
        preRun: input.preRunGitChangeSet,
        changeSet: resultContract.codingResult.changeSet,
      }),
    },
  };
}

export function projectWorkflowExecutionResultContract(input: {
  readonly plan: WorkflowTaskPlan;
  readonly workspaceRoot: string;
  readonly preRunGitChangeSet: WorkflowGitDiagnostics;
  readonly dispatchedRunCommand?: string;
  readonly changedFiles: string[];
  readonly failedFiles: Array<{ path: string; reason: string }>;
  readonly patches: CodingPatchRecord[];
  readonly verifiedFiles: string[];
  readonly unverifiedFiles: Array<{ path: string; reason: string }>;
  readonly verification: CodingVerificationSummary;
  readonly repairNotes: string[];
  readonly evidence: string[];
  readonly crossFileDegradationReason?: string;
  readonly degradedCrossFileTargets: string[];
  readonly crossFileRemainingTargets: string[];
  readonly crossFileFailedByReason: Array<{
    path: string;
    failureCode: string;
    reason: string;
  }>;
  readonly crossFileSkippedFiles: Array<{ path: string; reason: string }>;
  readonly provenance?: CodingResultProvenanceSummary;
}): {
  codingResult: CodingResultSummary;
  userFacingOutput: string;
} {
  const repairNotes =
    input.failedFiles.length > 0 && input.repairNotes.length === 0
      ? [
          "operation failed; inspect failed items and rerun with clearer target/instruction",
        ]
      : input.repairNotes;
  return projectWorkflowRuntimeResultContract({
    workspaceRoot: input.workspaceRoot,
    preRunGitChangeSet: input.preRunGitChangeSet,
    attributeChangeSet: input.plan.taskKind !== "run-command",
    handoff:
      input.plan.taskKind === "run-command"
        ? buildCommandHandoff({
            ...input,
            repairNotes,
          })
        : buildMutationHandoff({
            ...input,
            repairNotes,
          }),
  });
}

function buildCommandHandoff(input: {
  readonly plan: WorkflowTaskPlan;
  readonly dispatchedRunCommand?: string;
  readonly changedFiles: string[];
  readonly failedFiles: Array<{ path: string; reason: string }>;
  readonly patches: CodingPatchRecord[];
  readonly verifiedFiles: string[];
  readonly unverifiedFiles: Array<{ path: string; reason: string }>;
  readonly verification: CodingVerificationSummary;
  readonly repairNotes: string[];
  readonly evidence: string[];
  readonly provenance?: CodingResultProvenanceSummary;
}): TurnResultHandoffInput {
  return {
    capabilityPlan: {
      taskKind: input.plan.taskKind,
      targetPath: input.plan.targetPath,
      directCommand: input.dispatchedRunCommand ?? input.verification.command,
      verification: input.verification,
      verifyAfterEdit: input.plan.verifyAfterEdit,
      inspectFirst: input.plan.inspectFirst,
      continuationLineage: input.plan.continuationLineage,
    },
    receipts: {
      evidence: input.evidence,
      continuationEvidence: input.plan.continuationLineage,
      verification: input.verification,
    },
    command: {
      command: input.dispatchedRunCommand ?? input.verification.command ?? "command",
      changedFiles: input.changedFiles,
      failedFiles: input.failedFiles,
      patches: input.patches,
      verifiedFiles: input.verifiedFiles,
      unverifiedFiles: input.unverifiedFiles,
      verification: input.verification,
      repairNotes: input.repairNotes,
      evidence: input.evidence,
      provenance: input.provenance,
    },
  };
}

function buildMutationHandoff(input: {
  readonly plan: WorkflowTaskPlan;
  readonly changedFiles: string[];
  readonly failedFiles: Array<{ path: string; reason: string }>;
  readonly patches: CodingPatchRecord[];
  readonly verifiedFiles: string[];
  readonly unverifiedFiles: Array<{ path: string; reason: string }>;
  readonly verification: CodingVerificationSummary;
  readonly repairNotes: string[];
  readonly evidence: string[];
  readonly crossFileDegradationReason?: string;
  readonly degradedCrossFileTargets: string[];
  readonly crossFileRemainingTargets: string[];
  readonly crossFileFailedByReason: Array<{
    path: string;
    failureCode: string;
    reason: string;
  }>;
  readonly crossFileSkippedFiles: Array<{ path: string; reason: string }>;
  readonly provenance?: CodingResultProvenanceSummary;
}): TurnResultHandoffInput {
  return {
    capabilityPlan: {
      taskKind: input.plan.taskKind,
      targetPath: input.plan.targetPath,
      blockedReason: input.plan.blockedReason,
      directCommand: input.plan.directCommand,
      verification: input.verification,
      verifyAfterEdit: input.plan.verifyAfterEdit,
      inspectFirst: input.plan.inspectFirst,
      continuationLineage: input.plan.continuationLineage,
    },
    receipts: {
      evidence: input.evidence,
      continuationEvidence: input.plan.continuationLineage,
      verification: input.verification,
    },
    mutation: {
      taskKind: input.plan.taskKind,
      changedFiles: input.changedFiles,
      failedFiles: input.failedFiles,
      patches: input.patches,
      verifiedFiles: input.verifiedFiles,
      unverifiedFiles: input.unverifiedFiles,
      verification: input.verification,
      repairNotes: input.repairNotes,
      evidence: input.evidence,
      crossFileDegradationReason: input.crossFileDegradationReason,
      degradedCrossFileTargets: input.degradedCrossFileTargets,
      crossFileRemainingTargets: input.crossFileRemainingTargets,
      crossFileFailedByReason: input.crossFileFailedByReason,
      crossFileSkippedFiles: input.crossFileSkippedFiles,
      provenance: input.provenance,
    },
  };
}
