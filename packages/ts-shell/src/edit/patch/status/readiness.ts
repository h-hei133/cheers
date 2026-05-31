import type { NoPartialPatchApplicationContract } from "../../../orchestration/patchApplication/noPartialApply.js";
import type {
  PatchFailure,
  PatchPreviewFile,
  PatchPreviewResult,
  PatchVerificationResult,
} from "../../../orchestration/patchParsing/types.js";

export interface SingleFileUpdatePatchPermissionMetadata {
  readonly capability: "single-file-update-apply-patch-readiness";
  readonly operationKind: "update";
  readonly targetPath?: string;
  readonly previewSummary: readonly string[];
  readonly additions: number;
  readonly deletions: number;
  readonly singleFileOnly: true;
  readonly unsupportedOperations: readonly ["multi-file", "add", "delete", "move"];
  readonly willWrite: false;
}

export interface SingleFileUpdatePatchResultContract {
  readonly status: "ready" | "blocked";
  readonly changedFiles: readonly string[];
  readonly failedFiles: readonly PatchFailure[];
  readonly patches: readonly SingleFileUpdatePatchResultRecord[];
  readonly evidence: readonly string[];
  readonly nextAction: string;
}

export type SingleFileUpdatePatchResultRecord =
  | {
      readonly path: string;
      readonly operation: "update";
      readonly status: "previewed";
      readonly additions: number;
      readonly deletions: number;
    }
  | {
      readonly path?: string;
      readonly operation: "update";
      readonly status: "blocked";
      readonly failureCode: PatchFailure["code"];
      readonly reason: string;
    };

export interface SingleFileUpdatePatchReadinessContract {
  readonly ready: boolean;
  readonly permissionMetadata: SingleFileUpdatePatchPermissionMetadata;
  readonly result: SingleFileUpdatePatchResultContract;
  readonly noPartial: {
    readonly atomicity: "verify-all-before-write";
    readonly writeIntents: number;
    readonly blockedWrites: boolean;
  };
}

const unsupportedOperations = ["multi-file", "add", "delete", "move"] as const;

export function buildSingleFileUpdatePatchReadinessContract(input: {
  readonly verification: PatchVerificationResult;
  readonly preview: PatchPreviewResult;
  readonly applicationContract: NoPartialPatchApplicationContract;
}): SingleFileUpdatePatchReadinessContract {
  const unsupportedFailure = singleFileUpdateUnsupportedFailure(input.preview);
  const verificationFailures =
    input.verification.ok === false ? input.verification.failures : [];
  const contractFailures =
    input.applicationContract.ok === false ? input.applicationContract.failures : [];
  const failures = uniqueFailures([
    ...verificationFailures,
    ...contractFailures,
    ...(unsupportedFailure ? [unsupportedFailure] : []),
  ]);

  const target = singlePreviewFile(input.preview);
  const permissionMetadata = buildPermissionMetadata(target);

  if (failures.length > 0 || !target || input.applicationContract.ok === false) {
    return {
      ready: false,
      permissionMetadata,
      result: {
        status: "blocked",
        changedFiles: [],
        failedFiles: failures,
        patches: failures.map(toBlockedPatchRecord),
        evidence: [
          "apply-patch-readiness:blocked",
          "apply-patch-readiness:no-production-wiring",
          "apply-patch-readiness:no-write-intents",
        ],
        nextAction:
          failures[0]?.nextAction ??
          "Regenerate a single-file Update File patch with verified context before production wiring is considered.",
      },
      noPartial: {
        atomicity: "verify-all-before-write",
        writeIntents: 0,
        blockedWrites: true,
      },
    };
  }

  return {
    ready: true,
    permissionMetadata,
    result: {
      status: "ready",
      changedFiles: [target.path],
      failedFiles: [],
      patches: [
        {
          path: target.path,
          operation: "update",
          status: "previewed",
          additions: target.additions,
          deletions: target.deletions,
        },
      ],
      evidence: [
        "apply-patch-readiness:single-file-update",
        "apply-patch-readiness:preview-only",
        "apply-patch-readiness:verify-all-before-write",
        "apply-patch-readiness:no-production-wiring",
      ],
      nextAction:
        "Keep production apply_patch rejected until permission, stale-read, result mapping, and terminal surfaces are wired and validated.",
    },
    noPartial: {
      atomicity: input.applicationContract.atomicity,
      writeIntents: input.applicationContract.writeIntents.length,
      blockedWrites: false,
    },
  };
}

function buildPermissionMetadata(
  target: PatchPreviewFile | undefined,
): SingleFileUpdatePatchPermissionMetadata {
  return {
    capability: "single-file-update-apply-patch-readiness",
    operationKind: "update",
    targetPath: target?.path,
    previewSummary: target ? [target.summary] : [],
    additions: target?.additions ?? 0,
    deletions: target?.deletions ?? 0,
    singleFileOnly: true,
    unsupportedOperations,
    willWrite: false,
  };
}

function singlePreviewFile(preview: PatchPreviewResult): PatchPreviewFile | undefined {
  return preview.files.length === 1 ? preview.files[0] : undefined;
}

function singleFileUpdateUnsupportedFailure(
  preview: PatchPreviewResult,
): PatchFailure | undefined {
  if (preview.failedFiles.length > 0) {
    return undefined;
  }
  if (preview.files.length !== 1) {
    return {
      code: "patch-apply-plan-not-verified",
      message: "Readiness only accepts one single-file Update File preview.",
      nextAction: "Reduce the patch to one Update File operation for one target file.",
    };
  }
  const file = preview.files[0];
  if (!file || file.kind !== "update") {
    return {
      code: "patch-apply-plan-not-verified",
      path: file?.path,
      message: "Readiness only accepts Update File operations.",
      nextAction: "Keep add, delete, and move patches rejected for this route.",
    };
  }
  return undefined;
}

function toBlockedPatchRecord(
  failure: PatchFailure,
): SingleFileUpdatePatchResultRecord {
  return {
    path: failure.path,
    operation: "update",
    status: "blocked",
    failureCode: failure.code,
    reason: failure.message,
  };
}

function uniqueFailures(failures: readonly PatchFailure[]): readonly PatchFailure[] {
  const seen = new Set<string>();
  const unique: PatchFailure[] = [];
  for (const failure of failures) {
    const key = `${failure.code}\0${failure.path ?? ""}\0${failure.message}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(failure);
  }
  return unique;
}
