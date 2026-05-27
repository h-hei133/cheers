import type { WorkflowGitDiagnostics } from "../workflow/gitContext.js";
import { attributeGitChangeSet } from "../orchestration/gitChangeSetAttribution.js";
import {
  projectWorkflowTurnHandoff,
  type TurnResultHandoffInput,
} from "../orchestration/resultSurfaceModule.js";
import type { CodingResultSummary } from "../orchestration/types.js";

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
