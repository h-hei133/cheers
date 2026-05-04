import fs from "node:fs";
import path from "node:path";

const projectLocalMarkers = ["/src/", "/packages/", "/app/", "/tests/", "/test/"];

function stripDriveSlash(value: string): string {
  return value.startsWith("/") && /^[A-Za-z]:[\\/]/.test(value.slice(1))
    ? value.slice(1)
    : value;
}

function normalizePathText(value: string): string {
  return stripDriveSlash(value).replace(/\\/g, "/").trim();
}

function normalizeDisplayPath(value: string): string {
  const trimmed = value.trim();
  if (isWindowsDriveAbsolutePath(trimmed)) {
    return process.platform === "win32"
      ? path.win32.normalize(stripDriveSlash(trimmed))
      : normalizePathText(trimmed);
  }
  return path.normalize(trimmed);
}

function isWindowsDriveAbsolutePath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(stripDriveSlash(value.trim()));
}

export function isAbsolutePathLike(value: string): boolean {
  const trimmed = value.trim();
  return isWindowsDriveAbsolutePath(trimmed) || path.isAbsolute(trimmed);
}

function normalizePathIdentity(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (isWindowsDriveAbsolutePath(trimmed)) {
    return normalizePathText(trimmed).toLowerCase();
  }
  if (path.isAbsolute(trimmed)) {
    return path.resolve(trimmed).replace(/\\/g, "/").toLowerCase();
  }
  return normalizePathText(trimmed).toLowerCase();
}

function displayRootCandidate(value: string): string {
  const trimmed = value.trim();
  return isWindowsDriveAbsolutePath(trimmed) ? stripDriveSlash(trimmed) : path.resolve(trimmed);
}

function looksPathLike(value: string): boolean {
  const trimmed = value.trim();
  return (
    isWindowsDriveAbsolutePath(trimmed) ||
    path.isAbsolute(trimmed) ||
    trimmed.includes("/") ||
    trimmed.includes("\\")
  );
}

function cacheKeyRoot(value: string): string | undefined {
  const divider = value.indexOf("|");
  if (divider <= 0) {
    return undefined;
  }
  const root = value.slice(0, divider).trim();
  return root.length > 0 ? root : undefined;
}

function cacheKeyTarget(value: string): string | undefined {
  const targetIndex = value.toLowerCase().indexOf(":target:");
  if (targetIndex < 0) {
    return undefined;
  }
  const target = value.slice(targetIndex + ":target:".length).trim();
  return target.length > 0 ? target : undefined;
}

function scopeTarget(value: string): string | undefined {
  const match = value.match(/\/target\((.+)\)$/i);
  const target = match?.[1]?.trim();
  return target && target.length > 0 ? target : undefined;
}

function rootFromTarget(value: string): string | undefined {
  const normalized = normalizePathText(value);
  if (!isAbsolutePathLike(normalized)) {
    return undefined;
  }
  const lowered = normalized.toLowerCase();
  for (const marker of projectLocalMarkers) {
    const markerIndex = lowered.indexOf(marker);
    if (markerIndex > 0) {
      return normalized.slice(0, markerIndex);
    }
  }
  const parts = normalized.split("/").filter(Boolean);
  if (isWindowsDriveAbsolutePath(normalized)) {
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : normalized;
  }
  return path.dirname(normalized);
}

function addReplacementPair(
  pairs: Array<readonly [pattern: string, replacement: string]>,
  seen: Set<string>,
  pattern: string,
  replacement: string,
): void {
  if (!pattern || seen.has(pattern)) {
    return;
  }
  seen.add(pattern);
  pairs.push([pattern, replacement]);
}

