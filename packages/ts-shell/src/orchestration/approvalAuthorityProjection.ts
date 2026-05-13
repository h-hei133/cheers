import path from "node:path";
import { normalizeSubjectTargetWithRootPath } from "../core/paths/legacyRootRebase.js";
import type { ContinuityStateLike } from "./runtimeHandoffProjection.js";

export function formatApprovalAuthorityFacts(input: {
  readonly continuity: ContinuityStateLike;
}): string {
  if (!input.continuity.lastApprovalDecision) {
    return "I don't have structured approval memory in this session yet. Run an approval-required action first, then ask what was approved.";
  }
  const authority = resolveActiveApprovalAuthority(input.continuity);
  const subjectRequest = resolveSubjectPermissionRequest(input.continuity);
  const subjectRequestLabel = subjectRequest.label;
  const subjectRequestScope = subjectRequest.scope;
  const subjectRequestCacheKey = subjectRequest.cacheKey;
  const subjectRequestRoot = subjectRequest.root;
  const currentContextScope = input.continuity.lastRequestScopeLabel;
  const currentContextCacheKey = input.continuity.lastRequestScopeCacheKey;
  const currentContextRoot = input.continuity.lastRequestScopeProjectRoot;
  const subjectCurrentConflict =
    Boolean(subjectRequestScope && currentContextScope) &&
    subjectRequestScope !== currentContextScope;
  const persistentText =
    input.continuity.lastApprovalPersistent === true
      ? "persistent (allow-always)"
      : "one-shot (allow-once/deny)";
  const decisionLines = [
    `Last approval decision: ${input.continuity.lastApprovalDecision}.`,
    input.continuity.lastApprovalDecisionSource
      ? `Decision source: ${input.continuity.lastApprovalDecisionSource}.`
      : undefined,
    `Lifecycle: ${persistentText}.`,
    input.continuity.lastApprovalCacheEffect
      ? `Cache effect: ${input.continuity.lastApprovalCacheEffect}.`
      : undefined,
    input.continuity.lastApprovalProjectRoot
      ? `Authority root: ${input.continuity.lastApprovalProjectRoot}.`
      : undefined,
    input.continuity.lastApprovalScope
      ? `Scope: ${input.continuity.lastApprovalScope}.`
      : undefined,
    input.continuity.lastApprovalLineage
      ? `Lineage: ${input.continuity.lastApprovalLineage}.`
      : undefined,
    input.continuity.lastApprovalStopReason
      ? `Stop reason: ${input.continuity.lastApprovalStopReason}.`
      : undefined,
    input.continuity.lastApprovalRecordedAt
      ? `Recorded at: ${input.continuity.lastApprovalRecordedAt}.`
      : undefined,
    subjectRequestLabel
      ? `Subject permission request: ${subjectRequestLabel}.`
      : undefined,
    subjectRequest.target
      ? `Subject permission target: ${subjectRequest.target}.`
      : undefined,
    subjectRequestScope
      ? `Subject permission scope: ${subjectRequestScope}.`
      : undefined,
    subjectRequestCacheKey
      ? `Subject permission cacheKey: ${subjectRequestCacheKey}.`
      : undefined,
    subjectRequestRoot
      ? `Subject permission root: ${subjectRequestRoot}.`
      : undefined,
    subjectRequestLabel && subjectRequest.isPartial
      ? "Subject permission scope details are incomplete in compacted/recovered memory; using current context for why-asking-again reasoning."
      : undefined,
    subjectRequest.isPartial &&
    subjectRequest.reconstructionSource !== "unavailable"
      ? `Subject reconstruction source: ${subjectRequest.reconstructionSource}.`
      : undefined,
    currentContextScope
      ? `Current request context scope: ${currentContextScope}.`
      : undefined,
    currentContextCacheKey
      ? `Current request context cacheKey: ${currentContextCacheKey}.`
      : undefined,
    currentContextRoot
      ? `Current request context root: ${currentContextRoot}.`
      : undefined,
    subjectCurrentConflict
      ? "Subject/current disambiguation: the subject approval request differs from the current request context scope."
      : undefined,
    authority.active
      ? `Authoritative approval now: ${authority.active.decision} (${authority.active.reason}).`
      : undefined,
    authority.active?.recordedAt
      ? `Authoritative recorded at: ${authority.active.recordedAt}.`
      : undefined,
    authority.overriddenByHistory && authority.overriddenByHistory.reason
      ? `Why not another approval: ${authority.overriddenByHistory.reason}.`
      : undefined,
  ].filter((line): line is string => Boolean(line));
  if (
    input.continuity.lastApprovalDecision === "allow-once" &&
    input.continuity.lastApprovalPersistent === false
  ) {
    decisionLines.push(
      "Why asking again: allow-once grants are consumed by a single execution and are not persisted.",
    );
  }
  if (
    input.continuity.lastApprovalDecision === "deny" &&
    input.continuity.lastApprovalStopReason
  ) {
    decisionLines.push(
      "Why asking again: previous decision denied escalation, so a new explicit approval is required for subsequent runs.",
    );
  }
  return decisionLines.join("\n");
}

