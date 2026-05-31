import type {
  RouteScopedEditJournal,
  RouteScopedEditJournalOperationKind,
} from "../../../orchestration/patchResult/routeScopedEditJournal.js";

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

export function projectOriginalContentAuthority(input: {
  readonly journal: RouteScopedEditJournal;
  readonly records?: readonly OriginalContentAuthorityRecord[];
}): OriginalContentAuthorityProjection {
  const records = input.records ?? [];
  const requirements = buildOriginalContentCaptureRequirements(input.journal);
  const status = deriveAuthorityStatus({ requirements, records });

  return {
    status,
    requirements,
    records: records.map((record) => ({ ...record })),
    restoreEligibility: projectRestoreEligibilityDiagnostic({
      requirements,
      records,
      status,
    }),
    evidence: [
      "journal-original-content-authority:projection-only",
      "journal-original-content-authority:no-file-read",
      "journal-original-content-authority:no-content-captured",
      "journal-original-content-authority:no-persistence",
      "journal-original-content-authority:no-restore-execution",
    ],
  };
}

export function buildOriginalContentCaptureRequirements(
  journal: RouteScopedEditJournal,
): readonly OriginalContentCaptureRequirement[] {
  return journal.operations.map((operation) => {
    const requiresOriginalContent = operationRequiresOriginalContent(
      operation.operationKind,
    );
    return {
      filePath: operation.targetPath,
      operationKind: operation.operationKind,
      requiresOriginalContent,
      requiresCurrentContentCheck: true,
      requiresWorkspaceAuthority: true,
      requiresPersistence: true,
      reason: requirementReason({
        operationKind: operation.operationKind,
        requiresOriginalContent,
      }),
    };
  });
}

export function projectRestoreEligibilityDiagnostic(input: {
  readonly requirements: readonly OriginalContentCaptureRequirement[];
  readonly records?: readonly OriginalContentAuthorityRecord[];
  readonly status?: OriginalContentAuthorityStatus;
}): RestoreEligibilityDiagnostic {
  const records = input.records ?? [];
  const missing = missingRestoreInputs({
    requirements: input.requirements,
    records,
    status: input.status ?? deriveAuthorityStatus({
      requirements: input.requirements,
      records,
    }),
  });
  const canAttemptExplicitRestore = missing.length === 0;

  return {
    canAttemptRestore: canAttemptExplicitRestore,
    canAttemptExplicitRestore,
    canRecoverAutomatically: false,
    canRollbackAtomically: false,
    blockers: canAttemptExplicitRestore
      ? ["no-automatic-recovery-executor", "no-atomicity-authority"]
      : [
          "no-original-content",
          "no-persistence-authority",
          "no-current-content-inspection",
          "no-recovery-executor",
        ],
    missing,
    evidence: canAttemptExplicitRestore
      ? [
          "journal-original-content-restore:can-attempt-explicit-restore",
          "journal-original-content-restore:current-content-guard-represented",
          "journal-original-content-restore:no-automatic-recovery",
          "journal-original-content-restore:no-rollback",
        ]
      : [
          "journal-original-content-restore:cannot-attempt",
          "journal-original-content-restore:no-file-io",
          "journal-original-content-restore:no-content-authority",
        ],
  };
}

function deriveAuthorityStatus(input: {
  readonly requirements: readonly OriginalContentCaptureRequirement[];
  readonly records: readonly OriginalContentAuthorityRecord[];
}): OriginalContentAuthorityStatus {
  const applicableRequirements = input.requirements.filter(
    (requirement) => requirement.requiresOriginalContent,
  );
  if (applicableRequirements.length === 0) {
    return "not-applicable";
  }
  if (input.records.length === 0) {
    return "missing";
  }
  if (
    input.records.some(
      (record) =>
        record.beforeContentAvailable &&
        record.capturedAtPhase === "pre-write" &&
        (record.persistence === "durable" || record.persistence === "non-default"),
    )
  ) {
    return "content-authority-present";
  }
  if (input.records.some((record) => record.beforeContentHash)) {
    return "hash-only";
  }
  return "missing";
}

function missingRestoreInputs(input: {
  readonly requirements: readonly OriginalContentCaptureRequirement[];
  readonly records: readonly OriginalContentAuthorityRecord[];
  readonly status: OriginalContentAuthorityStatus;
}): readonly string[] {
  const missing = new Set<string>();
  for (const requirement of input.requirements) {
    const record = input.records.find(
      (candidate) =>
        candidate.filePath === requirement.filePath &&
        candidate.operationKind === requirement.operationKind,
    );
    if (!record) {
      missing.add("original-content-authority");
      if (requirement.requiresOriginalContent) {
        missing.add("restorable-original-content");
      }
      if (requirement.requiresPersistence) {
        missing.add("durable-persistence");
      }
      if (requirement.requiresCurrentContentCheck) {
        missing.add("current-content-inspection");
      }
      if (requirement.requiresWorkspaceAuthority) {
        missing.add("restore-workspace-authority");
      }
      continue;
    }
    if (
      requirement.requiresOriginalContent &&
      !record.beforeContentAvailable
    ) {
      missing.add("restorable-original-content");
    }
    if (
      requirement.requiresPersistence &&
      record.persistence !== "durable" &&
      record.persistence !== "non-default"
    ) {
      missing.add("durable-persistence");
    }
    if (
      requirement.requiresCurrentContentCheck &&
      (record.expectedCurrentState === undefined ||
        record.expectedCurrentState === "unknown")
    ) {
      missing.add("current-content-inspection");
    }
    if (
      requirement.requiresCurrentContentCheck &&
      record.expectedCurrentState === "exists" &&
      !record.expectedCurrentContentHash
    ) {
      missing.add("current-content-hash");
    }
    if (requirement.requiresWorkspaceAuthority) {
      // The route-level restore primitive still has to validate workspace
      // authority at call time; captured records only make the guard possible.
    }
  }
  if (input.status === "hash-only") {
    missing.add("restorable-original-content");
  }
  if (input.records.length === 0) {
    missing.add("recovery-executor");
  }
  return [...missing];
}

function operationRequiresOriginalContent(
  operationKind: RouteScopedEditJournalOperationKind,
): boolean {
  return operationKind !== "create";
}

function requirementReason(input: {
  readonly operationKind: RouteScopedEditJournalOperationKind;
  readonly requiresOriginalContent: boolean;
}): string {
  if (!input.requiresOriginalContent) {
    return "create restore can remove a created target, but still requires current-content, workspace, and persistence authority";
  }
  return `${input.operationKind} restore requires durable pre-write original content authority before any future executor can attempt restoration`;
}
