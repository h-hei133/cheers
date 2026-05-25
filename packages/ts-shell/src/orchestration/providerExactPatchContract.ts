import type { ProviderEditRawProposal } from "./providerEditProposal.js";
import { safeTargetLabel } from "./workspaceFileContract.js";

export type ProviderExactPatchParseStatus =
  | "exact-patch"
  | "recovered-exact-patch"
  | "review-only"
  | "invalid-format"
  | "target-mismatch";

export type ProviderExactPatchClassification =
  | "exact-ready"
  | "recovered-exact-ready"
  | "review-only"
  | "invalid-format"
  | "target-mismatch"
  | "old-text-not-found"
  | "old-text-multiple-matches"
  | "network-blocked"
  | "auth-failed"
  | "config-failed"
  | "provider-error";

export type ProviderExactPatchParseResult =
  | {
      readonly ok: true;
      readonly status: "exact-patch" | "recovered-exact-patch" | "review-only";
      readonly rawProposal: ProviderEditRawProposal;
      readonly reason: string;
      readonly evidence: readonly string[];
      readonly diagnostics: ProviderExactPatchDiagnostics;
    }
  | {
      readonly ok: false;
      readonly status: "invalid-format" | "target-mismatch";
      readonly reason: string;
      readonly evidence: readonly string[];
      readonly diagnostics: ProviderExactPatchDiagnostics;
    };

export type ProviderExactPatchWrapperKind =
  | "none"
  | "markdown-json"
  | "json"
  | "diff"
  | "unknown";

export type ProviderExactPatchOutputShape =
  | "exact-json"
  | "review-only-json"
  | "provider-proposal-json"
  | "diff"
  | "unknown";

export interface ProviderExactPatchDiagnostics {
  readonly parseStatus: ProviderExactPatchParseStatus;
  readonly wrapperKind: ProviderExactPatchWrapperKind;
  readonly outputShapeKind: ProviderExactPatchOutputShape;
  readonly targetMatched: boolean;
  readonly targetCandidateCount: number;
  readonly oldTextPresent: boolean;
  readonly newTextPresent: boolean;
  readonly oldTextLength?: number;
  readonly newTextLength?: number;
  readonly rejectionReason?: string;
  readonly evidence: readonly string[];
}

export function buildProviderExactPatchSystemPrompt(): string {
  return [
    "You generate exact single-file patch proposals for a no-write route.",
    "Return JSON only. Do not use markdown fences.",
    "Do not claim files were changed. Do not run commands. Do not request apply.",
    "Required JSON shape when the prompt includes current target content:",
    '{"targetFile":"src/example.ts","oldText":"exact current text","newText":"replacement text","reason":"short reason","verificationHint":"safe readback or test"}',
    "oldText and newText are mandatory unless a required fact is missing.",
    "oldText must be copied byte-for-byte from provided current target content.",
    "If a required fact is missing, return review-only and name the missing fact:",
    '{"status":"review-only","targetFile":"src/example.ts","missingFact":"specific missing exact evidence","reason":"why exact oldText/newText cannot be produced"}',
    "Review-only is allowed only when a required fact is missing; do not use review-only for commentary or preference.",
    "Rules: exactly one targetFile, targetFile must equal the explicit target, oldText must be copied from provided current evidence, newText must be non-empty, no multi-file edits, no broad/fuzzy edits.",
  ].join("\n");
}