interface NormalizedApprovalAuthorityEvent {
  readonly decision: "deny" | "allow-once" | "allow-always";
  readonly persistent: boolean;
  readonly cacheEffect?: string;
  readonly projectRoot?: string;
  readonly cacheKey?: string;
  readonly scope?: string;
  readonly lineage?: string;
  readonly stopReason?: string;
  readonly recordedAt?: string;
  readonly recordedAtMs: number;
  readonly source: "history" | "last-approval";
  readonly order: number;
}

interface ApprovalAuthorityResolution {
  readonly active?: {
    readonly decision: "deny" | "allow-once" | "allow-always";
    readonly recordedAt?: string;
    readonly reason: string;
  };
  readonly overriddenByHistory?: {
    readonly reason: string;
  };
}

interface ScopedApprovalHint {
  readonly cacheKey?: string;
  readonly scope?: string;
  readonly source:
    | "verification-command"
    | "approval-request"
    | "last-approval";
}

interface CurrentRequestScope {
  readonly cacheKey: string;
  readonly scopeLabel: string;
  readonly projectRoot: string;
  readonly source: "verification-command" | "approval-request";
}

interface CurrentPermissionRequest {
  readonly toolName: string;
  readonly operation: string;
  readonly target: string;
  readonly process?: string;
  readonly scopeKey: string;
  readonly scopeLabel: string;
  readonly cacheKey: string;
  readonly projectRoot: string;
  readonly source: "verification-command" | "approval-request";
  readonly lineageHint?: string;
}

interface SubjectPermissionRequestResolution {
  readonly label?: string;
  readonly target?: string;
  readonly scope?: string;
  readonly cacheKey?: string;
  readonly root?: string;
  readonly isPartial: boolean;
  readonly reconstructionSource:
    | "last-permission-request"
    | "approval-history"
    | "last-approval"
    | "unavailable";
}

function resolveActiveApprovalAuthority(
  continuity: ContinuityStateLike,
): ApprovalAuthorityResolution {
  const events = collectApprovalAuthorityEvents(continuity);
  if (events.length === 0) {
    return {};
  }
  const activeRoot = normalizeApprovalAuthorityRoot(
    continuity.projectRoot ?? continuity.lastApprovalProjectRoot,
  );
  const scopedHint = deriveScopedApprovalHint(continuity, activeRoot);
  const scopedEvents =
    activeRoot === undefined
      ? events
      : events.filter((event) => {
          const eventRoot = normalizeApprovalAuthorityRoot(event.projectRoot);
          return eventRoot !== undefined && eventRoot === activeRoot;
        });
  const rootRelevantEvents = scopedEvents.length > 0 ? scopedEvents : events;
  const scopedRelevantEvents = resolveEventsForScopedHint(
    rootRelevantEvents,
    scopedHint,
  );
  const relevantEvents =
    scopedRelevantEvents.length > 0 ? scopedRelevantEvents : rootRelevantEvents;
  const active = relevantEvents[relevantEvents.length - 1];
  if (!active) {
    return {};
  }
  const filteredForScope = scopedRelevantEvents.length > 0;
  const previous = findPreviousDistinctApprovalEvent(relevantEvents, active);
  const scopeConflict = findScopeConflictingNewerEvent({
    rootEvents: rootRelevantEvents,
    scopedEvents: relevantEvents,
    active,
  });
  return {
    active: {
      decision: active.decision,
      ...(active.recordedAt ? { recordedAt: active.recordedAt } : {}),
      reason: describeAuthoritativeApprovalReason(active, {
        rootScoped: scopedEvents.length > 0,
        scopeScoped: filteredForScope,
        scopedHint,
      }),
    },
    ...((scopeConflict ?? previous)
      ? {
          overriddenByHistory: {
            reason: describeOverriddenApprovalReason({
              active,
              previous: scopeConflict ?? previous!,
              activeRootScoped: scopedEvents.length > 0,
              scopeScoped: filteredForScope,
              scopeConflict: Boolean(scopeConflict),
            }),
          },
        }
      : {}),
  };
}