function rootReplacementPairs(
  legacyRoot: string,
  nextRoot: string,
): Array<readonly [pattern: string, replacement: string]> {
  const forms = new Set<string>();
  const trimmed = stripDriveSlash(legacyRoot.trim());
  forms.add(trimmed);
  forms.add(normalizePathText(trimmed));
  forms.add(normalizePathText(trimmed).replace(/\//g, "\\"));

  const pairs: Array<readonly [pattern: string, replacement: string]> = [];
  const seen = new Set<string>();
  for (const form of forms) {
    addReplacementPair(pairs, seen, form.toLowerCase(), nextRoot.toLowerCase());
    addReplacementPair(pairs, seen, form.toUpperCase(), nextRoot.toUpperCase());
    addReplacementPair(pairs, seen, form, nextRoot);
  }
  return pairs.sort((left, right) => right[0].length - left[0].length);
}

function replaceRootInText(input: string, legacyRoot: string, nextRoot: string): string {
  let output = input;
  for (const [pattern, replacement] of rootReplacementPairs(legacyRoot, nextRoot)) {
    output = output.split(pattern).join(replacement);
  }
  return output;
}

function rebaseRootInValue(value: unknown, legacyRoot: string, nextRoot: string): unknown {
  if (typeof value === "string") {
    const rebased = replaceRootInText(value, legacyRoot, nextRoot);
    return rebased === value ? value : rebased;
  }

  if (Array.isArray(value)) {
    let changed = false;
    const nextValue = value.map((entry) => {
      const rebased = rebaseRootInValue(entry, legacyRoot, nextRoot);
      if (rebased !== entry) {
        changed = true;
      }
      return rebased;
    });
    return changed ? nextValue : value;
  }

  if (value && typeof value === "object") {
    let changed = false;
    const nextEntries = Object.entries(value).map(([key, entry]) => {
      const rebased = rebaseRootInValue(entry, legacyRoot, nextRoot);
      if (rebased !== entry) {
        changed = true;
      }
      return [key, rebased] as const;
    });
    return changed ? Object.fromEntries(nextEntries) : value;
  }

  return value;
}

function findLegacyRootCandidate(
  workingMemory: unknown,
  sessionProjectRoot: string,
): string | undefined {
  if (!workingMemory || typeof workingMemory !== "object" || Array.isArray(workingMemory)) {
    return undefined;
  }

  const currentRootIdentity = normalizePathIdentity(sessionProjectRoot);
  const candidates = new Map<string, string>();
  const addRootCandidate = (value: unknown): void => {
    if (typeof value !== "string") {
      return;
    }
    const trimmed = value.trim();
    if (!trimmed || trimmed.toLowerCase() === "unknown" || !looksPathLike(trimmed)) {
      return;
    }
    const identity = normalizePathIdentity(trimmed);
    if (!identity || identity === currentRootIdentity) {
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
    const root = cacheKeyRoot(value.trim());
    if (root) {
      addRootCandidate(root);
    }
    const target = cacheKeyTarget(value.trim());
    if (target) {
      const targetRoot = rootFromTarget(target);
      if (targetRoot) {
        addRootCandidate(targetRoot);
      }
    }
  };
  const addTargetCandidate = (value: unknown): void => {
    if (typeof value !== "string") {
      return;
    }
    const targetRoot = rootFromTarget(value);
    if (targetRoot) {
      addRootCandidate(targetRoot);
    }
  };
  const addScopeCandidate = (value: unknown): void => {
    if (typeof value !== "string") {
      return;
    }
    const target = scopeTarget(value.trim());
    if (target) {
      addTargetCandidate(target);
    }
  };

  const root = workingMemory as Record<string, unknown>;
  const continuity =
    root.continuity && typeof root.continuity === "object" && !Array.isArray(root.continuity)
      ? (root.continuity as Record<string, unknown>)
      : undefined;

  const approvalAudit =
    root.approvalAudit && typeof root.approvalAudit === "object" && !Array.isArray(root.approvalAudit)
      ? (root.approvalAudit as Record<string, unknown>)
      : undefined;
  if (approvalAudit) {
    addRootCandidate(approvalAudit.projectRoot);
    addCacheKeyCandidate(approvalAudit.cacheKey);
    addScopeCandidate(approvalAudit.scopeLabel);
  }

  if (Array.isArray(root.approvalAuditHistory)) {
    for (const entry of root.approvalAuditHistory) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        continue;
      }
      const record = entry as Record<string, unknown>;
      addRootCandidate(record.projectRoot);
      addCacheKeyCandidate(record.cacheKey);
      addScopeCandidate(record.scopeLabel);
    }
  }

  if (continuity) {
    addRootCandidate(continuity.lastApprovalProjectRoot);
    addRootCandidate(continuity.lastRequestScopeProjectRoot);
    addRootCandidate(continuity.lastPermissionRequestProjectRoot);
    addCacheKeyCandidate(continuity.lastApprovalCacheKey);
    addCacheKeyCandidate(continuity.lastRequestScopeCacheKey);
    addCacheKeyCandidate(continuity.lastPermissionRequestCacheKey);
    addScopeCandidate(continuity.lastApprovalScope);
    addScopeCandidate(continuity.lastRequestScopeLabel);
    addScopeCandidate(continuity.lastPermissionRequestScopeLabel);
    addTargetCandidate(continuity.lastPermissionRequestTarget);
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
      } else if (key.endsWith("scope") || key.endsWith("scope-label")) {
        addScopeCandidate(value);
      } else if (key.endsWith("target")) {
        addTargetCandidate(value);
      }
    }
  }

  return candidates.size === 1 ? [...candidates.values()][0] : undefined;
}

