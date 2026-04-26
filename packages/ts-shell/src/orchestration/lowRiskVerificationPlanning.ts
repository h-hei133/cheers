import type { CodingPatchRecord } from "./types.js";
import type { FileUnchangedAssertion } from "./fileConstraintAssertions.js";

export interface LowRiskFileContentAssertion {
  readonly path: string;
  readonly expectedText: string;
}

export type LowRiskUnchangedAssertion = FileUnchangedAssertion;

export interface LowRiskContentAssertion {
  readonly expectedText: string;
}

export interface LowRiskConsistencyAssertion {
  readonly paths: string[];
  readonly sourcePath: string;
}

export type LowRiskFileAssertionReadPlanEntry =
  | { path: string; source: "applied-content"; output: string }
  | { path: string; source: "protected-snapshot"; output: string }
  | { path: string; source: "read-tool" };

export interface LowRiskVerificationPlan {
  readonly fileContentAssertions: LowRiskFileContentAssertion[];
  readonly contentAssertion: LowRiskContentAssertion | undefined;
  readonly consistencyAssertion: LowRiskConsistencyAssertion | undefined;
  readonly hasExplicitFileAssertions: boolean;
  readonly uniqueContentAssertions: Array<{
    readonly path: string;
    readonly expected: LowRiskFileContentAssertion[];
  }>;
  readonly fileAssertionReadPlan: LowRiskFileAssertionReadPlanEntry[];
}

export function planLowRiskVerification(input: {
  readonly prompt: string;
  readonly changedFiles: readonly string[];
  readonly unchangedAssertions: readonly LowRiskUnchangedAssertion[];
  readonly appliedContentByPath: ReadonlyMap<string, string>;
  readonly protectedSnapshots: ReadonlyMap<string, string>;
  readonly patches: readonly CodingPatchRecord[];
}): LowRiskVerificationPlan {
  const fileContentAssertions = extractLowRiskFileContentVerifications(
    input.prompt,
  );
  const contentAssertion = extractLowRiskContentVerification(input.prompt);
  const hasExplicitFileAssertions =
    fileContentAssertions.length > 0 || input.unchangedAssertions.length > 0;
  const consistencyAssertion = hasExplicitFileAssertions
    ? undefined
    : extractLowRiskConsistencyVerification(input.prompt, input.changedFiles);
  const uniqueContentAssertions = uniqueStable(
    fileContentAssertions.map((assertion) => assertion.path),
  ).map((assertionPath) => ({
    path: assertionPath,
    expected: fileContentAssertions.filter(
      (assertion) => assertion.path === assertionPath,
    ),
  }));
  const fileAssertionReadPlan = planLowRiskFileAssertionReads({
    fileContentAssertions,
    unchangedAssertions: input.unchangedAssertions,
    appliedContentByPath: input.appliedContentByPath,
    protectedSnapshots: input.protectedSnapshots,
    patches: input.patches,
  });

  return {
    fileContentAssertions,
    contentAssertion,
    consistencyAssertion,
    hasExplicitFileAssertions,
    uniqueContentAssertions,
    fileAssertionReadPlan,
  };
}

export function extractConsistencyItems(content: string): string[] {
  return uniqueStable(
    content
      .split(/\r?\n/)
      .map((line) =>
        line
          .trim()
          .replace(/^(?:[-*]\s+|\d+[.)]\s+)/, "")
          .trim(),
      )
      .filter((line) => line.length > 0 && !/^(?:plan|todo|tasks?)$/i.test(line)),
  );
}

export function findMissingConsistencyItems(input: {
  readonly sourceItems: readonly string[];
  readonly targets: ReadonlyArray<{
    readonly path: string;
    readonly result: { readonly output?: string };
  }>;
}): { targetPath: string; item: string } | undefined {
  for (const target of input.targets) {
    const normalizedTargetContent = normalizeComparableText(
      target.result.output ?? "",
    );
    for (const item of input.sourceItems) {
      if (!normalizedTargetContent.includes(normalizeComparableText(item))) {
        return { targetPath: target.path, item };
      }
    }
  }
  return undefined;
}