function collectApprovalAuthorityEvents(
  continuity: ContinuityStateLike,
): readonly NormalizedApprovalAuthorityEvent[] {
  const collected: NormalizedApprovalAuthorityEvent[] = [];
  const history = Array.isArray(continuity.lastApprovalHistory)
    ? continuity.lastApprovalHistory
    : [];
  for (const [index, entry] of history.entries()) {
    const decision = normalizeApprovalDecision(entry?.decision);
    if (!decision) {
      continue;
    }
    const normalizedRoot = normalizeApprovalAuthorityRoot(entry.projectRoot);
    const recordedAt = normalizeOptionalAuditText(entry.recordedAt);
    const recordedAtMs = parseApprovalTimestamp(recordedAt, index);
    collected.push({
      decision,
      persistent:
        typeof entry.persistent === "boolean"
          ? entry.persistent
          : decision === "allow-always",
      cacheEffect: normalizeOptionalAuditText(entry.cacheEffect),
      projectRoot: normalizedRoot,
      cacheKey: normalizeOptionalAuditText(entry.cacheKey),
      scope: normalizeOptionalAuditText(entry.scopeLabel),
      lineage: normalizeOptionalAuditText(entry.lineage),
      stopReason: normalizeOptionalAuditText(entry.stopReason),
      recordedAt,
      recordedAtMs,
      source: "history",
      order: index,
    });
  }
  const latestDecision = normalizeApprovalDecision(
    continuity.lastApprovalDecision,
  );
  if (latestDecision) {
    const order = collected.length;
    const recordedAt = normalizeOptionalAuditText(
      continuity.lastApprovalRecordedAt,
    );
    const latest = {
      decision: latestDecision,
      persistent:
        typeof continuity.lastApprovalPersistent === "boolean"
          ? continuity.lastApprovalPersistent
          : latestDecision === "allow-always",
      cacheEffect: normalizeOptionalAuditText(
        continuity.lastApprovalCacheEffect,
      ),
      projectRoot: normalizeApprovalAuthorityRoot(
        continuity.lastApprovalProjectRoot ?? continuity.projectRoot,
      ),
      cacheKey: normalizeOptionalAuditText(continuity.lastApprovalCacheKey),
      scope: normalizeOptionalAuditText(continuity.lastApprovalScope),
      lineage: normalizeOptionalAuditText(continuity.lastApprovalLineage),
      stopReason: normalizeOptionalAuditText(continuity.lastApprovalStopReason),
      recordedAt,
      recordedAtMs: parseApprovalTimestamp(recordedAt, order),
      source: "last-approval" as const,
      order,
    };
    const duplicate = collected.some((event) =>
      isEquivalentApprovalAuthorityEvent(event, latest),
    );
    if (!duplicate) {
      collected.push(latest);
    }
  }
  return collected.sort((left, right) => {
    if (left.recordedAtMs !== right.recordedAtMs) {
      return left.recordedAtMs - right.recordedAtMs;
    }
    return left.order - right.order;
  });
}

function findPreviousDistinctApprovalEvent(
  events: readonly NormalizedApprovalAuthorityEvent[],
  active: NormalizedApprovalAuthorityEvent,
): NormalizedApprovalAuthorityEvent | undefined {
  for (let index = events.length - 2; index >= 0; index -= 1) {
    const candidate = events[index];
    if (!candidate) {
      continue;
    }
    if (!isEquivalentApprovalAuthorityEvent(candidate, active)) {
      return candidate;
    }
  }
  return undefined;
}

function isEquivalentApprovalAuthorityEvent(
  left: NormalizedApprovalAuthorityEvent,
  right: NormalizedApprovalAuthorityEvent,
): boolean {
  return (
    left.decision === right.decision &&
    left.persistent === right.persistent &&
    (left.cacheEffect ?? "") === (right.cacheEffect ?? "") &&
    normalizeApprovalAuthorityRoot(left.projectRoot) ===
      normalizeApprovalAuthorityRoot(right.projectRoot) &&
    (left.cacheKey ?? "") === (right.cacheKey ?? "") &&
    (left.scope ?? "") === (right.scope ?? "") &&
    (left.lineage ?? "") === (right.lineage ?? "") &&
    (left.stopReason ?? "") === (right.stopReason ?? "") &&
    (left.recordedAt ?? "") === (right.recordedAt ?? "")
  );
}

function normalizeApprovalDecision(
  decision: unknown,
): "deny" | "allow-once" | "allow-always" | undefined {
  if (typeof decision !== "string") {
    return undefined;
  }
  const normalized = decision.trim().toLowerCase();
  if (
    normalized === "deny" ||
    normalized === "allow-once" ||
    normalized === "allow-always"
  ) {
    return normalized;
  }
  return undefined;
}

function normalizeApprovalAuthorityRoot(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }
  return path.resolve(value).replace(/\\/g, "/").toLowerCase();
}

function normalizeOptionalAuditText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseApprovalTimestamp(
  value: string | undefined,
  fallback: number,
): number {
  if (!value) {
    return Number.MAX_SAFE_INTEGER - 10_000 + fallback;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed)
    ? parsed
    : Number.MAX_SAFE_INTEGER - 10_000 + fallback;
}

function describeAuthoritativeApprovalReason(
  event: NormalizedApprovalAuthorityEvent,
  options: {
    rootScoped: boolean;
    scopeScoped: boolean;
    scopedHint?: ScopedApprovalHint;
  },
): string {
  const rootReason = options.rootScoped
    ? "latest decision for the rebased authority root"
    : "latest decision across available approval memory";
  const scopedReason = options.scopeScoped
    ? ` scoped to ${options.scopedHint?.source === "verification-command" ? "current verification command scope" : "current approval scope"}`
    : "";
  if (event.decision === "allow-always" && event.persistent) {
    return `${rootReason}${scopedReason}; persistent grant remains active`;
  }
  if (event.decision === "allow-once") {
    return `${rootReason}${scopedReason}; one-shot grant only applies to the consumed execution`;
  }
  if (event.decision === "deny") {
    return event.stopReason
      ? `${rootReason}${scopedReason}; denial remains authoritative (${event.stopReason})`
      : `${rootReason}${scopedReason}; denial remains authoritative`;
  }
  return `${rootReason}${scopedReason}`;
}

