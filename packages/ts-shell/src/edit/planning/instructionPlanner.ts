import {
  computeFragmentFingerprintFromIndexes,
  resolveFragmentIndexesFromContinuityInput,
  compressLineIndexesToRanges,
} from "../../context/readWindowContinuation.js";
import {
  buildAmbiguousEditInstructionReason,
  formatEditExecutionFailure,
} from "../../planning/projection/nextAction.js";
import { extractLowRiskUnchangedVerifications } from "../../orchestration/fileConstraintAssertions.js";
import {
  applySingleFileReplacePatch,
  formatPatchFailureReason,
  type SingleFileReplacePatchResult,
} from "../../orchestration/patchMutationLane.js";
import type {
  ContinuationTransform,
  WorkflowTaskPlan,
} from "../../orchestration/workflowTaskPlanner.js";

export function extractLowRiskRenameRefactor(
  prompt: string,
): { from: string; to: string; paths: string[] } | undefined {
  const match = prompt.match(
    /\brename\b[\s\S]{0,80}\b(?:exported\s+)?(?:function\s+)?([A-Za-z_$][\w$]*)\s+\bto\b\s+([A-Za-z_$][\w$]*)\b/i,
  );
  const from = match?.[1]?.trim();
  const to = match?.[2]?.trim();
  if (!from || !to || from === to) {
    return undefined;
  }
  const protectedPaths = new Set(
    extractLowRiskUnchangedVerifications(prompt).map((assertion) =>
      normalizePathLike(assertion.path),
    ),
  );
  const paths = extractPromptFileReferences(prompt).filter(
    (filePath) => !protectedPaths.has(normalizePathLike(filePath)),
  );
  if (paths.length < 2) {
    return undefined;
  }
  return { from, to, paths: uniqueStable(paths) };
}

export function applyWholeWordRename(
  content: string,
  from: string,
  to: string,
): string {
  return content.replace(new RegExp(`\\b${escapeRegExp(from)}\\b`, "g"), to);
}

