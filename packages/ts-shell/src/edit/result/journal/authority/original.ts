import type { RouteScopedEditJournalOperationKind } from "../model.js";

export type OriginalContentAuthorityStatus =
  | "missing"
  | "hash-only"
  | "content-authority-present"
  | "content-authority-stale"
  | "not-applicable";

export type OriginalContentCapturePhase =
  | "not-captured"
  | "pre-write"
  | "post-write"
  | "external";

export type OriginalContentPersistence =
  | "none"
  | "memory-only"
  | "non-default"
  | "durable";

export interface OriginalContentCaptureRequirement {
  readonly filePath: string;
  readonly operationKind: RouteScopedEditJournalOperationKind;
  readonly requiresOriginalContent: boolean;
  readonly requiresCurrentContentCheck: boolean;
  readonly requiresWorkspaceAuthority: boolean;
  readonly requiresPersistence: boolean;
  readonly reason: string;
}

export interface OriginalContentAuthorityRecord {
  readonly filePath: string;
  readonly operationKind: RouteScopedEditJournalOperationKind;
  readonly beforeContentHash?: string;
  readonly beforeContentAvailable: boolean;
  readonly expectedCurrentState?: "exists" | "absent" | "unknown";
  readonly expectedCurrentContentHash?: string;
  readonly capturedAtPhase: OriginalContentCapturePhase;
  readonly persistence: OriginalContentPersistence;
}

export interface RestoreEligibilityDiagnostic {
  readonly canAttemptRestore: boolean;
  readonly canAttemptExplicitRestore: boolean;
  readonly canRecoverAutomatically: false;
  readonly canRollbackAtomically: false;
  readonly blockers: readonly string[];
  readonly missing: readonly string[];
  readonly evidence: readonly string[];
}

export interface OriginalContentAuthorityProjection {
  readonly status: OriginalContentAuthorityStatus;
  readonly requirements: readonly OriginalContentCaptureRequirement[];
  readonly records: readonly OriginalContentAuthorityRecord[];
  readonly restoreEligibility: RestoreEligibilityDiagnostic;
  readonly evidence: readonly string[];
}
