import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import {
  createBrowserLocalFixture,
  sanitizeBrowserEvidenceText,
  type BrowserLocalFixture,
  type BrowserLocalFixtureAction,
  type BrowserLocalFixtureKind,
} from "./browserLocalFixture.js";
import {
  browserExternalRunnerHasForbiddenContent,
  type BrowserExternalRunnerAction,
  type BrowserExternalRunnerMode,
} from "./browserExternalRunnerProtocol.js";

export const BROWSER_EXTERNAL_RUNNER_MANIFEST_VERSION =
  "browser-external-runner-manifest/v1" as const;

export type BrowserExternalRunnerManifestVersion =
  typeof BROWSER_EXTERNAL_RUNNER_MANIFEST_VERSION;
export type BrowserExternalRunnerManifestSource =
  | "cli-harness"
  | "explicit-local-config"
  | "skill-managed"
  | "test-only";

export interface BrowserExternalRunnerCommand {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd?: string;
}

export interface BrowserExternalRunnerManifestFixture {
  readonly id: string;
  readonly kind: BrowserLocalFixtureKind;
  readonly title: string;
  readonly url: string;
  readonly textSummary: string;
  readonly allowedActions: readonly BrowserLocalFixtureAction[];
}

export interface BrowserExternalRunnerManifest {
  readonly manifestVersion: BrowserExternalRunnerManifestVersion;
  readonly source: BrowserExternalRunnerManifestSource;
  readonly runnerMode: BrowserExternalRunnerMode;
  readonly runnerId: string;
  readonly runnerCommand?: BrowserExternalRunnerCommand;
  readonly runnerRef?: string;
  readonly fixture: BrowserExternalRunnerManifestFixture;
  readonly allowedActions: readonly BrowserExternalRunnerAction[];
  readonly sandboxAuthority: "local-fixture";
  readonly networkAllowlist: "none";
  readonly confirmationState: "confirmed";
  readonly timeoutMs: number;
  readonly outputBudgetBytes: number;
  readonly evidencePolicy: "safe-summary-only";
  readonly redactions: readonly string[];
  readonly warnings: readonly string[];
}

export type BrowserExternalRunnerManifestValidationResult =
  | {
      readonly ok: true;
      readonly manifest: BrowserExternalRunnerManifest;
      readonly fixture: BrowserLocalFixture;
      readonly evidence: readonly string[];
      readonly warnings: readonly string[];
    }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly evidence: readonly string[];
      readonly warnings: readonly string[];
    };

const SAFE_ACTIONS = new Set<BrowserExternalRunnerAction>([
  "observe",
  "extract",
  "navigate-local",
]);

export function createBrowserExternalRunnerManifest(input: {
  readonly source?: BrowserExternalRunnerManifestSource;
  readonly runnerMode?: BrowserExternalRunnerMode;
  readonly runnerId?: string;
  readonly runnerCommand?: BrowserExternalRunnerCommand;
  readonly runnerRef?: string;
  readonly fixture?: Partial<BrowserExternalRunnerManifestFixture>;
  readonly timeoutMs?: number;
  readonly outputBudgetBytes?: number;
} = {}): BrowserExternalRunnerManifest {
  const fixture = createBrowserLocalFixture({
    fixtureId: input.fixture?.id ?? "fixture:route103-demo",
    fixtureKind: input.fixture?.kind,
    title: input.fixture?.title ?? "Route 103 external runner fixture",
    url: input.fixture?.url ?? "local-fixture://route103-demo",
    text: input.fixture?.textSummary ?? "Route 103 safe external runner fixture summary.",
    allowedActions: input.fixture?.allowedActions,
  });
  return {
    manifestVersion: BROWSER_EXTERNAL_RUNNER_MANIFEST_VERSION,
    source: input.source ?? "cli-harness",
    runnerMode: input.runnerMode ?? "test-local",
    runnerId: sanitizeRunnerId(input.runnerId ?? "route103-test-local-runner"),
    runnerCommand: input.runnerCommand,
    runnerRef: input.runnerRef,
    fixture: {
      id: fixture.fixtureId,
      kind: fixture.fixtureKind,
      title: fixture.safeTitle,
      url: fixture.safeUrl,
      textSummary: fixture.safeTextSummary,
      allowedActions: fixture.allowedActions,
    },
    allowedActions: ["observe", "extract", "navigate-local"],
    sandboxAuthority: "local-fixture",
    networkAllowlist: "none",
    confirmationState: "confirmed",
    timeoutMs: input.timeoutMs ?? 1500,
    outputBudgetBytes: input.outputBudgetBytes ?? 4096,
    evidencePolicy: "safe-summary-only",
    redactions: fixture.redactions,
    warnings: fixture.warnings,
  };
}

