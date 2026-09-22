import { toUnixLines } from "../../runtime/execution/fileText.js";

export type FencedEditMappingSource =
  | "old-new-fenced-blocks"
  | "replace-directive-to-fence";

export type FencedEditPlanBlocker =
  | "missing-target"
  | "ambiguous-target"
  | "missing-mapping"
  | "unsupported-fuzzy"
  | "unsupported-discovery"
  | "unsupported-broad"
  | "unsupported-multi-file"
  | "unsupported-generated"
  | "unsupported-rollback"
  | "target-missing"
  | "mapping-not-found"
  | "multiple-matches"
  | "no-op"
  | "unsafe-patch-control-line";

export interface FencedEditMapping {
  readonly oldText: string;
  readonly newText: string;
  readonly source: FencedEditMappingSource;
}

export type FencedEditMappingResult =
  | {
      readonly ok: true;
      readonly mapping: FencedEditMapping;
      readonly evidence: readonly string[];
    }
  | {
      readonly ok: false;
      readonly blocker: Extract<
        FencedEditPlanBlocker,
        "missing-mapping" | "unsupported-fuzzy"
      >;
      readonly reason: string;
      readonly nextAction: string;
      readonly evidence: readonly string[];
    };

export type ExactFencedReplacementPlan =
  | {
      readonly ok: true;
      readonly targetPath: string;
      readonly rawPatchText: string;
      readonly matchCount: 1;
      readonly changedLines: number;
      readonly addedLines: number;
      readonly removedLines: number;
      readonly summary: string;
      readonly evidence: readonly string[];
    }
  | {
      readonly ok: false;
      readonly targetPath?: string;
      readonly blocker: FencedEditPlanBlocker;
      readonly matchCount: number;
      readonly reason: string;
      readonly nextAction: string;
      readonly summary: string;
      readonly evidence: readonly string[];
    };

export function parseExactFencedReplacementMapping(input: {
  readonly prompt: string;
  readonly replaceDirective?: { readonly from: string; readonly to: string };
}): FencedEditMappingResult {
  if (/\b(?:similar|approximately|roughly|fuzzy|closest|nearest)\b/i.test(input.prompt)) {
    return mappingStopped({
      blocker: "unsupported-fuzzy",
      reason: "Fuzzy fenced replacement is outside the exact replacement lane.",
      nextAction:
        "Provide exact old and new fenced blocks for one explicit target file.",
      evidence: ["fenced-edit-mapping:unsupported-fuzzy"],
    });
  }

  const fencedBlocks = extractFencedBlocks(input.prompt);
  if (fencedBlocks.length === 2) {
    return {
      ok: true,
      mapping: {
        oldText: fencedBlocks[0]!,
        newText: fencedBlocks[1]!,
        source: "old-new-fenced-blocks",
      },
      evidence: ["fenced-edit-mapping:old-new-fenced-blocks"],
    };
  }

  if (fencedBlocks.length === 1 && input.replaceDirective) {
    return {
      ok: true,
      mapping: {
        oldText: input.replaceDirective.from,
        newText: fencedBlocks[0]!,
        source: "replace-directive-to-fence",
      },
      evidence: ["fenced-edit-mapping:replace-directive-to-fence"],
    };
  }

  return mappingStopped({
    blocker: "missing-mapping",
    reason:
      "Exact fenced replacement requires either two fenced blocks or one replace directive plus one new fenced block.",
    nextAction:
      "Provide one old fenced block and one new fenced block, or an exact replace-from directive plus one fenced replacement block.",
    evidence: ["fenced-edit-mapping:missing-mapping"],
  });
}

