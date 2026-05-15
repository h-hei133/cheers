import { routeScopedEditJournalRecoveryBlockers } from "./journalMetadataBoundary.js";

export type JournalDurableAuthorityKind =
  | "none"
  | "original-content-ledger"
  | "hash-only-ledger"
  | "snapshot-checkpoint"
  | "git-checkpoint"
  | "file-history";

export type JournalDurableAuthorityAvailability =
  | "absent"
  | "design-only"
  | "prototype-disabled"
  | "available";

export type JournalDurableAuthorityPersistence =
  | "none"
  | "memory-only"
  | "non-default"
  | "durable";

export interface JournalDurableAuthorityDescriptor {
  readonly authorityKind: JournalDurableAuthorityKind;
  readonly availability: JournalDurableAuthorityAvailability;
  readonly persistence: JournalDurableAuthorityPersistence;
  readonly canRecover: boolean;
  readonly canRollback: boolean;
  readonly canRestoreOriginalContent: boolean;
  readonly canVerifyCurrentContent: boolean;
  readonly blockers: readonly string[];
  readonly evidence: readonly string[];
  readonly requiredBeforeRecovery: readonly string[];
  readonly requiredBeforeRollback: readonly string[];
}

export interface JournalDurableAuthorityOption {
  readonly authorityKind: Exclude<JournalDurableAuthorityKind, "none">;
  readonly availability: Exclude<
    JournalDurableAuthorityAvailability,
    "absent" | "available"
  >;
  readonly persistence: Exclude<JournalDurableAuthorityPersistence, "none">;
  readonly canRecover: false;
  readonly canRollback: false;
  readonly canRestoreOriginalContent: false;
  readonly canVerifyCurrentContent: false;
  readonly evidence: readonly string[];
}

export const currentJournalDurableAuthority =
  buildCurrentJournalDurableAuthority();

export const futureJournalDurableAuthorityOptions: readonly JournalDurableAuthorityOption[] =
  [
    futureOption({
      authorityKind: "original-content-ledger",
      availability: "design-only",
      persistence: "non-default",
      evidence: [
        "journal-durable-authority-option:original-content-ledger:smallest-local-next-step",
        "journal-durable-authority-option:original-content-ledger:requires-storage-policy",
      ],
    }),
    futureOption({
      authorityKind: "hash-only-ledger",
      availability: "design-only",
      persistence: "non-default",
      evidence: [
        "journal-durable-authority-option:hash-only-ledger:can-check-content",
        "journal-durable-authority-option:hash-only-ledger:cannot-restore-content",
      ],
    }),
    futureOption({
      authorityKind: "snapshot-checkpoint",
      availability: "design-only",
      persistence: "durable",
      evidence: [
        "journal-durable-authority-option:snapshot-checkpoint:stronger-restore-semantics",
        "journal-durable-authority-option:snapshot-checkpoint:larger-lifecycle-scope",
      ],
    }),
    futureOption({
      authorityKind: "git-checkpoint",
      availability: "design-only",
      persistence: "durable",
      evidence: [
        "journal-durable-authority-option:git-checkpoint:reference-pattern",
        "journal-durable-authority-option:git-checkpoint:requires-repo-and-cleanup-policy",
      ],
    }),
    futureOption({
      authorityKind: "file-history",
      availability: "design-only",
      persistence: "durable",
      evidence: [
        "journal-durable-authority-option:file-history:reference-pattern",
        "journal-durable-authority-option:file-history:requires-session-lifecycle",
      ],
    }),
  ];

export function buildCurrentJournalDurableAuthority(): JournalDurableAuthorityDescriptor {
  return {
    authorityKind: "none",
    availability: "absent",
    persistence: "none",
    canRecover: false,
    canRollback: false,
    canRestoreOriginalContent: false,
    canVerifyCurrentContent: false,
    blockers: [
      ...routeScopedEditJournalRecoveryBlockers,
      "no-durable-authority",
      "no-current-content-inspection",
    ],
    evidence: [
      "journal-durable-authority:current:none",
      "journal-durable-authority:availability:absent",
      "journal-durable-authority:persistence:none",
      "journal-durable-authority:no-file-io",
      "journal-durable-authority:no-git",
      "journal-durable-authority:no-snapshot",
    ],
    requiredBeforeRecovery: [
      "durable original-content or snapshot authority",
      "current-content inspection before restore",
      "workspace authority for restore target",
      "non-default storage lifecycle and cleanup policy",
      "recovery executor boundary",
    ],
    requiredBeforeRollback: [
      "atomic rollback authority or durable snapshot",
      "rollback executor boundary",
      "user/session-visible rollback semantics",
    ],
  };
}

export function buildCapturedOriginalContentLedgerAuthority(): JournalDurableAuthorityDescriptor {
  return {
    authorityKind: "original-content-ledger",
    availability: "available",
    persistence: "non-default",
    canRecover: false,
    canRollback: false,
    canRestoreOriginalContent: true,
    canVerifyCurrentContent: true,
    blockers: ["no-automatic-recovery-executor", "no-atomicity-authority"],
    evidence: [
      "journal-durable-authority:original-content-ledger:captured",
      "journal-durable-authority:persistence:non-default",
      "journal-durable-authority:explicit-restore-primitive-required",
      "journal-durable-authority:no-automatic-recovery",
      "journal-durable-authority:no-rollback",
    ],
    requiredBeforeRecovery: [
      "explicit restore primitive invocation",
      "current-content guard must pass",
      "workspace authority for restore target",
    ],
    requiredBeforeRollback: [
      "atomic rollback authority or durable snapshot",
      "rollback executor boundary",
      "user/session-visible rollback semantics",
    ],
  };
}

function futureOption(
  input: Pick<
    JournalDurableAuthorityOption,
    "authorityKind" | "availability" | "persistence" | "evidence"
  >,
): JournalDurableAuthorityOption {
  return {
    authorityKind: input.authorityKind,
    availability: input.availability,
    persistence: input.persistence,
    canRecover: false,
    canRollback: false,
    canRestoreOriginalContent: false,
    canVerifyCurrentContent: false,
    evidence: input.evidence,
  };
}