export function parseProviderExactPatchOutput(input: {
  readonly text: string;
  readonly explicitTargetLabels: readonly string[];
}): ProviderExactPatchParseResult {
  const text = input.text.trim();
  const explicitTargets = normalizeExplicitTargets(input.explicitTargetLabels);
  if (looksLikeDiff(text)) {
    const diff = parseSimpleUnifiedDiff({
      text,
      explicitTargets,
    });
    if (diff) return diff;
  }
  const extracted = extractJsonObjectWithWrapper(text);
  const jsonText = extracted.jsonText;
  if (!jsonText) {
    const diff = parseSimpleUnifiedDiff({
      text,
      explicitTargets,
    });
    if (diff) return diff;
    return invalid("invalid-format", "Provider output did not contain a JSON object or supported single-file diff.", [
      "provider-exact-patch-contract:parse:missing-json",
    ], {
      wrapperKind: looksLikeDiff(text) ? "diff" : "unknown",
      outputShapeKind: looksLikeDiff(text) ? "diff" : "unknown",
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return invalid("invalid-format", "Provider output contained malformed JSON.", [
      "provider-exact-patch-contract:parse:malformed-json",
    ], {
      wrapperKind: extracted.wrapperKind,
      outputShapeKind: "unknown",
    });
  }

  const candidate = isRecord(parsed) && isRecord(parsed.proposal) ? parsed.proposal : parsed;
  if (!isRecord(candidate)) {
    return invalid("invalid-format", "Provider JSON was not an object.", [
      "provider-exact-patch-contract:parse:not-object",
    ], {
      wrapperKind: extracted.wrapperKind,
      outputShapeKind: "unknown",
    });
  }

  const reviewStatus = typeof candidate.status === "string" ? candidate.status : undefined;
  if (reviewStatus === "review-only" || candidate.reviewOnly === true) {
    const targetFile = stringField(candidate, "targetFile") ?? firstTargetPath(candidate);
    const resolved = targetFile
      ? resolveExplicitTarget(targetFile, explicitTargets)
      : explicitTargets.length === 1
        ? { matched: true, label: explicitTargets[0]!.label, candidateCount: 1 }
        : undefined;
    const path = resolved?.label;
    if (!path || !resolved?.matched) {
      return invalid("target-mismatch", "Provider review-only output did not bind to the explicit target.", [
        "provider-exact-patch-contract:parse:review-target-mismatch",
      ], {
        wrapperKind: extracted.wrapperKind,
        outputShapeKind: "review-only-json",
        targetCandidateCount: resolved?.candidateCount ?? 0,
      });
    }
    const missingFactPresent = concreteReviewOnlyMissingFact(candidate);
    const diagnostics = buildDiagnostics({
      parseStatus: "review-only",
      wrapperKind: extracted.wrapperKind,
      outputShapeKind: "review-only-json",
      targetMatched: true,
      targetCandidateCount: resolved.candidateCount,
      oldTextPresent: false,
      newTextPresent: false,
      evidence: [
        "provider-exact-patch-diagnostic:parse-status:review-only",
        `provider-exact-patch-diagnostic:wrapper:${extracted.wrapperKind}`,
        "provider-exact-patch-diagnostic:shape:review-only-json",
        `provider-exact-patch-diagnostic:review-only-missing-fact-present:${missingFactPresent}`,
      ],
    });
    return {
      ok: true,
      status: "review-only",
      rawProposal: {
        operationKind: "generated-replacement",
        targets: [
          {
            path,
            summary: stringField(candidate, "missingFact") ??
              stringField(candidate, "reason") ??
              "provider returned review-only exact patch status",
          },
        ],
        confidence: parseConfidence(candidate.confidence),
        riskSummary: "Provider did not supply exact oldText/newText; no write authority granted.",
        verificationPlan: parseVerification(candidate.verificationHint, candidate.verificationPlan),
        diagnostics: diagnostics.evidence,
      },
      reason: "Provider explicitly returned review-only instead of exact patch.",
      evidence: [
        "provider-exact-patch-contract:parse:review-only",
        "provider-exact-patch-contract:raw-content-excluded",
        ...diagnostics.evidence,
      ],
      diagnostics,
    };
  }

  const existing = parseExistingRawProposal(candidate);
  if (existing) {
    const resolvedTargets = resolveProposalTargets(existing.targets, explicitTargets);
    if (!resolvedTargets.ok) {
      return invalid("target-mismatch", "Provider proposal referenced a target outside explicit context.", [
        "provider-exact-patch-contract:parse:target-mismatch",
      ], {
        wrapperKind: extracted.wrapperKind,
        outputShapeKind: "provider-proposal-json",
        targetCandidateCount: resolvedTargets.candidateCount,
      });
    }
    const recoveredProposal = {
      ...existing,
      targets: resolvedTargets.targets,
    };
    const hasExact = recoveredProposal.targets?.some((target) => target.oldText && target.newText) ?? false;
    const diagnostics = buildDiagnostics({
      parseStatus: hasExact ? "recovered-exact-patch" : "review-only",
      wrapperKind: extracted.wrapperKind,
      outputShapeKind: "provider-proposal-json",
      targetMatched: true,
      targetCandidateCount: resolvedTargets.candidateCount,
      oldTextPresent: recoveredProposal.targets?.some((target) => typeof target.oldText === "string") ?? false,
      newTextPresent: recoveredProposal.targets?.some((target) => typeof target.newText === "string") ?? false,
      oldTextLength: singleTextLength(recoveredProposal.targets?.map((target) => target.oldText)),
      newTextLength: singleTextLength(recoveredProposal.targets?.map((target) => target.newText)),
      evidence: [
        `provider-exact-patch-diagnostic:parse-status:${hasExact ? "recovered-exact-patch" : "review-only"}`,
        `provider-exact-patch-diagnostic:wrapper:${extracted.wrapperKind}`,
        "provider-exact-patch-diagnostic:shape:provider-proposal-json",
      ],
    });
    return {
      ok: true,
      status: hasExact
        ? "recovered-exact-patch"
        : "review-only",
      rawProposal: {
        ...recoveredProposal,
        diagnostics: diagnostics.evidence,
      },
      reason: "Provider returned the supported provider proposal JSON shape.",
      evidence: [
        "provider-exact-patch-contract:parse:provider-proposal-shape",
        "provider-exact-patch-contract:raw-content-excluded",
        ...diagnostics.evidence,
      ],
      diagnostics,
    };
  }

  const targetFile = stringField(candidate, "targetFile");
  const oldText = stringField(candidate, "oldText");
  const newText = stringField(candidate, "newText");
  if (!targetFile || !oldText || newText === undefined) {
    return invalid("invalid-format", "Provider exact patch JSON missed targetFile, oldText, or newText.", [
      "provider-exact-patch-contract:parse:missing-required-field",
    ], {
      wrapperKind: extracted.wrapperKind,
      outputShapeKind: "exact-json",
      oldTextPresent: typeof oldText === "string",
      newTextPresent: typeof newText === "string",
      oldTextLength: typeof oldText === "string" ? oldText.length : undefined,
      newTextLength: typeof newText === "string" ? newText.length : undefined,
    });
  }
  const resolved = resolveExplicitTarget(targetFile, explicitTargets);
  const path = resolved?.label;
  if (!path || !resolved.matched) {
    return invalid("target-mismatch", "Provider exact patch targetFile did not match the explicit target.", [
      "provider-exact-patch-contract:parse:target-mismatch",
    ], {
      wrapperKind: extracted.wrapperKind,
      outputShapeKind: "exact-json",
      targetCandidateCount: resolved?.candidateCount ?? 0,
      oldTextPresent: true,
      newTextPresent: true,
      oldTextLength: oldText.length,
      newTextLength: newText.length,
    });
  }
  if (oldText.length === 0 || newText.length === 0) {
    return invalid("invalid-format", "Provider exact patch oldText/newText must be non-empty.", [
      "provider-exact-patch-contract:parse:empty-old-or-new",
    ], {
      wrapperKind: extracted.wrapperKind,
      outputShapeKind: "exact-json",
      targetCandidateCount: resolved.candidateCount,
      oldTextPresent: oldText.length > 0,
      newTextPresent: newText.length > 0,
      oldTextLength: oldText.length,
      newTextLength: newText.length,
    });
  }
  if (oldText === newText) {
    return invalid("invalid-format", "Provider exact patch oldText and newText must differ.", [
      "provider-exact-patch-contract:parse:unchanged-old-new",
    ], {
      wrapperKind: extracted.wrapperKind,
      outputShapeKind: "exact-json",
      targetCandidateCount: resolved.candidateCount,
      oldTextPresent: true,
      newTextPresent: true,
      oldTextLength: oldText.length,
      newTextLength: newText.length,
    });
  }

  const diagnostics = buildDiagnostics({
    parseStatus: extracted.wrapperKind === "markdown-json" ? "recovered-exact-patch" : "exact-patch",
    wrapperKind: extracted.wrapperKind,
    outputShapeKind: "exact-json",
    targetMatched: true,
    targetCandidateCount: resolved.candidateCount,
    oldTextPresent: true,
    newTextPresent: true,
    oldTextLength: oldText.length,
    newTextLength: newText.length,
    evidence: [
      `provider-exact-patch-diagnostic:parse-status:${extracted.wrapperKind === "markdown-json" ? "recovered-exact-patch" : "exact-patch"}`,
      `provider-exact-patch-diagnostic:wrapper:${extracted.wrapperKind}`,
      "provider-exact-patch-diagnostic:shape:exact-json",
      "provider-exact-patch-diagnostic:old-text-present:true",
      "provider-exact-patch-diagnostic:new-text-present:true",
    ],
  });
  return {
    ok: true,
    status: diagnostics.parseStatus === "recovered-exact-patch" ? "recovered-exact-patch" : "exact-patch",
    rawProposal: {
      operationKind: "exact-fenced-replacement",
      targets: [
        {
          path,
          summary: stringField(candidate, "reason") ?? "provider exact patch",
          oldText,
          newText,
        },
      ],
      confidence: parseConfidence(candidate.confidence),
      riskSummary: "Single-file exact provider patch; requires review and explicit confirmation.",
      verificationPlan: parseVerification(candidate.verificationHint, candidate.verificationPlan),
      diagnostics: diagnostics.evidence,
    },
    reason: "Provider returned the Route214 exact patch JSON shape.",
    evidence: [
      "provider-exact-patch-contract:parse:exact-patch",
      "provider-exact-patch-contract:raw-content-excluded",
      ...diagnostics.evidence,
    ],
    diagnostics,
  };
}

export function extractJsonObject(text: string): string | undefined {
  return extractJsonObjectWithWrapper(text).jsonText;
}

function extractJsonObjectWithWrapper(text: string): {
  readonly jsonText?: string;
  readonly wrapperKind: ProviderExactPatchWrapperKind;
} {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const source = fenced || text;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end < start) {
    return { wrapperKind: fenced ? "markdown-json" : "unknown" };
  }
  return {
    jsonText: source.slice(start, end + 1),
    wrapperKind: fenced ? "markdown-json" : "json",
  };
}

function invalid(
  status: "invalid-format" | "target-mismatch",
  reason: string,
  evidence: readonly string[],
  diagnosticInput: Partial<Omit<ProviderExactPatchDiagnostics, "parseStatus" | "rejectionReason" | "evidence">> = {},
): ProviderExactPatchParseResult {
  const diagnostics = buildDiagnostics({
    parseStatus: status,
    wrapperKind: diagnosticInput.wrapperKind ?? "unknown",
    outputShapeKind: diagnosticInput.outputShapeKind ?? "unknown",
    targetMatched: diagnosticInput.targetMatched ?? false,
    targetCandidateCount: diagnosticInput.targetCandidateCount ?? 0,
    oldTextPresent: diagnosticInput.oldTextPresent ?? false,
    newTextPresent: diagnosticInput.newTextPresent ?? false,
    oldTextLength: diagnosticInput.oldTextLength,
    newTextLength: diagnosticInput.newTextLength,
    rejectionReason: reason,
    evidence: [
      `provider-exact-patch-diagnostic:parse-status:${status}`,
      `provider-exact-patch-diagnostic:wrapper:${diagnosticInput.wrapperKind ?? "unknown"}`,
      `provider-exact-patch-diagnostic:shape:${diagnosticInput.outputShapeKind ?? "unknown"}`,
      `provider-exact-patch-diagnostic:rejection:${safeDiagnosticReason(reason)}`,
    ],
  });
  return {
    ok: false,
    status,
    reason,
    evidence: [
      ...evidence,
      "provider-exact-patch-contract:raw-content-excluded",
      ...diagnostics.evidence,
    ],
    diagnostics,
  };
}

function parseExistingRawProposal(candidate: Record<string, unknown>): ProviderEditRawProposal | undefined {
  const operationKind = candidate.operationKind;
  if (
    operationKind !== "exact-fenced-replacement" &&
    operationKind !== "generated-replacement" &&
    operationKind !== "broad-refactor" &&
    operationKind !== "fuzzy-replacement"
  ) {
    return undefined;
  }
  return {
    operationKind,
    targets: parseTargets(candidate.targets),
    confidence: parseConfidence(candidate.confidence),
    riskSummary: stringField(candidate, "riskSummary"),
    verificationPlan: parseVerification(undefined, candidate.verificationPlan),
  };
}

function parseTargets(value: unknown): ProviderEditRawProposal["targets"] {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter(isRecord)
    .map((target) => ({
      path: typeof target.path === "string" ? target.path : "",
      summary: typeof target.summary === "string" ? target.summary : undefined,
      oldText: typeof target.oldText === "string" ? target.oldText : undefined,
      newText: typeof target.newText === "string" ? target.newText : undefined,
    }))
    .filter((target) => target.path);
}

function normalizeExplicitTargets(
  labels: readonly string[],
): readonly {
  readonly label: string;
  readonly basename: string;
  readonly variants: readonly string[];
}[] {
  return labels.map((label) => {
    const safe = safeTargetLabel(label);
    const withoutDot = safe.replace(/^\.\//, "");
    return {
      label: safe,
      basename: withoutDot.split("/").pop() ?? withoutDot,
      variants: Array.from(new Set([
        safe,
        withoutDot,
        `./${withoutDot}`,
        `a/${withoutDot}`,
        `b/${withoutDot}`,
      ])),
    };
  });
}

function resolveExplicitTarget(
  targetPath: string,
  explicitTargets: readonly {
    readonly label: string;
    readonly basename: string;
    readonly variants: readonly string[];
  }[],
): { readonly matched: boolean; readonly label: string; readonly candidateCount: number } | undefined {
  const safe = safeTargetLabel(targetPath);
  const direct = explicitTargets.filter((target) => target.variants.includes(safe));
  if (direct.length === 1) {
    return { matched: true, label: direct[0]!.label, candidateCount: 1 };
  }
  if (direct.length > 1) {
    return { matched: false, label: safe, candidateCount: direct.length };
  }
  const basename = safe.replace(/^\.\//, "").replace(/^[ab]\//, "").split("/").pop() ?? safe;
  const basenameMatches = explicitTargets.filter((target) => target.basename === basename);
  if (basenameMatches.length === 1) {
    return { matched: true, label: basenameMatches[0]!.label, candidateCount: 1 };
  }
  return {
    matched: false,
    label: safe,
    candidateCount: basenameMatches.length,
  };
}

function resolveProposalTargets(
  targets: ProviderEditRawProposal["targets"],
  explicitTargets: readonly {
    readonly label: string;
    readonly basename: string;
    readonly variants: readonly string[];
  }[],
): {
  readonly ok: boolean;
  readonly targets?: ProviderEditRawProposal["targets"];
  readonly candidateCount: number;
} {
  if (!targets?.length) return { ok: true, targets, candidateCount: 0 };
  const resolved = targets.map((target) => ({
    target,
    resolved: resolveExplicitTarget(target.path, explicitTargets),
  }));
  const candidateCount = resolved.reduce((sum, item) => sum + (item.resolved?.candidateCount ?? 0), 0);
  if (resolved.some((item) => !item.resolved?.matched)) {
    return { ok: false, candidateCount };
  }
  return {
    ok: true,
    candidateCount,
    targets: resolved.map((item) => ({
      ...item.target,
      path: item.resolved!.label,
    })),
  };
}

function parseSimpleUnifiedDiff(input: {
  readonly text: string;
  readonly explicitTargets: readonly {
    readonly label: string;
    readonly basename: string;
    readonly variants: readonly string[];
  }[];
}): ProviderExactPatchParseResult | undefined {
  if (!looksLikeDiff(input.text)) return undefined;
  const lines = input.text.replace(/\r\n/g, "\n").split("\n");
  const diffTargets = parseDiffTargetCandidates(lines);
  if (diffTargets.length !== 1) {
    return invalid("target-mismatch", "Provider diff did not contain exactly one target file.", [
      "provider-exact-patch-contract:parse:diff-target-count",
    ], {
      wrapperKind: "diff",
      outputShapeKind: "diff",
      targetCandidateCount: diffTargets.length,
    });
  }
  const resolved = resolveExplicitTarget(diffTargets[0]!, input.explicitTargets);
  if (!resolved?.matched) {
    return invalid("target-mismatch", "Provider diff target did not match the explicit target.", [
      "provider-exact-patch-contract:parse:diff-target-mismatch",
    ], {
      wrapperKind: "diff",
      outputShapeKind: "diff",
      targetCandidateCount: resolved?.candidateCount ?? 0,
    });
  }
  const hunks = extractUnifiedDiffHunks(lines);
  if (hunks.length !== 1) {
    return invalid("invalid-format", "Provider diff must contain exactly one hunk for exact recovery.", [
      "provider-exact-patch-contract:parse:diff-hunk-count",
    ], {
      wrapperKind: "diff",
      outputShapeKind: "diff",
      targetCandidateCount: resolved.candidateCount,
    });
  }
  const hunk = hunks[0]!;
  if (!hunk.oldText.trim() || !hunk.newText.trim()) {
    return invalid("invalid-format", "Provider diff hunk did not recover non-empty oldText and newText.", [
      "provider-exact-patch-contract:parse:diff-empty-hunk",
    ], {
      wrapperKind: "diff",
      outputShapeKind: "diff",
      targetCandidateCount: resolved.candidateCount,
      oldTextPresent: Boolean(hunk.oldText.trim()),
      newTextPresent: Boolean(hunk.newText.trim()),
      oldTextLength: hunk.oldText.length,
      newTextLength: hunk.newText.length,
    });
  }
  const diagnostics = buildDiagnostics({
    parseStatus: "recovered-exact-patch",
    wrapperKind: "diff",
    outputShapeKind: "diff",
    targetMatched: true,
    targetCandidateCount: resolved.candidateCount,
    oldTextPresent: true,
    newTextPresent: true,
    oldTextLength: hunk.oldText.length,
    newTextLength: hunk.newText.length,
    evidence: [
      "provider-exact-patch-diagnostic:parse-status:recovered-exact-patch",
      "provider-exact-patch-diagnostic:wrapper:diff",
      "provider-exact-patch-diagnostic:shape:diff",
      "provider-exact-patch-diagnostic:old-text-present:true",
      "provider-exact-patch-diagnostic:new-text-present:true",
    ],
  });
  return {
    ok: true,
    status: "recovered-exact-patch",
    rawProposal: {
      operationKind: "exact-fenced-replacement",
      targets: [{
        path: resolved.label,
        summary: "provider unified diff exact patch",
        oldText: hunk.oldText,
        newText: hunk.newText,
      }],
      confidence: "medium",
      riskSummary: "Recovered from single-file unified diff; requires exact anchoring and explicit confirmation.",
      verificationPlan: ["readback target after confirmed apply"],
      diagnostics: diagnostics.evidence,
    },
    reason: "Provider returned a simple single-file unified diff recoverable as exact oldText/newText.",
    evidence: [
      "provider-exact-patch-contract:parse:diff-recovered",
      "provider-exact-patch-contract:raw-content-excluded",
      ...diagnostics.evidence,
    ],
    diagnostics,
  };
}

function parseDiffTargetCandidates(lines: readonly string[]): readonly string[] {
  const targets = new Set<string>();
  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      const parts = line.split(/\s+/).slice(2);
      for (const part of parts) {
        if (part && part !== "/dev/null") targets.add(part);
      }
    }
    if (line.startsWith("--- ") || line.startsWith("+++ ")) {
      const part = line.slice(4).trim().split(/\s+/)[0];
      if (part && part !== "/dev/null") targets.add(part);
    }
  }
  const normalized = Array.from(targets).map((target) => safeTargetLabel(target).replace(/^[ab]\//, ""));
  return Array.from(new Set(normalized));
}

function extractUnifiedDiffHunks(lines: readonly string[]): readonly { readonly oldText: string; readonly newText: string }[] {
  const hunks: { oldLines: string[]; newLines: string[] }[] = [];
  let current: { oldLines: string[]; newLines: string[] } | undefined;
  for (const line of lines) {
    if (line.startsWith("@@")) {
      current = { oldLines: [], newLines: [] };
      hunks.push(current);
      continue;
    }
    if (!current) continue;
    if (line.startsWith("\\ No newline at end of file")) continue;
    if (line.startsWith("+") && !line.startsWith("+++")) {
      current.newLines.push(line.slice(1));
      continue;
    }
    if (line.startsWith("-") && !line.startsWith("---")) {
      current.oldLines.push(line.slice(1));
      continue;
    }
    if (line.startsWith(" ")) {
      const value = line.slice(1);
      current.oldLines.push(value);
      current.newLines.push(value);
    }
  }
  return hunks.map((hunk) => ({
    oldText: joinDiffLines(hunk.oldLines),
    newText: joinDiffLines(hunk.newLines),
  }));
}

function joinDiffLines(lines: readonly string[]): string {
  return lines.join("\n");
}

function looksLikeDiff(text: string): boolean {
  return /^diff --git /m.test(text) || /^--- .*\n\+\+\+ /m.test(text) || /^@@ /m.test(text);
}

function buildDiagnostics(input: Omit<ProviderExactPatchDiagnostics, "evidence"> & {
  readonly evidence: readonly string[];
}): ProviderExactPatchDiagnostics {
  return {
    parseStatus: input.parseStatus,
    wrapperKind: input.wrapperKind,
    outputShapeKind: input.outputShapeKind,
    targetMatched: input.targetMatched,
    targetCandidateCount: input.targetCandidateCount,
    oldTextPresent: input.oldTextPresent,
    newTextPresent: input.newTextPresent,
    ...(input.oldTextLength !== undefined ? { oldTextLength: input.oldTextLength } : {}),
    ...(input.newTextLength !== undefined ? { newTextLength: input.newTextLength } : {}),
    ...(input.rejectionReason ? { rejectionReason: input.rejectionReason } : {}),
    evidence: [
      ...input.evidence,
      `provider-exact-patch-diagnostic:target-matched:${input.targetMatched}`,
      `provider-exact-patch-diagnostic:target-candidates:${input.targetCandidateCount}`,
      `provider-exact-patch-diagnostic:old-text-present:${input.oldTextPresent}`,
      `provider-exact-patch-diagnostic:new-text-present:${input.newTextPresent}`,
      ...(input.oldTextLength !== undefined ? [`provider-exact-patch-diagnostic:old-text-length:${input.oldTextLength}`] : []),
      ...(input.newTextLength !== undefined ? [`provider-exact-patch-diagnostic:new-text-length:${input.newTextLength}`] : []),
      "provider-exact-patch-diagnostic:raw-content-excluded",
    ],
  };
}

function singleTextLength(values?: readonly (string | undefined)[]): number | undefined {
  const present = values?.filter((value): value is string => typeof value === "string") ?? [];
  return present.length === 1 ? present[0]!.length : undefined;
}

function safeDiagnosticReason(reason: string): string {
  return reason.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "unknown";
}

function firstTargetPath(candidate: Record<string, unknown>): string | undefined {
  const targets = candidate.targets;
  if (!Array.isArray(targets)) return undefined;
  const first = targets.find(isRecord);
  return first && typeof first.path === "string" ? first.path : undefined;
}

function concreteReviewOnlyMissingFact(candidate: Record<string, unknown>): boolean {
  const missingFact = stringField(candidate, "missingFact") ?? stringField(candidate, "reason");
  if (!missingFact?.trim()) return false;
  return /missing|not provided|unavailable|insufficient|required|needed|lack/i.test(missingFact);
}

function parseConfidence(value: unknown): ProviderEditRawProposal["confidence"] {
  return value === "low" || value === "medium" || value === "high" ? value : undefined;
}

function parseVerification(
  hint: unknown,
  plan: unknown,
): readonly string[] | undefined {
  if (typeof hint === "string" && hint.trim()) return [hint.trim()];
  if (!Array.isArray(plan)) return undefined;
  const parsed = plan.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
  return parsed.length ? parsed : undefined;
}

function stringField(candidate: Record<string, unknown>, field: string): string | undefined {
  const value = candidate[field];
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
