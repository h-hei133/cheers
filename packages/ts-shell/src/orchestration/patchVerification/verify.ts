import path from "node:path";
import type {
  ParsedPatch,
  PatchFailure,
  PatchFileOperation,
  PatchHunk,
  PatchOperationKind,
  PatchVerificationResult,
  VerifiedPatchFileOperation,
} from "../patchParsing/types.js";

export interface VerifyParsedPatchOptions {
  readonly workspaceRoot: string;
  readonly readFile: (absolutePath: string) => string | undefined;
  readonly supportedOperations?: readonly PatchOperationKind[];
}

export function verifyParsedPatch(
  patch: ParsedPatch,
  options: VerifyParsedPatchOptions,
): PatchVerificationResult {
  const supportedOperations = new Set(options.supportedOperations ?? ["update"]);
  const verified: VerifiedPatchFileOperation[] = [];
  const failures: PatchFailure[] = [];

  for (const operation of patch.operations) {
    const resolved = resolveWorkspacePath(
      options.workspaceRoot,
      operation.path,
    );
    if (resolved.ok === false) {
      failures.push(resolved.failure);
      continue;
    }

    if (!supportedOperations.has(operation.kind)) {
      failures.push({
        code: "patch-verify-operation-unsupported",
        path: operation.path,
        message: `Patch operation ${operation.kind} is not supported by this verification pass.`,
        nextAction:
          "Use the currently supported operation shape or keep this patch rejected until the capability is enabled.",
      });
      continue;
    }

    const result = verifyOperation(operation, resolved.absolutePath, options);
    if (result.ok === false) {
      failures.push(...result.failures);
    } else {
      verified.push(result.operation);
    }
  }

  if (failures.length > 0) {
    return {
      ok: false,
      failures,
      changedFiles: [],
    };
  }

  return {
    ok: true,
    plan: {
      parsedPatch: patch,
      operations: verified,
      atomicity: "verify-all-before-write",
    },
    warnings: [],
  };
}

type ResolvePathResult =
  | {
      readonly ok: true;
      readonly absolutePath: string;
    }
  | {
      readonly ok: false;
      readonly failure: PatchFailure;
    };

function resolveWorkspacePath(
  workspaceRoot: string,
  patchPath: string,
): ResolvePathResult {
  const absoluteRoot = path.resolve(workspaceRoot);
  const absolutePath = path.resolve(absoluteRoot, patchPath);
  const relative = path.relative(absoluteRoot, absolutePath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return {
      ok: false,
      failure: {
        code: "patch-verify-path-outside-workspace",
        path: patchPath,
        message: "Patch path resolves outside the workspace root.",
        nextAction:
          "Regenerate the patch with paths relative to the active workspace.",
      },
    };
  }

  return {
    ok: true,
    absolutePath,
  };
}

type VerifyOperationResult =
  | {
      readonly ok: true;
      readonly operation: VerifiedPatchFileOperation;
    }
  | {
      readonly ok: false;
      readonly failures: readonly PatchFailure[];
    };

function verifyOperation(
  operation: PatchFileOperation,
  absolutePath: string,
  options: VerifyParsedPatchOptions,
): VerifyOperationResult {
  switch (operation.kind) {
    case "add":
      return verifyAddOperation(operation, absolutePath, options);
    case "update":
      return verifyUpdateOperation(operation, absolutePath, options);
    case "delete":
      return verifyDeleteOperation(operation, absolutePath, options);
    case "move":
      return verifyMoveOperation(operation, absolutePath, options);
  }
}

function verifyAddOperation(
  operation: Extract<PatchFileOperation, { kind: "add" }>,
  absolutePath: string,
  options: VerifyParsedPatchOptions,
): VerifyOperationResult {
  const existing = options.readFile(absolutePath);
  if (existing !== undefined) {
    return {
      ok: false,
      failures: [
        {
          code: "patch-verify-file-already-exists",
          path: operation.path,
          message: "Patch add target already exists.",
          nextAction:
            "Regenerate the patch as an update, or choose a non-existing add target.",
        },
      ],
    };
  }

  return {
    ok: true,
    operation: {
      operation,
      plannedContent: operation.content,
      additions: countLines(operation.content),
      deletions: 0,
    },
  };
}

function verifyUpdateOperation(
  operation: Extract<PatchFileOperation, { kind: "update" }>,
  absolutePath: string,
  options: VerifyParsedPatchOptions,
): VerifyOperationResult {
  const originalContent = options.readFile(absolutePath);
  if (originalContent === undefined) {
    return missingFileFailure(operation.path);
  }

  return verifyHunks(operation, originalContent);
}

function verifyDeleteOperation(
  operation: Extract<PatchFileOperation, { kind: "delete" }>,
  absolutePath: string,
  options: VerifyParsedPatchOptions,
): VerifyOperationResult {
  const originalContent = options.readFile(absolutePath);
  if (originalContent === undefined) {
    return missingFileFailure(operation.path);
  }

  return {
    ok: true,
    operation: {
      operation,
      originalContent,
      plannedContent: "",
      additions: 0,
      deletions: countLines(originalContent),
    },
  };
}