function describeOverriddenApprovalReason(input: {
  active: NormalizedApprovalAuthorityEvent;
  previous: NormalizedApprovalAuthorityEvent;
  activeRootScoped: boolean;
  scopeScoped: boolean;
  scopeConflict: boolean;
}): string {
  const sameRoot =
    normalizeApprovalAuthorityRoot(input.active.projectRoot) ===
    normalizeApprovalAuthorityRoot(input.previous.projectRoot);
  if (input.scopeConflict && input.scopeScoped) {
    return `newer ${input.previous.decision} decision is for a different scope/cacheKey, so current scoped authority stays ${input.active.decision}`;
  }
  if (!sameRoot && input.activeRootScoped) {
    return `current root-scoped authority (${input.active.decision}) takes precedence over history from another root (${input.previous.decision})`;
  }
  return `newer ${input.active.decision} decision overrides earlier ${input.previous.decision} decision`;
}

function deriveScopedApprovalHint(
  continuity: ContinuityStateLike,
  normalizedRoot: string | undefined,
): ScopedApprovalHint | undefined {
  const permissionRequestCacheKey = normalizeOptionalAuditText(
    continuity.lastPermissionRequestCacheKey,
  );
  const permissionRequestScope =
    normalizeOptionalAuditText(continuity.lastPermissionRequestScopeLabel) ??
    normalizeOptionalAuditText(continuity.lastRequestScopeLabel);
  const permissionRequestScopeKey =
    normalizeOptionalAuditText(continuity.lastPermissionRequestScopeKey) ??
    buildScopeKeyFromPermissionRequest(
      continuity.lastPermissionRequestToolName,
      continuity.lastPermissionRequestOperation,
      continuity.lastPermissionRequestProcess,
      continuity.lastPermissionRequestTarget,
    );
  const permissionRequestRoot =
    normalizeApprovalAuthorityRoot(
      continuity.lastPermissionRequestProjectRoot ??
        continuity.lastRequestScopeProjectRoot,
    ) ?? normalizedRoot;
  if (
    permissionRequestCacheKey ||
    permissionRequestScope ||
    permissionRequestScopeKey
  ) {
    const cacheKey =
      permissionRequestCacheKey ??
      (permissionRequestScopeKey && permissionRequestRoot
        ? `${permissionRequestRoot}|${permissionRequestScopeKey}`
        : undefined);
    return {
      ...(cacheKey ? { cacheKey } : {}),
      ...(permissionRequestScope ? { scope: permissionRequestScope } : {}),
      source:
        continuity.lastPermissionRequestSource ??
        continuity.lastRequestScopeSource ??
        "approval-request",
    };
  }

  const explicitCacheKey = normalizeOptionalAuditText(
    continuity.lastRequestScopeCacheKey,
  );
  const explicitScope = normalizeOptionalAuditText(
    continuity.lastRequestScopeLabel,
  );
  if (explicitCacheKey || explicitScope) {
    return {
      ...(explicitCacheKey ? { cacheKey: explicitCacheKey } : {}),
      ...(explicitScope ? { scope: explicitScope } : {}),
      source: continuity.lastRequestScopeSource ?? "approval-request",
    };
  }
  const verificationCommand = normalizeOptionalAuditText(
    continuity.lastVerificationCommand,
  );
  if (verificationCommand && normalizedRoot) {
    const process = extractCommandProcessName(verificationCommand);
    if (process) {
      const scopeKey = `bash:spawn:process:${process}`;
      return {
        cacheKey: `${normalizedRoot}|${scopeKey}`,
        scope: `bash/spawn/process(${process})`,
        source: "verification-command",
      };
    }
  }
  const cacheKey = normalizeOptionalAuditText(continuity.lastApprovalCacheKey);
  const scope = normalizeOptionalAuditText(continuity.lastApprovalScope);
  if (!cacheKey && !scope) {
    return undefined;
  }
  return {
    ...(cacheKey ? { cacheKey } : {}),
    ...(scope ? { scope } : {}),
    source: "last-approval",
  };
}

function buildScopeKeyFromPermissionRequest(
  toolName: string | undefined,
  operation: string | undefined,
  process: string | undefined,
  target: string | undefined,
): string | undefined {
  const normalizedTool = normalizeOptionalAuditText(toolName)?.toLowerCase();
  const normalizedOperation =
    normalizeOptionalAuditText(operation)?.toLowerCase();
  if (!normalizedTool || !normalizedOperation) {
    return undefined;
  }
  const normalizedProcess = normalizeOptionalAuditText(process)?.toLowerCase();
  if (normalizedProcess) {
    return `${normalizedTool}:${normalizedOperation}:process:${normalizedProcess}`;
  }
  const normalizedTarget = normalizeOptionalAuditText(target)?.toLowerCase();
  if (!normalizedTarget) {
    return undefined;
  }
  return `${normalizedTool}:${normalizedOperation}:target:${normalizedTarget}`;
}

