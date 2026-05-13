import path from "node:path";
import type {
  PermissionRequestMemoryState,
  RequestScopeMemoryState,
} from "./sessionContinuityTypes.js";

export type PermissionRequestMemoryRecord = PermissionRequestMemoryState;

export function parsePermissionRequestMemory(
  workingMemory: unknown,
): PermissionRequestMemoryRecord | undefined {
  if (!workingMemory || typeof workingMemory !== "object") {
    return undefined;
  }
  const root = workingMemory as Record<string, unknown>;
  return (
    parsePermissionRequestFromContinuityState(root.continuity) ??
    parsePermissionRequestFromSummary(root.summary)
  );
}

export function normalizePermissionRequestMemory(
  value: unknown,
): PermissionRequestMemoryRecord | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const request = value as Record<string, unknown>;
  const source = normalizePermissionSource(request.source);
  const result: PermissionRequestMemoryRecord = {
    ...(normalizeOptionalString(request.toolName)
      ? { toolName: normalizeOptionalString(request.toolName)! }
      : {}),
    ...(normalizeOptionalString(request.operation)
      ? { operation: normalizeOptionalString(request.operation)! }
      : {}),
    ...(normalizeOptionalString(request.target)
      ? { target: normalizeOptionalString(request.target)! }
      : {}),
    ...(normalizeOptionalString(request.process)
      ? { process: normalizeOptionalString(request.process)! }
      : {}),
    ...(normalizeOptionalString(request.scopeKey)
      ? { scopeKey: normalizeOptionalString(request.scopeKey)! }
      : {}),
    ...(normalizeOptionalString(request.scopeLabel)
      ? { scopeLabel: normalizeOptionalString(request.scopeLabel)! }
      : {}),
    ...(normalizeOptionalString(request.cacheKey)
      ? { cacheKey: normalizeOptionalString(request.cacheKey)! }
      : {}),
    ...(normalizeOptionalString(request.projectRoot)
      ? { projectRoot: normalizeOptionalString(request.projectRoot)! }
      : {}),
    ...(source ? { source } : {}),
    ...(normalizeOptionalString(request.lineage)
      ? { lineage: normalizeOptionalString(request.lineage)! }
      : {}),
  };
  return Object.keys(result).length > 0 ? result : undefined;
}

export function parseRequestScopeMemory(
  workingMemory: unknown,
): RequestScopeMemoryState | undefined {
  if (!workingMemory || typeof workingMemory !== "object") {
    return undefined;
  }
  const root = workingMemory as Record<string, unknown>;
  if (
    root.continuity &&
    typeof root.continuity === "object" &&
    !Array.isArray(root.continuity)
  ) {
    const continuity = root.continuity as Record<string, unknown>;
    const source = normalizePermissionSource(continuity.lastRequestScopeSource);
    const fromContinuity: RequestScopeMemoryState = {
      ...(normalizeOptionalString(continuity.lastRequestScopeCacheKey)
        ? {
            cacheKey: normalizeOptionalString(
              continuity.lastRequestScopeCacheKey,
            )!,
          }
        : {}),
      ...(normalizeOptionalString(continuity.lastRequestScopeLabel)
        ? {
            scopeLabel: normalizeOptionalString(
              continuity.lastRequestScopeLabel,
            )!,
          }
        : {}),
      ...(normalizeOptionalString(continuity.lastRequestScopeProjectRoot)
        ? {
            projectRoot: normalizeOptionalString(
              continuity.lastRequestScopeProjectRoot,
            )!,
          }
        : {}),
      ...(source ? { source } : {}),
    };
    if (Object.keys(fromContinuity).length > 0) {
      return fromContinuity;
    }
  }
  if (Array.isArray(root.summary)) {
    const fields = parseSummaryFields(root.summary, "last-request-scope-");
    const source = normalizePermissionSource(
      fields.get("last-request-scope-source"),
    );
    const fromSummary: RequestScopeMemoryState = {
      ...(fields.get("last-request-scope-cache-key")
        ? { cacheKey: fields.get("last-request-scope-cache-key")! }
        : {}),
      ...(fields.get("last-request-scope-label")
        ? { scopeLabel: fields.get("last-request-scope-label")! }
        : {}),
      ...(fields.get("last-request-scope-project-root")
        ? { projectRoot: fields.get("last-request-scope-project-root")! }
        : {}),
      ...(source ? { source } : {}),
    };
    if (Object.keys(fromSummary).length > 0) {
      return fromSummary;
    }
  }
  return undefined;
}