export function planExactFencedReplacement(input: {
  readonly targetPath?: string;
  readonly originalContent: string | undefined;
  readonly mapping?: FencedEditMapping;
}): ExactFencedReplacementPlan {
  const targetPath = input.targetPath?.trim();
  if (!targetPath) {
    return stoppedPlan({
      blocker: "missing-target",
      matchCount: 0,
      reason: "Exact fenced replacement requires one explicit target file.",
      nextAction:
        "Retry with one explicit in-workspace target file and an exact fenced mapping.",
      evidence: ["fenced-edit-plan:missing-target"],
    });
  }

  if (looksLikeMultipleTargets(targetPath)) {
    return stoppedPlan({
      targetPath,
      blocker: "ambiguous-target",
      matchCount: 0,
      reason: "Exact fenced replacement accepts exactly one target file.",
      nextAction: "Split the request into one explicit target file per edit.",
      evidence: ["fenced-edit-plan:ambiguous-target"],
    });
  }

  if (!input.mapping || !input.mapping.oldText || input.mapping.newText === "") {
    return stoppedPlan({
      targetPath,
      blocker: "missing-mapping",
      matchCount: 0,
      reason: "Exact fenced replacement requires non-empty old and new mapping text.",
      nextAction:
        "Provide exact old text and exact new text for the selected target.",
      evidence: ["fenced-edit-plan:missing-mapping"],
    });
  }

  if (input.mapping.oldText === input.mapping.newText) {
    return stoppedPlan({
      targetPath,
      blocker: "no-op",
      matchCount: 1,
      reason: "Exact fenced replacement old and new text are identical.",
      nextAction: "Provide replacement text that changes the selected block.",
      evidence: ["fenced-edit-plan:no-op"],
    });
  }

  if (
    containsPatchControlLine(input.mapping.oldText) ||
    containsPatchControlLine(input.mapping.newText)
  ) {
    return stoppedPlan({
      targetPath,
      blocker: "unsafe-patch-control-line",
      matchCount: 0,
      reason:
        "Fenced replacement text contains apply_patch control lines that cannot be safely embedded in this narrow lane.",
      nextAction:
        "Use exact source text without apply_patch control markers, or use a dedicated patch route.",
      evidence: ["fenced-edit-plan:unsafe-patch-control-line"],
    });
  }

  if (typeof input.originalContent !== "string") {
    return stoppedPlan({
      targetPath,
      blocker: "target-missing",
      matchCount: 0,
      reason: "Target content was not readable before planning replacement.",
      nextAction: "Read the target file and retry with the current exact text.",
      evidence: ["fenced-edit-plan:target-missing"],
    });
  }

  const matchCount = countExactBlockMatches(
    input.originalContent,
    input.mapping.oldText,
  );
  if (matchCount === 0) {
    return stoppedPlan({
      targetPath,
      blocker: "mapping-not-found",
      matchCount,
      reason: "Exact old fenced block was not found in the target file.",
      nextAction:
        "Re-read the target file and retry with the exact current block.",
      evidence: ["fenced-edit-plan:mapping-not-found"],
    });
  }
  if (matchCount > 1) {
    return stoppedPlan({
      targetPath,
      blocker: "multiple-matches",
      matchCount,
      reason: `Exact old fenced block matched ${matchCount} regions in the target file.`,
      nextAction:
        "Provide a larger old fenced block that uniquely identifies one region.",
      evidence: ["fenced-edit-plan:multiple-matches"],
    });
  }

  return {
    ok: true,
    targetPath,
    rawPatchText: buildApplyPatchUpdate({
      targetPath,
      oldText: input.mapping.oldText,
      newText: input.mapping.newText,
    }),
    matchCount: 1,
    ...computeLineDelta(input.mapping.oldText, input.mapping.newText),
    summary: `Exact fenced replacement planned for ${safePathLabel(targetPath)}.`,
    evidence: [
      "fenced-edit-plan:exact-mapping-ready",
      `fenced-edit-plan:mapping-source:${input.mapping.source}`,
      "fenced-edit-plan:match-count:1",
      "fenced-edit-plan:raw-content-excluded",
    ],
  };
}

export function buildStoppedFencedReplacementPlan(input: {
  readonly targetPath?: string;
  readonly blocker: FencedEditPlanBlocker;
  readonly matchCount?: number;
  readonly reason: string;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}): Extract<ExactFencedReplacementPlan, { ok: false }> {
  return stoppedPlan({
    ...(input.targetPath ? { targetPath: input.targetPath } : {}),
    blocker: input.blocker,
    matchCount: input.matchCount ?? 0,
    reason: input.reason,
    nextAction: input.nextAction,
    evidence: input.evidence,
  });
}