export function normalizeComparableText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\r/g, "\n")
    .replace(/^(?:[-*]\s+|\d+[.)]\s+)/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractLowRiskContentVerification(
  prompt: string,
): LowRiskContentAssertion | undefined {
  const match = prompt.match(
    /(?:verify|confirm|ensure|check|\u9a8c\u8bc1|\u786e\u8ba4|\u68c0\u67e5)[\s\S]{0,160}?\b(?:contains|includes|has)\b\s*[:=]?\s*[`"“”']?([^\r\n`"“”']{1,200}?)[`"“”']?(?:[.。]|$)/i,
  );
  const expectedText = match?.[1]?.trim();
  if (!expectedText) {
    return undefined;
  }
  return { expectedText };
}

function extractLowRiskFileContentVerifications(
  prompt: string,
): LowRiskFileContentAssertion[] {
  const assertions: LowRiskFileContentAssertion[] = [];
  const matches = prompt.matchAll(
    /([\w./\\-]+\.(?:txt|md|json|yaml|yml|ts|tsx|js|jsx|py|css|html))\s+\b(?:contains|includes|has)\b\s*[:=]?\s*[`"“”']?(.+?)[`"“”']?(?=(?:\s+\band\s+[\w./\\-]+\.(?:txt|md|json|yaml|yml|ts|tsx|js|jsx|py|css|html)\s+\b(?:contains|includes|has|(?:is|stays?|remains?)\s+unchanged)\b)|[.。]|$)/gi,
  );
  for (const match of matches) {
    const path = match[1]?.trim();
    const expectedText = match[2]?.trim();
    if (path && expectedText) {
      assertions.push({
        path: path.replace(/\\/g, "/"),
        expectedText,
      });
    }
  }
  return assertions;
}

function planLowRiskFileAssertionReads(input: {
  readonly fileContentAssertions: readonly LowRiskFileContentAssertion[];
  readonly unchangedAssertions: readonly LowRiskUnchangedAssertion[];
  readonly appliedContentByPath: ReadonlyMap<string, string>;
  readonly protectedSnapshots: ReadonlyMap<string, string>;
  readonly patches: readonly CodingPatchRecord[];
}): LowRiskFileAssertionReadPlanEntry[] {
  return uniqueStable([
    ...input.fileContentAssertions.map((assertion) => assertion.path),
    ...input.unchangedAssertions.map((assertion) => assertion.path),
  ]).map((path) => {
    const normalizedPath = normalizePathLike(path);
    const appliedContent = input.appliedContentByPath.get(normalizedPath);
    if (appliedContent !== undefined) {
      return { path, source: "applied-content", output: appliedContent };
    }
    const protectedSnapshot = input.protectedSnapshots.get(path);
    const protectedExpectedUnchanged = input.unchangedAssertions.some(
      (assertion) => normalizePathLike(assertion.path) === normalizedPath,
    );
    const protectedWasMutated = input.patches.some(
      (patch) =>
        patch.status === "applied" &&
        normalizePathLike(patch.path) === normalizedPath,
    );
    if (
      protectedExpectedUnchanged &&
      protectedSnapshot !== undefined &&
      !protectedWasMutated
    ) {
      return { path, source: "protected-snapshot", output: protectedSnapshot };
    }
    return { path, source: "read-tool" };
  });
}

function extractLowRiskConsistencyVerification(
  prompt: string,
  changedFiles: readonly string[],
): LowRiskConsistencyAssertion | undefined {
  if (
    !/(?:verify|confirm|ensure|check|\u9a8c\u8bc1|\u786e\u8ba4|\u68c0\u67e5)/i.test(prompt) ||
    !/(?:consistent|sync(?:ed|hronized)?|aligned|match|reflect|keep.+same|\u4e00\u81f4|\u540c\u6b65)/i.test(prompt)
  ) {
    return undefined;
  }
  const verificationTail = extractVerificationTailForFileAssertion(prompt);
  const verificationPaths = extractPromptFileReferences(verificationTail);
  const paths =
    verificationPaths.length >= 2 ? verificationPaths : extractPromptFileReferences(prompt);
  const merged = uniqueStable([
    ...paths,
    ...changedFiles.filter((file) => paths.includes(file)),
  ]);
  if (merged.length < 2) {
    return undefined;
  }
  const changedSet = new Set(changedFiles.map((file) => normalizePathLike(file)));
  const sourcePath =
    merged.find((file) => !changedSet.has(normalizePathLike(file))) ?? merged[0]!;
  return { paths: merged, sourcePath };
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

function extractVerificationTailForFileAssertion(prompt: string): string {
  const matches = Array.from(
    prompt.matchAll(
      /(?:verify|confirm|ensure|check|\u9a8c\u8bc1|\u786e\u8ba4|\u68c0\u67e5)[\s\S]*?(?:[\w.-]+\.(?:txt|md|json|yaml|yml|ts|tsx|js|jsx|py|css|html)|consistent|sync(?:ed|hronized)?|aligned|match|reflect|keep.+same|contains|includes|has)[\s\S]*$/gi,
    ),
  );
  const last = matches.at(-1);
  if (last?.index !== undefined) {
    return prompt.slice(last.index);
  }
  return prompt;
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

function normalizePathLike(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\/+/g, "").trim();
}
