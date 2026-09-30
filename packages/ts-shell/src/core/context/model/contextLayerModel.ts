

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
