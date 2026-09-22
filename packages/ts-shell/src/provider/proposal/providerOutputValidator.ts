import type { ProviderEditRawProposal } from "./providerEditProposal.js";

export type ProviderOutputValidationStatus =
  | "valid-exact-single-target"
  | "valid-exact-hunk-set"
  | "partial-anchor"
  | "unanchored-generated"
  | "fuzzy-output"
  | "broad-refactor-output"
  | "malformed-output"
  | "unsafe-output"
  | "empty-output"
  | "over-budget-output";

export interface ProviderOutputValidation {
  readonly validationId: string;
  readonly status: ProviderOutputValidationStatus;
  readonly validForManifest: boolean;
  readonly targetBinding: "exact" | "partial" | "missing" | "outside-context";
  readonly hunkCount: number;
  readonly targetCount: number;
  readonly reason: string;
  readonly summary: string;
  readonly mutationAuthority: "not-granted";
  readonly evidence: readonly string[];
}

const UNSAFE_TEXT = /\b(rm\s+-rf|sudo\b|chmod\s+777|curl\s+[^|]*\|\s*(?:sh|bash)|delete\s+all|drop\s+table)\b/i;

export function validateProviderOutput(input: {
  readonly requestId: string;
  readonly rawOutput?: ProviderEditRawProposal | null;
  readonly explicitTargetLabels: readonly string[];
  readonly maxTargets?: number;
  readonly maxOutputBytes?: number;
}): ProviderOutputValidation {
  const rawOutput = input.rawOutput;
  const maxTargets = input.maxTargets ?? 3;
  const maxOutputBytes = input.maxOutputBytes ?? 16000;
  const serialized = JSON.stringify(rawOutput ?? null);
  const status = classifyOutput({
    rawOutput,
    explicitTargetLabels: input.explicitTargetLabels,
    maxTargets,
    serializedLength: serialized.length,
    maxOutputBytes,
  });
  const targets = rawOutput?.targets ?? [];
  const targetBinding = classifyTargetBinding(targets, input.explicitTargetLabels);
  const hunkCount = targets.filter((target) => target.oldText && target.newText).length;
  const validationId = [
    "provider_output_validation",
    input.requestId,
    status,
    targetBinding,
    targets.length,
    hunkCount,
  ].join("_").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
  const validForManifest =
    status === "valid-exact-single-target" ||
    status === "valid-exact-hunk-set" ||
    status === "partial-anchor";
  const reason = describeStatus(status);
  const summary = [
    `provider-output-validation ${validationId}`,
    `status=${status}`,
    `targetBinding=${targetBinding}`,
    `targets=${targets.length}`,
    `hunks=${hunkCount}`,
    "mutationAuthority=not-granted",
    "raw-content-excluded",
  ].join("; ");

  return {
    validationId,
    status,
    validForManifest,
    targetBinding,
    hunkCount,
    targetCount: targets.length,
    reason,
    summary,
    mutationAuthority: "not-granted",
    evidence: [
      `provider-output-validation:id:${validationId}`,
      `provider-output-validation:status:${status}`,
      `provider-output-validation:target-binding:${targetBinding}`,
      `provider-output-validation:targets:${targets.length}`,
      `provider-output-validation:hunks:${hunkCount}`,
      "provider-output-validation:mutation-authority:not-granted",
      "provider-output-validation:raw-content-excluded",
    ],
  };
}

function classifyOutput(input: {
  readonly rawOutput?: ProviderEditRawProposal | null;
  readonly explicitTargetLabels: readonly string[];
  readonly maxTargets: number;
  readonly serializedLength: number;
  readonly maxOutputBytes: number;
}): ProviderOutputValidationStatus {
  const raw = input.rawOutput;
  if (!raw) return "empty-output";
  if (input.serializedLength > input.maxOutputBytes) return "over-budget-output";
  if (!raw.operationKind) return "malformed-output";
  if (raw.operationKind === "broad-refactor") return "broad-refactor-output";
  if (raw.operationKind === "fuzzy-replacement") return "fuzzy-output";
  const targets = raw.targets ?? [];
  if (targets.length === 0) return raw.operationKind === "generated-replacement" ? "unanchored-generated" : "empty-output";
  if (targets.length > input.maxTargets) return "broad-refactor-output";
  if (targets.some((target) => unsafeTargetText(target))) return "unsafe-output";
  const binding = classifyTargetBinding(targets, input.explicitTargetLabels);
  if (binding === "missing") return "unanchored-generated";
  if (binding === "outside-context") return "malformed-output";
  const exactCount = targets.filter((target) => target.oldText && target.newText).length;
  if (exactCount === targets.length) {
    return targets.length === 1 ? "valid-exact-single-target" : "valid-exact-hunk-set";
  }
  return binding === "exact" || binding === "partial" ? "partial-anchor" : "malformed-output";
}

function classifyTargetBinding(
  targets: readonly NonNullable<ProviderEditRawProposal["targets"]>[number][],
  explicitTargetLabels: readonly string[],
): ProviderOutputValidation["targetBinding"] {
  if (targets.length === 0) return "missing";
  const explicit = new Set(explicitTargetLabels);
  const bound = targets.filter((target) => explicit.has(target.path));
  if (bound.length === targets.length) return "exact";
  if (bound.length > 0) return "partial";
  return targets.some((target) => target.path) ? "outside-context" : "missing";
}

function unsafeTargetText(target: NonNullable<ProviderEditRawProposal["targets"]>[number]): boolean {
  return [target.path, target.summary, target.oldText, target.newText]
    .filter(Boolean)
    .some((value) => UNSAFE_TEXT.test(value ?? ""));
}

function describeStatus(status: ProviderOutputValidationStatus): string {
  switch (status) {
    case "valid-exact-single-target":
      return "Provider output has one exact target-bound old/new anchor.";
    case "valid-exact-hunk-set":
      return "Provider output has a bounded exact target set.";
    case "partial-anchor":
      return "Provider output is target-bound but missing complete exact anchors.";
    case "unanchored-generated":
      return "Provider output is generated but unanchored to explicit targets.";
    case "fuzzy-output":
      return "Provider output requested fuzzy replacement.";
    case "broad-refactor-output":
      return "Provider output requested broad or over-bounded refactor scope.";
    case "malformed-output":
      return "Provider output shape is malformed or outside explicit context.";
    case "unsafe-output":
      return "Provider output contains unsafe command or destructive content.";
    case "empty-output":
      return "Provider output was empty.";
    case "over-budget-output":
      return "Provider output exceeded the dry-run output budget.";
  }
}