export function serializeBrowserExternalRunnerManifest(
  manifest: BrowserExternalRunnerManifest,
): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function validateBrowserExternalRunnerManifest(
  value: unknown,
): BrowserExternalRunnerManifestValidationResult {
  if (!isRecord(value)) {
    return invalid("External runner manifest must be a JSON object.");
  }
  if (value.manifestVersion !== BROWSER_EXTERNAL_RUNNER_MANIFEST_VERSION) {
    return invalid("External runner manifest version is unsupported.");
  }
  if (!isSource(value.source)) {
    return invalid("External runner manifest source is unsupported.");
  }
  if (!isRunnerMode(value.runnerMode)) {
    return invalid("External runner mode is unsupported.");
  }
  if (value.runnerMode === "skill-managed" && value.source !== "skill-managed") {
    return invalid("Skill-managed runner mode must use skill-managed source.");
  }
  if ((value.runnerMode === "test-local" || value.runnerMode === "external-local") && !isRunnerCommand(value.runnerCommand)) {
    return invalid("External local runner manifest requires an explicit runner command.");
  }
  if (value.runnerMode === "skill-managed" && !stringValue(value.runnerRef)) {
    return invalid("Skill-managed runner manifest requires an explicit runner reference.");
  }
  const runnerId = sanitizeRunnerId(stringValue(value.runnerId) ?? "external-runner");
  if (browserExternalRunnerHasForbiddenContent(runnerId)) {
    return invalid("External runner id contains unsafe content.");
  }
  const fixture = validateFixture(value.fixture);
  if (fixture.ok === false) {
    return fixture;
  }
  const allowedActions = Array.isArray(value.allowedActions)
    ? value.allowedActions
    : [];
  if (allowedActions.length === 0 || !allowedActions.every(isSafeAction)) {
    return invalid("External runner allowed actions must be read-only local fixture actions.");
  }
  if (value.sandboxAuthority !== "local-fixture" || value.networkAllowlist !== "none") {
    return invalid("External runner manifest must be local-fixture scoped with no network allowlist.");
  }
  if (value.confirmationState !== "confirmed") {
    return invalid("External runner manifest must carry confirmed local sandbox state.");
  }
  if (!isSafeInteger(value.timeoutMs, 50, 10_000) || !isSafeInteger(value.outputBudgetBytes, 256, 32_768)) {
    return invalid("External runner manifest requires bounded timeout and output budget.");
  }
  if (value.evidencePolicy !== "safe-summary-only") {
    return invalid("External runner manifest must use safe-summary-only evidence.");
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
  if (runnerCommand && !runnerCommandIsSafe(value.runnerMode, runnerCommand)) {
    return invalid("External runner command must be explicit, local/test scoped, and non-global.");
  }
  const manifest: BrowserExternalRunnerManifest = {
    manifestVersion: BROWSER_EXTERNAL_RUNNER_MANIFEST_VERSION,
    source: value.source,
    runnerMode: value.runnerMode,
    runnerId,
    runnerCommand,
    runnerRef: stringValue(value.runnerRef),
    fixture: fixture.entry,
    allowedActions: allowedActions as BrowserExternalRunnerAction[],
    sandboxAuthority: "local-fixture",
    networkAllowlist: "none",
    confirmationState: "confirmed",
    timeoutMs: value.timeoutMs,
    outputBudgetBytes: value.outputBudgetBytes,
    evidencePolicy: "safe-summary-only",
    redactions: stringArray(value.redactions),
    warnings: stringArray(value.warnings),
  };
  return {
    ok: true,
    manifest,
    fixture: createBrowserLocalFixture({
      fixtureId: fixture.entry.id,
      fixtureKind: fixture.entry.kind,
      title: fixture.entry.title,
      url: fixture.entry.url,
      text: fixture.entry.textSummary,
      allowedActions: fixture.entry.allowedActions,
    }),
    evidence: [
      "browser-external-runner-manifest:validated",
      `browser-external-runner-manifest:mode:${manifest.runnerMode}`,
      "browser-external-runner-manifest:local-fixture-only",
      "browser-external-runner-manifest:no-external-network",
      "browser-external-runner-manifest:no-raw-content",
    ],
    warnings: manifest.warnings,
  };
}

function validateFixture(value: unknown):
  | { readonly ok: true; readonly entry: BrowserExternalRunnerManifestFixture }
  | Extract<BrowserExternalRunnerManifestValidationResult, { ok: false }> {
  if (!isRecord(value)) {
    return invalid("External runner fixture must be a JSON object.");
  }
  const id = stringValue(value.id);
  const kind = stringValue(value.kind);
  const title = stringValue(value.title);
  const url = stringValue(value.url);
  const textSummary = stringValue(value.textSummary);
  if (!id || !kind || !title || !url || !textSummary) {
    return invalid("External runner fixture is missing required safe fields.");
  }
  if (!["static-page", "accessibility-summary", "extraction-result"].includes(kind)) {
    return invalid("External runner fixture kind is unsupported.");
  }
  if (!url.startsWith("local-fixture://")) {
    return invalid("External runner fixture URL must use local-fixture scheme.");
  }
  if ([id, title, url, textSummary].some(browserExternalRunnerHasForbiddenContent)) {
    return invalid("External runner fixture contains raw content or secret-looking data.");
  }
  const allowedActions = Array.isArray(value.allowedActions) ? value.allowedActions : [];
  if (
    allowedActions.length === 0 ||
    !allowedActions.every((item) => item === "observe" || item === "extract" || item === "navigate-local")
  ) {
    return invalid("External runner fixture allowedActions must be read-only local fixture actions.");
  }
  return {
    ok: true,
    entry: {
      id: sanitizeBrowserEvidenceText(id, 120).value,
      kind: kind as BrowserLocalFixtureKind,
      title: sanitizeBrowserEvidenceText(title, 80).value,
      url: sanitizeBrowserEvidenceText(url, 120).value,
      textSummary: sanitizeBrowserEvidenceText(textSummary, 180).value,
      allowedActions: allowedActions as BrowserLocalFixtureAction[],
    },
  };
}

function runnerCommandIsSafe(
  mode: BrowserExternalRunnerMode,
  command: BrowserExternalRunnerCommand,
): boolean {
  const combined = [command.command, ...command.args, command.cwd ?? ""].join("\n");
  if (browserExternalRunnerHasForbiddenContent(combined)) {
    return false;
  }
  if (/https?:\/\//i.test(combined) || /\b(mcp|browserbase|chromadb|playwright)\b/i.test(combined)) {
    return false;
  }
  if (mode === "test-local") {
    return command.args.some((arg) => arg.startsWith("/tmp/"));
  }
  return command.args.some((arg) => arg.startsWith("/tmp/") || arg.startsWith("./"));
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

function isSource(value: unknown): value is BrowserExternalRunnerManifestSource {
  return value === "cli-harness" || value === "explicit-local-config" || value === "skill-managed" || value === "test-only";
}

function isRunnerMode(value: unknown): value is BrowserExternalRunnerMode {
  return value === "external-local" || value === "skill-managed" || value === "test-local";
}

function isSafeInteger(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function sanitizeRunnerId(value: string): string {
  return sanitizeBrowserText(value, 120).replace(/[^A-Za-z0-9:_./-]+/g, "-");
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => sanitizeBrowserEvidenceText(item, 120).value)
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(
  reason: string,
): Extract<BrowserExternalRunnerManifestValidationResult, { ok: false }> {
  return {
    ok: false,
    reason,
    evidence: ["browser-external-runner-manifest:invalid"],
    warnings: ["browser-external-runner-manifest:blocked"],
  };
}
