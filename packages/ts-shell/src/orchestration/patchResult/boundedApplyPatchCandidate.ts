import path from "node:path";
import { parseApplyPatchText } from "../patchParsing/parser.js";
import type { PatchFileOperation } from "../patchParsing/types.js";
import {
  MAX_BOUNDED_WRITE_OPERATIONS,
  isTooManyBoundedWriteOperations,
} from "./boundedWritePolicy.js";

export type BoundedApplyPatchCandidateStatus = "candidate" | "unsupported";

export type BoundedApplyPatchCandidateRejectionReason =
  | "unsupportedTooManyOperations"
  | "unsupportedBroadShape"
  | "unsupportedDestructiveShape"
  | "unsupportedPathConflict"
  | "unsupportedWorkspaceBoundary"
  | "unsupportedOverwrite"
  | "unsupportedDirectoryOperation"
  | "unsupportedFuzzyPatch";

export type BoundedApplyPatchCandidateOperationFamily =
  | "single"
  | "update-only"
  | "mixed"
  | "delete-only"
  | "move-only";

export type BoundedApplyPatchNormalizedOperationKind =
  | "update"
  | "create"
  | "delete"
  | "move";

export interface BoundedApplyPatchNormalizedOperation {
  readonly kind: BoundedApplyPatchNormalizedOperationKind;
  readonly sourcePath?: string;
  readonly targetPath: string;
}

export type BoundedApplyPatchCandidateProjection =
  | {
      readonly status: "candidate";
      readonly operationCount: number;
      readonly operationFamily: BoundedApplyPatchCandidateOperationFamily;
      readonly normalizedOperations: readonly BoundedApplyPatchNormalizedOperation[];
      readonly affectedPaths: readonly string[];
      readonly approvalPaths: readonly string[];
      readonly evidence: readonly string[];
    }
  | {
      readonly status: "unsupported";
      readonly operationCount: number;
      readonly normalizedOperations: readonly BoundedApplyPatchNormalizedOperation[];
      readonly affectedPaths: readonly string[];
      readonly approvalPaths: readonly string[];
      readonly rejectionReason: BoundedApplyPatchCandidateRejectionReason;
      readonly evidence: readonly string[];
    };

export interface BoundedApplyPatchCandidateOptions {
  readonly rawPatchText: string;
  readonly workspaceRoot?: string;
}

export function classifyBoundedApplyPatchCandidate(
  options: BoundedApplyPatchCandidateOptions,
): BoundedApplyPatchCandidateProjection {
  const parsed = parseApplyPatchText(options.rawPatchText);
  if (parsed.ok === false) {
    const broadShape = looksLikeUnifiedDiff(options.rawPatchText);
    return unsupported({
      operationCount: 0,
      normalizedOperations: [],
      rejectionReason: broadShape
        ? "unsupportedBroadShape"
        : "unsupportedFuzzyPatch",
      evidence: [
        "bounded-apply-patch-candidate:parse-blocked",
        broadShape
          ? "bounded-apply-patch-candidate:unified-diff-not-normalized"
          : "bounded-apply-patch-candidate:parser-supported-shape-required",
      ],
    });
  }

  const operations = parsed.patch.operations;
  const normalizedOperations = operations.map(normalizeOperation);
  const operationCount = operations.length;

  if (isTooManyBoundedWriteOperations(operationCount)) {
    return unsupported({
      operationCount,
      normalizedOperations,
      rejectionReason: "unsupportedTooManyOperations",
      evidence: [
        "bounded-apply-patch-candidate:too-many-operations",
        `bounded-apply-patch-candidate:max-${MAX_BOUNDED_WRITE_OPERATIONS}`,
      ],
    });
  }

  const directoryOperation = normalizedOperations.find(hasDirectoryPath);
  if (directoryOperation) {
    return unsupported({
      operationCount,
      normalizedOperations,
      rejectionReason: "unsupportedDirectoryOperation",
      evidence: [
        "bounded-apply-patch-candidate:directory-operation-blocked",
      ],
    });
  }

  const workspaceBoundaryFailure = options.workspaceRoot
    ? firstWorkspaceBoundaryFailure(options.workspaceRoot, normalizedOperations)
    : undefined;
  if (workspaceBoundaryFailure) {
    return unsupported({
      operationCount,
      normalizedOperations,
      rejectionReason: "unsupportedWorkspaceBoundary",
      evidence: [
        "bounded-apply-patch-candidate:workspace-boundary-blocked",
        `bounded-apply-patch-candidate:path:${workspaceBoundaryFailure}`,
      ],
    });
  }

  if (hasMoveWithContentEdit(operations)) {
    return unsupported({
      operationCount,
      normalizedOperations,
      rejectionReason: "unsupportedDestructiveShape",
      evidence: [
        "bounded-apply-patch-candidate:move-content-edit-blocked",
      ],
    });
  }

  if (hasPathConflict(normalizedOperations)) {
    return unsupported({
      operationCount,
      normalizedOperations,
      rejectionReason: "unsupportedPathConflict",
      evidence: [
        "bounded-apply-patch-candidate:path-conflict-blocked",
        "bounded-apply-patch-candidate:no-source-target-reuse",
      ],
    });
  }

  const operationFamily = operationFamilyFor(normalizedOperations);
  if (!operationFamily) {
    return unsupported({
      operationCount,
      normalizedOperations,
      rejectionReason: "unsupportedBroadShape",
      evidence: [
        "bounded-apply-patch-candidate:unsupported-operation-combination",
      ],
    });
  }

  return {
    status: "candidate",
    operationCount,
    operationFamily,
    normalizedOperations,
    affectedPaths: affectedPathsFor(normalizedOperations),
    approvalPaths: approvalPathsFor(normalizedOperations),
    evidence: [
      "bounded-apply-patch-candidate:parser-supported-shape",
      `bounded-apply-patch-candidate:operation-count:${operationCount}`,
      `bounded-apply-patch-candidate:family:${operationFamily}`,
      "bounded-apply-patch-candidate:routes-existing-small-n-writers",
      "bounded-apply-patch-candidate:no-broad-arbitrary-claim",
    ],
  };
}

