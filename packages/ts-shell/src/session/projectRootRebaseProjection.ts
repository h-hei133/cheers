import path from "node:path";
import { rebaseLegacyPermissionRootsInWorkingMemory } from "../core/paths/legacyRootRebase.js";
import { normalizeProjectRootKey } from "./projectBindingPolicy.js";

export interface ProjectRootRebaseProjection {
  readonly workingMemory: unknown;
}

export function projectRebasedSessionRoot(nextProjectRoot: string): string {
  return path.resolve(nextProjectRoot.trim());
}

export function projectRootRebase(input: {
  readonly value: unknown;
  readonly previousRoot: string;
  readonly nextRoot: string;
}): ProjectRootRebaseProjection {
  const rebasedValue = rebaseProjectRootInValue(
    input.value,
    input.previousRoot,
    input.nextRoot,
  );
  return {
    workingMemory: rebaseApprovalAuditCacheKeyRoot(
      rebasedValue,
      input.nextRoot,
    ),
  };
}

export function normalizeLegacyPermissionWorkingMemory(input: {
  readonly workingMemory: unknown;
  readonly sessionProjectRoot: string;
}): unknown {
  const normalizedProjectRoot = path.resolve(input.sessionProjectRoot);
  const rebasedWorkingMemory = rebaseLegacyPermissionRootsInWorkingMemory(
    input.workingMemory,
    normalizedProjectRoot,
  );
  return rebaseApprovalAuditCacheKeyRoot(
    rebasedWorkingMemory,
    normalizedProjectRoot,
  );
}

export function detectLegacyPermissionRootCandidate(input: {
  readonly workingMemory: unknown;
  readonly sessionProjectRoot: string;
}): string | undefined {
  const { workingMemory, sessionProjectRoot } = input;
  if (
    !workingMemory ||
    typeof workingMemory !== "object" ||
    Array.isArray(workingMemory)
  ) {
    return undefined;
  }

  const root = workingMemory as Record<string, unknown>;
  const continuity =
    root.continuity &&
    typeof root.continuity === "object" &&
    !Array.isArray(root.continuity)
      ? (root.continuity as Record<string, unknown>)
      : undefined;

  const summaryEntries = Array.isArray(root.summary)
    ? root.summary.filter((entry): entry is string => typeof entry === "string")
    : [];

  const candidates = new Map<string, string>();
  const addRootCandidate = (value: unknown): void => {
    if (typeof value !== "string") {
      return;
    }
    const trimmed = value.trim();
    if (!trimmed || trimmed.toLowerCase() === "unknown") {
      return;
    }
    if (!trimmed.includes(path.sep) && !/^[a-zA-Z]:[\\/]/.test(trimmed)) {
      return;
    }
    const resolved = normalizeProjectRootKey(trimmed);
    if (!resolved || resolved === normalizeProjectRootKey(sessionProjectRoot)) {
      return;
    }
    if (!candidates.has(resolved)) {
      candidates.set(resolved, path.resolve(trimmed));
    }
  };
  const addCacheKeyCandidate = (value: unknown): void => {
    if (typeof value !== "string") {
      return;
    }
    const cacheKey = value.trim();
    const divider = cacheKey.indexOf("|");
    if (divider <= 0) {
      return;
    }
    addRootCandidate(cacheKey.slice(0, divider));
  };

  const approvalAudit =
    root.approvalAudit &&
    typeof root.approvalAudit === "object" &&
    !Array.isArray(root.approvalAudit)
      ? (root.approvalAudit as Record<string, unknown>)
      : undefined;
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

  for (const line of summaryEntries) {
    const parsed = line.match(/^-?\s*([^:]+):\s*(.+)$/);
    if (!parsed) {
      continue;
    }
    const key = parsed[1]?.trim().toLowerCase();
    const value = parsed[2]?.trim();
    if (!key || !value) {
      continue;
    }
    if (
      key === "last-approval-project-root" ||
      key === "last-request-scope-project-root" ||
      key === "last-permission-request-project-root"
    ) {
      addRootCandidate(value);
    }
    if (
      key === "last-approval-cache-key" ||
      key === "last-request-scope-cache-key" ||
      key === "last-permission-request-cache-key"
    ) {
      addCacheKeyCandidate(value);
    }
  }

  if (candidates.size !== 1) {
    return undefined;
  }
  return [...candidates.values()][0];
}

function rebaseProjectRootInValue(
  value: unknown,
  previousRoot: string,
  nextRoot: string,
): unknown {
  if (typeof value === "string") {
    return replaceProjectRootInText(value, previousRoot, nextRoot);
  }

  if (Array.isArray(value)) {
    return value.map((entry) =>
      rebaseProjectRootInValue(entry, previousRoot, nextRoot),
    );
  }

  if (value && typeof value === "object") {
    const rebasedEntries = Object.entries(value).map(([key, entry]) => [
      key,
      rebaseProjectRootInValue(entry, previousRoot, nextRoot),
    ]);
    return Object.fromEntries(rebasedEntries);
  }

  return value;
}

