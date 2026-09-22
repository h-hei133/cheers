import type {
  EditCapabilityId,
  EditCapabilityReadinessStatus,
} from "./editCapabilityReadiness.js";
import { listEditCapabilityReadiness } from "./editCapabilityReadiness.js";

export interface EditCapabilityCloseoutManifestEntry {
  readonly id: EditCapabilityId;
  readonly status: EditCapabilityReadinessStatus;
  readonly evidence: readonly string[];
  readonly riskNotes: readonly string[];
  readonly blockedReason?: string;
  readonly recoveryRestoreDependency?: string;
}

export interface EditCapabilityCloseoutManifest {
  readonly route: "73";
  readonly status: "closeout-candidate";
  readonly generatedFrom: "editCapabilityReadiness";
  readonly defaultPersistence: "absent";
  readonly automaticRecovery: false;
  readonly atomicRollback: false;
  readonly arbitraryBroadApplyPatch: "blocked-by-design";
  readonly entries: readonly EditCapabilityCloseoutManifestEntry[];
}

export const EDIT_CAPABILITY_CLOSEOUT_MANIFEST: EditCapabilityCloseoutManifest = {
  route: "73",
  status: "closeout-candidate",
  generatedFrom: "editCapabilityReadiness",
  defaultPersistence: "absent",
  automaticRecovery: false,
  atomicRollback: false,
  arbitraryBroadApplyPatch: "blocked-by-design",
  entries: listEditCapabilityReadiness().map((readiness) => ({
    id: readiness.id,
    status: readiness.status,
    evidence: readiness.evidence,
    riskNotes: riskNotesFor(readiness.id),
    ...blockedReasonFor(readiness.id),
    ...recoveryRestoreDependencyFor(readiness.id),
  })),
};

function riskNotesFor(id: EditCapabilityId): readonly string[] {
  if (
    id === "recovery-authority-capture" ||
    id === "restore-preview" ||
    id === "restore-execute" ||
    id === "local-restore-command"
  ) {
    return [
      "non-default or explicit user action required",
      "does not execute automatically after write failure",
      "does not claim atomic rollback",
    ];
  }
  if (
    id === "arbitrary-broad-apply-patch" ||
    id === "fuzzy-patch" ||
    id === "binary-mode-symlink-submodule-copy" ||
    id === "directory-operations" ||
    id === "overwrite" ||
    id === "automatic-recovery" ||
    id === "atomic-rollback" ||
    id === "default-durable-persistence"
  ) {
    return [
      "blocked by current closeout boundary",
      "requires separate route before any implementation",
    ];
  }
  return [
    "bounded selected-workspace capability only",
    "does not imply arbitrary broad apply_patch readiness",
    "does not imply automatic recovery or atomic rollback",
  ];
}

function blockedReasonFor(
  id: EditCapabilityId,
): Pick<EditCapabilityCloseoutManifestEntry, "blockedReason"> {
  switch (id) {
    case "arbitrary-broad-apply-patch":
      return { blockedReason: "outside bounded parser and route envelope" };
    case "fuzzy-patch":
      return { blockedReason: "exact parser and verifier only" };
    case "binary-mode-symlink-submodule-copy":
      return { blockedReason: "unsupported metadata/destructive patch shape" };
    case "directory-operations":
      return { blockedReason: "workspace authority is file-scoped" };
    case "overwrite":
      return { blockedReason: "exclusive create/move target authority required" };
    case "automatic-recovery":
      return { blockedReason: "restore must be explicit" };
    case "atomic-rollback":
      return { blockedReason: "no transaction rollback executor" };
    case "default-durable-persistence":
      return { blockedReason: "no default SessionManager persistence wiring" };
    default:
      return {};
  }
}

function recoveryRestoreDependencyFor(
  id: EditCapabilityId,
): Pick<EditCapabilityCloseoutManifestEntry, "recoveryRestoreDependency"> {
  switch (id) {
    case "recovery-authority-capture":
      return { recoveryRestoreDependency: "explicit non-default ledger root" };
    case "restore-preview":
      return { recoveryRestoreDependency: "explicit ledger/workspace/record selection" };
    case "restore-execute":
    case "local-restore-command":
      return { recoveryRestoreDependency: "explicit restore command path" };
    default:
      return {};
  }
}
