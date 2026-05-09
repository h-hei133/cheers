import path from "node:path";
import type {
  ParsedPatch,
  PatchFailure,
  PatchFileOperation,
} from "../patchParsing/types.js";

export type AddFileNoWriteBlockedReason =
  | "add-file-not-enabled"
  | "add-file-target-exists"
  | "add-file-parent-missing"
  | "add-file-outside-workspace"
  | "multi-file-add-not-enabled";

export interface AddFileNoWriteClassification {
  readonly capability: "create-file-candidate-only";
  readonly operation: "add";
  readonly tier: "backlog";
  readonly classificationMode: "synthetic-no-write";
  readonly targetPath?: string;
  readonly wouldCreateFiles: readonly string[];
  readonly blockedReason: AddFileNoWriteBlockedReason;
  readonly expectedCapability: "selected-workspace single-file add/create";
  readonly currentSupportedCapability: "existing-file single-file update only";
  readonly drivesApplyPatchExpansion: false;
  readonly willWrite: false;
  readonly writerReachable: false;
  readonly changedFiles: readonly [];
  readonly writeIntents: readonly [];
  readonly explanation: string;
  readonly nextAction: string;
}

export function classifyAddFileNoWrite(
  patch: ParsedPatch,
  options: {
    readonly workspaceRoot: string;
    readonly readFile: (absolutePath: string) => string | undefined;
    readonly directoryExists?: (absolutePath: string) => boolean;
  },
): AddFileNoWriteClassification | undefined {
  const addOperations = patch.operations.filter(isAddOperation);
  if (addOperations.length === 0) {
    return undefined;
  }

  const wouldCreateFiles = addOperations.map((operation) => operation.path);
  if (patch.operations.length !== 1 || addOperations.length !== 1) {
    return buildAddFileClassification({
      blockedReason: "multi-file-add-not-enabled",
      wouldCreateFiles,
      explanation:
        "Add File appears in a multi-file patch, but create/add classification is no-write and single-file only.",
      nextAction:
        "Reduce the patch to one selected-workspace Add File target for classification; keep multi-file mutation disabled.",
    });
  }

  const operation = addOperations[0];
  if (!operation) {
    return undefined;
  }

  const resolved = resolveWorkspacePath(options.workspaceRoot, operation.path);
  if (resolved.ok === false) {
    return buildAddFileClassification({
      targetPath: operation.path,
      blockedReason: "add-file-outside-workspace",
      wouldCreateFiles: [operation.path],
      explanation: "Add File target resolves outside the selected workspace.",
      nextAction:
        "Regenerate the Add File patch with a path inside the selected workspace; no writer is reachable for this patch.",
    });
  }

  if (options.readFile(resolved.absolutePath) !== undefined) {
    return buildAddFileClassification({
      targetPath: operation.path,
      blockedReason: "add-file-target-exists",
      wouldCreateFiles: [operation.path],
      explanation:
        "Add File target already exists, so it cannot be treated as a create operation.",
      nextAction:
        "Use a single-file Update File patch for existing files; create/add writing remains disabled.",
    });
  }

  if (options.directoryExists?.(path.dirname(resolved.absolutePath)) === false) {
    return buildAddFileClassification({
      targetPath: operation.path,
      blockedReason: "add-file-parent-missing",
      wouldCreateFiles: [operation.path],
      explanation:
        "Add File target parent directory is missing, and creating directories is not enabled.",
      nextAction:
        "Create parent directories through a separate approved capability before considering an add-file write route.",
    });
  }

  return buildAddFileClassification({
    targetPath: operation.path,
    blockedReason: "add-file-not-enabled",
    wouldCreateFiles: [operation.path],
    explanation:
      "Add File patch is recognized as a selected-workspace single-file create candidate, but create/add writing is not enabled.",
    nextAction:
      "Keep this no-write classification as candidate/backlog evidence; only existing-file single-file updates are currently supported.",
  });
}

export function patchFailureFromAddClassification(
  classification: AddFileNoWriteClassification,
): PatchFailure {
  return withOptionalPath({
    code: failureCodeForAddClassification(classification),
    path: classification.targetPath,
    message: classification.explanation,
    nextAction: classification.nextAction,
  });
}

function isAddOperation(
  operation: PatchFileOperation,
): operation is Extract<PatchFileOperation, { kind: "add" }> {
  return operation.kind === "add";
}

function buildAddFileClassification(input: {
  readonly targetPath?: string;
  readonly wouldCreateFiles: readonly string[];
  readonly blockedReason: AddFileNoWriteBlockedReason;
  readonly explanation: string;
  readonly nextAction: string;
}): AddFileNoWriteClassification {
  return {
    capability: "create-file-candidate-only",
    operation: "add",
    tier: "backlog",
    classificationMode: "synthetic-no-write",
    ...(input.targetPath ? { targetPath: input.targetPath } : {}),
    wouldCreateFiles: input.wouldCreateFiles,
    blockedReason: input.blockedReason,
    expectedCapability: "selected-workspace single-file add/create",
    currentSupportedCapability: "existing-file single-file update only",
    drivesApplyPatchExpansion: false,
    willWrite: false,
    writerReachable: false,
    changedFiles: [],
    writeIntents: [],
    explanation: input.explanation,
    nextAction: input.nextAction,
  };
}

function failureCodeForAddClassification(
  classification: AddFileNoWriteClassification,
): PatchFailure["code"] {
  switch (classification.blockedReason) {
    case "add-file-target-exists":
      return "patch-add-file-target-exists";
    case "add-file-parent-missing":
      return "patch-add-file-parent-missing";
    case "add-file-outside-workspace":
      return "patch-verify-path-outside-workspace";
    case "multi-file-add-not-enabled":
      return "patch-apply-plan-not-verified";
    case "add-file-not-enabled":
      return "patch-add-file-not-enabled";
  }
}

function withOptionalPath(input: {
  readonly code: PatchFailure["code"];
  readonly path?: string;
  readonly message: string;
  readonly nextAction: string;
}): PatchFailure {
  return {
    code: input.code,
    ...(input.path ? { path: input.path } : {}),
    message: input.message,
    nextAction: input.nextAction,
  };
}

type ResolvePathResult =
  | {
      readonly ok: true;
      readonly absolutePath: string;
    }
  | {
      readonly ok: false;
    };

function resolveWorkspacePath(
  workspaceRoot: string,
  patchPath: string,
): ResolvePathResult {
  const absoluteRoot = path.resolve(workspaceRoot);
  const absolutePath = path.resolve(absoluteRoot, patchPath);
  const relative = path.relative(absoluteRoot, absolutePath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return { ok: false };
  }

  return {
    ok: true,
    absolutePath,
  };
}
