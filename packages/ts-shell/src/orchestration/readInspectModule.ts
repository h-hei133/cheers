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