export function deriveCurrentPermissionRequestFromToolInput(input: {
  toolName: string;
  operation: string;
  target: string | undefined;
  workspaceRoot: string;
  source: "verification-command" | "approval-request";
  lineageHint?: string;
}): CurrentPermissionRequest | undefined {
  const normalizedTarget = normalizeOptionalAuditText(input.target);
  if (!normalizedTarget) {
    return undefined;
  }
  const normalizedTool = normalizeOptionalAuditText(
    input.toolName,
  )?.toLowerCase();
  const normalizedOperation = normalizeOptionalAuditText(
    input.operation,
  )?.toLowerCase();
  if (!normalizedTool || !normalizedOperation) {
    return undefined;
  }
  const process =
    normalizedTool === "bash"
      ? extractCommandProcessName(normalizedTarget)
      : undefined;
  const scopeKey = process
    ? `${normalizedTool}:${normalizedOperation}:process:${process}`
    : `${normalizedTool}:${normalizedOperation}:target:${normalizedTarget.toLowerCase()}`;
  const scopeLabel = process
    ? `${normalizedTool}/${normalizedOperation}/process(${process})`
    : `${normalizedTool}/${normalizedOperation}/target(${normalizedTarget})`;
  const normalizedRoot = normalizeApprovalAuthorityRoot(input.workspaceRoot);
  if (!normalizedRoot) {
    return undefined;
  }
  return {
    toolName: normalizedTool,
    operation: normalizedOperation,
    target: normalizedTarget,
    ...(process ? { process } : {}),
    scopeKey,
    scopeLabel,
    cacheKey: `${normalizedRoot}|${scopeKey}`,
    projectRoot: normalizedRoot,
    source: input.source,
    ...(input.lineageHint ? { lineageHint: input.lineageHint } : {}),
  };
}

export function appendCurrentRequestScopeEvidence(
  evidence: string[],
  scope: CurrentPermissionRequest | undefined,
): void {
  if (!scope) {
    return;
  }
  evidence.push(`current-permission-request-tool:${scope.toolName}`);
  evidence.push(`current-permission-request-operation:${scope.operation}`);
  evidence.push(`current-permission-request-target:${scope.target}`);
  if (scope.process) {
    evidence.push(`current-permission-request-process:${scope.process}`);
  }
  evidence.push(`current-permission-request-scope-key:${scope.scopeKey}`);
  evidence.push(`current-permission-request-scope-label:${scope.scopeLabel}`);
  evidence.push(`current-permission-request-cache-key:${scope.cacheKey}`);
  evidence.push(`current-permission-request-project-root:${scope.projectRoot}`);
  evidence.push(`current-permission-request-source:${scope.source}`);
  if (scope.lineageHint) {
    evidence.push(`current-permission-request-lineage:${scope.lineageHint}`);
  }
  evidence.push(`current-request-scope-cache-key:${scope.cacheKey}`);
  evidence.push(`current-request-scope-label:${scope.scopeLabel}`);
  evidence.push(`current-request-scope-project-root:${scope.projectRoot}`);
  evidence.push(`current-request-scope-source:${scope.source}`);
}

function resolveEventsForScopedHint(
  events: readonly NormalizedApprovalAuthorityEvent[],
  hint: ScopedApprovalHint | undefined,
): readonly NormalizedApprovalAuthorityEvent[] {
  if (!hint) {
    return [];
  }
  if (hint.cacheKey) {
    const byCacheKey = events.filter(
      (event) => event.cacheKey === hint.cacheKey,
    );
    if (byCacheKey.length > 0) {
      return byCacheKey;
    }
  }
  if (hint.scope) {
    const byScope = events.filter((event) => event.scope === hint.scope);
    if (byScope.length > 0) {
      return byScope;
    }
  }
  return [];
}

function findScopeConflictingNewerEvent(input: {
  rootEvents: readonly NormalizedApprovalAuthorityEvent[];
  scopedEvents: readonly NormalizedApprovalAuthorityEvent[];
  active: NormalizedApprovalAuthorityEvent;
}): NormalizedApprovalAuthorityEvent | undefined {
  if (input.rootEvents.length === 0 || input.scopedEvents.length === 0) {
    return undefined;
  }
  const activeIndex = input.rootEvents.findIndex((event) =>
    isEquivalentApprovalAuthorityEvent(event, input.active),
  );
  if (activeIndex < 0) {
    return undefined;
  }
  for (
    let index = input.rootEvents.length - 1;
    index > activeIndex;
    index -= 1
  ) {
    const candidate = input.rootEvents[index];
    if (!candidate) {
      continue;
    }
    if (isEquivalentApprovalAuthorityEvent(candidate, input.active)) {
      continue;
    }
    return candidate;
  }
  return undefined;
}

function extractCommandProcessName(command: string): string | undefined {
  const trimmed = command.trim().toLowerCase();
  if (!trimmed) {
    return undefined;
  }
  const match = trimmed.match(/^\s*([^\s]+)/);
  const process = match?.[1]?.trim();
  return process && process.length > 0 ? process : undefined;
}

function resolveSubjectPermissionRequest(
  continuity: ContinuityStateLike,
): SubjectPermissionRequestResolution {
  const fromLastPermissionRequest =
    resolveSubjectFromLastPermissionRequest(continuity);
  if (fromLastPermissionRequest && !fromLastPermissionRequest.isPartial) {
    return fromLastPermissionRequest;
  }
  const fromHistory = resolveSubjectFromApprovalHistory(continuity);
  if (fromHistory) {
    const merged = mergeSubjectResolution(
      fromLastPermissionRequest,
      fromHistory,
      "approval-history",
    );
    if (merged) {
      return merged;
    }
  }
  const fromLastApproval = resolveSubjectFromLastApproval(continuity);
  if (fromLastApproval) {
    const merged = mergeSubjectResolution(
      fromLastPermissionRequest ?? fromHistory,
      fromLastApproval,
      "last-approval",
    );
    if (merged) {
      return merged;
    }
  }
  return (
    fromLastPermissionRequest ?? {
      isPartial: true,
      reconstructionSource: "unavailable",
    }
  );
}