export function rebaseLegacyPermissionRootsInWorkingMemory(
  workingMemory: unknown,
  sessionProjectRoot: string,
): unknown {
  const normalizedProjectRoot = path.resolve(sessionProjectRoot);
  const legacyRoot = findLegacyRootCandidate(workingMemory, normalizedProjectRoot);
  if (!legacyRoot) {
    return workingMemory;
  }
  return rebaseRootInValue(workingMemory, legacyRoot, normalizedProjectRoot);
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
  if (!isWindowsDriveAbsolutePath(normalizedCandidate)) {
    const normalizedWorkspace = workspaceAbsolute.toLowerCase();
    const resolvedCandidateAbsolute = path.resolve(workspaceAbsolute, normalizedCandidate);
    const normalizedResolved = resolvedCandidateAbsolute.toLowerCase();
    const inWorkspace =
      normalizedResolved === normalizedWorkspace ||
      normalizedResolved.startsWith(`${normalizedWorkspace}${path.sep.toLowerCase()}`);
    if (inWorkspace) {
      return normalizePathText(path.relative(workspaceAbsolute, resolvedCandidateAbsolute));
    }
  }

  if (!isAbsolutePathLike(normalizedCandidate)) {
    return undefined;
  }

  const candidateParts = normalizedCandidate.split("/").filter((part) => part.length > 0);
  for (
    let startIndex = Math.max(0, candidateParts.length - 6);
    startIndex < candidateParts.length;
    startIndex += 1
  ) {
    const suffix = candidateParts.slice(startIndex).join("/");
    if (!suffix) {
      continue;
    }
    const reboundAbsolute = path.resolve(workspaceAbsolute, suffix);
    if (!fs.existsSync(reboundAbsolute)) {
      continue;
    }
    try {
      if (!fs.statSync(reboundAbsolute).isFile()) {
        continue;
      }
    } catch {
      continue;
    }
    return normalizePathText(path.relative(workspaceAbsolute, reboundAbsolute));
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
  const target = typeof input.target === "string" ? input.target.trim() : "";
  const root = typeof input.root === "string" ? input.root.trim() : "";
  if (!target) {
    return { partial: false };
  }
  if (!root || !isAbsolutePathLike(target) || !isAbsolutePathLike(root)) {
    return { target, partial: false };
  }

  const normalizedTargetIdentity = normalizePathIdentity(target);
  const normalizedRootIdentity = normalizePathIdentity(root);
  if (
    normalizedTargetIdentity &&
    normalizedRootIdentity &&
    (normalizedTargetIdentity === normalizedRootIdentity ||
      normalizedTargetIdentity.startsWith(`${normalizedRootIdentity}/`))
  ) {
    return { target: normalizeDisplayPath(target), partial: false };
  }

  const normalizedTarget = normalizePathText(target);
  const loweredTarget = normalizedTarget.toLowerCase();
  for (const marker of projectLocalMarkers) {
    const markerIndex = loweredTarget.indexOf(marker);
    if (markerIndex <= 0) {
      continue;
    }
    const suffix = normalizedTarget.slice(markerIndex + 1);
    const candidate = path.normalize(path.join(path.resolve(root), suffix));
    if (fs.existsSync(candidate)) {
      return { target: candidate, partial: false };
    }
  }

  return { partial: true };
}
