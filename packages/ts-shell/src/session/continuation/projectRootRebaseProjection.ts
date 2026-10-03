import path from "node:path";
import { collectLegacyPermissionRoots, normalizePathIdentity } from "./roots.js";
export { detectLegacyPermissionRootCandidate } from "./roots.js";
import { normalizeProjectRootKey } from "../store/projectBindingPolicy.js";
import { rebasePathValues } from "./rebase.js";
import { isRecord } from "../../core/values/record.js";

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
  const rebasedValue = rebasePathValues(
    input.value,
    input.previousRoot,
    input.nextRoot,
  );
  return {
    workingMemory: rebaseApprovalAuditCacheKeyRoot(
      rebasedValue,
      input.nextRoot,
      input.previousRoot,
      input.value,
    ),
  };
}

export function normalizeLegacyPermissionWorkingMemory(input: {
  readonly workingMemory: unknown;
  readonly sessionProjectRoot: string;
}): unknown {
  const normalizedProjectRoot = path.resolve(input.sessionProjectRoot);
  const roots = collectLegacyPermissionRoots(input);
  if (roots.length > 1) return input.workingMemory;
  const previousRoot = roots[0];
  const rebasedWorkingMemory = previousRoot
    ? rebasePathValues(input.workingMemory, previousRoot, normalizedProjectRoot)
    : input.workingMemory;
  return rebaseApprovalAuditCacheKeyRoot(
    rebasedWorkingMemory,
    normalizedProjectRoot,
    previousRoot,
    input.workingMemory,
  );
}

function rebaseApprovalAuditCacheKeyRoot(
  value: unknown,
  nextProjectRoot: string,
  previousRoot?: string,
  originalValue: unknown = value,
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
    const cacheRoot = normalizePathIdentity(cacheKey.slice(0, dividerIndex), true);
    const fromPreviousRoot = previousRoot && cacheRoot === normalizePathIdentity(previousRoot, true);
    const fromCurrentRoot = cacheRoot === normalizePathIdentity(nextProjectRoot, true);
    if (!cacheRoot || (!fromPreviousRoot && !fromCurrentRoot)) return undefined;
    const cacheSuffix = cacheKey.slice(dividerIndex + 1).trim();
    if (!cacheSuffix) {
      return undefined;
    }
    return `${normalizedCacheKeyRoot}|${rebasePathValues(cacheSuffix, previousRoot ?? nextProjectRoot, normalizedCacheKeyRoot, {
      ignoreCase: true,
      ...(fromCurrentRoot ? { preserveRoot: nextProjectRoot } : {}),
    })}`;
  };

  const rewriteCacheKeyObject = (input: unknown, original: unknown): unknown => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return input;
    }
    const obj = input as Record<string, unknown>;
    let nextObj: Record<string, unknown> = obj;
    const sourceKey = isRecord(original) ? original.cacheKey : obj.cacheKey;
    const normalizedCacheKey = normalizeCacheKey(sourceKey) ?? (typeof sourceKey === "string" ? sourceKey : undefined);
    if (normalizedCacheKey && normalizedCacheKey !== obj.cacheKey) {
      nextObj = { ...nextObj, cacheKey: normalizedCacheKey };
    }
    return nextObj;
  };

  const root = value as Record<string, unknown>;
  // Read cache paths from the original records: the general path pass may have
  // inserted a destination that itself contains the old root.
  const originalRoot = isRecord(originalValue) ? originalValue : root;
  let nextRoot: Record<string, unknown> = root;

  const rebasedApprovalAudit = rewriteCacheKeyObject(root.approvalAudit, originalRoot.approvalAudit);
  if (rebasedApprovalAudit !== root.approvalAudit) {
    nextRoot = { ...nextRoot, approvalAudit: rebasedApprovalAudit };
  }

  if (Array.isArray(root.approvalAuditHistory)) {
    let changed = false;
    const originalHistory = Array.isArray(originalRoot.approvalAuditHistory) ? originalRoot.approvalAuditHistory : [];
    const rebasedHistory = root.approvalAuditHistory.map((entry, index) => {
      const rebasedEntry = rewriteCacheKeyObject(entry, originalHistory[index]);
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
    const originalContinuity = isRecord(originalRoot.continuity) ? originalRoot.continuity : continuity;
    let nextContinuity: Record<string, unknown> = continuity;
    const continuityKeys = [
      "lastApprovalCacheKey",
      "lastRequestScopeCacheKey",
      "lastPermissionRequestCacheKey",
    ] as const;
    for (const key of continuityKeys) {
      const sourceKey = originalContinuity[key];
      const normalized = normalizeCacheKey(sourceKey) ?? (typeof sourceKey === "string" ? sourceKey : undefined);
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
      const originalHistory = Array.isArray(originalContinuity.lastApprovalHistory) ? originalContinuity.lastApprovalHistory : [];
      const rebasedContinuityHistory = continuity.lastApprovalHistory.map(
        (entry, index) => {
          const rebasedEntry = rewriteCacheKeyObject(entry, originalHistory[index]);
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

  const summary = rebaseCacheKeysInSummaryEntries(nextRoot.summary, originalRoot.summary, normalizeCacheKey);
  if (summary !== nextRoot.summary) {
    nextRoot = { ...nextRoot, summary };
  }
  return nextRoot;
}

function rebaseCacheKeysInSummaryEntries(
  summaryValue: unknown,
  originalSummary: unknown,
  normalizeCacheKey: (value: unknown) => string | undefined,
): unknown {
  if (!Array.isArray(summaryValue)) {
    return summaryValue;
  }
  let changed = false;
  const nextSummary = summaryValue.map((entry, index) => {
    if (typeof entry !== "string") {
      return entry;
    }
    const originalEntry = Array.isArray(originalSummary) ? originalSummary[index] : undefined;
    const line = (typeof originalEntry === "string" ? originalEntry : entry).trim();
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
    const rebased = normalizeCacheKey(valuePart);
    if (!rebased) {
      const restored = typeof originalEntry === "string" ? originalEntry : entry;
      changed ||= restored !== entry;
      return restored;
    }
    if (entry.slice(entry.indexOf(":") + 1).trim() === rebased) {
      return entry;
    }
    changed = true;
    return `- ${key}: ${rebased}`;
  });
  return changed ? nextSummary : summaryValue;
}
