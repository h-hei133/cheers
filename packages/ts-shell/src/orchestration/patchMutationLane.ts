export type SingleFileReplacePatchFailureCode =
  | "patch-target-missing"
  | "patch-from-not-found"
  | "patch-ambiguous";

export type SingleFileReplacePatchResult =
  | {
      readonly ok: true;
      readonly content: string;
      readonly changedLines: number;
      readonly addedLines: number;
      readonly removedLines: number;
      readonly matchedCount: 1;
    }
  | {
      readonly ok: false;
      readonly failureCode: SingleFileReplacePatchFailureCode;
      readonly failureReason: SingleFileReplacePatchFailureCode;
      readonly explanation: string;
      readonly reason: string;
      readonly matchedCount: number;
      readonly nextAction: string;
    };

export function formatPatchFailureReason(
  failure: Extract<SingleFileReplacePatchResult, { ok: false }>,
): string {
  return `${failure.failureReason}: ${failure.explanation} Next action: ${failure.nextAction}`;
}

export function applySingleFileReplacePatch(input: {
  readonly targetPath?: string;
  readonly originalContent: string | undefined;
  readonly replaceDirective: { from: string; to: string };
}): SingleFileReplacePatchResult {
  if (!input.targetPath || typeof input.originalContent !== "string") {
    return {
      ok: false,
      failureCode: "patch-target-missing",
      failureReason: "patch-target-missing",
      explanation:
        "Patch target is missing or was not readable before applying replace.",
      reason: "Patch target is missing or was not readable before applying replace.",
      matchedCount: 0,
      nextAction:
        "Read the target file and rerun with an explicit in-workspace target path.",
    };
  }

  const matchedCount = countExactOccurrences(
    input.originalContent,
    input.replaceDirective.from,
  );
  if (matchedCount === 0) {
    return {
      ok: false,
      failureCode: "patch-from-not-found",
      failureReason: "patch-from-not-found",
      explanation: "Patch source text was not found in the target file.",
      reason: "Patch source text was not found in the target file.",
      matchedCount,
      nextAction:
        "Re-read the target and rerun with the exact current text to replace.",
    };
  }

  if (matchedCount > 1) {
    return {
      ok: false,
      failureCode: "patch-ambiguous",
      failureReason: "patch-ambiguous",
      explanation: `Patch source text matched ${matchedCount} times in the target file.`,
      reason: `Patch source text matched ${matchedCount} times in the target file.`,
      matchedCount,
      nextAction:
        "Provide a more specific replaceFrom snippet that uniquely identifies the intended occurrence.",
    };
  }

  const updated = input.originalContent.replace(
    input.replaceDirective.from,
    input.replaceDirective.to,
  );
  return {
    ok: true,
    content: updated,
    matchedCount: 1,
    ...computeLineDelta(input.originalContent, updated),
  };
}

function countExactOccurrences(content: string, needle: string): number {
  if (needle.length === 0) {
    return 0;
  }

  let count = 0;
  let offset = 0;
  while (true) {
    const index = content.indexOf(needle, offset);
    if (index === -1) {
      return count;
    }
    count += 1;
    offset = index + needle.length;
  }
}

function computeLineDelta(
  previous: string,
  next: string,
): { changedLines: number; addedLines: number; removedLines: number } {
  const previousLines = previous.length > 0 ? previous.split("\n") : [];
  const nextLines = next.length > 0 ? next.split("\n") : [];
  const changedLines = Math.max(previousLines.length, nextLines.length);
  return {
    changedLines,
    addedLines: Math.max(0, nextLines.length - previousLines.length),
    removedLines: Math.max(0, previousLines.length - nextLines.length),
  };
}
