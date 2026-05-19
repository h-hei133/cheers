import type { WorkflowGitDiagnostics } from "../workflow/gitContext.js";
import { getWorkflowGitDiagnostics } from "../workflow/gitContext.js";
import type { CodingChangeSetSummary } from "./types.js";

export function snapshotGitChangeSet(
  workspaceRoot: string,
): WorkflowGitDiagnostics {
  return getWorkflowGitDiagnostics(workspaceRoot, { limit: 200 });
}

export function attributeGitChangeSet(input: {
  readonly workspaceRoot: string;
  readonly preRun: WorkflowGitDiagnostics;
  readonly changeSet: CodingChangeSetSummary;
}): CodingChangeSetSummary {
  if (
    !input.preRun.insideGit ||
    input.changeSet.attemptedFiles.length === 0
  ) {
    return input.changeSet;
  }

  const postRun = getWorkflowGitDiagnostics(input.workspaceRoot, { limit: 200 });
  if (!postRun.insideGit) {
    return input.changeSet;
  }

  return {
    ...input.changeSet,
    gitAware: true,
    preExistingDirtyFiles: uniquePaths(
      input.preRun.entries.map((entry) => entry.path),
    ),
    postRunDirtyFiles: uniquePaths(postRun.entries.map((entry) => entry.path)),
  };
}

function uniquePaths(paths: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const path of paths) {
    const key = path.trim();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(key);
  }
  return result;
}