export function extractLastRequestScopeFromEvidence(
  evidence: readonly string[] | undefined,
): RequestScopeMemoryState {
  if (!evidence?.length) {
    return {};
  }
  let cacheKey: string | undefined;
  let scopeLabel: string | undefined;
  let projectRoot: string | undefined;
  let source: "verification-command" | "approval-request" | undefined;
  for (let index = evidence.length - 1; index >= 0; index -= 1) {
    const item = evidence[index]?.trim();
    if (!item) {
      continue;
    }
    if (!cacheKey) {
      const match = item.match(/^current-request-scope-cache-key:(.+)$/i);
      const value = match?.[1]?.trim();
      if (value) {
        cacheKey = value;
      }
    }
    if (!scopeLabel) {
      const match = item.match(/^current-request-scope-label:(.+)$/i);
      const value = match?.[1]?.trim();
      if (value) {
        scopeLabel = value;
      }
    }
    if (!projectRoot) {
      const match = item.match(/^current-request-scope-project-root:(.+)$/i);
      const value = match?.[1]?.trim();
      if (value) {
        projectRoot = value;
      }
    }
    if (!source) {
      const match = item.match(/^current-request-scope-source:(.+)$/i);
      source = normalizePermissionSource(match?.[1]);
    }
    if (cacheKey && scopeLabel && projectRoot && source) {
      break;
    }
  }
  return {
    ...(cacheKey ? { cacheKey } : {}),
    ...(scopeLabel ? { scopeLabel } : {}),
    ...(projectRoot ? { projectRoot } : {}),
    ...(source ? { source } : {}),
  };
}

export function extractLastPermissionRequestFromEvidence(
  evidence: readonly string[] | undefined,
): PermissionRequestMemoryRecord {
  if (!evidence?.length) {
    return {};
  }
  let toolName: string | undefined;
  let operation: string | undefined;
  let target: string | undefined;
  let process: string | undefined;
  let scopeKey: string | undefined;
  let scopeLabel: string | undefined;
  let cacheKey: string | undefined;
  let projectRoot: string | undefined;
  let source: "verification-command" | "approval-request" | undefined;
  let lineage: string | undefined;
  for (let index = evidence.length - 1; index >= 0; index -= 1) {
    const item = evidence[index]?.trim();
    if (!item) {
      continue;
    }
    if (!toolName) {
      const match = item.match(/^current-permission-request-tool:(.+)$/i);
      const value = match?.[1]?.trim().toLowerCase();
      if (value) {
        toolName = value;
      }
    }
    if (!operation) {
      const match = item.match(/^current-permission-request-operation:(.+)$/i);
      const value = match?.[1]?.trim().toLowerCase();
      if (value) {
        operation = value;
      }
    }
    if (!target) {
      const match = item.match(/^current-permission-request-target:(.+)$/i);
      const value = match?.[1]?.trim();
      if (value) {
        target = value;
      }
    }
    if (!process) {
      const match = item.match(/^current-permission-request-process:(.+)$/i);
      const value = match?.[1]?.trim().toLowerCase();
      if (value) {
        process = value;
      }
    }
    if (!scopeKey) {
      const match = item.match(/^current-permission-request-scope-key:(.+)$/i);
      const value = match?.[1]?.trim().toLowerCase();
      if (value) {
        scopeKey = value;
      }
    }
    if (!scopeLabel) {
      const match = item.match(/^current-permission-request-scope-label:(.+)$/i);
      const value = match?.[1]?.trim();
      if (value) {
        scopeLabel = value;
      }
    }
    if (!cacheKey) {
      const match = item.match(/^current-permission-request-cache-key:(.+)$/i);
      const value = match?.[1]?.trim();
      if (value) {
        cacheKey = value;
      }
    }
    if (!projectRoot) {
      const match = item.match(/^current-permission-request-project-root:(.+)$/i);
      const value = match?.[1]?.trim();
      if (value) {
        projectRoot = value;
      }
    }
    if (!source) {
      const match = item.match(/^current-permission-request-source:(.+)$/i);
      source = normalizePermissionSource(match?.[1]);
    }
    if (!lineage) {
      const match = item.match(/^current-permission-request-lineage:(.+)$/i);
      const value = match?.[1]?.trim();
      if (value) {
        lineage = value;
      }
    }
    if (
      toolName &&
      operation &&
      target &&
      scopeKey &&
      scopeLabel &&
      cacheKey &&
      projectRoot &&
      source
    ) {
      break;
    }
  }
  return {
    ...(toolName ? { toolName } : {}),
    ...(operation ? { operation } : {}),
    ...(target ? { target } : {}),
    ...(process ? { process } : {}),
    ...(scopeKey ? { scopeKey } : {}),
    ...(scopeLabel ? { scopeLabel } : {}),
    ...(cacheKey ? { cacheKey } : {}),
    ...(projectRoot ? { projectRoot } : {}),
    ...(source ? { source } : {}),
    ...(lineage ? { lineage } : {}),
  };
}