function resolveSubjectFromLastPermissionRequest(
  continuity: ContinuityStateLike,
): SubjectPermissionRequestResolution | undefined {
  const tool = normalizeOptionalAuditText(
    continuity.lastPermissionRequestToolName,
  )?.toLowerCase();
  const operation = normalizeOptionalAuditText(
    continuity.lastPermissionRequestOperation,
  )?.toLowerCase();
  const target = normalizeOptionalAuditText(
    continuity.lastPermissionRequestTarget,
  );
  const process = normalizeOptionalAuditText(
    continuity.lastPermissionRequestProcess,
  )?.toLowerCase();
  const scope = normalizeOptionalAuditText(
    continuity.lastPermissionRequestScopeLabel,
  );
  const cacheKey = normalizeOptionalAuditText(
    continuity.lastPermissionRequestCacheKey,
  );
  const root = normalizeOptionalAuditText(
    continuity.lastPermissionRequestProjectRoot,
  );
  const hasAnySignal = Boolean(
    tool || operation || target || process || scope || cacheKey || root,
  );
  if (!hasAnySignal) {
    return undefined;
  }
  const inferred = inferRequestFromScope(scope, cacheKey);
  const normalizedProcess = tool === "bash" ? process : undefined;
  const derivedScopeFromFields = deriveScopeFromPermissionFields({
    tool,
    operation,
    target,
    process: normalizedProcess,
    root,
    cacheKey,
  });
  const hasScopeFieldConflict =
    Boolean(tool && operation && inferred.tool && inferred.operation) &&
    (tool !== inferred.tool || operation !== inferred.operation);
  const labelTool =
    tool ??
    (hasScopeFieldConflict ? derivedScopeFromFields.tool : inferred.tool);
  const labelOperation =
    operation ??
    (hasScopeFieldConflict
      ? derivedScopeFromFields.operation
      : inferred.operation);
  const labelProcess =
    normalizedProcess ??
    (hasScopeFieldConflict ? derivedScopeFromFields.process : inferred.process);
  const label =
    labelTool && labelOperation
      ? `${labelTool}/${labelOperation}${labelProcess ? `/process(${labelProcess})` : ""}`
      : undefined;
  const completedScope =
    hasScopeFieldConflict || !scope
      ? (derivedScopeFromFields.scope ?? scope ?? inferred.scope)
      : scope;
  const completedCacheKey =
    hasScopeFieldConflict || !cacheKey
      ? (derivedScopeFromFields.cacheKey ?? cacheKey ?? inferred.cacheKey)
      : cacheKey;
  const completedRoot = root ?? derivedScopeFromFields.root ?? inferred.root;
  const normalizedTargetState = normalizeSubjectTargetWithRoot({
    target,
    root: completedRoot,
  });
  const normalizedTarget = normalizedTargetState.target;
  const rebuiltFromNormalizedTarget =
    normalizedTarget && labelTool && labelOperation
      ? deriveScopeFromPermissionFields({
          tool: labelTool,
          operation: labelOperation,
          target: normalizedTarget,
          process: labelProcess,
          root: completedRoot,
          cacheKey: completedCacheKey,
        })
      : undefined;
  const finalScope = rebuiltFromNormalizedTarget?.scope ?? completedScope;
  const finalCacheKey =
    rebuiltFromNormalizedTarget?.cacheKey ?? completedCacheKey;
  const finalRoot = rebuiltFromNormalizedTarget?.root ?? completedRoot;
  const isPartial =
    !Boolean(label && finalScope && finalCacheKey && finalRoot) ||
    normalizedTargetState.partial;
  return {
    ...(label ? { label } : {}),
    ...(normalizedTarget ? { target: normalizedTarget } : {}),
    ...(finalScope ? { scope: finalScope } : {}),
    ...(finalCacheKey ? { cacheKey: finalCacheKey } : {}),
    ...(finalRoot ? { root: finalRoot } : {}),
    isPartial,
    reconstructionSource: "last-permission-request",
  };
}

