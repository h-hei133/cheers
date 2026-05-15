import type {
  ParsedPatch,
  PatchFailureCode,
  PatchFileOperation,
  PatchHunk,
  PatchLineChange,
  PatchParseResult,
} from "./types.js";

const BEGIN_MARKER = "*** Begin Patch";
const END_MARKER = "*** End Patch";
const ADD_FILE_PREFIX = "*** Add File:";
const UPDATE_FILE_PREFIX = "*** Update File:";
const DELETE_FILE_PREFIX = "*** Delete File:";
const MOVE_TO_PREFIX = "*** Move to:";

export function parseApplyPatchText(rawText: string): PatchParseResult {
  const normalized = normalizePatchText(rawText);
  const lines = normalized.split("\n");

  const beginIndex = lines.findIndex((line) => line.trim() === BEGIN_MARKER);
  const endIndex = lines.findIndex((line) => line.trim() === END_MARKER);

  if (beginIndex === -1 || endIndex === -1 || beginIndex >= endIndex) {
    return parseFailure(
      rawText,
      "patch-parse-invalid-format",
      "Patch must contain *** Begin Patch and *** End Patch markers in order.",
      "Regenerate the patch with explicit begin/end markers.",
    );
  }

  const operations: PatchFileOperation[] = [];
  let index = beginIndex + 1;

  while (index < endIndex) {
    const line = lines[index] ?? "";
    if (line.trim() === "") {
      index += 1;
      continue;
    }

    if (line.startsWith(ADD_FILE_PREFIX)) {
      const parsed = parseAddOperation(lines, index, endIndex);
      if (parsed.ok === false) {
        return parsed.result(rawText);
      }
      operations.push(parsed.operation);
      index = parsed.nextIndex;
      continue;
    }

    if (line.startsWith(UPDATE_FILE_PREFIX)) {
      const parsed = parseUpdateOperation(lines, index, endIndex);
      if (parsed.ok === false) {
        return parsed.result(rawText);
      }
      operations.push(parsed.operation);
      index = parsed.nextIndex;
      continue;
    }

    if (line.startsWith(DELETE_FILE_PREFIX)) {
      const path = readDirectivePath(line, DELETE_FILE_PREFIX);
      if (!path) {
        return parseFailure(
          rawText,
          "patch-parse-invalid-format",
          "Delete file directive is missing a file path.",
          "Regenerate the patch with a path after *** Delete File:.",
        );
      }
      operations.push({ kind: "delete", path });
      index += 1;
      continue;
    }

    return parseFailure(
      rawText,
      "patch-parse-unsupported-operation",
      `Unsupported patch line: ${line}`,
      "Use only *** Add File, *** Update File, or *** Delete File directives.",
    );
  }

  if (operations.length === 0) {
    return parseFailure(
      rawText,
      "patch-parse-empty",
      "Patch did not contain any file operations.",
      "Regenerate the patch with at least one add, update, or delete operation.",
    );
  }

  return {
    ok: true,
    patch: {
      rawText,
      operations,
    },
  };
}

