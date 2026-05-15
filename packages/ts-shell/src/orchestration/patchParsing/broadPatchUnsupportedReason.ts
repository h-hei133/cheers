export type BroadPatchUnsupportedReason =
  | "not-broad-patch"
  | "unsupported-arbitrary-broad-patch"
  | "unsupported-fuzzy-patch"
  | "unsupported-binary-patch"
  | "unsupported-mode-change"
  | "unsupported-symlink-patch"
  | "unsupported-submodule-patch"
  | "unsupported-copy-patch"
  | "unsupported-directory-operation"
  | "unsupported-overwrite"
  | "unsupported-path-conflict"
  | "unsupported-rename-content-edit"
  | "unsupported-rename-with-content-edit"
  | "unsupported-malformed-diff"
  | "unsupported-ambiguous-hunk"
  | "unsupported-index-only-change"
  | "too-many-operations";

export interface BroadPatchUnsupportedReasonInfo {
  readonly reason: BroadPatchUnsupportedReason;
  readonly shortReason: string;
  readonly doNext: string;
  readonly evidenceTag: string;
  readonly safeNoWrite: true;
}

const REASON_INFO: Record<
  BroadPatchUnsupportedReason,
  Omit<BroadPatchUnsupportedReasonInfo, "reason" | "safeNoWrite">
> = {
  "not-broad-patch": {
    shortReason: "Patch is not a git-style broad diff.",
    doNext: "Use supported apply_patch markers or provide a git-style diff.",
    evidenceTag: "broad-patch-unsupported:not-broad-patch",
  },
  "unsupported-arbitrary-broad-patch": {
    shortReason: "Broad patch shape is outside the bounded safe subset.",
    doNext:
      "Split the patch into supported update/add/delete/move sections or marker-style patches.",
    evidenceTag: "broad-patch-unsupported:arbitrary-broad-patch",
  },
  "unsupported-fuzzy-patch": {
    shortReason: "Fuzzy patch application is not supported.",
    doNext: "Provide exact marker hunks with current file context.",
    evidenceTag: "broad-patch-unsupported:fuzzy-patch",
  },
  "unsupported-binary-patch": {
    shortReason: "Binary patch application is not supported.",
    doNext: "Use a separate approved binary-file capability.",
    evidenceTag: "broad-patch-unsupported:binary-patch",
  },
  "unsupported-mode-change": {
    shortReason: "Mode changes are not supported.",
    doNext: "Remove chmod/mode metadata from the patch.",
    evidenceTag: "broad-patch-unsupported:mode-change",
  },
  "unsupported-symlink-patch": {
    shortReason: "Symlink patch application is not supported.",
    doNext: "Use a separate approved symlink capability.",
    evidenceTag: "broad-patch-unsupported:symlink-patch",
  },
  "unsupported-submodule-patch": {
    shortReason: "Submodule patch application is not supported.",
    doNext: "Use a separate approved submodule workflow.",
    evidenceTag: "broad-patch-unsupported:submodule-patch",
  },
  "unsupported-copy-patch": {
    shortReason: "Copy metadata is not supported.",
    doNext: "Represent the change as explicit supported create/update operations.",
    evidenceTag: "broad-patch-unsupported:copy-patch",
  },
  "unsupported-directory-operation": {
    shortReason: "Directory operations are not supported.",
    doNext: "Target regular files only.",
    evidenceTag: "broad-patch-unsupported:directory-operation",
  },
  "unsupported-overwrite": {
    shortReason: "Overwrite/path-exists shape is not supported.",
    doNext: "Re-read the workspace and choose a non-existing create or move target.",
    evidenceTag: "broad-patch-unsupported:overwrite",
  },
  "unsupported-path-conflict": {
    shortReason: "Patch source/target paths conflict.",
    doNext: "Split the patch so each operation source and target is unambiguous.",
    evidenceTag: "broad-patch-unsupported:path-conflict",
  },
  "unsupported-rename-content-edit": {
    shortReason: "Path-changing update is not supported.",
    doNext: "Use rename metadata or split into supported move and update steps.",
    evidenceTag: "broad-patch-unsupported:rename-content-edit",
  },
  "unsupported-rename-with-content-edit": {
    shortReason: "Rename-with-content-edit requires safe move plus update handling.",
    doNext:
      "Keep the rename and target update within the bounded safe subset and operation cap.",
    evidenceTag: "broad-patch-unsupported:rename-with-content-edit",
  },
  "unsupported-malformed-diff": {
    shortReason: "Diff is malformed or incomplete.",
    doNext: "Regenerate the diff with file markers and exact hunk lines.",
    evidenceTag: "broad-patch-unsupported:malformed-diff",
  },
  "unsupported-ambiguous-hunk": {
    shortReason: "Hunk context is ambiguous or insufficient.",
    doNext: "Regenerate the patch with enough exact surrounding context.",
    evidenceTag: "broad-patch-unsupported:ambiguous-hunk",
  },
  "unsupported-index-only-change": {
    shortReason: "Index-only metadata changes are not supported.",
    doNext: "Remove metadata-only changes or use a dedicated capability.",
    evidenceTag: "broad-patch-unsupported:index-only-change",
  },
  "too-many-operations": {
    shortReason: "Patch exceeds the bounded operation cap.",
    doNext: "Split the patch so each batch has at most 32 operations.",
    evidenceTag: "broad-patch-unsupported:too-many-operations",
  },
};

export function broadPatchUnsupportedReasonInfo(
  reason: BroadPatchUnsupportedReason,
): BroadPatchUnsupportedReasonInfo {
  const info = REASON_INFO[reason];
  return {
    reason,
    safeNoWrite: true,
    ...info,
  };
}

export function broadPatchUnsupportedEvidence(
  reason: BroadPatchUnsupportedReason,
): string {
  return broadPatchUnsupportedReasonInfo(reason).evidenceTag;
}