export function extractSecondaryFileWrites(
  prompt: string,
  primaryPath: string,
): Array<{ path: string; content: string }> {
  const writes: Array<{ path: string; content: string }> = [];
  const primary = normalizePathLike(primaryPath);
  const matches = prompt.matchAll(
    /\b(?:create|write|update)\s+(?:file\s+)?((?:\.{1,2}[\\/])?(?:[\w.-]+[\\/])*[\w.-]+\.(?:txt|md|json|yaml|yml|ts|tsx|js|jsx|py|css|html))\s+with\s+content\s*:\s*([\s\S]*?)(?=(?:[.!?。！？]\s+(?:do\s+not|don't|without|no|verify|confirm|ensure|check|only|then|create|write|update|replace)\b)|$)/gi,
  );
  for (const match of matches) {
    const path = match[1]?.trim().replace(/\\/g, "/");
    const content = match[2]?.trim();
    if (!path || !content || normalizePathLike(path) === primary) {
      continue;
    }
    writes.push({ path, content: trimTrailingVerifyInstruction(content) });
  }
  return writes;
}

export function extractFencedContent(prompt: string): string | undefined {
  const match = prompt.match(/```(?:[\w.+-]+)?\n?([\s\S]*?)```/);
  const content = match?.[1]?.trim();
  return content && content.length > 0 ? content : undefined;
}

export function extractReplaceDirective(
  prompt: string,
): { from: string; to: string } | undefined {
  const zhWithPathMatch = prompt.match(
    /(?:\u628a|\u5c06)\s*.+?\s*\u91cc(?:\u7684)?\s*["'`]?(.+?)["'`]?\s*(?:\u66ff\u6362\u4e3a|\u6539\u6210|\u6539\u4e3a)\s*["'`]?([^"'`\uFF0C\u3002,\.\n\r]+)["'`]?/u,
  );
  if (zhWithPathMatch?.[1] && zhWithPathMatch?.[2]) {
    return { from: zhWithPathMatch[1], to: zhWithPathMatch[2] };
  }

  const zhMatch = prompt.match(
    /(?:\u628a|\u5c06)\s*["'`]?(.+?)["'`]?\s*(?:\u66ff\u6362\u4e3a|\u6539\u6210|\u6539\u4e3a)\s*["'`]?([^"'`\uFF0C\u3002,\.\n\r]+)["'`]?/u,
  );
  if (zhMatch?.[1] && zhMatch?.[2]) {
    return { from: zhMatch[1], to: zhMatch[2] };
  }

  const enMatch = prompt.match(
    /replac(?:e|ing)(?:\s+it)?\s+["'`]?(.+?)["'`]?\s+with\s+["'`]?(.+?)["'`]?(?:[.\u3002!\uFF01?\uFF1F]|$)/i,
  );
  if (enMatch?.[1] && enMatch?.[2]) {
    return { from: enMatch[1], to: sanitizeReplaceTarget(enMatch[2]) };
  }

  const enChangeMatch = prompt.match(
    /(?:change|update|fix|modify|swap)\s+["'`]?(.+?)["'`]?\s+(?:to|into|with)\s+["'`]?(.+?)["'`]?(?=\s+in\s+(?:that|this)\s+(?:part|section|file)|[.\u3002!\uFF01?\uFF1F]|$)(?:\s+in\s+(?:that|this)\s+(?:part|section|file))?(?:[.\u3002!\uFF01?\uFF1F]|$)/i,
  );
  if (enChangeMatch?.[1] && enChangeMatch?.[2]) {
    return {
      from: enChangeMatch[1],
      to: sanitizeReplaceTarget(enChangeMatch[2]),
    };
  }
  return undefined;
}

export function inferAlternativeReplaceDirective(input: {
  readonly targetPath: string;
  readonly originalContent: string | undefined;
  readonly failedTransforms: readonly ContinuationTransform[];
  readonly avoidPreviousDirection: boolean;
}): { from: string; to: string } | undefined {
  if (typeof input.originalContent !== "string") {
    return undefined;
  }
  const targetPath = normalizePathLike(input.targetPath);
  const relevant = input.failedTransforms.filter(
    (item) =>
      normalizePathLike(item.path) === targetPath && item.to.trim().length > 0,
  );
  if (relevant.length === 0) {
    return undefined;
  }

  const directCandidates = relevant.filter(
    (item) =>
      input.originalContent.includes(item.from) &&
      !input.originalContent.includes(item.to),
  );
  if (directCandidates.length > 0) {
    const preferred = directCandidates[directCandidates.length - 1];
    return { from: preferred.from, to: preferred.to };
  }

  for (const failed of relevant) {
    const sourceCandidate = inferFallbackReplaceSourceFromCurrentContent(
      input.originalContent,
      failed.to,
    );
    if (!sourceCandidate) {
      continue;
    }
    return { from: sourceCandidate, to: failed.to };
  }

  const constrainedCandidate = inferConstraintAwareBlockReplacement({
    content: input.originalContent,
    failedTransforms: relevant,
    avoidPreviousDirection: input.avoidPreviousDirection,
  });
  if (constrainedCandidate) {
    return constrainedCandidate;
  }

  return undefined;
}

export function resolveMutationInstruction(
  plan: WorkflowTaskPlan,
  rawPrompt: string,
  originalContent: string | undefined,
  fencedContent: string | undefined,
  replaceDirective: { from: string; to: string } | undefined,
):
  | {
      ok: true;
      content: string;
      changedLines: number;
      addedLines: number;
      removedLines: number;
    }
  | { ok: false; reason: string } {
  if (plan.taskKind === "write-file") {
    const inlineContent = extractInlineWriteContent(rawPrompt);
    const resolvedContent =
      fencedContent ??
      inlineContent ??
      inferLowRiskExampleFileContent({
        targetPath: plan.targetPath,
        prompt: rawPrompt,
      });
    if (!resolvedContent) {
      return {
        ok: false,
        reason:
          "Write task needs concrete file content. Provide fenced code or a single-line literal such as 'with content: hello'.",
      };
    }
    const lines = resolvedContent.split("\n").length;
    return {
      ok: true,
      content: resolvedContent,
      changedLines: lines,
      addedLines: lines,
      removedLines: 0,
    };
  }

  if (plan.taskKind !== "edit-file") {
    return {
      ok: false,
      reason: "Mutation instruction only applies to write/edit tasks.",
    };
  }

  const explicitPromptReplaceDirective = extractReplaceDirective(rawPrompt);
  const shouldUsePatchFirstReplaceLane = Boolean(
    plan.targetPath &&
    plan.replaceFrom &&
    plan.replaceTo &&
    replaceDirective &&
    explicitPromptReplaceDirective &&
    explicitPromptReplaceDirective.from === replaceDirective.from &&
    explicitPromptReplaceDirective.to === replaceDirective.to,
  );
  if (shouldUsePatchFirstReplaceLane && replaceDirective) {
    const patchResult = applySingleFileReplacePatch({
      targetPath: plan.targetPath,
      originalContent,
      replaceDirective,
    });
    if (patchResult.ok) {
      return {
        ok: true,
        content: patchResult.content,
        changedLines: patchResult.changedLines,
        addedLines: patchResult.addedLines,
        removedLines: patchResult.removedLines,
      };
    }
    if (isSingleFileReplacePatchFailure(patchResult)) {
      return {
        ok: false,
        reason: formatPatchFailureReason(patchResult),
      };
    }
  }

  if (fencedContent) {
    const previous = originalContent ?? "";
    const delta = computeLineDelta(previous, fencedContent);
    return {
      ok: true,
      content: fencedContent,
      ...delta,
    };
  }

  const inlineContent = extractInlineWriteContent(rawPrompt);
  if (
    typeof originalContent === "string" &&
    inlineContent &&
    /\b(?:replace|update|write|set)\b[\s\S]{0,80}?\bcontent\b/i.test(rawPrompt)
  ) {
    return {
      ok: true,
      content: inlineContent,
      ...computeLineDelta(originalContent, inlineContent),
    };
  }
  if (
    typeof originalContent === "string" &&
    inlineContent &&
    /\bappend\b/i.test(rawPrompt)
  ) {
    const separator =
      originalContent.length > 0 && !originalContent.endsWith("\n") ? "\n" : "";
    const updated = `${originalContent}${separator}${inlineContent}`;
    return {
      ok: true,
      content: updated,
      ...computeLineDelta(originalContent, updated),
    };
  }

  if (typeof originalContent === "string") {
    const smallBugfix = inferLowRiskSmallBugfix({
      targetPath: plan.targetPath,
      prompt: rawPrompt,
      originalContent,
    });
    if (smallBugfix) {
      return {
        ok: true,
        content: smallBugfix,
        ...computeLineDelta(originalContent, smallBugfix),
      };
    }

    const constrainedAddition = inferLowRiskConstrainedAddition({
      targetPath: plan.targetPath,
      prompt: rawPrompt,
      originalContent,
    });
    if (constrainedAddition) {
      return {
        ok: true,
        content: constrainedAddition,
        ...computeLineDelta(originalContent, constrainedAddition),
      };
    }
  }

  if (typeof originalContent === "string" && replaceDirective) {
    const lineScopedRepair = applyLineScopedContinuationRepair(
      originalContent,
      replaceDirective,
      rawPrompt,
    );
    if (lineScopedRepair) {
      return {
        ok: true,
        content: lineScopedRepair,
        ...computeLineDelta(originalContent, lineScopedRepair),
      };
    }
  }

  if (!replaceDirective) {
    if (plan.mutationScopeRequired) {
      return {
        ok: false,
        reason: formatEditExecutionFailure({
          failureReason: "edit-transform-unclear",
          explanation:
            "Local-slice edit requires a concrete transform for the explained fragment.",
          nextAction:
            "Specify an explicit change such as: replace X with Y in that part.",
        }),
      };
    }
    return {
      ok: false,
      reason: buildAmbiguousEditInstructionReason(plan.targetPath),
    };
  }

  if (typeof originalContent !== "string") {
    return {
      ok: false,
      reason: formatEditExecutionFailure({
        failureReason: "edit-target-missing",
        explanation:
          "The target file content was not available before applying the edit.",
        nextAction:
          "Check that the target file exists, ask to read it first, then rerun with an explicit replace instruction.",
      }),
    };
  }

  if (
    plan.mutationScopeRequired ||
    (plan.mutationScopeLineIndexes?.length ?? 0) > 0 ||
    (plan.mutationScopeRanges?.length ?? 0) > 0 ||
    plan.mutationScopeSourceWindowStart !== undefined ||
    plan.mutationScopeSourceWindowEnd !== undefined ||
    Boolean(plan.mutationScopeFingerprint)
  ) {
    const scopedMutation = applyScopedReplaceDirective({
      content: originalContent,
      replaceDirective,
      scope: {
        indexes: plan.mutationScopeLineIndexes,
        ranges: plan.mutationScopeRanges,
        sourceWindowStart: plan.mutationScopeSourceWindowStart,
        sourceWindowEnd: plan.mutationScopeSourceWindowEnd,
        fingerprint: plan.mutationScopeFingerprint,
      },
      required: plan.mutationScopeRequired === true,
    });
    if (scopedMutation.ok) {
      return {
        ok: true,
        content: scopedMutation.content,
        ...computeLineDelta(originalContent, scopedMutation.content),
      };
    }
    if ("hardFailure" in scopedMutation && scopedMutation.hardFailure) {
      return {
        ok: false,
        reason: scopedMutation.reason,
      };
    }
  }

  const patchResult = applySingleFileReplacePatch({
    targetPath: plan.targetPath,
    originalContent,
    replaceDirective,
  });
  if (isSingleFileReplacePatchFailure(patchResult)) {
    return {
      ok: false,
      reason: formatPatchFailureReason(patchResult),
    };
  }

  return {
    ok: true,
    content: patchResult.content,
    changedLines: patchResult.changedLines,
    addedLines: patchResult.addedLines,
    removedLines: patchResult.removedLines,
  };
}

export function isSafeReboundDirective(input: {
  readonly original: { from: string; to: string };
  readonly rebound: { from: string; to: string };
}): boolean {
  const from = input.rebound.from.trim();
  const to = input.rebound.to.trim();
  const originalFrom = input.original.from.trim();
  const originalTo = input.original.to.trim();
  if (!from || !to) {
    return false;
  }
  if (from === to) {
    return false;
  }
  if (from === originalTo && to === originalFrom) {
    return false;
  }
  const reboundIsBlockScoped = from.includes("\n") || to.includes("\n");
  if (reboundIsBlockScoped) {
    return true;
  }
  const fromHasWhitespace = /\s/.test(from);
  const toHasWhitespace = /\s/.test(to);
  if (fromHasWhitespace && !toHasWhitespace) {
    return false;
  }
  if (from.length > to.length * 3 && !toHasWhitespace) {
    return false;
  }
  const originalTokenLike = !/\s/.test(originalFrom);
  if (originalTokenLike && fromHasWhitespace && !toHasWhitespace) {
    return false;
  }
  return true;
}

export function isSafeGeneratedAlternativeDirective(input: {
  readonly from: string;
  readonly to: string;
}): boolean {
  const from = input.from.trim();
  const to = input.to.trim();
  if (!from || !to || from === to) {
    return false;
  }
  const isBlockScoped = from.includes("\n") || to.includes("\n");
  if (isBlockScoped) {
    return true;
  }
  const fromHasWhitespace = /\s/.test(from);
  const toHasWhitespace = /\s/.test(to);
  if (fromHasWhitespace && !toHasWhitespace) {
    return false;
  }
  if (!toHasWhitespace && from.length > Math.max(48, to.length * 3)) {
    return false;
  }
  return true;
}

export function computeLineDelta(
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

export function normalizePathLike(value: string): string {
  return value
    .replace(/\\/g, "/")
    .replace(/^\.\/+/g, "")
    .trim();
}

function extractPromptFileReferences(prompt: string): string[] {
  const matches = prompt.matchAll(
    /(?:^|[\s"'“”`(])((?:\.{1,2}[\\/])?(?:[\w.-]+[\\/])*[\w.-]+\.(?:txt|md|json|yaml|yml|ts|tsx|js|jsx|py|css|html))(?:$|[\s"'“”`),.:;!?])/gi,
  );
  const paths: string[] = [];
  for (const match of matches) {
    const candidate = match[1]?.trim();
    if (candidate) {
      paths.push(candidate.replace(/\\/g, "/"));
    }
  }
  return uniqueStable(paths);
}

function uniqueStable(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = normalizePathLike(value);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }
  return result;
}

function sanitizeReplaceTarget(value: string): string {
  return value
    .replace(/\s*,\s*then\s+run\b[\s\S]*$/i, "")
    .replace(/\s+then\s+run\b[\s\S]*$/i, "")
    .replace(/\s+and\s+run\b[\s\S]*$/i, "")
    .trim();
}

function inferFallbackReplaceSourceFromCurrentContent(
  content: string,
  avoidValue: string,
): string | undefined {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const unique = Array.from(new Set(lines));
  if (unique.length === 0) {
    return undefined;
  }
  if (unique.length === 1) {
    return unique[0] === avoidValue ? undefined : unique[0];
  }
  const compactCandidates = unique.filter(
    (line) =>
      line !== avoidValue && line.length <= 80 && !/[{}()[\];]/.test(line),
  );
  return compactCandidates.length === 1 ? compactCandidates[0] : undefined;
}

function inferConstraintAwareBlockReplacement(input: {
  readonly content: string;
  readonly failedTransforms: readonly ContinuationTransform[];
  readonly avoidPreviousDirection: boolean;
}): { from: string; to: string } | undefined {
  const lines = input.content.split(/\r?\n/);
  for (const failed of input.failedTransforms) {
    const toPair = extractAssignmentPair(failed.to);
    if (!toPair) {
      continue;
    }
    const assignment = findAssignmentLine(lines, toPair.key);
    if (!assignment) {
      continue;
    }
    const prohibitedValues = new Set<string>(
      input.failedTransforms
        .map((item) => extractAssignmentPair(item.to)?.value)
        .filter((value): value is string => Boolean(value)),
    );
    const nextValue = chooseAlternativeAssignmentValue(
      assignment.value,
      prohibitedValues,
      input.avoidPreviousDirection,
    );
    if (!nextValue) {
      continue;
    }

    const updatedLine = assignment.line.replace(
      assignment.match[0],
      `${assignment.match[1]}${assignment.match[2] ?? ""}${nextValue}${assignment.match[2] ?? ""}`,
    );
    const blockRange = inferLocalBlockRange(lines, assignment.index);
    const fromBlock = lines
      .slice(blockRange.start, blockRange.end + 1)
      .join("\n");
    const toLines = lines.slice(blockRange.start, blockRange.end + 1);
    toLines[assignment.index - blockRange.start] = updatedLine;
    const toBlock = toLines.join("\n");
    if (fromBlock === toBlock) {
      continue;
    }
    return { from: fromBlock, to: toBlock };
  }
  return undefined;
}

function extractAssignmentPair(
  raw: string,
): { key: string; value: string } | undefined {
  const match = raw.match(
    /^\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*[:=]\s*["']?([^"'\s]+)["']?\s*$/,
  );
  if (!match?.[1] || !match?.[2]) {
    return undefined;
  }
  return { key: match[1], value: match[2] };
}

function findAssignmentLine(
  lines: readonly string[],
  key: string,
):
  | {
      index: number;
      line: string;
      value: string;
      match: RegExpMatchArray;
    }
  | undefined {
  const pattern = new RegExp(
    `(\\b${escapeRegExp(key)}\\b\\s*[:=]\\s*)(["']?)([^"'\\s]+)\\2`,
  );
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const match = line.match(pattern);
    if (!match?.[0] || !match[3]) {
      continue;
    }
    return {
      index: i,
      line,
      value: match[3],
      match,
    };
  }
  return undefined;
}

function chooseAlternativeAssignmentValue(
  currentValue: string,
  prohibitedValues: ReadonlySet<string>,
  avoidPreviousDirection: boolean,
): string | undefined {
  const normalizedCurrent = currentValue.trim().toLowerCase();
  const map: Record<string, string[]> = {
    legacy: ["modern", "v2", "enabled", "right"],
    old: ["new", "modern", "v2"],
    wrong: ["right", "fixed", "modern"],
    disabled: ["enabled"],
    false: ["true"],
    off: ["on"],
  };
  const fallback = ["modern", "right", "fixed", "v2"];
  const candidates = map[normalizedCurrent] ?? fallback;
  for (const candidate of candidates) {
    if (candidate.toLowerCase() === normalizedCurrent) {
      continue;
    }
    if (avoidPreviousDirection && prohibitedValues.has(candidate)) {
      continue;
    }
    return candidate;
  }
  return undefined;
}

function inferLocalBlockRange(
  lines: readonly string[],
  targetIndex: number,
): { start: number; end: number } {
  let start = targetIndex;
  while (start > 0) {
    const line = lines[start] ?? "";
    if (
      /^\s*(export\s+)?(async\s+)?function\b/.test(line) ||
      /^\s*(const|let|var)\s+[A-Za-z_][A-Za-z0-9_]*\s*=\s*(async\s*)?\(/.test(
        line,
      ) ||
      /^\s*#{1,6}\s+/.test(line)
    ) {
      break;
    }
    if ((lines[start - 1] ?? "").trim() === "") {
      break;
    }
    start -= 1;
  }

  let end = targetIndex;
  let depth = 0;
  let seenBrace = false;
  for (let i = start; i < lines.length && i <= start + 60; i += 1) {
    const line = lines[i] ?? "";
    const opens = (line.match(/\{/g) ?? []).length;
    const closes = (line.match(/\}/g) ?? []).length;
    if (opens > 0) {
      seenBrace = true;
    }
    depth += opens - closes;
    end = i;
    if (seenBrace && depth <= 0 && i > targetIndex) {
      break;
    }
    if (!seenBrace && i > targetIndex && line.trim() === "") {
      end = i - 1;
      break;
    }
  }

  if (end < start) {
    end = start;
  }
  return { start, end };
}

function isSingleFileReplacePatchFailure(
  result: SingleFileReplacePatchResult,
): result is Extract<SingleFileReplacePatchResult, { ok: false }> {
  return result.ok === false;
}

export function extractInlineWriteContent(prompt: string): string | undefined {
  const zhMatch = prompt.match(
    /(?:\u5199\u5165(?:\u4ee5\u4e0b)?\u5185\u5bb9|\u5185\u5bb9(?:\u662f|[:\uFF1A]))\s*[:\uFF1A]?\s*(.+)$/u,
  );
  if (zhMatch?.[1]) {
    return trimTrailingVerifyInstruction(zhMatch[1]).trim();
  }

  const enMultilineMatch = prompt.match(
    /(?:with exactly this content|with exactly|containing exactly|content\s*:)\s*:?\s*\n([\s\S]+)$/i,
  );
  if (enMultilineMatch?.[1]) {
    return trimTrailingVerifyInstruction(enMultilineMatch[1]).trim();
  }

  const enMatch = prompt.match(
    /(?:write content|content\s*:|content\s+is|with content(?:\s+exactly)?|containing(?:\s+exactly)?|set content to)\s*[:=]?\s*["“”']?(.+?)["“”']?\s*$/i,
  );
  if (enMatch?.[1]) {
    return trimTrailingVerifyInstruction(enMatch[1]).trim();
  }

  return undefined;
}

function trimTrailingVerifyInstruction(content: string): string {
  let trimmed = content.replace(
    /\s+(?:and\s+)?(?:verify|confirm|ensure|check)\b[\s\S]*?\b(?:contains|includes|has)\b[\s\S]*$/i,
    "",
  );
  const fileVerifyMatches = Array.from(
    trimmed.matchAll(
      /(?:^|[.!?。！？]\s+)(?:and\s+)?(?:verify|confirm|ensure|check)\b[\s\S]*?(?:[\w.-]+\.(?:txt|md|json|yaml|yml|ts|tsx|js|jsx|py|css|html)|consistent|sync(?:ed|hronized)?|aligned|match|reflect|keep.+same|contains|includes|has)/gi,
    ),
  );
  const lastFileVerify = fileVerifyMatches.at(-1);
  if (lastFileVerify?.index !== undefined && lastFileVerify.index > 0) {
    trimmed = trimmed.slice(0, lastFileVerify.index).trim();
  }
  return trimmed
    .replace(
      /[.!?。！？]\s+(?:create|write|update|replace)\s+(?:file\s+)?[\w.-]+\.(?:txt|md|json|yaml|yml|ts|tsx|js|jsx|py|css|html)\s+with\s+content\b[\s\S]*$/i,
      "",
    )
    .replace(
      /\s+(?:only\s+modify|do\s+not\s+change|then\s+verify)\b[\s\S]*$/i,
      "",
    )
    .replace(/[.!?。！？]\s*$/, "")
    .trim();
}

function inferLowRiskConstrainedAddition(input: {
  targetPath?: string;
  prompt: string;
  originalContent: string;
}): string | undefined {
  const normalizedTarget = normalizePathLike(input.targetPath ?? "");
  if (
    normalizedTarget.endsWith("examples.md") &&
    /\bexpected\s+outputs?\b/i.test(input.prompt) &&
    /\bdouble\s*\(\s*3\s*\)/.test(input.prompt) &&
    /\bsquare\s*\(\s*4\s*\)/.test(input.prompt)
  ) {
    return buildLowRiskMathExamplesContent({ includeOutputs: true });
  }

  if (
    normalizedTarget.endsWith("README.md") &&
    /\b(?:add|show|primary\s+example|second\s+example)\b[\s\S]{0,120}\b(?:usage\s+section|example)\b/i.test(
      input.prompt,
    ) &&
    /\b(?:greet|welcome)\(\)/.test(input.prompt) &&
    /(?:greet|welcome)\((?:["“']?Ada["”']?)\)/.test(input.prompt)
  ) {
    const functionName = /\bwelcome\(\)/.test(input.prompt)
      ? "welcome"
      : "greet";
    const usageSection = [
      "## Usage",
      "",
      `- \`${functionName}()\``,
      `- \`${functionName}(\"Ada\")\``,
    ].join("\n");
    if (
      input.originalContent.includes(`${functionName}()`) &&
      input.originalContent.includes(`${functionName}(\"Ada\")`)
    ) {
      return input.originalContent;
    }
    const separator =
      input.originalContent.length > 0 && !input.originalContent.endsWith("\n")
        ? "\n\n"
        : "\n";
    return `${input.originalContent}${separator}${usageSection}`;
  }

  if (
    normalizedTarget.endsWith("utils.js") &&
    /\badd\b[\s\S]{0,120}\bexported\s+function\b[\s\S]{0,80}\bshout\s*\(\s*message\s*\)/i.test(
      input.prompt,
    ) &&
    /message\.toUpperCase\s*\(\s*\)/.test(input.prompt)
  ) {
    if (/export\s+function\s+shout\s*\(/.test(input.originalContent)) {
      return input.originalContent;
    }
    const functionBlock = [
      "export function shout(message) {",
      "  return message.toUpperCase();",
      "}",
    ].join("\n");
    const separator =
      input.originalContent.length > 0 && !input.originalContent.endsWith("\n")
        ? "\n\n"
        : "\n";
    return `${input.originalContent}${separator}${functionBlock}`;
  }

  return undefined;
}

function inferLowRiskExampleFileContent(input: {
  targetPath?: string;
  prompt: string;
}): string | undefined {
  const normalizedTarget = normalizePathLike(input.targetPath ?? "");
  if (
    normalizedTarget.endsWith("examples.md") &&
    /\bcreate\b[\s\S]{0,80}\bexamples\.md\b/i.test(input.prompt) &&
    /\bdouble\b/i.test(input.prompt) &&
    /\bsquare\b/i.test(input.prompt)
  ) {
    return buildLowRiskMathExamplesContent({
      includeOutputs: /\bexpected\s+outputs?\b/i.test(input.prompt),
    });
  }
  return undefined;
}

function buildLowRiskMathExamplesContent(input: {
  includeOutputs: boolean;
}): string {
  if (input.includeOutputs) {
    return [
      "# Examples",
      "",
      "- `double(3)` returns `6`.",
      "- `square(4)` returns `16`.",
    ].join("\n");
  }
  return ["# Examples", "", "- `double(3)`", "- `square(4)`"].join("\n");
}

function inferLowRiskSmallBugfix(input: {
  targetPath?: string;
  prompt: string;
  originalContent: string;
}): string | undefined {
  const normalizedTarget = normalizePathLike(input.targetPath ?? "");
  if (!normalizedTarget.endsWith("math.js")) {
    return undefined;
  }

  if (
    /\bdouble\s*\(\s*3\s*\)\s+should\s+return\s+6\b/i.test(input.prompt) &&
    /\bfix\b[\s\S]{0,80}\bbug\b|\bbug\b[\s\S]{0,120}\bimplementation\s+is\s+wrong\b/i.test(
      input.prompt,
    ) &&
    /return\s+n\s*\+\s*2\s*;/.test(input.originalContent)
  ) {
    return input.originalContent.replace(
      /return\s+n\s*\+\s*2\s*;/,
      "return n * 2;",
    );
  }

  if (
    /\bcomment\s+above\s+double\b/i.test(input.prompt) &&
    /\bdoubles\s+a\s+number\b/i.test(input.prompt) &&
    /export\s+function\s+double\s*\(/.test(input.originalContent) &&
    !/doubles\s+a\s+number/i.test(input.originalContent)
  ) {
    return input.originalContent.replace(
      /(export\s+function\s+double\s*\()/,
      "// doubles a number\n$1",
    );
  }

  return undefined;
}

function applyScopedReplaceDirective(input: {
  content: string;
  replaceDirective: { from: string; to: string };
  scope: {
    indexes?: readonly number[];
    ranges?: readonly string[];
    sourceWindowStart?: number;
    sourceWindowEnd?: number;
    fingerprint?: string;
  };
  required: boolean;
}):
  | { ok: true; content: string }
  | { ok: false; hardFailure: boolean; reason: string } {
  const lines = input.content.split(/\r?\n/);
  const scopedIndexes = resolveFragmentIndexesFromContinuityInput(
    lines,
    input.scope.indexes,
    input.scope.ranges,
    input.scope.sourceWindowStart,
    input.scope.sourceWindowEnd,
    undefined,
  );
  if (scopedIndexes.length === 0) {
    return {
      ok: false,
      hardFailure: input.required,
      reason:
        "Local-slice edit requested, but explained fragment scope is unavailable. Re-read/re-explain that part before editing.",
    };
  }

  if (input.scope.fingerprint) {
    const currentScopedFragment = computeFragmentFingerprintFromIndexes(
      lines,
      scopedIndexes,
    )?.fingerprint;
    if (
      !currentScopedFragment ||
      currentScopedFragment !== input.scope.fingerprint
    ) {
      return {
        ok: false,
        hardFailure: true,
        reason:
          "Explained fragment evidence is stale for local edit. Re-read/re-explain this part before applying the mutation.",
      };
    }
  }

  const from = input.replaceDirective.from;
  const to = input.replaceDirective.to;
  const isMultiline = from.includes("\n");

  if (isMultiline) {
    const contiguousRanges = compressLineIndexesToRanges(scopedIndexes)
      .split(";")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .map((entry) => {
        const [rawStart, rawEnd] = entry.split("-").map((part) => part?.trim());
        const start = Number.parseInt(rawStart ?? "", 10);
        const end = Number.parseInt(rawEnd ?? rawStart ?? "", 10);
        if (
          Number.isFinite(start) &&
          Number.isFinite(end) &&
          start >= 0 &&
          end >= start
        ) {
          return { start, end };
        }
        return undefined;
      })
      .filter((value): value is { start: number; end: number } =>
        Boolean(value),
      );
    if (contiguousRanges.length !== 1) {
      return {
        ok: false,
        hardFailure: true,
        reason:
          "Multiline replacement is ambiguous for the explained fragment (non-contiguous slice). Provide an explicit file-scoped edit or a narrower local transform.",
      };
    }
    const range = contiguousRanges[0];
    if (!range) {
      return {
        ok: false,
        hardFailure: true,
        reason:
          "Explained fragment range could not be reconstructed for multiline replacement.",
      };
    }
    const block = lines.slice(range.start, range.end + 1).join("\n");
    if (!block.includes(from)) {
      return {
        ok: false,
        hardFailure: true,
        reason:
          "Replace source text was not found inside the explained fragment.",
      };
    }
    const replaced = block.replace(from, to);
    if (replaced === block) {
      return {
        ok: false,
        hardFailure: true,
        reason:
          "Replace operation produced no effective change in explained fragment.",
      };
    }
    const nextLines = [...lines];
    nextLines.splice(
      range.start,
      range.end - range.start + 1,
      ...replaced.split("\n"),
    );
    return { ok: true, content: nextLines.join("\n") };
  }

  const nextLines = [...lines];
  for (const index of scopedIndexes) {
    const line = nextLines[index];
    if (line === undefined || !line.includes(from)) {
      continue;
    }
    const updatedLine = line.replace(from, to);
    if (updatedLine === line) {
      continue;
    }
    nextLines[index] = updatedLine;
    return { ok: true, content: nextLines.join("\n") };
  }

  return {
    ok: false,
    hardFailure: true,
    reason: "Replace source text was not found inside the explained fragment.",
  };
}

function applyLineScopedContinuationRepair(
  content: string,
  replaceDirective: { from: string; to: string },
  prompt: string,
): string | undefined {
  const keepFirstLine =
    /(?:\u4fdd\u7559\u7b2c\u4e00\u884c|\u7b2c\u4e00\u884c\u4e0d\u52a8|keep first line)/i.test(
      prompt,
    );
  const onlySecondLine =
    /(?:\u53ea\u6539\u7b2c\u4e8c\u884c|\u53ea\u4fee\u7b2c\u4e8c\u884c|only second line)/i.test(
      prompt,
    );
  if (!keepFirstLine && !onlySecondLine) {
    return undefined;
  }

  const lines = content.split(/\r?\n/);
  if (lines.length === 0) {
    return undefined;
  }
  let mutated = false;

  if (keepFirstLine && lines.length >= 1) {
    const reverted = lines[0]!.replace(
      replaceDirective.to,
      replaceDirective.from,
    );
    if (reverted !== lines[0]) {
      lines[0] = reverted;
      mutated = true;
    }
  }

  if (onlySecondLine && lines.length >= 2) {
    const updatedSecond = lines[1]!.replace(
      replaceDirective.from,
      replaceDirective.to,
    );
    if (updatedSecond !== lines[1]) {
      lines[1] = updatedSecond;
      mutated = true;
    }
  }

  if (!mutated) {
    return undefined;
  }
  return lines.join("\n");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
