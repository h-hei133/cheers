import type { ProviderEditRawProposal } from "./providerEditProposal.js";
import { safeTargetLabel } from "./workspaceFileContract.js";

export type ProviderExactPatchParseStatus =
  | "exact-patch"
  | "review-only"
  | "invalid-format"
  | "target-mismatch";

export type ProviderExactPatchClassification =
  | "exact-ready"
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
      readonly status: "exact-patch" | "review-only";
      readonly rawProposal: ProviderEditRawProposal;
      readonly reason: string;
      readonly evidence: readonly string[];
    }
  | {
      readonly ok: false;
      readonly status: "invalid-format" | "target-mismatch";
      readonly reason: string;
      readonly evidence: readonly string[];
    };

export function buildProviderExactPatchSystemPrompt(): string {
  return [
    "You generate exact single-file patch proposals for a no-write route.",
    "Return JSON only. Do not use markdown fences.",
    "Do not claim files were changed. Do not run commands. Do not request apply.",
    "Preferred JSON shape:",
    '{"targetFile":"src/example.ts","oldText":"exact current text","newText":"replacement text","reason":"short reason","verificationHint":"safe readback or test"}',
    "If exact oldText/newText cannot be produced from the prompt, return:",
    '{"status":"review-only","targetFile":"src/example.ts","reason":"specific missing exact evidence"}',
    "Rules: exactly one targetFile, targetFile must equal the explicit target, oldText must be copied from provided current evidence, newText must be non-empty, no multi-file edits, no broad/fuzzy edits.",
  ].join("\n");
}

export function parseProviderExactPatchOutput(input: {
  readonly text: string;
  readonly explicitTargetLabels: readonly string[];
}): ProviderExactPatchParseResult {
  const jsonText = extractJsonObject(input.text.trim());
  if (!jsonText) {
    return invalid("invalid-format", "Provider output did not contain a JSON object.", [
      "provider-exact-patch-contract:parse:missing-json",
    ]);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return invalid("invalid-format", "Provider output contained malformed JSON.", [
      "provider-exact-patch-contract:parse:malformed-json",
    ]);
  }

  const candidate = isRecord(parsed) && isRecord(parsed.proposal) ? parsed.proposal : parsed;
  if (!isRecord(candidate)) {
    return invalid("invalid-format", "Provider JSON was not an object.", [
      "provider-exact-patch-contract:parse:not-object",
    ]);
  }

  const explicitTargets = new Set(input.explicitTargetLabels.map(safeTargetLabel));
  const reviewStatus = typeof candidate.status === "string" ? candidate.status : undefined;
  if (reviewStatus === "review-only" || candidate.reviewOnly === true) {
    const targetFile = stringField(candidate, "targetFile") ?? firstTargetPath(candidate);
    const path = targetFile ? safeTargetLabel(targetFile) : input.explicitTargetLabels[0];
    if (!path || !explicitTargets.has(path)) {
      return invalid("target-mismatch", "Provider review-only output did not bind to the explicit target.", [
        "provider-exact-patch-contract:parse:review-target-mismatch",
      ]);
    }
    return {
      ok: true,
      status: "review-only",
      rawProposal: {
        operationKind: "generated-replacement",
        targets: [
          {
            path,
            summary: stringField(candidate, "reason") ?? "provider returned review-only exact patch status",
          },
        ],
        confidence: parseConfidence(candidate.confidence),
        riskSummary: "Provider did not supply exact oldText/newText; no write authority granted.",
        verificationPlan: parseVerification(candidate.verificationHint, candidate.verificationPlan),
      },
      reason: "Provider explicitly returned review-only instead of exact patch.",
      evidence: [
        "provider-exact-patch-contract:parse:review-only",
        "provider-exact-patch-contract:raw-content-excluded",
      ],
    };
  }

  const existing = parseExistingRawProposal(candidate);
  if (existing) {
    if (existing.targets?.some((target) => !explicitTargets.has(safeTargetLabel(target.path)))) {
      return invalid("target-mismatch", "Provider proposal referenced a target outside explicit context.", [
        "provider-exact-patch-contract:parse:target-mismatch",
      ]);
    }
    return {
      ok: true,
      status: existing.targets?.some((target) => target.oldText && target.newText)
        ? "exact-patch"
        : "review-only",
      rawProposal: existing,
      reason: "Provider returned the supported provider proposal JSON shape.",
      evidence: [
        "provider-exact-patch-contract:parse:provider-proposal-shape",
        "provider-exact-patch-contract:raw-content-excluded",
      ],
    };
  }

  const targetFile = stringField(candidate, "targetFile");
  const oldText = stringField(candidate, "oldText");
  const newText = stringField(candidate, "newText");
  if (!targetFile || !oldText || newText === undefined) {
    return invalid("invalid-format", "Provider exact patch JSON missed targetFile, oldText, or newText.", [
      "provider-exact-patch-contract:parse:missing-required-field",
    ]);
  }
  const path = safeTargetLabel(targetFile);
  if (!explicitTargets.has(path)) {
    return invalid("target-mismatch", "Provider exact patch targetFile did not match the explicit target.", [
      "provider-exact-patch-contract:parse:target-mismatch",
    ]);
  }
  if (oldText.length === 0 || newText.length === 0) {
    return invalid("invalid-format", "Provider exact patch oldText/newText must be non-empty.", [
      "provider-exact-patch-contract:parse:empty-old-or-new",
    ]);
  }

  return {
    ok: true,
    status: "exact-patch",
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
    },
    reason: "Provider returned the Route214 exact patch JSON shape.",
    evidence: [
      "provider-exact-patch-contract:parse:exact-patch",
      "provider-exact-patch-contract:raw-content-excluded",
    ],
  };
}

export function extractJsonObject(text: string): string | undefined {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const source = fenced || text;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end < start) return undefined;
  return source.slice(start, end + 1);
}

function invalid(
  status: "invalid-format" | "target-mismatch",
  reason: string,
  evidence: readonly string[],
): ProviderExactPatchParseResult {
  return {
    ok: false,
    status,
    reason,
    evidence: [
      ...evidence,
      "provider-exact-patch-contract:raw-content-excluded",
    ],
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

function firstTargetPath(candidate: Record<string, unknown>): string | undefined {
  const targets = candidate.targets;
  if (!Array.isArray(targets)) return undefined;
  const first = targets.find(isRecord);
  return first && typeof first.path === "string" ? first.path : undefined;
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
