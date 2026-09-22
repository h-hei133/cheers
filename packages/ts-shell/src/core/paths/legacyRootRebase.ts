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
  const legacyRoot = findLegacyRootCandidate(workingMemory, nextRoot);
  if (!legacyRoot) {
    return workingMemory;
  }
  return rebaseRootInValue(workingMemory, legacyRoot, nextRoot);
}

/**
 * The one root a legacy snapshot was anchored to, if its continuity fields all
 * agree on it and it is not the current root. More than one distinct legacy
 * root means the memory cannot be rebased unambiguously, so nothing changes.
 */
function findLegacyRootCandidate(
  workingMemory: unknown,
  sessionProjectRoot: string,
): string | undefined {
  const root = workingMemory as Record<string, unknown>;
  const continuity =
    root.continuity && typeof root.continuity === "object" && !Array.isArray(root.continuity)
      ? (root.continuity as Record<string, unknown>)
      : undefined;
  const approvalAudit =
    root.approvalAudit && typeof root.approvalAudit === "object" && !Array.isArray(root.approvalAudit)
      ? (root.approvalAudit as Record<string, unknown>)
      : undefined;

  const candidates = new Map<string, string>();
  const currentIdentity = normalizePathIdentity(sessionProjectRoot);
  const addRootCandidate = (value: unknown): void => {
    if (typeof value !== "string") {
      return;
    }
    const trimmed = value.trim();
    if (!trimmed || trimmed.toLowerCase() === "unknown" || !looksPathLike(trimmed)) {
      return;
    }
    const identity = normalizePathIdentity(trimmed);
    if (!identity || identity === currentIdentity) {
      return;
    }
    if (!candidates.has(identity)) {
      candidates.set(identity, displayRootCandidate(trimmed));
    }
  };
  const addCacheKeyCandidate = (value: unknown): void => {
    if (typeof value !== "string") {
      return;
    }
    const divider = value.indexOf("|");
    if (divider > 0) {
      addRootCandidate(value.slice(0, divider));
    }
  };

  if (approvalAudit) {
    addRootCandidate(approvalAudit.projectRoot);
    addCacheKeyCandidate(approvalAudit.cacheKey);
  }
  if (Array.isArray(root.approvalAuditHistory)) {
    for (const entry of root.approvalAuditHistory) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        continue;
      }
      const record = entry as Record<string, unknown>;
      addRootCandidate(record.projectRoot);
      addCacheKeyCandidate(record.cacheKey);
    }
  }
  if (continuity) {
    addRootCandidate(continuity.lastApprovalProjectRoot);
    addRootCandidate(continuity.lastRequestScopeProjectRoot);
    addRootCandidate(continuity.lastPermissionRequestProjectRoot);
    addCacheKeyCandidate(continuity.lastApprovalCacheKey);
    addCacheKeyCandidate(continuity.lastRequestScopeCacheKey);
    addCacheKeyCandidate(continuity.lastPermissionRequestCacheKey);
  }
  if (Array.isArray(root.summary)) {
    for (const entry of root.summary) {
      if (typeof entry !== "string") {
        continue;
      }
      const parsed = entry.trim().match(/^-?\s*([^:]+):\s*(.+)$/);
      const key = parsed?.[1]?.trim().toLowerCase();
      const value = parsed?.[2]?.trim();
      if (!key || !value) {
        continue;
      }
      if (key.endsWith("project-root")) {
        addRootCandidate(value);
      } else if (key.endsWith("cache-key")) {
        addCacheKeyCandidate(value);
      }
    }
  }

  return candidates.size === 1 ? [...candidates.values()][0] : undefined;
}

function normalizePathIdentity(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (/^[A-Za-z]:[\\/]/.test(stripDriveSlash(trimmed))) {
    return normalizePathText(trimmed).toLowerCase();
  }
  if (path.isAbsolute(trimmed)) {
    return path.resolve(trimmed).replace(/\\/g, "/").toLowerCase();
  }
  return normalizePathText(trimmed).toLowerCase();
}

function displayRootCandidate(value: string): string {
  const trimmed = value.trim();
  return /^[A-Za-z]:[\\/]/.test(stripDriveSlash(trimmed)) ? stripDriveSlash(trimmed) : path.resolve(trimmed);
}

function looksPathLike(value: string): boolean {
  const trimmed = value.trim();
  return (
    /^[A-Za-z]:[\\/]/.test(stripDriveSlash(trimmed)) ||
    path.isAbsolute(trimmed) ||
    trimmed.includes("/") ||
    trimmed.includes("\\")
  );
}

/** Rewrite every path-like string, walking structures unchanged otherwise. */
function rebaseRootInValue(value: unknown, legacyRoot: string, nextRoot: string): unknown {
  if (typeof value === "string") {
    return replaceRootInText(value, legacyRoot, nextRoot);
  }
  if (Array.isArray(value)) {
    return value.map((item) => rebaseRootInValue(item, legacyRoot, nextRoot));
  }
  if (value && typeof value === "object") {
    const nextEntries = Object.entries(value).map(([k, v]) => [
      k,
      rebaseRootInValue(v, legacyRoot, nextRoot),
    ]);
    return Object.fromEntries(nextEntries);
  }
  return value;
}

function replaceRootInText(input: string, legacyRoot: string, nextRoot: string): string {
  let output = input;
  for (const [pattern, replacement] of rootReplacementPairs(legacyRoot, nextRoot)) {
    output = output.split(pattern).join(replacement);
  }
  return output;
}

/**
 * Every textual form the legacy root is known to take — raw, slash-normalized,
 * backslash form, each case-folded — longest first so nested prefixes replace
 * atomically.
 */
function rootReplacementPairs(
  legacyRoot: string,
  nextRoot: string,
): Array<readonly [pattern: string, replacement: string]> {
  const trimmed = stripDriveSlash(legacyRoot.trim());
  const forms = new Set<string>([
    trimmed,
    normalizePathText(trimmed),
    normalizePathText(trimmed).replace(/\//g, "\\"),
  ]);

  const pairs: Array<readonly [pattern: string, replacement: string]> = [];
  const seen = new Set<string>();
  for (const form of forms) {
    for (const [pattern, replacement] of [
      [form.toLowerCase(), nextRoot.toLowerCase()],
      [form.toUpperCase(), nextRoot.toUpperCase()],
      [form, nextRoot],
    ] as const) {
      if (pattern && !seen.has(pattern)) {
        seen.add(pattern);
        pairs.push([pattern, replacement]);
      }
    }
  }
  return pairs.sort((left, right) => right[0].length - left[0].length);
}