export function resolvePermissionRequestMemory(input: {
  readonly evidence: PermissionRequestMemoryRecord;
  readonly memory?: PermissionRequestMemoryRecord;
  readonly sessionProjectRoot: string;
}): PermissionRequestMemoryRecord {
  const preferMemory = shouldPreferMemory({
    evidenceCacheKey: input.evidence.cacheKey,
    evidenceProjectRoot: input.evidence.projectRoot,
    memoryCacheKey: input.memory?.cacheKey,
    memoryProjectRoot: input.memory?.projectRoot,
    sessionProjectRoot: input.sessionProjectRoot,
  });
  const pick = <T,>(
    evidenceValue: T | undefined,
    memoryValue: T | undefined,
  ): T | undefined =>
    preferMemory ? (memoryValue ?? evidenceValue) : (evidenceValue ?? memoryValue);
  return {
    toolName: pick(input.evidence.toolName, input.memory?.toolName),
    operation: pick(input.evidence.operation, input.memory?.operation),
    target: pick(input.evidence.target, input.memory?.target),
    process: pick(input.evidence.process, input.memory?.process),
    scopeKey: pick(input.evidence.scopeKey, input.memory?.scopeKey),
    scopeLabel: pick(input.evidence.scopeLabel, input.memory?.scopeLabel),
    cacheKey: pick(input.evidence.cacheKey, input.memory?.cacheKey),
    projectRoot: pick(input.evidence.projectRoot, input.memory?.projectRoot),
    source: pick(input.evidence.source, input.memory?.source),
    lineage: pick(input.evidence.lineage, input.memory?.lineage),
  };
}

export function resolveRequestScopeMemory(input: {
  readonly evidence: RequestScopeMemoryState;
  readonly memory?: RequestScopeMemoryState;
  readonly sessionProjectRoot: string;
}): RequestScopeMemoryState {
  const preferMemory = shouldPreferMemory({
    evidenceCacheKey: input.evidence.cacheKey,
    evidenceProjectRoot: input.evidence.projectRoot,
    memoryCacheKey: input.memory?.cacheKey,
    memoryProjectRoot: input.memory?.projectRoot,
    sessionProjectRoot: input.sessionProjectRoot,
  });
  const pick = <T,>(
    evidenceValue: T | undefined,
    memoryValue: T | undefined,
  ): T | undefined =>
    preferMemory ? (memoryValue ?? evidenceValue) : (evidenceValue ?? memoryValue);
  return {
    cacheKey: pick(input.evidence.cacheKey, input.memory?.cacheKey),
    scopeLabel: pick(input.evidence.scopeLabel, input.memory?.scopeLabel),
    projectRoot: pick(input.evidence.projectRoot, input.memory?.projectRoot),
    source: pick(input.evidence.source, input.memory?.source),
  };
}

function parsePermissionRequestFromContinuityState(
  value: unknown,
): PermissionRequestMemoryRecord | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const continuity = value as Record<string, unknown>;
  const source = normalizePermissionSource(
    continuity.lastPermissionRequestSource,
  );
  const result: PermissionRequestMemoryRecord = {
    ...(normalizeOptionalString(continuity.lastPermissionRequestToolName)
      ? {
          toolName: normalizeOptionalString(
            continuity.lastPermissionRequestToolName,
          )!,
        }
      : {}),
    ...(normalizeOptionalString(continuity.lastPermissionRequestOperation)
      ? {
          operation: normalizeOptionalString(
            continuity.lastPermissionRequestOperation,
          )!,
        }
      : {}),
    ...(normalizeOptionalString(continuity.lastPermissionRequestTarget)
      ? {
          target: normalizeOptionalString(
            continuity.lastPermissionRequestTarget,
          )!,
        }
      : {}),
    ...(normalizeOptionalString(continuity.lastPermissionRequestProcess)
      ? {
          process: normalizeOptionalString(
            continuity.lastPermissionRequestProcess,
          )!,
        }
      : {}),
    ...(normalizeOptionalString(continuity.lastPermissionRequestScopeKey)
      ? {
          scopeKey: normalizeOptionalString(
            continuity.lastPermissionRequestScopeKey,
          )!,
        }
      : {}),
    ...(normalizeOptionalString(continuity.lastPermissionRequestScopeLabel)
      ? {
          scopeLabel: normalizeOptionalString(
            continuity.lastPermissionRequestScopeLabel,
          )!,
        }
      : {}),
    ...(normalizeOptionalString(continuity.lastPermissionRequestCacheKey)
      ? {
          cacheKey: normalizeOptionalString(
            continuity.lastPermissionRequestCacheKey,
          )!,
        }
      : {}),
    ...(normalizeOptionalString(continuity.lastPermissionRequestProjectRoot)
      ? {
          projectRoot: normalizeOptionalString(
            continuity.lastPermissionRequestProjectRoot,
          )!,
        }
      : {}),
    ...(source ? { source } : {}),
    ...(normalizeOptionalString(continuity.lastPermissionRequestLineage)
      ? {
          lineage: normalizeOptionalString(
            continuity.lastPermissionRequestLineage,
          )!,
        }
      : {}),
  };
  return Object.keys(result).length > 0 ? result : undefined;
}

