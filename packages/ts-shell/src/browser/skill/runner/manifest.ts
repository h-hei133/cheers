import { sanitizeBrowserText } from "../../../core/context/browserCapabilityModel.js";
import {
  createBrowserSkillRunnerMetadata,
  validateBrowserSkillRunnerMetadata,
  type BrowserSkillRunnerMetadata,
} from "./metadata.js";
import {
  validateBrowserSkillRunnerBinding,
  type BrowserSkillRunnerBinding,
} from "./binding.js";
import {
  classifyBrowserSkillRunnerReadiness,
  type BrowserSkillRunnerReadiness,
} from "./readiness.js";

export const BROWSER_SKILL_RUNNER_MANIFEST_VERSION =
  "browser-skill-runner-manifest/v1" as const;

export interface BrowserSkillRunnerManifest {
  readonly manifestVersion: typeof BROWSER_SKILL_RUNNER_MANIFEST_VERSION;
  readonly source: "cli-harness" | "explicit-local-config" | "test-only";
  readonly skillRunnerMetadata: BrowserSkillRunnerMetadata;
  readonly skillRunnerBinding?: BrowserSkillRunnerBinding;
  readonly allowedActions: readonly string[];
  readonly fixtureScope: "local-fixture-only";
  readonly sandboxContract: "local-fixture-no-network";
  readonly evidenceContract: "safe-summary-only";
  readonly replayContract: "receipt-reference-only";
  readonly timeoutMs: number;
  readonly outputBudgetBytes: number;
  readonly redactions: readonly string[];
  readonly warnings: readonly string[];
}

export type BrowserSkillRunnerManifestValidationResult =
  | {
      readonly ok: true;
      readonly manifest: BrowserSkillRunnerManifest;
      readonly readiness: BrowserSkillRunnerReadiness;
      readonly evidence: readonly string[];
      readonly warnings: readonly string[];
    }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly readiness: BrowserSkillRunnerReadiness;
      readonly evidence: readonly string[];
      readonly warnings: readonly string[];
    };

export function createBrowserSkillRunnerManifest(input: {
  readonly source?: BrowserSkillRunnerManifest["source"];
  readonly metadata?: BrowserSkillRunnerMetadata;
  readonly binding?: BrowserSkillRunnerBinding;
  readonly actions?: readonly string[];
  readonly timeoutMs?: number;
  readonly outputBudgetBytes?: number;
} = {}): BrowserSkillRunnerManifest {
  const metadata = input.metadata ?? createBrowserSkillRunnerMetadata({ actions: input.actions });
  return {
    manifestVersion: BROWSER_SKILL_RUNNER_MANIFEST_VERSION,
    source: input.source ?? "cli-harness",
    skillRunnerMetadata: metadata,
    skillRunnerBinding: input.binding,
    allowedActions: metadata.supportedActions,
    fixtureScope: "local-fixture-only",
    sandboxContract: "local-fixture-no-network",
    evidenceContract: "safe-summary-only",
    replayContract: "receipt-reference-only",
    timeoutMs: input.timeoutMs ?? 1500,
    outputBudgetBytes: input.outputBudgetBytes ?? 4096,
    redactions: [],
    warnings: metadata.warnings,
  };
}

