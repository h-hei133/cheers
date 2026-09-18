import { sanitizeBrowserText } from "../../browserCapabilityModel.js";
import type {
  BrowserExternalRunnerAction,
  BrowserExternalRunnerCommand,
} from "../../runtime/external/protocol.js";
import { browserExternalRunnerHasForbiddenContent } from "../../runtime/external/protocol.js";
import type { BrowserSkillRunnerMetadata } from "./metadata.js";

export const BROWSER_SKILL_RUNNER_BINDING_VERSION =
  "browser-skill-runner-binding/v1" as const;

export type BrowserSkillRunnerBindingSource =
  | "cli-harness-manifest"
  | "explicit-local-config"
  | "test-only"
  | "disabled";
export type BrowserSkillRunnerBindingMode =
  | "test-local-process"
  | "external-local-process"
  | "future-skill-runtime";

export interface BrowserSkillRunnerBinding {
  readonly bindingVersion: typeof BROWSER_SKILL_RUNNER_BINDING_VERSION;
  readonly source: BrowserSkillRunnerBindingSource;
  readonly mode: BrowserSkillRunnerBindingMode;
  readonly runnerId: string;
  readonly runnerCommand?: BrowserExternalRunnerCommand;
  readonly runnerRef: string;
  readonly skillRunnerId: string;
  readonly skillRunnerMetadataVersion: string;
  readonly allowedActions: readonly BrowserExternalRunnerAction[];
  readonly fixtureScope: "local-fixture-only";
  readonly sandboxContract: "local-fixture-no-network";
  readonly evidenceContract: "safe-summary-only";
  readonly replayContract: "receipt-reference-only";
  readonly networkAllowlist: "none";
  readonly dynamicDiscovery: "disabled";
  readonly timeoutMs: number;
  readonly outputBudgetBytes: number;
  readonly redactions: readonly string[];
  readonly warnings: readonly string[];
}

export type BrowserSkillRunnerBindingValidationResult =
  | {
      readonly ok: true;
      readonly binding: BrowserSkillRunnerBinding;
      readonly evidence: readonly string[];
      readonly warnings: readonly string[];
      readonly redactions: readonly string[];
    }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly evidence: readonly string[];
      readonly warnings: readonly string[];
      readonly redactions: readonly string[];
    };

const SAFE_ACTIONS = new Set<BrowserExternalRunnerAction>([
  "observe",
  "extract",
  "navigate-local",
]);

export function createBrowserSkillRunnerBinding(input: {
  readonly source?: BrowserSkillRunnerBindingSource;
  readonly mode?: BrowserSkillRunnerBindingMode;
  readonly runnerId?: string;
  readonly runnerCommand?: BrowserExternalRunnerCommand;
  readonly runnerRef?: string;
  readonly metadata: BrowserSkillRunnerMetadata;
  readonly allowedActions?: readonly BrowserExternalRunnerAction[];
  readonly timeoutMs?: number;
  readonly outputBudgetBytes?: number;
}): BrowserSkillRunnerBinding {
  return {
    bindingVersion: BROWSER_SKILL_RUNNER_BINDING_VERSION,
    source: input.source ?? "cli-harness-manifest",
    mode: input.mode ?? "test-local-process",
    runnerId: sanitizeId(input.runnerId ?? `${input.metadata.runnerId}:binding`),
    runnerCommand: input.runnerCommand,
    runnerRef: sanitizeId(input.runnerRef ?? input.metadata.runnerId),
    skillRunnerId: input.metadata.runnerId,
    skillRunnerMetadataVersion: input.metadata.runnerVersion,
    allowedActions: input.allowedActions ?? input.metadata.supportedActions.filter(isSafeAction),
    fixtureScope: "local-fixture-only",
    sandboxContract: "local-fixture-no-network",
    evidenceContract: "safe-summary-only",
    replayContract: "receipt-reference-only",
    networkAllowlist: "none",
    dynamicDiscovery: "disabled",
    timeoutMs: input.timeoutMs ?? 1500,
    outputBudgetBytes: input.outputBudgetBytes ?? 4096,
    redactions: [],
    warnings: [],
  };
}

