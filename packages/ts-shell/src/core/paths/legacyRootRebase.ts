import path from "node:path";

function stripDriveSlash(value: string): string {
  return value.startsWith("/") && /^[A-Za-z]:[\\/]/.test(value.slice(1))
    ? value.slice(1)
    : value;
}

export function normalizePathText(value: string): string {
  return stripDriveSlash(value).replace(/\\/g, "/").trim();
}

export function isAbsolutePathLike(value: string): boolean {
  const trimmed = value.trim();
  return (
    /^[A-Za-z]:[\\/]/.test(stripDriveSlash(trimmed)) || path.isAbsolute(trimmed)
  );
}

export function rebindPathLikeToWorkspace(
  candidatePath: string,
  workspaceRoot: string,
): string {
  const normalizedCandidate = normalizePathText(candidatePath);
  const normalizedWorkspace = normalizePathText(workspaceRoot);

  if (!isAbsolutePathLike(candidatePath)) {
    return normalizedCandidate;
  }

  if (normalizedCandidate.startsWith(normalizedWorkspace + "/")) {
    return normalizedCandidate.slice(normalizedWorkspace.length + 1);
  }

  return path.basename(normalizedCandidate);
}

export function normalizeSubjectTargetWithRootPath(input: {
  target?: string;
  root?: string;
}): {
  readonly target?: string;
  readonly partial: boolean;
} {
  if (!input.target) {
    return { partial: false };
  }
  const target = input.root
    ? rebindPathLikeToWorkspace(input.target, input.root)
    : normalizePathText(input.target);
  return {
    target,
    partial: false,
  };
}

export function rebaseLegacyPermissionRootsInWorkingMemory(
  workingMemory: unknown,
  _nextProjectRoot: string,
): unknown {
  return workingMemory;
}