function deriveScopeFromPermissionFields(input: {
  tool?: string;
  operation?: string;
  target?: string;
  process?: string;
  root?: string;
  cacheKey?: string;
}): {
  readonly tool?: string;
  readonly operation?: string;
  readonly process?: string;
  readonly scope?: string;
  readonly cacheKey?: string;
  readonly root?: string;
} {
  const tool = normalizeOptionalAuditText(input.tool)?.toLowerCase();
  const operation = normalizeOptionalAuditText(input.operation)?.toLowerCase();
  const target = normalizeOptionalAuditText(input.target);
  const process = normalizeOptionalAuditText(input.process)?.toLowerCase();
  const normalizedRoot = normalizeOptionalAuditText(input.root);
  const cacheKeyRoot =
    normalizeOptionalAuditText(input.cacheKey)?.split("|", 2)[0] ?? undefined;
  const root = normalizedRoot ?? cacheKeyRoot;
  if (!tool || !operation) {
    return {
      ...(root ? { root } : {}),
      ...(input.cacheKey ? { cacheKey: input.cacheKey } : {}),
    };
  }
  if (tool === "bash" && process) {
    const scopeKey = `${tool}:${operation}:process:${process}`;
    return {
      tool,
      operation,
      process,
      scope: `${tool}/${operation}/process(${process})`,
      ...(root ? { root } : {}),
      ...(root ? { cacheKey: `${root}|${scopeKey}` } : {}),
    };
  }
  if (target) {
    const normalizedTarget = target.toLowerCase();
    const scopeKey = `${tool}:${operation}:target:${normalizedTarget}`;
    return {
      tool,
      operation,
      scope: `${tool}/${operation}/target(${target})`,
      ...(root ? { root } : {}),
      ...(root ? { cacheKey: `${root}|${scopeKey}` } : {}),
    };
  }
  return {
    tool,
    operation,
    ...(root ? { root } : {}),
    ...(input.cacheKey ? { cacheKey: input.cacheKey } : {}),
  };
}

function resolveSubjectFromApprovalHistory(
  continuity: ContinuityStateLike,
): SubjectPermissionRequestResolution | undefined {
  const hasExplicitHistory =
    Array.isArray(continuity.lastApprovalHistory) &&
    continuity.lastApprovalHistory.length > 0;
  if (!hasExplicitHistory) {
    return undefined;
  }
  const events = collectApprovalAuthorityEvents(continuity);
  if (events.length === 0) {
    return undefined;
  }
  const activeRoot = normalizeApprovalAuthorityRoot(
    continuity.projectRoot ?? continuity.lastApprovalProjectRoot,
  );
  const rootScopedEvents =
    activeRoot === undefined
      ? events
      : events.filter((event) => {
          const eventRoot = normalizeApprovalAuthorityRoot(event.projectRoot);
          return eventRoot !== undefined && eventRoot === activeRoot;
        });
  const relevant = rootScopedEvents.length > 0 ? rootScopedEvents : events;
  const lastRecordedAt = normalizeOptionalAuditText(
    continuity.lastApprovalRecordedAt,
  );
  const latestByRecordedAt =
    lastRecordedAt !== undefined
      ? [...relevant]
          .reverse()
          .find(
            (event) =>
              normalizeOptionalAuditText(event.recordedAt) === lastRecordedAt &&
              event.decision === continuity.lastApprovalDecision,
          )
      : undefined;
  const latest = latestByRecordedAt ?? relevant[relevant.length - 1];
  if (!latest) {
    return undefined;
  }
  const inferred = inferRequestFromScope(latest.scope, latest.cacheKey);
  const label =
    inferred.tool && inferred.operation
      ? `${inferred.tool}/${inferred.operation}${inferred.process ? `/process(${inferred.process})` : ""}`
      : undefined;
  const scope = latest.scope ?? inferred.scope;
  const cacheKey = latest.cacheKey ?? inferred.cacheKey;
  const root = latest.projectRoot ?? inferred.root;
  const normalizedTargetState = normalizeSubjectTargetWithRoot({
    target: inferred.target,
    root,
  });
  const normalizedTarget = normalizedTargetState.target;
  const rebuiltFromNormalizedTarget =
    normalizedTarget && inferred.tool && inferred.operation
      ? deriveScopeFromPermissionFields({
          tool: inferred.tool,
          operation: inferred.operation,
          target: normalizedTarget,
          process: inferred.process,
          root,
          cacheKey,
        })
      : undefined;
  const finalScope = rebuiltFromNormalizedTarget?.scope ?? scope;
  const finalCacheKey = rebuiltFromNormalizedTarget?.cacheKey ?? cacheKey;
  const finalRoot = rebuiltFromNormalizedTarget?.root ?? root;
  if (!label && !finalScope && !finalCacheKey && !finalRoot) {
    return undefined;
  }
  return {
    ...(label ? { label } : {}),
    ...(normalizedTarget ? { target: normalizedTarget } : {}),
    ...(finalScope ? { scope: finalScope } : {}),
    ...(finalCacheKey ? { cacheKey: finalCacheKey } : {}),
    ...(finalRoot ? { root: finalRoot } : {}),
    isPartial: true || normalizedTargetState.partial,
    reconstructionSource: "approval-history",
  };
}

function resolveSubjectFromLastApproval(
  continuity: ContinuityStateLike,
): SubjectPermissionRequestResolution | undefined {
  const scope = normalizeOptionalAuditText(continuity.lastApprovalScope);
  const cacheKey = normalizeOptionalAuditText(continuity.lastApprovalCacheKey);
  const root = normalizeOptionalAuditText(
    continuity.lastApprovalProjectRoot ?? continuity.projectRoot,
  );
  if (!scope && !cacheKey && !root) {
    return undefined;
  }
  const inferred = inferRequestFromScope(scope, cacheKey);
  const label =
    inferred.tool && inferred.operation
      ? `${inferred.tool}/${inferred.operation}${inferred.process ? `/process(${inferred.process})` : ""}`
      : undefined;
  return {
    ...(label ? { label } : {}),
    ...((scope ?? inferred.scope) ? { scope: scope ?? inferred.scope! } : {}),
    ...((cacheKey ?? inferred.cacheKey)
      ? { cacheKey: cacheKey ?? inferred.cacheKey! }
      : {}),
    ...((root ?? inferred.root) ? { root: root ?? inferred.root! } : {}),
    isPartial: true,
    reconstructionSource: "last-approval",
  };
}

