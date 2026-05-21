import fs from "node:fs";
import path from "node:path";
import type { DiscoveryEditCandidateInput } from "./discoveryEditPlanner.js";

export interface DiscoveryEditRuntimeRequest {
  readonly prompt: string;
  readonly workspaceRoot: string;
  readonly candidates: readonly DiscoveryEditCandidateInput[];
  readonly maxCandidates: number;
  readonly confirmationTargetPath?: string;
  readonly confirmedTargetSet?: readonly string[];
}

export function buildDiscoveryEditRuntimeRequest(input: {
  readonly prompt: string;
  readonly workspaceRoot: string;
  readonly targetPath?: string;
}): DiscoveryEditRuntimeRequest | undefined {
  if (!looksLikeDiscoveryEditRuntimePrompt(input.prompt)) {
    return undefined;
  }

  const maxCandidates = 5;
  const confirmedTargetSet = extractDiscoveryConfirmedTargetSet(input.prompt);
  const confirmationTargetPath = extractDiscoveryConfirmationTarget(input.prompt);
  const candidatePathHints = uniqueStable([
    ...(input.targetPath ? [input.targetPath] : []),
    ...(confirmationTargetPath ? [confirmationTargetPath] : []),
    ...(confirmedTargetSet ?? []),
  ]);
  const candidates =
    candidatePathHints.length > 0
      ? readDiscoveryCandidateHints({
          workspaceRoot: input.workspaceRoot,
          paths: candidatePathHints,
        })
      : discoverWorkspaceEditCandidates({
          workspaceRoot: input.workspaceRoot,
          maxCandidates: maxCandidates + 1,
        });

  return {
    prompt: input.prompt,
    workspaceRoot: input.workspaceRoot,
    candidates,
    maxCandidates,
    ...(confirmationTargetPath ? { confirmationTargetPath } : {}),
    ...(confirmedTargetSet ? { confirmedTargetSet } : {}),
  };
}

function looksLikeDiscoveryEditRuntimePrompt(prompt: string): boolean {
  const hasDiscoveryCue = /\b(?:find|discover|search|locate)\b/i.test(prompt);
  const hasEditCue = /\b(?:edit|replace|update|change)\b/i.test(prompt);
  const hasFencedCue =
    /```[\s\S]*?```/.test(prompt) ||
    /\b(?:fenced|block|old\/new|old\s+and\s+new)\b/i.test(prompt);
  const hasTargetSelectionCue = /\b(?:target|file|place|location)\b/i.test(prompt);
  return hasDiscoveryCue && hasEditCue && (hasFencedCue || hasTargetSelectionCue);
}

function extractDiscoveryConfirmationTarget(prompt: string): string | undefined {
  const match = prompt.match(
    /\b(?:confirm(?:ed)?|select(?:ed)?|choose|use)\s+(?:target\s+)?[`"']?([A-Za-z0-9._/-]+\.(?:ts|tsx|js|jsx|py|go|rs|md|txt|json|yaml|yml))[`"']?/i,
  );
  return match?.[1] ? normalizePathLike(match[1]) : undefined;
}

function extractDiscoveryConfirmedTargetSet(
  prompt: string,
): readonly string[] | undefined {
  const match = prompt.match(
    /\bconfirm(?:ed)?\s+(?:targets?|target\s+set)\s*[:=]\s*([^\n]+)/i,
  );
  if (!match?.[1]) {
    return undefined;
  }
  const targets = Array.from(
    match[1].matchAll(
      /([A-Za-z0-9._/-]+\.(?:ts|tsx|js|jsx|py|go|rs|md|txt|json|yaml|yml))/gi,
    ),
  )
    .map((entry) => normalizePathLike(entry[1] ?? ""))
    .filter(Boolean);
  return targets.length > 0 ? uniqueStable(targets) : undefined;
}

function readDiscoveryCandidateHints(input: {
  readonly workspaceRoot: string;
  readonly paths: readonly string[];
}): readonly DiscoveryEditCandidateInput[] {
  return input.paths.map((candidatePath) => {
    const absolutePath = path.isAbsolute(candidatePath)
      ? candidatePath
      : path.join(input.workspaceRoot, candidatePath);
    const relativePath = path.relative(input.workspaceRoot, absolutePath);
    if (
      relativePath.startsWith("..") ||
      path.isAbsolute(relativePath) ||
      !isDiscoveryCandidateFile(candidatePath)
    ) {
      return { path: normalizePathLike(candidatePath) };
    }
    try {
      return {
        path: normalizePathLike(relativePath),
        content: fs.readFileSync(absolutePath, "utf8"),
      };
    } catch {
      return { path: normalizePathLike(relativePath) };
    }
  });
}

function discoverWorkspaceEditCandidates(input: {
  readonly workspaceRoot: string;
  readonly maxCandidates: number;
}): readonly DiscoveryEditCandidateInput[] {
  const candidates: DiscoveryEditCandidateInput[] = [];
  const visit = (directory: string): void => {
    if (candidates.length >= input.maxCandidates) {
      return;
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      if (candidates.length >= input.maxCandidates) {
        return;
      }
      if (["node_modules", ".git", ".sisyphus"].includes(entry.name)) {
        continue;
      }
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
        continue;
      }
      if (!entry.isFile() || !isDiscoveryCandidateFile(entry.name)) {
        continue;
      }
      try {
        const relativePath = path.relative(input.workspaceRoot, absolutePath);
        candidates.push({
          path: normalizePathLike(relativePath),
          content: fs.readFileSync(absolutePath, "utf8"),
        });
      } catch {
        // Candidate discovery is best-effort and remains no-write.
      }
    }
  };
  visit(input.workspaceRoot);
  return candidates;
}

function isDiscoveryCandidateFile(candidatePath: string): boolean {
  return /\.(?:ts|tsx|js|jsx|py|go|rs|md|txt|json|yaml|yml)$/i.test(candidatePath);
}

function uniqueStable(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizePathLike(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function normalizePathLike(value: string): string {
  return value.trim().replace(/\\/g, "/").replace(/^\.\//, "");
}