function parsePermissionRequestFromSummary(
  value: unknown,
): PermissionRequestMemoryRecord | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const fields = parseSummaryFields(value, "last-permission-request-");
  const source = normalizePermissionSource(
    fields.get("last-permission-request-source"),
  );
  const result: PermissionRequestMemoryRecord = {
    ...(fields.get("last-permission-request-tool")
      ? { toolName: fields.get("last-permission-request-tool")! }
      : {}),
    ...(fields.get("last-permission-request-operation")
      ? { operation: fields.get("last-permission-request-operation")! }
      : {}),
    ...(fields.get("last-permission-request-target")
      ? { target: fields.get("last-permission-request-target")! }
      : {}),
    ...(fields.get("last-permission-request-process")
      ? { process: fields.get("last-permission-request-process")! }
      : {}),
    ...(fields.get("last-permission-request-scope-key")
      ? { scopeKey: fields.get("last-permission-request-scope-key")! }
      : {}),
    ...(fields.get("last-permission-request-scope-label")
      ? { scopeLabel: fields.get("last-permission-request-scope-label")! }
      : {}),
    ...(fields.get("last-permission-request-cache-key")
      ? { cacheKey: fields.get("last-permission-request-cache-key")! }
      : {}),
    ...(fields.get("last-permission-request-project-root")
      ? { projectRoot: fields.get("last-permission-request-project-root")! }
      : {}),
    ...(source ? { source } : {}),
    ...(fields.get("last-permission-request-lineage")
      ? { lineage: fields.get("last-permission-request-lineage")! }
      : {}),
  };
  return Object.keys(result).length > 0 ? result : undefined;
}

function parseSummaryFields(
  summary: readonly unknown[],
  prefix: string,
): Map<string, string> {
  const fields = new Map<string, string>();
  for (const raw of summary) {
    if (typeof raw !== "string") {
      continue;
    }
    const trimmed = raw.trim();
    if (!trimmed) {
      continue;
    }
    const line =
      trimmed.startsWith("- ") || trimmed.startsWith("* ")
        ? trimmed.slice(2).trim()
        : trimmed;
    const colonIndex = line.indexOf(":");
    if (colonIndex <= 0) {
      continue;
    }
    const key = line.slice(0, colonIndex).trim().toLowerCase();
    if (!key.startsWith(prefix)) {
      continue;
    }
    const value = line.slice(colonIndex + 1).trim();
    if (!value || fields.has(key)) {
      continue;
    }
    fields.set(key, value);
  }
  return fields;
}

function shouldPreferMemory(input: {
  readonly evidenceCacheKey?: string;
  readonly evidenceProjectRoot?: string;
  readonly memoryCacheKey?: string;
  readonly memoryProjectRoot?: string;
  readonly sessionProjectRoot: string;
}): boolean {
  const evidenceRoot =
    normalizeOptionalString(input.evidenceProjectRoot) ??
    inferRootFromCacheKey(input.evidenceCacheKey);
  const memoryRoot =
    normalizeOptionalString(input.memoryProjectRoot) ??
    inferRootFromCacheKey(input.memoryCacheKey);
  const normalizedSessionRoot = path.resolve(input.sessionProjectRoot);
  return (
    Boolean(memoryRoot) &&
    path.resolve(memoryRoot!) === normalizedSessionRoot &&
    Boolean(evidenceRoot) &&
    path.resolve(evidenceRoot!) !== normalizedSessionRoot
  );
}

function inferRootFromCacheKey(cacheKey: string | undefined): string | undefined {
  if (!cacheKey) {
    return undefined;
  }
  const divider = cacheKey.indexOf("|");
  if (divider <= 0) {
    return undefined;
  }
  const rootPart = cacheKey.slice(0, divider).trim();
  return rootPart.length > 0 ? rootPart : undefined;
}

function normalizePermissionSource(
  value: unknown,
): "verification-command" | "approval-request" | undefined {
  const sourceRaw = normalizeOptionalString(value)?.toLowerCase();
  return sourceRaw === "verification-command" || sourceRaw === "approval-request"
    ? sourceRaw
    : undefined;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}