function mergeSubjectResolution(
  primary: SubjectPermissionRequestResolution | undefined,
  fallback: SubjectPermissionRequestResolution,
  source: SubjectPermissionRequestResolution["reconstructionSource"],
): SubjectPermissionRequestResolution | undefined {
  if (!primary) {
    return { ...fallback, reconstructionSource: source };
  }
  if (
    (source === "last-approval" || source === "approval-history") &&
    primary.label
  ) {
    return {
      ...primary,
      isPartial: true,
      reconstructionSource: primary.reconstructionSource,
    };
  }
  const merged = {
    label: primary.label ?? fallback.label,
    target: primary.target ?? fallback.target,
    scope: primary.scope ?? fallback.scope,
    cacheKey: primary.cacheKey ?? fallback.cacheKey,
    root: primary.root ?? fallback.root,
  };
  const hasAny = Boolean(
    merged.label ||
    merged.target ||
    merged.scope ||
    merged.cacheKey ||
    merged.root,
  );
  if (!hasAny) {
    return undefined;
  }
  const isStructurallyComplete = Boolean(
    merged.label && merged.scope && merged.cacheKey && merged.root,
  );
  const isPartial =
    primary.isPartial ||
    fallback.isPartial ||
    !isStructurallyComplete ||
    source === "approval-history" ||
    source === "last-approval";
  return {
    ...(merged.label ? { label: merged.label } : {}),
    ...(merged.target ? { target: merged.target } : {}),
    ...(merged.scope ? { scope: merged.scope } : {}),
    ...(merged.cacheKey ? { cacheKey: merged.cacheKey } : {}),
    ...(merged.root ? { root: merged.root } : {}),
    isPartial,
    reconstructionSource:
      source === "approval-history" || source === "last-approval"
        ? source
        : isPartial
          ? source
          : "last-permission-request",
  };
}

function inferRequestFromScope(
  scope: string | undefined,
  cacheKey: string | undefined,
): {
  readonly tool?: string;
  readonly operation?: string;
  readonly target?: string;
  readonly process?: string;
  readonly scope?: string;
  readonly cacheKey?: string;
  readonly root?: string;
} {
  const normalizedScope = normalizeOptionalAuditText(scope);
  const normalizedCacheKey = normalizeOptionalAuditText(cacheKey);
  const rootFromCacheKey =
    normalizedCacheKey && normalizedCacheKey.includes("|")
      ? normalizedCacheKey.slice(0, normalizedCacheKey.indexOf("|"))
      : undefined;
  if (!normalizedScope) {
    return {
      ...(normalizedCacheKey ? { cacheKey: normalizedCacheKey } : {}),
      ...(rootFromCacheKey ? { root: rootFromCacheKey } : {}),
    };
  }
  const processMatch = normalizedScope.match(
    /^([a-z0-9_-]+)\/([a-z0-9_-]+)\/process\((.+)\)$/i,
  );
  if (processMatch) {
    const tool = processMatch[1]?.trim().toLowerCase();
    const operation = processMatch[2]?.trim().toLowerCase();
    const process = processMatch[3]?.trim().toLowerCase();
    return {
      ...(tool ? { tool } : {}),
      ...(operation ? { operation } : {}),
      ...(process ? { process } : {}),
      scope: normalizedScope,
      ...(normalizedCacheKey ? { cacheKey: normalizedCacheKey } : {}),
      ...(rootFromCacheKey ? { root: rootFromCacheKey } : {}),
    };
  }
  const targetMatch = normalizedScope.match(
    /^([a-z0-9_-]+)\/([a-z0-9_-]+)\/target\((.+)\)$/i,
  );
  if (targetMatch) {
    const tool = targetMatch[1]?.trim().toLowerCase();
    const operation = targetMatch[2]?.trim().toLowerCase();
    const target = targetMatch[3]?.trim();
    return {
      ...(tool ? { tool } : {}),
      ...(operation ? { operation } : {}),
      ...(target ? { target } : {}),
      scope: normalizedScope,
      ...(normalizedCacheKey ? { cacheKey: normalizedCacheKey } : {}),
      ...(rootFromCacheKey ? { root: rootFromCacheKey } : {}),
    };
  }
  return {
    scope: normalizedScope,
    ...(normalizedCacheKey ? { cacheKey: normalizedCacheKey } : {}),
    ...(rootFromCacheKey ? { root: rootFromCacheKey } : {}),
  };
}

function normalizeSubjectTargetWithRoot(input: {
  target?: string;
  root?: string;
}): {
  readonly target?: string;
  readonly partial: boolean;
} {
  return normalizeSubjectTargetWithRootPath(input);
}

export function projectApprovalAuthority(
  continuity: ContinuityStateLike,
): ApprovalAuthorityResolution {
  return resolveActiveApprovalAuthority(continuity);
}

export function projectApprovalProvenance(
  continuity: ContinuityStateLike,
): SubjectPermissionRequestResolution {
  return resolveSubjectPermissionRequest(continuity);
}
