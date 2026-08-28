import fs from "node:fs";
import path from "node:path";

const projectLocalMarkers = [
  "/src/",
  "/packages/",
  "/app/",
  "/tests/",
  "/test/",
];

function stripDriveSlash(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("/") && /^[A-Za-z]:[\\/]/.test(trimmed.slice(1))
    ? trimmed.slice(1)
    : trimmed;
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
): string | undefined {
  const normalizedCandidate = normalizePathText(candidatePath);
  if (!normalizedCandidate) {
    return undefined;
  }

  const workspaceAbsolute = path.resolve(workspaceRoot);
  const normalizedWorkspace = normalizePathText(workspaceAbsolute);

  // If candidate is a relative path
  if (!isAbsolutePathLike(candidatePath)) {
    const candidateAbsolute = path.resolve(
      workspaceAbsolute,
      normalizedCandidate,
    );
    const normalizedCandidateAbsolute = normalizePathText(candidateAbsolute);
    if (
      normalizedCandidateAbsolute === normalizedWorkspace ||
      normalizedCandidateAbsolute.startsWith(normalizedWorkspace + "/")
    ) {
      return normalizePathText(
        path.relative(workspaceAbsolute, candidateAbsolute),
      );
    }
  }

  // If candidate is directly inside workspace
  const candidateLower = normalizedCandidate.toLowerCase();
  const workspaceLower = normalizedWorkspace.toLowerCase();
  if (candidateLower.startsWith(workspaceLower + "/")) {
    return normalizedCandidate.slice(normalizedWorkspace.length + 1);
  }

  // Check project local marker suffixes on disk
  for (const marker of projectLocalMarkers) {
    const markerIndex = candidateLower.indexOf(marker);
    if (markerIndex > 0) {
      const suffix = normalizedCandidate.slice(markerIndex + 1);
      const candidateResolved = path.resolve(workspaceAbsolute, suffix);
      if (fs.existsSync(candidateResolved)) {
        return normalizePathText(suffix);
      }
    }
  }

  return undefined;
}

export function normalizeSubjectTargetWithRootPath(input: {
  readonly target?: string;
  readonly root?: string;
}): {
  readonly target?: string;
  readonly partial: boolean;
} {
  const target = input.target?.trim();
  const root = input.root?.trim();
  if (!target) {
    return { partial: false };
  }
  if (!root || !isAbsolutePathLike(target) || !isAbsolutePathLike(root)) {
    return { target, partial: false };
  }

  const normalizedTarget = normalizePathText(target).toLowerCase();
  const normalizedRoot = normalizePathText(root).toLowerCase();

  if (
    normalizedTarget === normalizedRoot ||
    normalizedTarget.startsWith(normalizedRoot + "/")
  ) {
    return { target: normalizePathText(target), partial: false };
  }

  // Check marker match
  for (const marker of projectLocalMarkers) {
    const markerIndex = normalizedTarget.indexOf(marker);
    if (markerIndex > 0) {
      const suffix = normalizePathText(target).slice(markerIndex + 1);
      const candidate = path.resolve(path.resolve(root), suffix);
      if (fs.existsSync(candidate)) {
        return { target: candidate, partial: false };
      }
    }
  }

  return { target, partial: true };
}

export function rebaseLegacyPermissionRootsInWorkingMemory(
  workingMemory: unknown,
  sessionProjectRoot: string,
): unknown {
  if (!workingMemory || typeof workingMemory !== "object") {
    return workingMemory;
  }
  const nextRoot = normalizePathText(path.resolve(sessionProjectRoot));
  return rebaseRootInValue(workingMemory, nextRoot);
}

function rebaseRootInValue(value: unknown, nextRoot: string): unknown {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => rebaseRootInValue(item, nextRoot));
  }
  if (value && typeof value === "object") {
    const nextEntries = Object.entries(value).map(([k, v]) => [
      k,
      rebaseRootInValue(v, nextRoot),
    ]);
    return Object.fromEntries(nextEntries);
  }
  return value;
}
