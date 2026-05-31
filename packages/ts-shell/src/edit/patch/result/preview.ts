import type {
  PatchOperationKind,
  PatchPreviewFile,
  PatchPreviewResult,
  PatchVerificationResult,
  VerifiedPatchFileOperation,
} from "../../../orchestration/patchParsing/types.js";

export function buildPatchPreview(
  verification: PatchVerificationResult,
): PatchPreviewResult {
  if (verification.ok === false) {
    return {
      changedFiles: [],
      failedFiles: verification.failures,
      files: [],
      willWrite: false,
    };
  }

  const files = verification.plan.operations.map(toPreviewFile);
  return {
    changedFiles: files.map((file) => file.path),
    failedFiles: [],
    files,
    willWrite: false,
  };
}

function toPreviewFile(operation: VerifiedPatchFileOperation): PatchPreviewFile {
  const kind = operation.operation.kind;
  const path = previewPath(operation);

  return {
    path,
    kind,
    additions: operation.additions,
    deletions: operation.deletions,
    summary: `${summaryPrefix(kind)} ${path}`,
  };
}

function previewPath(operation: VerifiedPatchFileOperation): string {
  if (operation.operation.kind === "move") {
    return operation.operation.moveTo;
  }
  return operation.operation.path;
}

function summaryPrefix(kind: PatchOperationKind): string {
  switch (kind) {
    case "add":
      return "A";
    case "update":
      return "M";
    case "delete":
      return "D";
    case "move":
      return "R";
  }
}
