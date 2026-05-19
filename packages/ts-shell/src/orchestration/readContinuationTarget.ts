import fs from "node:fs";
import path from "node:path";

import type { ContinuityStateLike } from "./runtimeHandoffProjection.js";

export interface ReadContinuationTargetRecovery {
  readonly targetPath?: string;
  readonly relocationNote?: string;
  readonly blockedReason?: string;
}

export function resolveReadContinuationTargetRecovery(input: {
  readonly candidatePath?: string;
  readonly continuity: ContinuityStateLike;
  readonly workspaceRoot: string;
}): ReadContinuationTargetRecovery {
  const sourceTarget = normalizePathLike(
    input.candidatePath ?? selectReadContinuitySourceTarget(input.continuity) ?? "",
  );
  if (!sourceTarget) {
    return {};
  }

  const existingTarget = normalizeExistingWorkspaceFile(
    sourceTarget,
    input.workspaceRoot,
  );
  if (existingTarget) {
    return { targetPath: existingTarget };
  }

  const candidates = findWorkspaceFilesByBasename({
    basename: path.basename(sourceTarget),
    workspaceRoot: input.workspaceRoot,
  });
  if (candidates.length === 1 && candidates[0]) {
    return {
      targetPath: candidates[0],
      relocationNote: `continuation target relocated: ${sourceTarget} -> ${candidates[0]}`,
    };
  }
  if (candidates.length > 1) {
    return {
      blockedReason: `Continuation target relocation is ambiguous for ${sourceTarget}; candidates: ${candidates.join(", ")}. Provide the explicit file path to continue reading.`,
    };
  }

  return {
    blockedReason: `Continuation target ${sourceTarget} no longer exists and no high-confidence relocation candidate was found. Provide the explicit file path to continue reading.`,
  };
}

function selectReadContinuitySourceTarget(
  continuity: ContinuityStateLike,
): string | undefined {
  return (
    continuity.recentTargetFiles?.[0] ??
    continuity.recentFailedFiles?.[0]?.path ??
    continuity.recentChangedFiles?.[0] ??
    continuity.recentVerifiedFiles?.[0]
  );
}

function normalizeExistingWorkspaceFile(
  candidatePath: string,
  workspaceRoot: string,
): string | undefined {
  const absolutePath = path.isAbsolute(candidatePath)
    ? candidatePath
    : path.resolve(workspaceRoot, candidatePath);
  const workspaceAbsolute = path.resolve(workspaceRoot);
  const normalizedAbsolute = path.resolve(absolutePath);
  if (
    normalizedAbsolute !== workspaceAbsolute &&
    !normalizedAbsolute.startsWith(`${workspaceAbsolute}${path.sep}`)
  ) {
    return undefined;
  }
  try {
    if (!fs.statSync(normalizedAbsolute).isFile()) {
      return undefined;
    }
  } catch {
    return undefined;
  }
  return normalizePathLike(path.relative(workspaceAbsolute, normalizedAbsolute));
}

function findWorkspaceFilesByBasename(input: {
  readonly basename: string;
  readonly workspaceRoot: string;
}): string[] {
  if (!input.basename || input.basename === "." || input.basename === "/") {
    return [];
  }
  const workspaceAbsolute = path.resolve(input.workspaceRoot);
  const ignoredDirectories = new Set([
    ".git",
    "node_modules",
    "dist",
    "build",
    ".sisyphus",
  ]);
  const matches: string[] = [];
  const stack = [workspaceAbsolute];
  let visited = 0;

  while (stack.length > 0 && visited < 2000) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    let entries: import("node:fs").Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      visited += 1;
      const absoluteEntry = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) {
          stack.push(absoluteEntry);
        }
        continue;
      }
      if (entry.isFile() && entry.name === input.basename) {
        matches.push(normalizePathLike(path.relative(workspaceAbsolute, absoluteEntry)));
      }
      if (matches.length > 1) {
        return matches.sort();
      }
    }
  }

  return matches.sort();
}

function normalizePathLike(value: string): string {
  return value
    .replace(/\\/g, "/")
    .replace(/^\.\/+/g, "")
    .trim();
}