export function serializeBrowserSkillRunnerManifest(
  manifest: BrowserSkillRunnerManifest,
): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function validateBrowserSkillRunnerManifest(
  value: unknown,
): BrowserSkillRunnerManifestValidationResult {
  if (!isRecord(value)) {
    return invalid("Skill runner manifest must be a JSON object.");
  }
  if (value.manifestVersion !== BROWSER_SKILL_RUNNER_MANIFEST_VERSION) {
    return invalid("Skill runner manifest version is unsupported.");
  }
  if (!isSource(value.source)) {
    return invalid("Skill runner manifest source is unsupported.");
  }
  if (
    value.fixtureScope !== "local-fixture-only" ||
    value.sandboxContract !== "local-fixture-no-network" ||
    value.evidenceContract !== "safe-summary-only" ||
    value.replayContract !== "receipt-reference-only"
  ) {
    return invalid("Skill runner manifest must be local-fixture scoped with safe-summary evidence.");
  }
  if (!isSafeInteger(value.timeoutMs, 50, 10_000) || !isSafeInteger(value.outputBudgetBytes, 256, 32_768)) {
    return invalid("Skill runner manifest requires bounded timeout and output budget.");
  }
  const metadataResult = validateBrowserSkillRunnerMetadata(value.skillRunnerMetadata);
  if (metadataResult.ok === false) {
    return invalid(metadataResult.reason, metadataResult.evidence);
  }
  const bindingResult = value.skillRunnerBinding !== undefined
    ? validateBrowserSkillRunnerBinding(value.skillRunnerBinding, metadataResult.metadata)
    : undefined;
  if (bindingResult?.ok === false) {
    return invalid(bindingResult.reason, bindingResult.evidence);
  }
  const allowedActions = Array.isArray(value.allowedActions)
    ? value.allowedActions.filter((item): item is string => typeof item === "string")
    : [];
  if (
    allowedActions.length === 0 ||
    allowedActions.some((action) => !metadataResult.metadata.supportedActions.includes(action))
  ) {
    return invalid("Skill runner manifest allowed actions must be a subset of safe metadata actions.");
  }
  if ([...allowedActions, ...stringArray(value.warnings), ...stringArray(value.redactions)].some(hasForbiddenContent)) {
    return invalid("Skill runner manifest contains raw content or secret-looking data.");
  }
  const manifest: BrowserSkillRunnerManifest = {
    manifestVersion: BROWSER_SKILL_RUNNER_MANIFEST_VERSION,
    source: value.source,
    skillRunnerMetadata: metadataResult.metadata,
    skillRunnerBinding: bindingResult?.ok ? bindingResult.binding : undefined,
    allowedActions: allowedActions.map((action) => sanitizeBrowserText(action, 80)),
    fixtureScope: "local-fixture-only",
    sandboxContract: "local-fixture-no-network",
    evidenceContract: "safe-summary-only",
    replayContract: "receipt-reference-only",
    timeoutMs: value.timeoutMs,
    outputBudgetBytes: value.outputBudgetBytes,
    redactions: stringArray(value.redactions),
    warnings: [...metadataResult.warnings, ...stringArray(value.warnings)],
  };
  const readiness = classifyBrowserSkillRunnerReadiness({
    metadata: manifest.skillRunnerMetadata,
  });
  return {
    ok: true,
    manifest,
    readiness,
    evidence: [
      ...metadataResult.evidence,
      ...(bindingResult?.ok ? bindingResult.evidence : []),
      ...readiness.evidence,
      "browser-skill-runner-manifest:validated",
      "browser-skill-runner-manifest:metadata-only",
      "browser-skill-runner-manifest:no-execution-authority",
    ],
    warnings: manifest.warnings,
  };
}

function invalid(
  reason: string,
  evidence: readonly string[] = [],
): Extract<BrowserSkillRunnerManifestValidationResult, { ok: false }> {
  const readiness = classifyBrowserSkillRunnerReadiness({ metadataValidationReason: reason });
  return {
    ok: false,
    reason,
    readiness,
    evidence: ["browser-skill-runner-manifest:invalid", ...evidence, ...readiness.evidence],
    warnings: ["browser-skill-runner-manifest:blocked"],
  };
}

function isSource(value: unknown): value is BrowserSkillRunnerManifest["source"] {
  return value === "cli-harness" || value === "explicit-local-config" || value === "test-only";
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => sanitizeBrowserText(item, 120))
    : [];
}

function hasForbiddenContent(value: string): boolean {
  return /(api[_-]?key|token|secret|password|bearer\s+|BEGIN [A-Z ]+PRIVATE KEY|https?:\/\/)/i.test(value);
}

function isSafeInteger(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