function verifyMoveOperation(
  operation: Extract<PatchFileOperation, { kind: "move" }>,
  absolutePath: string,
  options: VerifyParsedPatchOptions,
): VerifyOperationResult {
  const target = resolveWorkspacePath(options.workspaceRoot, operation.moveTo);
  if (target.ok === false) {
    return { ok: false, failures: [target.failure] };
  }
  if (options.readFile(target.absolutePath) !== undefined) {
    return {
      ok: false,
      failures: [
        {
          code: "patch-verify-file-already-exists",
          path: operation.moveTo,
          message: "Patch move destination already exists.",
          nextAction:
            "Regenerate the patch with a non-existing move destination.",
        },
      ],
    };
  }

  const originalContent = options.readFile(absolutePath);
  if (originalContent === undefined) {
    return missingFileFailure(operation.path);
  }

  return verifyHunks(operation, originalContent);
}

function verifyHunks(
  operation: Extract<PatchFileOperation, { kind: "update" | "move" }>,
  originalContent: string,
): VerifyOperationResult {
  let plannedContent = originalContent;
  let additions = 0;
  let deletions = 0;

  for (const hunk of operation.hunks) {
    const replacement = computeHunkReplacement(plannedContent, hunk);
    if (replacement.ok === false) {
      return {
        ok: false,
        failures: [
          {
            ...replacement.failure,
            path: operation.path,
          },
        ],
      };
    }

    plannedContent = replacement.content;
    additions += replacement.additions;
    deletions += replacement.deletions;
  }

  return {
    ok: true,
    operation: {
      operation,
      originalContent,
      plannedContent,
      additions,
      deletions,
    },
  };
}

type HunkReplacementResult =
  | {
      readonly ok: true;
      readonly content: string;
      readonly additions: number;
      readonly deletions: number;
    }
  | {
      readonly ok: false;
      readonly failure: PatchFailure;
    };

function computeHunkReplacement(
  content: string,
  hunk: PatchHunk,
): HunkReplacementResult {
  const oldLines = hunk.lines
    .filter((line) => line.kind === "context" || line.kind === "remove")
    .map((line) => line.text);
  const newLines = hunk.lines
    .filter((line) => line.kind === "context" || line.kind === "add")
    .map((line) => line.text);

  if (oldLines.length === 0) {
    return {
      ok: false,
      failure: {
        code: "patch-verify-hunk-context-missing",
        message: "Patch hunk does not include any existing context to match.",
        nextAction:
          "Regenerate the patch with enough existing target lines for verification.",
      },
    };
  }

  const contentLines = splitContentLines(content);
  const matches = findLineSequenceMatches(contentLines, oldLines);
  if (matches.length === 0) {
    return {
      ok: false,
      failure: {
        code: "patch-verify-hunk-context-missing",
        message: "Patch hunk context was not found in the target content.",
        nextAction:
          "Re-read the target file and regenerate the patch from current content.",
      },
    };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      failure: {
        code: "patch-verify-hunk-context-ambiguous",
        message: "Patch hunk context matched multiple locations.",
        nextAction:
          "Regenerate the patch with more surrounding context for a unique match.",
      },
    };
  }

  const match = matches[0]!;
  const nextLines = [
    ...contentLines.slice(0, match),
    ...newLines,
    ...contentLines.slice(match + oldLines.length),
  ];

  return {
    ok: true,
    content: joinContentLines(nextLines, content.endsWith("\n")),
    additions: hunk.lines.filter((line) => line.kind === "add").length,
    deletions: hunk.lines.filter((line) => line.kind === "remove").length,
  };
}

function missingFileFailure(pathValue: string): VerifyOperationResult {
  return {
    ok: false,
    failures: [
      {
        code: "patch-verify-file-missing",
        path: pathValue,
        message: "Patch target file does not exist.",
        nextAction:
          "Re-read the workspace and regenerate the patch against an existing target.",
      },
    ],
  };
}

function splitContentLines(content: string): string[] {
  const lines = content.split("\n");
  if (lines.at(-1) === "") {
    return lines.slice(0, -1);
  }
  return lines;
}

function joinContentLines(lines: readonly string[], trailingNewline: boolean) {
  const content = lines.join("\n");
  return trailingNewline ? `${content}\n` : content;
}

function findLineSequenceMatches(
  haystack: readonly string[],
  needle: readonly string[],
): number[] {
  const matches: number[] = [];
  if (needle.length === 0 || needle.length > haystack.length) {
    return matches;
  }

  for (let index = 0; index <= haystack.length - needle.length; index += 1) {
    let found = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[index + offset] !== needle[offset]) {
        found = false;
        break;
      }
    }
    if (found) {
      matches.push(index);
    }
  }

  return matches;
}

function countLines(content: string): number {
  if (content.length === 0) {
    return 0;
  }
  return splitContentLines(content).length;
}