export function serializeBrowserSkillRunnerBinding(
  binding: BrowserSkillRunnerBinding,
): string {
  return `${JSON.stringify(binding, null, 2)}\n`;
}

export function validateBrowserSkillRunnerBinding(
  value: unknown,
  metadata?: BrowserSkillRunnerMetadata,
): BrowserSkillRunnerBindingValidationResult {
  if (!isRecord(value)) {
    return invalid("Skill runner binding must be a JSON object.");
  }
  if (value.bindingVersion !== BROWSER_SKILL_RUNNER_BINDING_VERSION) {
    return invalid("Skill runner binding version is unsupported.");
  }
  if (!isSource(value.source) || value.source === "disabled") {
    return invalid("Skill runner binding source is disabled or unsupported.");
  }
  if (!isMode(value.mode)) {
    return invalid("Skill runner binding mode is unsupported.");
  }
  if (value.dynamicDiscovery !== "disabled") {
    return invalid("Skill runner binding cannot request dynamic discovery.");
  }
  if (
    value.fixtureScope !== "local-fixture-only" ||
    value.sandboxContract !== "local-fixture-no-network" ||
    value.evidenceContract !== "safe-summary-only" ||
    value.replayContract !== "receipt-reference-only" ||
    value.networkAllowlist !== "none"
  ) {
    return invalid("Skill runner binding must be local-fixture scoped with no network.");
  }
  const runnerId = stringValue(value.runnerId);
  const runnerRef = stringValue(value.runnerRef);
  const skillRunnerId = stringValue(value.skillRunnerId);
  const skillRunnerMetadataVersion = stringValue(value.skillRunnerMetadataVersion);
  if (!runnerId || !runnerRef || !skillRunnerId || !skillRunnerMetadataVersion) {
    return invalid("Skill runner binding is missing required identity fields.");
  }
  if (!metadata || metadata.runnerId !== skillRunnerId || metadata.runnerVersion !== skillRunnerMetadataVersion) {
    return invalid("Skill runner binding must match explicit skill metadata.");
  }
  const allowedActions = Array.isArray(value.allowedActions)
    ? value.allowedActions
    : [];
  if (allowedActions.length === 0 || !allowedActions.every(isSafeAction)) {
    return invalid("Skill runner binding allowed actions must be safe local fixture actions.");
  }
  if (allowedActions.some((action) => !metadata.supportedActions.includes(action))) {
    return invalid("Skill runner binding actions must be a subset of metadata actions.");
  }
  if (!isSafeInteger(value.timeoutMs, 50, 10_000) || !isSafeInteger(value.outputBudgetBytes, 256, 32_768)) {
    return invalid("Skill runner binding requires bounded timeout and output budget.");
  }
  const runnerCommand = isRunnerCommand(value.runnerCommand)
    ? {
        command: sanitizeBrowserText(value.runnerCommand.command, 240),
        args: value.runnerCommand.args.map((arg) => sanitizeBrowserText(arg, 240)),
        cwd: stringValue(value.runnerCommand.cwd)
          ? sanitizeBrowserText(value.runnerCommand.cwd, 240)
          : undefined,
      }
    : undefined;
  if ((value.mode === "test-local-process" || value.mode === "external-local-process") && !runnerCommand) {
    return invalid("Skill runner process binding requires an explicit runner command.");
  }
  if (runnerCommand && !runnerCommandIsSafe(value.mode, runnerCommand)) {
    return invalid("Skill runner command must be explicit, local/test scoped, and non-global.");
  }
  const encoded = JSON.stringify({
    runnerId,
    runnerRef,
    skillRunnerId,
    skillRunnerMetadataVersion,
    allowedActions,
    redactions: stringArray(value.redactions),
    warnings: stringArray(value.warnings),
  });
  if (browserExternalRunnerHasForbiddenContent(encoded)) {
    return invalid("Skill runner binding contains unsafe or secret-looking content.", ["skill-runner-binding"]);
  }
  const binding: BrowserSkillRunnerBinding = {
    bindingVersion: BROWSER_SKILL_RUNNER_BINDING_VERSION,
    source: value.source,
    mode: value.mode,
    runnerId: sanitizeId(runnerId),
    runnerCommand,
    runnerRef: sanitizeId(runnerRef),
    skillRunnerId: sanitizeId(skillRunnerId),
    skillRunnerMetadataVersion: sanitizeBrowserText(skillRunnerMetadataVersion, 80),
    allowedActions: allowedActions as BrowserExternalRunnerAction[],
    fixtureScope: "local-fixture-only",
    sandboxContract: "local-fixture-no-network",
    evidenceContract: "safe-summary-only",
    replayContract: "receipt-reference-only",
    networkAllowlist: "none",
    dynamicDiscovery: "disabled",
    timeoutMs: value.timeoutMs,
    outputBudgetBytes: value.outputBudgetBytes,
    redactions: stringArray(value.redactions),
    warnings: stringArray(value.warnings),
  };
  return {
    ok: true,
    binding,
    evidence: [
      "browser-skill-runner-binding:validated",
      `browser-skill-runner-binding:mode:${binding.mode}`,
      "browser-skill-runner-binding:local-fixture-only",
      "browser-skill-runner-binding:no-dynamic-discovery",
      "browser-skill-runner-binding:no-external-network",
      "browser-skill-runner-binding:no-raw-content",
    ],
    warnings: binding.warnings,
    redactions: binding.redactions,
  };
}

