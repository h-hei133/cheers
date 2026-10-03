import path from "node:path";

function stripDriveSlash(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("/") && /^[A-Za-z]:[\\/]/.test(trimmed.slice(1))
    ? trimmed.slice(1)
    : trimmed;
}

/**
 * The one root a legacy snapshot was anchored to, if its continuity fields all
 * agree on it and it is not the current root. More than one distinct legacy
 * root means the memory cannot be rebased unambiguously, so nothing changes.
 */
export function detectLegacyPermissionRootCandidate(input: {
  readonly workingMemory: unknown;
  readonly sessionProjectRoot: string;
}): string | undefined {
  const roots = collectLegacyPermissionRoots(input);
  return roots.length === 1 ? roots[0] : undefined;
}

export function collectLegacyPermissionRoots(input: {
  readonly workingMemory: unknown;
  readonly sessionProjectRoot: string;
}): string[] {
  const { workingMemory, sessionProjectRoot } = input;
  if (!workingMemory || typeof workingMemory !== "object" || Array.isArray(workingMemory)) return [];
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
  const cacheRoots: string[] = [];
  const currentIdentity = normalizePathIdentity(sessionProjectRoot);
  const knownCacheRoots = new Set([normalizePathIdentity(sessionProjectRoot, true)]);
  const addRootCandidate = (value: unknown): void => {
    if (typeof value !== "string") {
      return;
    }
    const trimmed = value.trim();
    const identity = normalizePathIdentity(trimmed);
    if (!identity) return;
    knownCacheRoots.add(normalizePathIdentity(trimmed, true));
    if (identity === currentIdentity) return;
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
      cacheRoots.push(value.slice(0, divider));
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

  // Cache keys deliberately fold case. They may confirm a display root, but
  // cannot make two distinct POSIX display roots become one source.
  for (const cacheRoot of cacheRoots) {
    if (!knownCacheRoots.has(normalizePathIdentity(cacheRoot, true))) {
      addRootCandidate(cacheRoot);
    }
  }
  return [...candidates.values()];
}

export function normalizePathIdentity(value: string, foldPosixCase = false): string | undefined {
  const trimmed = stripDriveSlash(value);
  const windows = /^[A-Za-z]:[\\/]|^\\\\/.test(trimmed);
  if (!windows && !path.posix.isAbsolute(trimmed)) return undefined;
  const normalized = (windows ? path.win32 : path.posix).normalize(trimmed).replace(/\\/g, "/");
  const identity = normalized.replace(/\/+$/, "") || "/";
  return windows || foldPosixCase ? identity.toLowerCase() : identity;
}

function displayRootCandidate(value: string): string {
  const trimmed = value.trim();
  return /^[A-Za-z]:[\\/]|^\\\\/.test(stripDriveSlash(trimmed)) ? stripDriveSlash(trimmed) : path.posix.resolve(trimmed);
}
