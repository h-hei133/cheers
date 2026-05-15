import type {
  RouteScopedEditJournal,
  RouteScopedEditJournalOperationKind,
} from "./routeScopedEditJournal.js";

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
  readonly expectedCurrentContentHash?: string;
  readonly capturedAtPhase: OriginalContentCapturePhase;
  readonly persistence: OriginalContentPersistence;
}

export interface RestoreEligibilityDiagnostic {
  readonly canAttemptRestore: false;
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

  return {
    canAttemptRestore: false,
    blockers: [
      "no-original-content",
      "no-persistence-authority",
      "no-current-content-inspection",
      "no-recovery-executor",
    ],
    missing,
    evidence: [
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
        record.persistence === "durable",
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
  if (input.status === "missing") {
    missing.add("original-content-authority");
  }
  if (input.status === "hash-only") {
    missing.add("restorable-original-content");
  }
  if (input.requirements.some((requirement) => requirement.requiresPersistence)) {
    missing.add("durable-persistence");
  }
  if (
    input.requirements.some(
      (requirement) => requirement.requiresCurrentContentCheck,
    )
  ) {
    missing.add("current-content-inspection");
  }
  if (
    input.requirements.some(
      (requirement) => requirement.requiresWorkspaceAuthority,
    )
  ) {
    missing.add("restore-workspace-authority");
  }
  missing.add("recovery-executor");
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