function extractFencedBlocks(prompt: string): readonly string[] {
  const blocks: string[] = [];
  const matcher = /```(?:[\w.+-]+)?\n?([\s\S]*?)```/g;
  for (const match of prompt.matchAll(matcher)) {
    const block = match[1]?.trim();
    if (block) {
      blocks.push(block);
    }
  }
  return blocks;
}

function buildApplyPatchUpdate(input: {
  readonly targetPath: string;
  readonly oldText: string;
  readonly newText: string;
}): string {
  return [
    "*** Begin Patch",
    `*** Update File: ${input.targetPath}`,
    "@@",
    ...splitPatchLines(input.oldText).map((line) => `-${line}`),
    ...splitPatchLines(input.newText).map((line) => `+${line}`),
    "*** End Patch",
  ].join("\n");
}

function splitPatchLines(value: string): readonly string[] {
  const lines = toUnixLines(value).split("\n");
  return lines.at(-1) === "" ? lines.slice(0, -1) : lines;
}

function countExactBlockMatches(content: string, block: string): number {
  const haystack = splitPatchLines(content);
  const needle = splitPatchLines(block);
  if (needle.length === 0 || needle.length > haystack.length) {
    return 0;
  }

  let count = 0;
  for (let index = 0; index <= haystack.length - needle.length; index += 1) {
    let found = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[index + offset] !== needle[offset]) {
        found = false;
        break;
      }
    }
    if (found) {
      count += 1;
    }
  }
  return count;
}

function computeLineDelta(
  previous: string,
  next: string,
): { changedLines: number; addedLines: number; removedLines: number } {
  const previousLines = splitPatchLines(previous);
  const nextLines = splitPatchLines(next);
  return {
    changedLines: Math.max(previousLines.length, nextLines.length),
    addedLines: Math.max(0, nextLines.length - previousLines.length),
    removedLines: Math.max(0, previousLines.length - nextLines.length),
  };
}

function containsPatchControlLine(value: string): boolean {
  return splitPatchLines(value).some((line) => line.startsWith("***"));
}

function looksLikeMultipleTargets(targetPath: string): boolean {
  const pathLikeTokens =
    targetPath.match(
      /[A-Za-z]:[\\/][^\s"',;<>|?*]+|\.{1,2}[\\/][^\s"',;<>|?*]+|\/[^\s"',;<>|?*]+|[A-Za-z0-9_-]+(?:[\\/][A-Za-z0-9._-]+)*\.(?:test\.)?(?:spec\.)?(?:d\.)?(?:tsx|ts|jsx|js|py|go|rs|md|txt|json|yaml|yml|toml)/g,
    ) ?? [];
  const uniqueTargets = new Set(
    pathLikeTokens.map((token) => token.replace(/\\/g, "/").toLowerCase()),
  );
  return uniqueTargets.size > 1;
}

function stoppedPlan(input: {
  readonly targetPath?: string;
  readonly blocker: FencedEditPlanBlocker;
  readonly matchCount: number;
  readonly reason: string;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}): Extract<ExactFencedReplacementPlan, { ok: false }> {
  return {
    ok: false,
    ...(input.targetPath ? { targetPath: input.targetPath } : {}),
    blocker: input.blocker,
    matchCount: input.matchCount,
    reason: input.reason,
    nextAction: input.nextAction,
    summary: input.reason,
    evidence: [
      ...input.evidence,
      `fenced-edit-plan:blocker:${input.blocker}`,
      "fenced-edit-plan:mutation-not-run",
      "fenced-edit-plan:raw-content-excluded",
    ],
  };
}

function mappingStopped(input: {
  readonly blocker: Extract<
    FencedEditPlanBlocker,
    "missing-mapping" | "unsupported-fuzzy"
  >;
  readonly reason: string;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}): FencedEditMappingResult {
  return {
    ok: false,
    blocker: input.blocker,
    reason: input.reason,
    nextAction: input.nextAction,
    evidence: [
      ...input.evidence,
      `fenced-edit-mapping:blocker:${input.blocker}`,
      "fenced-edit-mapping:raw-content-excluded",
    ],
  };
}

function safePathLabel(targetPath: string): string {
  return targetPath.replace(/\\/g, "/").replace(/^\.\/+/g, "");
}