function runnerCommandIsSafe(
  mode: BrowserSkillRunnerBindingMode,
  command: BrowserExternalRunnerCommand,
): boolean {
  const combined = [command.command, ...command.args, command.cwd ?? ""].join("\n");
  if (browserExternalRunnerHasForbiddenContent(combined)) {
    return false;
  }
  if (/https?:\/\//i.test(combined) || /\b(mcp|browserbase|chromadb|playwright)\b/i.test(combined)) {
    return false;
  }
  const isTmpOrLocal = (arg: string) => {
    const normalized = arg.replace(/\\/g, "/");
    return (
      normalized.startsWith("/tmp/") ||
      normalized.startsWith("./") ||
      normalized.includes("/temp/") ||
      normalized.includes("/tmp/") ||
      normalized.includes("Temp/")
    );
  };
  if (mode === "test-local-process") {
    return command.args.some(isTmpOrLocal);
  }
  return command.args.some(isTmpOrLocal);
}

function invalid(
  reason: string,
  redactions: readonly string[] = [],
): Extract<BrowserSkillRunnerBindingValidationResult, { ok: false }> {
  return {
    ok: false,
    reason,
    evidence: ["browser-skill-runner-binding:invalid"],
    warnings: ["browser-skill-runner-binding:blocked"],
    redactions,
  };
}

function isRunnerCommand(value: unknown): value is BrowserExternalRunnerCommand {
  return (
    isRecord(value) &&
    typeof value.command === "string" &&
    value.command.trim().length > 0 &&
    Array.isArray(value.args) &&
    value.args.every((arg) => typeof arg === "string")
  );
}

function isSafeAction(value: unknown): value is BrowserExternalRunnerAction {
  return typeof value === "string" && SAFE_ACTIONS.has(value as BrowserExternalRunnerAction);
}

function isSource(value: unknown): value is BrowserSkillRunnerBindingSource {
  return value === "cli-harness-manifest" ||
    value === "explicit-local-config" ||
    value === "test-only" ||
    value === "disabled";
}

function isMode(value: unknown): value is BrowserSkillRunnerBindingMode {
  return value === "test-local-process" ||
    value === "external-local-process" ||
    value === "future-skill-runtime";
}

function isSafeInteger(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function sanitizeId(value: string): string {
  return sanitizeBrowserText(value, 120).replace(/[^A-Za-z0-9:_./-]+/g, "-");
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => sanitizeBrowserText(item, 120))
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
