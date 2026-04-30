import path from "node:path";

export interface ResolvedTarget {
  readonly raw: string;
  readonly cleaned: string;
  readonly absolutePath: string;
  readonly inWorkspace: boolean;
}

export interface TaskTargetResolution {
  readonly prompt: string;
  readonly workspaceRoot: string;
  readonly targets: readonly ResolvedTarget[];
  readonly primaryTarget: ResolvedTarget | null;
  readonly blocker: TargetResolutionBlocker | null;
  readonly cleanedPaths: readonly string[];
  readonly workspacePaths: readonly string[];
  readonly externalPaths: readonly string[];
}

export interface TargetResolutionBlocker {
  readonly code: "ambiguous-target";
  readonly reason: string;
  readonly nextAction: string;
  readonly candidates: readonly string[];
}

export function extractPromptTargets(
  prompt: string,
  workspaceRoot: string,
): readonly ResolvedTarget[] {
  const tokens = collectCandidateTokens(prompt);
  const results: ResolvedTarget[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    const cleaned = sanitizeCandidate(token);
    if (!looksLikeFilePath(cleaned)) {
      continue;
    }

    const absolutePath = path.isAbsolute(cleaned)
      ? path.resolve(cleaned)
      : path.resolve(workspaceRoot, cleaned);
    const normalizedAbs = normalizeForCompare(absolutePath);
    if (seen.has(normalizedAbs)) {
      continue;
    }
    seen.add(normalizedAbs);
    results.push({
      raw: token,
      cleaned,
      absolutePath,
      inWorkspace: isPathWithinWorkspace(absolutePath, workspaceRoot),
    });
  }

  return results;
}

export function pickPrimaryTarget(
  prompt: string,
  workspaceRoot: string,
): ResolvedTarget | null {
  return resolveTaskTargets(prompt, workspaceRoot).primaryTarget;
}

export function resolveTaskTargets(
  prompt: string,
  workspaceRoot: string,
): TaskTargetResolution {
  const targets = extractPromptTargets(prompt, workspaceRoot);
  const blocker = findAmbiguousSiblingTargetBlocker(targets);
  const primaryTarget = blocker ? null : (targets[0] ?? null);
  const cleanedPaths = targets.map((target) => target.cleaned);
  const workspacePaths = targets
    .filter((target) => target.inWorkspace)
    .map((target) => target.cleaned);
  const externalPaths = targets
    .filter((target) => !target.inWorkspace)
    .map((target) => target.cleaned);

  return {
    prompt,
    workspaceRoot,
    targets,
    primaryTarget,
    blocker,
    cleanedPaths,
    workspacePaths,
    externalPaths,
  };
}

function findAmbiguousSiblingTargetBlocker(
  targets: readonly ResolvedTarget[],
): TargetResolutionBlocker | null {
  const workspaceTargets = targets.filter((target) => target.inWorkspace);
  const byParent = new Map<string, ResolvedTarget[]>();

  for (const target of workspaceTargets) {
    const parent = normalizeForCompare(path.dirname(target.absolutePath));
    const siblings = byParent.get(parent) ?? [];
    siblings.push(target);
    byParent.set(parent, siblings);
  }

  for (const siblings of byParent.values()) {
    if (siblings.length > 1) {
      const candidates = siblings.map((target) => target.cleaned);
      return {
        code: "ambiguous-target",
        reason:
          "Multiple sibling target files were mentioned, so a single edit target cannot be chosen safely.",
        nextAction:
          "Rerun with exactly one explicit target file for this edit, or split the request into separate edits.",
        candidates,
      };
    }
  }

  return null;
}

function collectCandidateTokens(prompt: string): string[] {
  const quoted = Array.from(prompt.matchAll(/["'`]([^"'`]+)["'`]/g))
    .map((match) => match[1]?.trim())
    .filter((candidate): candidate is string => Boolean(candidate));
  const markdownCode = Array.from(prompt.matchAll(/`([^`]+)`/g))
    .map((match) => match[1]?.trim())
    .filter((candidate): candidate is string => Boolean(candidate));
  const inline =
    prompt.match(
      /([A-Za-z]:[\\/][^\s"'`<>|?*]+|(?:\.\.?[\\/][^\s"'`<>|?*]+)|(?:\/[^\s"'`<>|?*]+)|(?:[A-Za-z0-9._-]+(?:[\\/][A-Za-z0-9._-]+)*\.(?:d\.ts|test\.(?:ts|tsx|jsx|js)|spec\.(?:ts|tsx|jsx|js)|json|tsx|jsx|ts|js|py|go|rs|md|txt|log|yaml|yml|toml)))/g,
    ) ?? [];

  return [...quoted, ...markdownCode, ...inline];
}

function sanitizeCandidate(candidate: string): string {
  return candidate
    .trim()
    .replace(/^[\s"'`[{(<]+/, "")
    .replace(/[\s"'`}\])>,;:.!?]+$/, "");
}

function looksLikeFilePath(candidate: string): boolean {
  if (!candidate || candidate.length < 2) {
    return false;
  }
  if (isCliFlagToken(candidate)) {
    return false;
  }
  if (/^https?:\/\//i.test(candidate)) {
    return false;
  }

  if (path.isAbsolute(candidate)) {
    return true;
  }

  if (candidate.startsWith("./") || candidate.startsWith("../")) {
    return true;
  }

  if (/[\\/]/.test(candidate)) {
    return true;
  }

  return /\.[A-Za-z0-9._-]{1,12}$/.test(candidate);
}

function isCliFlagToken(candidate: string): boolean {
  const normalized = candidate.replace(/\\/g, "/");
  if (/^\/?--[a-z0-9-]+$/i.test(normalized)) {
    return true;
  }
  if (/^\/?--[a-z0-9-]+(?:\/--[a-z0-9-]+)+$/i.test(normalized)) {
    return true;
  }
  return false;
}

function isPathWithinWorkspace(
  candidateAbsolutePath: string,
  workspaceRoot: string,
): boolean {
  const relative = path.relative(
    normalizeForCompare(workspaceRoot),
    normalizeForCompare(candidateAbsolutePath),
  );
  return (
    relative.length === 0 ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function normalizeForCompare(value: string): string {
  return path.resolve(value).replace(/\\/g, "/").toLowerCase();
}
