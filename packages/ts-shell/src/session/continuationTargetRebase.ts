import { rebindPathLikeToWorkspace } from "../core/paths/legacyRootRebase.js";

export function rebindContinuationTargetToWorkspace(
  candidatePath: string,
  workspaceRoot: string,
): string | undefined {
  const normalizedCandidate = normalizeContinuationTargetPath(candidatePath);
  if (!isUsableContinuationTargetPath(normalizedCandidate)) {
    return undefined;
  }
  return rebindPathLikeToWorkspace(normalizedCandidate, workspaceRoot);
}

export function isUsableContinuationTargetPath(candidate: string): boolean {
  if (!candidate) {
    return false;
  }
  const lowered = candidate.toLowerCase();
  if (
    lowered === "(missing-target)" ||
    lowered === "(unknown)" ||
    lowered === "(workspace)" ||
    lowered.includes("(missing-target)")
  ) {
    return false;
  }
  return true;
}

function normalizeContinuationTargetPath(value: string): string {
  return value
    .replace(/\\/g, "/")
    .replace(/^\.\/+/g, "")
    .trim();
}
