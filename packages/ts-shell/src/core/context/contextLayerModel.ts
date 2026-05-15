export type ContextLayerId =
  | "immediate-prompt"
  | "task-goal"
  | "project"
  | "route-history"
  | "edit-capability"
  | "mutation-evidence"
  | "recovery-restore"
  | "tool-availability"
  | "compact-summary"
  | "memory-candidate"
  | "sidebar-state"
  | "startup-warm";

export type ContextRetentionClass =
  | "current-turn-only"
  | "task-scoped"
  | "session-scoped"
  | "compact-survivor"
  | "project-scoped-candidate"
  | "user-memory-candidate"
  | "never-persist";

export type ContextSensitivity =
  | "public-summary"
  | "project-internal"
  | "secret-sensitive"
  | "raw-content-sensitive"
  | "execution-sensitive";

export type ContextPayloadKind =
  | "natural-language-summary"
  | "structured-evidence"
  | "capability-manifest"
  | "recovery-authority-reference"
  | "validation-evidence"
  | "tool-state"
  | "unknown";

export interface ContextLayerDefinition {
  readonly id: ContextLayerId;
  readonly retentionClass: ContextRetentionClass;
  readonly sensitivity: ContextSensitivity;
  readonly payloadKind: ContextPayloadKind;
  readonly compactSurvivable: boolean;
  readonly memoryCandidate: boolean;
  readonly sidebarCandidate: boolean;
  readonly startupWarmCandidate: boolean;
  readonly description: string;
}

export const CONTEXT_LAYER_DEFINITIONS: readonly ContextLayerDefinition[] = [
  layer("immediate-prompt", "current-turn-only", "project-internal", "natural-language-summary", false, false, false, false, "Current user prompt and direct turn inputs."),
  layer("task-goal", "task-scoped", "project-internal", "structured-evidence", true, false, true, false, "Current objective, explicit constraints, unresolved blockers, and next action."),
  layer("project", "compact-survivor", "project-internal", "structured-evidence", true, true, true, true, "Safe project root and stable project facts."),
  layer("route-history", "session-scoped", "project-internal", "structured-evidence", true, true, false, false, "Route ids, route status, and high-signal route decisions."),
  layer("edit-capability", "compact-survivor", "project-internal", "capability-manifest", true, true, true, true, "Route 73 edit closeout status, supported envelope, and blocked-by-design capabilities."),
  layer("mutation-evidence", "compact-survivor", "project-internal", "structured-evidence", true, false, true, false, "Planned, changed, failed, verified, and writer-state evidence."),
  layer("recovery-restore", "compact-survivor", "project-internal", "recovery-authority-reference", true, false, true, false, "Recovery availability and restore authority references without raw original content."),
  layer("tool-availability", "session-scoped", "execution-sensitive", "tool-state", true, false, true, false, "Known tool/MCP/skill availability supplied by the caller."),
  layer("compact-summary", "compact-survivor", "public-summary", "natural-language-summary", true, false, false, false, "Compact-safe natural-language summary."),
  layer("memory-candidate", "project-scoped-candidate", "project-internal", "structured-evidence", false, true, false, false, "Project-scoped facts that may become memory after a separate decision."),
  layer("sidebar-state", "current-turn-only", "public-summary", "structured-evidence", false, false, true, false, "UI-ready changed, failed, blocked, and restorable facts."),
  layer("startup-warm", "project-scoped-candidate", "project-internal", "structured-evidence", false, false, false, true, "Project facts that may seed a future warm-start cache."),
];

export function getContextLayerDefinition(
  id: ContextLayerId,
): ContextLayerDefinition {
  const definition = CONTEXT_LAYER_DEFINITIONS.find((item) => item.id === id);
  if (!definition) {
    throw new Error(`Unknown context layer id: ${id}`);
  }
  return definition;
}

export function isCompactSurvivorLayer(id: ContextLayerId): boolean {
  return getContextLayerDefinition(id).compactSurvivable;
}

export function isMemoryCandidateLayer(id: ContextLayerId): boolean {
  return getContextLayerDefinition(id).memoryCandidate;
}

export function isSidebarCandidateLayer(id: ContextLayerId): boolean {
  return getContextLayerDefinition(id).sidebarCandidate;
}

export function isStartupWarmCandidateLayer(id: ContextLayerId): boolean {
  return getContextLayerDefinition(id).startupWarmCandidate;
}

function layer(
  id: ContextLayerId,
  retentionClass: ContextRetentionClass,
  sensitivity: ContextSensitivity,
  payloadKind: ContextPayloadKind,
  compactSurvivable: boolean,
  memoryCandidate: boolean,
  sidebarCandidate: boolean,
  startupWarmCandidate: boolean,
  description: string,
): ContextLayerDefinition {
  return {
    id,
    retentionClass,
    sensitivity,
    payloadKind,
    compactSurvivable,
    memoryCandidate,
    sidebarCandidate,
    startupWarmCandidate,
    description,
  };
}
