export type PatchOperationKind = "add" | "update" | "delete" | "move";

export type PatchFailureCode =
  | "patch-add-file-not-enabled"
  | "patch-add-file-parent-missing"
  | "patch-add-file-target-exists"
  | "patch-parse-invalid-format"
  | "patch-parse-empty"
  | "patch-parse-unsupported-operation"
  | "patch-verify-path-outside-workspace"
  | "patch-verify-file-missing"
  | "patch-verify-file-already-exists"
  | "patch-verify-hunk-context-missing"
  | "patch-verify-hunk-context-ambiguous"
  | "patch-verify-operation-unsupported"
  | "patch-apply-plan-not-verified"
  | "patch-apply-write-failed"
  | "patch-no-partial-apply-blocked";

export type PatchLineChangeKind = "context" | "add" | "remove";

export interface PatchLineChange {
  readonly kind: PatchLineChangeKind;
  readonly text: string;
}

export interface PatchHunk {
  readonly oldStartLine?: number;
  readonly newStartLine?: number;
  readonly changeContext?: string;
  readonly lines: readonly PatchLineChange[];
  readonly isEndOfFile?: boolean;
}

export interface PatchAddFileOperation {
  readonly kind: "add";
  readonly path: string;
  readonly content: string;
}

export interface PatchUpdateFileOperation {
  readonly kind: "update";
  readonly path: string;
  readonly hunks: readonly PatchHunk[];
}

export interface PatchDeleteFileOperation {
  readonly kind: "delete";
  readonly path: string;
}

export interface PatchMoveFileOperation {
  readonly kind: "move";
  readonly path: string;
  readonly moveTo: string;
  readonly hunks: readonly PatchHunk[];
}

export type PatchFileOperation =
  | PatchAddFileOperation
  | PatchUpdateFileOperation
  | PatchDeleteFileOperation
  | PatchMoveFileOperation;

export interface ParsedPatch {
  readonly rawText: string;
  readonly operations: readonly PatchFileOperation[];
}

export interface PatchFailure {
  readonly code: PatchFailureCode;
  readonly path?: string;
  readonly message: string;
  readonly nextAction: string;
}

export interface VerifiedPatchFileOperation {
  readonly operation: PatchFileOperation;
  readonly originalContent?: string;
  readonly plannedContent?: string;
  readonly additions: number;
  readonly deletions: number;
}

export type PatchAtomicityStrategy =
  | "verify-all-before-write"
  | "staged-write"
  | "snapshot-rollback";

export interface PatchApplicationPlan {
  readonly parsedPatch: ParsedPatch;
  readonly operations: readonly VerifiedPatchFileOperation[];
  readonly atomicity: PatchAtomicityStrategy;
}

export type PatchVerificationResult =
  | {
      readonly ok: true;
      readonly plan: PatchApplicationPlan;
      readonly warnings: readonly PatchFailure[];
    }
  | {
      readonly ok: false;
      readonly failures: readonly PatchFailure[];
      readonly changedFiles: readonly [];
    };

export interface PatchPreviewFile {
  readonly path: string;
  readonly kind: PatchOperationKind;
  readonly additions: number;
  readonly deletions: number;
  readonly summary: string;
}

export interface PatchPreviewResult {
  readonly changedFiles: readonly string[];
  readonly failedFiles: readonly PatchFailure[];
  readonly files: readonly PatchPreviewFile[];
  readonly willWrite: false;
}

export type PatchParseResult =
  | {
      readonly ok: true;
      readonly patch: ParsedPatch;
    }
  | {
      readonly ok: false;
      readonly failure: PatchFailure;
      readonly rawText: string;
    };