function replaceProjectRootInText(
  input: string,
  previousRoot: string,
  nextRoot: string,
): string {
  const previousForward = previousRoot.replaceAll("\\", "/");
  const previousBackward = previousRoot.replaceAll("/", "\\");
  const nextForward = nextRoot.replaceAll("\\", "/");
  const nextBackward = nextRoot.replaceAll("/", "\\");
  const variants: Array<[pattern: string, replacement: string]> = [
    [previousRoot, nextRoot],
    [previousRoot.toLowerCase(), nextRoot.toLowerCase()],
    [previousRoot.toUpperCase(), nextRoot.toUpperCase()],
    [previousForward, nextForward],
    [previousForward.toLowerCase(), nextForward.toLowerCase()],
    [previousForward.toUpperCase(), nextForward.toUpperCase()],
    [previousBackward, nextBackward],
    [previousBackward.toLowerCase(), nextBackward.toLowerCase()],
    [previousBackward.toUpperCase(), nextBackward.toUpperCase()],
  ];
  let output = input;
  for (const [pattern, replacement] of variants) {
    if (!pattern) {
      continue;
    }
    output = output.split(pattern).join(replacement);
  }
  return output;
}

function rebaseApprovalAuditCacheKeyRoot(
  value: unknown,
  nextProjectRoot: string,
): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const normalizedCacheKeyRoot = normalizeProjectRootKey(nextProjectRoot);

  const normalizeCacheKey = (cacheKeyValue: unknown): string | undefined => {
    if (typeof cacheKeyValue !== "string") {
      return undefined;
    }
    const cacheKey = cacheKeyValue.trim();
    if (!cacheKey) {
      return undefined;
    }
    const dividerIndex = cacheKey.indexOf("|");
    if (dividerIndex <= 0 || dividerIndex === cacheKey.length - 1) {
      return undefined;
    }
    const cacheSuffix = cacheKey.slice(dividerIndex + 1).trim();
    if (!cacheSuffix) {
      return undefined;
    }
    return `${normalizedCacheKeyRoot}|${cacheSuffix}`;
  };

  const rewriteCacheKeyObject = (input: unknown): unknown => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return input;
    }
    const obj = input as Record<string, unknown>;
    let nextObj: Record<string, unknown> = obj;
    const normalizedCacheKey = normalizeCacheKey(obj.cacheKey);
    if (normalizedCacheKey && normalizedCacheKey !== obj.cacheKey) {
      nextObj = { ...nextObj, cacheKey: normalizedCacheKey };
    }
    return nextObj;
  };

  const root = value as Record<string, unknown>;
  let nextRoot: Record<string, unknown> = root;

  const rebasedApprovalAudit = rewriteCacheKeyObject(root.approvalAudit);
  if (rebasedApprovalAudit !== root.approvalAudit) {
    nextRoot = { ...nextRoot, approvalAudit: rebasedApprovalAudit };
  }

  if (Array.isArray(root.approvalAuditHistory)) {
    let changed = false;
    const rebasedHistory = root.approvalAuditHistory.map((entry) => {
      const rebasedEntry = rewriteCacheKeyObject(entry);
      if (rebasedEntry !== entry) {
        changed = true;
      }
      return rebasedEntry;
    });
    if (changed) {
      nextRoot = { ...nextRoot, approvalAuditHistory: rebasedHistory };
    }
  }

  if (
    nextRoot.continuity &&
    typeof nextRoot.continuity === "object" &&
    !Array.isArray(nextRoot.continuity)
  ) {
    const continuity = nextRoot.continuity as Record<string, unknown>;
    let nextContinuity: Record<string, unknown> = continuity;
    const continuityKeys = [
      "lastApprovalCacheKey",
      "lastRequestScopeCacheKey",
      "lastPermissionRequestCacheKey",
    ] as const;
    for (const key of continuityKeys) {
      const normalized = normalizeCacheKey(continuity[key]);
      if (normalized && normalized !== continuity[key]) {
        nextContinuity = { ...nextContinuity, [key]: normalized };
      }
    }
    const scopeCacheKeyCandidate =
      (typeof nextContinuity.lastPermissionRequestCacheKey === "string"
        ? nextContinuity.lastPermissionRequestCacheKey
        : undefined) ??
      (typeof nextContinuity.lastRequestScopeCacheKey === "string"
        ? nextContinuity.lastRequestScopeCacheKey
        : undefined) ??
      (typeof nextContinuity.lastApprovalCacheKey === "string"
        ? nextContinuity.lastApprovalCacheKey
        : undefined);
    if (
      scopeCacheKeyCandidate &&
      (typeof nextContinuity.lastPermissionRequestCacheKey !== "string" ||
        !nextContinuity.lastPermissionRequestCacheKey.trim())
    ) {
      nextContinuity = {
        ...nextContinuity,
        lastPermissionRequestCacheKey: scopeCacheKeyCandidate,
      };
    }
    const scopeLabelCandidate =
      (typeof nextContinuity.lastPermissionRequestScopeLabel === "string"
        ? nextContinuity.lastPermissionRequestScopeLabel
        : undefined) ??
      (typeof nextContinuity.lastRequestScopeLabel === "string"
        ? nextContinuity.lastRequestScopeLabel
        : undefined) ??
      (typeof nextContinuity.lastApprovalScope === "string"
        ? nextContinuity.lastApprovalScope
        : undefined);
    if (
      scopeLabelCandidate &&
      (typeof nextContinuity.lastPermissionRequestScopeLabel !== "string" ||
        !nextContinuity.lastPermissionRequestScopeLabel.trim())
    ) {
      nextContinuity = {
        ...nextContinuity,
        lastPermissionRequestScopeLabel: scopeLabelCandidate,
      };
    }
    const projectRootCandidate =
      (typeof nextContinuity.lastPermissionRequestProjectRoot === "string"
        ? nextContinuity.lastPermissionRequestProjectRoot
        : undefined) ??
      (typeof nextContinuity.lastRequestScopeProjectRoot === "string"
        ? nextContinuity.lastRequestScopeProjectRoot
        : undefined) ??
      (typeof nextContinuity.lastApprovalProjectRoot === "string"
        ? nextContinuity.lastApprovalProjectRoot
        : undefined) ??
      nextProjectRoot;
    if (
      projectRootCandidate &&
      (typeof nextContinuity.lastPermissionRequestProjectRoot !== "string" ||
        !nextContinuity.lastPermissionRequestProjectRoot.trim())
    ) {
      nextContinuity = {
        ...nextContinuity,
        lastPermissionRequestProjectRoot: projectRootCandidate,
      };
    }
    if (
      (typeof nextContinuity.lastPermissionRequestSource !== "string" ||
        !nextContinuity.lastPermissionRequestSource.trim()) &&
      (typeof nextContinuity.lastRequestScopeSource === "string" ||
        typeof nextContinuity.lastApprovalDecision === "string")
    ) {
      nextContinuity = {
        ...nextContinuity,
        lastPermissionRequestSource:
          typeof nextContinuity.lastRequestScopeSource === "string" &&
          nextContinuity.lastRequestScopeSource.trim()
            ? nextContinuity.lastRequestScopeSource
            : "approval-request",
      };
    }
    if (Array.isArray(continuity.lastApprovalHistory)) {
      let historyChanged = false;
      const rebasedContinuityHistory = continuity.lastApprovalHistory.map(
        (entry) => {
          const rebasedEntry = rewriteCacheKeyObject(entry);
          if (rebasedEntry !== entry) {
            historyChanged = true;
          }
          return rebasedEntry;
        },
      );
      if (historyChanged) {
        nextContinuity = {
          ...nextContinuity,
          lastApprovalHistory: rebasedContinuityHistory,
        };
      }
    }
    if (nextContinuity !== continuity) {
      nextRoot = { ...nextRoot, continuity: nextContinuity };
    }
  }

  return nextRoot === root
    ? value
    : {
        ...nextRoot,
        summary: rebaseCacheKeysInSummaryEntries(
          nextRoot.summary,
          normalizedCacheKeyRoot,
        ),
      };
}