function normalizePatchText(rawText: string): string {
  return rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function readDirectivePath(line: string, prefix: string): string | undefined {
  const path = line.slice(prefix.length).trim();
  return path.length > 0 ? path : undefined;
}

type ParsedOperation<T extends PatchFileOperation> =
  | {
      readonly ok: true;
      readonly operation: T;
      readonly nextIndex: number;
    }
  | ParseFailureFactory;

type ParsedHunk =
  | {
      readonly ok: true;
      readonly hunk: PatchHunk;
      readonly nextIndex: number;
    }
  | ParseFailureFactory;

type ParseFailureFactory =
  | {
      readonly ok: false;
      readonly result: (rawText: string) => PatchParseResult;
    };

function parseAddOperation(
  lines: readonly string[],
  startIndex: number,
  endIndex: number,
): ParsedOperation<Extract<PatchFileOperation, { kind: "add" }>> {
  const path = readDirectivePath(lines[startIndex] ?? "", ADD_FILE_PREFIX);
  if (!path) {
    return operationFailure(
      "patch-parse-invalid-format",
      "Add file directive is missing a file path.",
      "Regenerate the patch with a path after *** Add File:.",
    );
  }

  const contentLines: string[] = [];
  let index = startIndex + 1;
  while (index < endIndex && !(lines[index] ?? "").startsWith("***")) {
    const line = lines[index] ?? "";
    if (!line.startsWith("+")) {
      return operationFailure(
        "patch-parse-invalid-format",
        `Add file content line must start with +: ${line}`,
        "Regenerate the add-file patch with every content line prefixed by +.",
      );
    }
    contentLines.push(line.slice(1));
    index += 1;
  }

  return {
    ok: true,
    operation: {
      kind: "add",
      path,
      content: contentLines.join("\n"),
    },
    nextIndex: index,
  };
}

function parseUpdateOperation(
  lines: readonly string[],
  startIndex: number,
  endIndex: number,
): ParsedOperation<
  Extract<PatchFileOperation, { kind: "update" | "move" }>
> {
  const path = readDirectivePath(lines[startIndex] ?? "", UPDATE_FILE_PREFIX);
  if (!path) {
    return operationFailure(
      "patch-parse-invalid-format",
      "Update file directive is missing a file path.",
      "Regenerate the patch with a path after *** Update File:.",
    );
  }

  let index = startIndex + 1;
  let moveTo: string | undefined;
  if ((lines[index] ?? "").startsWith(MOVE_TO_PREFIX)) {
    moveTo = readDirectivePath(lines[index] ?? "", MOVE_TO_PREFIX);
    if (!moveTo) {
      return operationFailure(
        "patch-parse-invalid-format",
        "Move directive is missing a destination path.",
        "Regenerate the patch with a path after *** Move to:.",
      );
    }
    index += 1;
  }

  const hunks: PatchHunk[] = [];
  while (index < endIndex && !(lines[index] ?? "").startsWith("***")) {
    const hunk = parseHunk(lines, index, endIndex);
    if (hunk.ok === false) {
      return {
        ok: false,
        result: hunk.result,
      };
    }
    hunks.push(hunk.hunk);
    index = hunk.nextIndex;
  }

  if (hunks.length === 0 && !moveTo) {
    return operationFailure(
      "patch-parse-invalid-format",
      "Update file operation did not contain any hunks.",
      "Regenerate the update patch with at least one @@ hunk.",
    );
  }

  if (moveTo) {
    return {
      ok: true,
      operation: {
        kind: "move",
        path,
        moveTo,
        hunks,
      },
      nextIndex: index,
    };
  }

  return {
    ok: true,
    operation: {
      kind: "update",
      path,
      hunks,
    },
    nextIndex: index,
  };
}

function parseHunk(
  lines: readonly string[],
  startIndex: number,
  endIndex: number,
): ParsedHunk {
  const header = lines[startIndex] ?? "";
  if (!header.startsWith("@@")) {
    return operationFailure(
      "patch-parse-invalid-format",
      `Update hunk must start with @@: ${header}`,
      "Regenerate the update patch with explicit @@ hunk markers.",
    );
  }

  const linesOut: PatchLineChange[] = [];
  let isEndOfFile = false;
  let index = startIndex + 1;
  while (
    index < endIndex &&
    !(lines[index] ?? "").startsWith("@@") &&
    !(lines[index] ?? "").startsWith("***")
  ) {
    const line = lines[index] ?? "";
    if (line === "*** End of File") {
      isEndOfFile = true;
      index += 1;
      break;
    }
    if (line.startsWith(" ")) {
      linesOut.push({ kind: "context", text: line.slice(1) });
    } else if (line.startsWith("+")) {
      linesOut.push({ kind: "add", text: line.slice(1) });
    } else if (line.startsWith("-")) {
      linesOut.push({ kind: "remove", text: line.slice(1) });
    } else {
      return operationFailure(
        "patch-parse-invalid-format",
        `Unsupported hunk line: ${line}`,
        "Regenerate the hunk with context, +, or - prefixed lines only.",
      );
    }
    index += 1;
  }

  if (linesOut.length === 0) {
    return operationFailure(
      "patch-parse-invalid-format",
      "Update hunk did not contain any line changes.",
      "Regenerate the hunk with at least one context, add, or remove line.",
    );
  }

  return {
    ok: true,
    hunk: {
      changeContext: header.slice(2).trim() || undefined,
      lines: linesOut,
      isEndOfFile: isEndOfFile || undefined,
    },
    nextIndex: index,
  };
}

function operationFailure(
  code: PatchFailureCode,
  message: string,
  nextAction: string,
): ParseFailureFactory {
  return {
    ok: false,
    result: (rawText: string) =>
      parseFailure(rawText, code, message, nextAction),
  };
}

function parseFailure(
  rawText: string,
  code: PatchFailureCode,
  message: string,
  nextAction: string,
): PatchParseResult {
  return {
    ok: false,
    rawText,
    failure: {
      code,
      message,
      nextAction,
    },
  };
}