function unsupported(input: {
  readonly operationCount: number;
  readonly normalizedOperations: readonly BoundedApplyPatchNormalizedOperation[];
  readonly rejectionReason: BoundedApplyPatchCandidateRejectionReason;
  readonly evidence: readonly string[];
}): BoundedApplyPatchCandidateProjection {
  return {
    status: "unsupported",
    operationCount: input.operationCount,
    normalizedOperations: input.normalizedOperations,
    affectedPaths: affectedPathsFor(input.normalizedOperations),
    approvalPaths: approvalPathsFor(input.normalizedOperations),
    rejectionReason: input.rejectionReason,
    evidence: [
      ...input.evidence,
      "bounded-apply-patch-candidate:no-write-authority",
      "bounded-apply-patch-candidate:no-recovery-execution",
    ],
  };
}

function normalizeOperation(
  operation: PatchFileOperation,
): BoundedApplyPatchNormalizedOperation {
  if (operation.kind === "add") {
    return { kind: "create", targetPath: operation.path };
  }
  if (operation.kind === "move") {
    return {
      kind: "move",
      sourcePath: operation.path,
      targetPath: operation.moveTo,
    };
  }
  return { kind: operation.kind, targetPath: operation.path };
}

function operationFamilyFor(
  operations: readonly BoundedApplyPatchNormalizedOperation[],
): BoundedApplyPatchCandidateOperationFamily | undefined {
  if (operations.length === 1) {
    return "single";
  }
  const kinds = new Set(operations.map((operation) => operation.kind));
  if (kinds.size === 1 && kinds.has("update")) {
    return "update-only";
  }
  if (kinds.size === 1 && kinds.has("delete")) {
    return "delete-only";
  }
  if (kinds.size === 1 && kinds.has("move")) {
    return "move-only";
  }
  return "mixed";
}

function hasMoveWithContentEdit(
  operations: readonly PatchFileOperation[],
): boolean {
  return operations.some((operation) => {
    if (operation.kind !== "move") {
      return false;
    }
    return operation.hunks.some((hunk) =>
      hunk.lines.some((line) => line.kind === "add" || line.kind === "remove"),
    );
  });
}

function hasDirectoryPath(
  operation: BoundedApplyPatchNormalizedOperation,
): boolean {
  return (
    operation.targetPath.endsWith("/") ||
    operation.targetPath.endsWith(path.sep) ||
    operation.sourcePath?.endsWith("/") === true ||
    operation.sourcePath?.endsWith(path.sep) === true
  );
}

function firstWorkspaceBoundaryFailure(
  workspaceRootInput: string,
  operations: readonly BoundedApplyPatchNormalizedOperation[],
): string | undefined {
  const workspaceRoot = path.resolve(workspaceRootInput);
  for (const operation of operations) {
    for (const relativePath of pathsForConflictCheck(operation)) {
      const absolutePath = path.resolve(workspaceRoot, relativePath);
      const relative = path.relative(workspaceRoot, absolutePath);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        return relativePath;
      }
    }
  }
  return undefined;
}

function hasPathConflict(
  operations: readonly BoundedApplyPatchNormalizedOperation[],
): boolean {
  const seen = new Set<string>();
  for (const operation of operations) {
    for (const relativePath of pathsForConflictCheck(operation)) {
      const key = normalizePathKey(relativePath);
      if (seen.has(key)) {
        return true;
      }
      seen.add(key);
    }
  }
  return false;
}

function pathsForConflictCheck(
  operation: BoundedApplyPatchNormalizedOperation,
): readonly string[] {
  return operation.sourcePath
    ? [operation.sourcePath, operation.targetPath]
    : [operation.targetPath];
}

function affectedPathsFor(
  operations: readonly BoundedApplyPatchNormalizedOperation[],
): readonly string[] {
  return unique(operations.flatMap(pathsForConflictCheck));
}

function approvalPathsFor(
  operations: readonly BoundedApplyPatchNormalizedOperation[],
): readonly string[] {
  return unique(operations.map((operation) => operation.targetPath));
}

function unique(paths: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of paths) {
    const key = normalizePathKey(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(item);
  }
  return output;
}

function normalizePathKey(relativePath: string): string {
  return path.normalize(relativePath).replaceAll("\\", "/");
}

function looksLikeUnifiedDiff(rawPatchText: string): boolean {
  return (
    rawPatchText.includes("diff --git ") ||
    rawPatchText.includes("\n--- ") ||
    rawPatchText.includes("\n+++ ")
  );
}