function rebaseCacheKeysInSummaryEntries(
  summaryValue: unknown,
  normalizedCacheKeyRoot: string,
): unknown {
  if (!Array.isArray(summaryValue)) {
    return summaryValue;
  }
  let changed = false;
  const nextSummary = summaryValue.map((entry) => {
    if (typeof entry !== "string") {
      return entry;
    }
    const line = entry.trim();
    const normalizedLine =
      line.startsWith("- ") || line.startsWith("* ")
        ? line.slice(2).trim()
        : line;
    const colonIndex = normalizedLine.indexOf(":");
    if (colonIndex <= 0) {
      return entry;
    }
    const key = normalizedLine.slice(0, colonIndex).trim().toLowerCase();
    if (
      key !== "last-approval-cache-key" &&
      key !== "last-request-scope-cache-key" &&
      key !== "last-permission-request-cache-key"
    ) {
      return entry;
    }
    const valuePart = normalizedLine.slice(colonIndex + 1).trim();
    const dividerIndex = valuePart.indexOf("|");
    if (dividerIndex <= 0 || dividerIndex === valuePart.length - 1) {
      return entry;
    }
    const suffix = valuePart.slice(dividerIndex + 1).trim();
    if (!suffix) {
      return entry;
    }
    const rebased = `${normalizedCacheKeyRoot}|${suffix}`;
    if (rebased === valuePart) {
      return entry;
    }
    changed = true;
    return `- ${key}: ${rebased}`;
  });
  return changed ? nextSummary : summaryValue;
}
