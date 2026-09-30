

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
