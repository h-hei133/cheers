import { isRecord } from "../core/values/record.js";
import { sanitizeBrowserText } from "./capabilityModel.js";
import {
  createBrowserNetworkAllowlist,
  normalizeBrowserAllowedOrigin,
  parseBrowserNetworkTarget,
} from "./networkAllowlist.js";
import { createBrowserSandboxAuthority } from "./sandboxAuthority.js";
import type { BrowserExecutionConfirmationRecord } from "./executionConfirmation.js";
import type { BrowserExecutionActionKind } from "./executionContract.js";
import fs from "node:fs";

export const BROWSER_CLI_EXTERNAL_NETWORK_RUNNER_MANIFEST_ENV =
  "PRIVATE_AGENTS_BROWSER_EXTERNAL_NETWORK_RUNNER_MANIFEST";

export const BROWSER_EXTERNAL_NETWORK_RUNNER_MANIFEST_VERSION =
  "browser-external-network-runner-manifest/v1" as const;

export type BrowserExternalNetworkRunnerManifestVersion =
  typeof BROWSER_EXTERNAL_NETWORK_RUNNER_MANIFEST_VERSION;
export type BrowserExternalNetworkRunnerManifestSource =
  | "cli-harness"
  | "explicit-local-config"
  | "test-only";
export type BrowserExternalNetworkRunnerManifestMode =
  | "simulated-external"
  | "disabled"
  | "future-real-external";
export type BrowserExternalNetworkActionKind = Extract<
  BrowserExecutionActionKind,
  "navigate" | "observe" | "extract"
>;

export interface BrowserExternalNetworkRunnerManifest {
  readonly manifestVersion: BrowserExternalNetworkRunnerManifestVersion;
  readonly source: BrowserExternalNetworkRunnerManifestSource;
  readonly runnerMode: BrowserExternalNetworkRunnerManifestMode;
  readonly runnerId: string;
  readonly allowedOrigins: readonly string[];
  readonly allowedActionKinds: readonly BrowserExternalNetworkActionKind[];
  readonly disallowedSensitiveActions: readonly string[];
  readonly timeoutMs: number;
  readonly outputBudgetBytes: number;
  readonly evidenceContract: "safe-summary-only";
  readonly networkExecution: false;
  readonly warnings: readonly string[];
}

export type BrowserExternalNetworkRunnerManifestValidationResult =
  | {
      readonly ok: true;
      readonly manifest: BrowserExternalNetworkRunnerManifest;
      readonly evidence: readonly string[];
      readonly warnings: readonly string[];
    }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly evidence: readonly string[];
      readonly warnings: readonly string[];
    };

export type BrowserExternalNetworkRunnerManifestLoadResult =
  | {
      readonly status: "missing";
      readonly manifest?: undefined;
      readonly reason: string;
      readonly evidence: readonly string[];
      readonly warnings: readonly string[];
      readonly redactions: readonly string[];
    }
  | {
      readonly status: "valid";
      readonly manifest: BrowserExternalNetworkRunnerManifest;
      readonly reason: string;
      readonly evidence: readonly string[];
      readonly warnings: readonly string[];
      readonly redactions: readonly string[];
    }
  | {
      readonly status: "invalid";
      readonly manifest?: undefined;
      readonly reason: string;
      readonly evidence: readonly string[];
      readonly warnings: readonly string[];
      readonly redactions: readonly string[];
    };

export interface BrowserExternalNetworkRunnerHarnessContext {
  readonly browserSandboxAuthority?: ReturnType<typeof createBrowserSandboxAuthority>;
  readonly browserNetworkAllowlist?: ReturnType<typeof createBrowserNetworkAllowlist>;
  readonly browserExecutionConfirmations?: readonly BrowserExecutionConfirmationRecord[];
}

const READ_ONLY_ACTIONS = new Set<BrowserExternalNetworkActionKind>([
  "navigate",
  "observe",
  "extract",
]);
const SENSITIVE_ACTIONS = [
  "auth",
  "payment",
  "destructive",
  "upload",
  "download",
  "screenshot",
  "ocr",
] as const;

export function createBrowserExternalNetworkRunnerManifest(input: {
  readonly source?: BrowserExternalNetworkRunnerManifestSource;
  readonly runnerMode?: BrowserExternalNetworkRunnerManifestMode;
  readonly runnerId?: string;
  readonly allowedOrigins?: readonly string[];
  readonly allowedActionKinds?: readonly BrowserExternalNetworkActionKind[];
  readonly timeoutMs?: number;
  readonly outputBudgetBytes?: number;
  readonly warnings?: readonly string[];
} = {}): BrowserExternalNetworkRunnerManifest {
  return {
    manifestVersion: BROWSER_EXTERNAL_NETWORK_RUNNER_MANIFEST_VERSION,
    source: input.source ?? "test-only",
    runnerMode: input.runnerMode ?? "simulated-external",
    runnerId: sanitizeRunnerId(input.runnerId ?? "route117-simulated-external-runner"),
    allowedOrigins: (input.allowedOrigins ?? ["https://example.com"]).map(normalizeOriginForManifest),
    allowedActionKinds: input.allowedActionKinds ?? ["navigate", "observe", "extract"],
    disallowedSensitiveActions: SENSITIVE_ACTIONS,
    timeoutMs: input.timeoutMs ?? 1500,
    outputBudgetBytes: input.outputBudgetBytes ?? 2048,
    evidenceContract: "safe-summary-only",
    networkExecution: false,
    warnings: sanitizeStringArray(input.warnings ?? []),
  };
}

export function serializeBrowserExternalNetworkRunnerManifest(
  manifest: BrowserExternalNetworkRunnerManifest,
): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function validateBrowserExternalNetworkRunnerManifest(
  value: unknown,
): BrowserExternalNetworkRunnerManifestValidationResult {
  if (!isRecord(value)) {
    return invalid("External-network runner manifest must be a JSON object.");
  }
  if (value.manifestVersion !== BROWSER_EXTERNAL_NETWORK_RUNNER_MANIFEST_VERSION) {
    return invalid("External-network runner manifest version is unsupported.");
  }
  if (!isSource(value.source)) {
    return invalid("External-network runner manifest source is unsupported.");
  }
  if (!isRunnerMode(value.runnerMode)) {
    return invalid("External-network runner mode is unsupported.");
  }
  if (value.networkExecution !== false) {
    return invalid("External-network runner manifest must keep networkExecution false.");
  }
  if (value.evidenceContract !== "safe-summary-only") {
    return invalid("External-network runner manifest must use safe-summary-only evidence.");
  }
  const runnerId = sanitizeRunnerId(stringValue(value.runnerId) ?? "external-network-runner");
  if (hasForbiddenContent(runnerId)) {
    return invalid("External-network runner id contains unsafe content.");
  }
  const origins = parseAllowedOrigins(value.allowedOrigins);
  if (origins.ok === false) {
    return invalid(origins.reason);
  }
  const actionKinds = parseActionKinds(value.allowedActionKinds);
  if (actionKinds.ok === false) {
    return invalid(actionKinds.reason);
  }
  const sensitive = sanitizeStringArray(
    Array.isArray(value.disallowedSensitiveActions)
      ? value.disallowedSensitiveActions
      : [],
  );
  if (!SENSITIVE_ACTIONS.every((action) => sensitive.includes(action))) {
    return invalid("External-network runner manifest must explicitly disallow sensitive actions.");
  }
  if (!isSafeInteger(value.timeoutMs, 50, 10_000) || !isSafeInteger(value.outputBudgetBytes, 256, 16_384)) {
    return invalid("External-network runner manifest requires bounded timeout and output budgets.");
  }
  const manifest: BrowserExternalNetworkRunnerManifest = {
    manifestVersion: BROWSER_EXTERNAL_NETWORK_RUNNER_MANIFEST_VERSION,
    source: value.source,
    runnerMode: value.runnerMode,
    runnerId,
    allowedOrigins: origins.origins,
    allowedActionKinds: actionKinds.actionKinds,
    disallowedSensitiveActions: sensitive,
    timeoutMs: value.timeoutMs,
    outputBudgetBytes: value.outputBudgetBytes,
    evidenceContract: "safe-summary-only",
    networkExecution: false,
    warnings: sanitizeStringArray(Array.isArray(value.warnings) ? value.warnings : []),
  };
  return {
    ok: true,
    manifest,
    evidence: [
      "browser-external-network-runner-manifest:validated",
      `browser-external-network-runner-manifest:mode:${manifest.runnerMode}`,
      "browser-external-network-runner-manifest:no-network-execution",
      "browser-external-network-runner-manifest:safe-summary-only",
    ],
    warnings: manifest.warnings,
  };
}

export function loadBrowserExternalNetworkRunnerManifestFromEnv(input: {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly readFile?: (path: string) => string;
} = {}): BrowserExternalNetworkRunnerManifestLoadResult {
  const env = input.env ?? process.env;
  const manifestPath = env[BROWSER_CLI_EXTERNAL_NETWORK_RUNNER_MANIFEST_ENV];
  if (!manifestPath) {
    return {
      status: "missing",
      reason: "No external-network runner manifest was provided.",
      evidence: [
        "browser-external-network-runner-manifest-load:missing",
        "browser-external-network-runner-manifest-load:no-default-runner",
      ],
      warnings: [],
      redactions: [],
    };
  }
  const readFile = input.readFile ?? ((path) => fs.readFileSync(path, "utf8"));
  let raw: string;
  try {
    raw = readFile(manifestPath);
  } catch {
    return invalidLoad("External-network runner manifest file could not be read.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return invalidLoad("External-network runner manifest JSON could not be parsed.");
  }
  const validation = validateBrowserExternalNetworkRunnerManifest(parsed);
  if (validation.ok === false) {
    return invalidLoad(validation.reason, validation.evidence);
  }
  return {
    status: "valid",
    manifest: validation.manifest,
    reason: "Explicit external-network runner manifest is valid.",
    evidence: [
      ...validation.evidence,
      "browser-external-network-runner-manifest-load:valid",
      "browser-external-network-runner-manifest-load:explicit-only",
    ],
    warnings: validation.warnings,
    redactions: [],
  };
}

export function createBrowserExternalNetworkRunnerHarnessContext(
  loadResult: BrowserExternalNetworkRunnerManifestLoadResult,
): BrowserExternalNetworkRunnerHarnessContext {
  if (loadResult.status !== "valid") {
    return {};
  }
  return {
    browserSandboxAuthority: createBrowserSandboxAuthority({ mode: "future-runtime" }),
    browserNetworkAllowlist: createBrowserNetworkAllowlist({
      allowedOrigins: loadResult.manifest.allowedOrigins.map((origin) => ({
        origin,
        mode: "future-runtime",
        label: "external-network-runner-manifest",
      })),
      evidence: [
        "browser-external-network-runner-manifest:harness-allowlist",
        "browser-external-network-runner-manifest:explicit-env-only",
      ],
    }),
    browserExecutionConfirmations: [{ kind: "network", status: "confirmed" }],
  };
}

function parseAllowedOrigins(value: unknown):
  | { readonly ok: true; readonly origins: readonly string[] }
  | { readonly ok: false; readonly reason: string } {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, reason: "External-network runner manifest requires explicit allowed origins." };
  }
  const origins: string[] = [];
  for (const item of value) {
    const origin = stringValue(item);
    if (!origin || origin === "*" || origin.includes("*")) {
      return { ok: false, reason: "External-network runner manifest cannot use wildcard origins." };
    }
    const target = parseBrowserNetworkTarget(origin);
    if (target.hasCredentials) {
      return { ok: false, reason: "External-network runner manifest cannot include credential URLs." };
    }
    if (target.parseError || target.scheme !== "https") {
      return { ok: false, reason: "External-network runner manifest origins must be valid https origins." };
    }
    const normalized = normalizeBrowserAllowedOrigin(origin);
    if (!normalized) {
      return { ok: false, reason: "External-network runner manifest origin is unsupported." };
    }
    origins.push(normalized);
  }
  return { ok: true, origins: unique(origins) };
}

function parseActionKinds(value: unknown):
  | { readonly ok: true; readonly actionKinds: readonly BrowserExternalNetworkActionKind[] }
  | { readonly ok: false; readonly reason: string } {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, reason: "External-network runner manifest requires allowed action kinds." };
  }
  const actionKinds: BrowserExternalNetworkActionKind[] = [];
  for (const item of value) {
    if (!isReadOnlyAction(item)) {
      return { ok: false, reason: "External-network runner manifest only allows navigate, observe, and extract." };
    }
    actionKinds.push(item);
  }
  return { ok: true, actionKinds: unique(actionKinds) };
}

function normalizeOriginForManifest(origin: string): string {
  return normalizeBrowserAllowedOrigin(origin) ?? "https://example.com";
}

function isReadOnlyAction(value: unknown): value is BrowserExternalNetworkActionKind {
  return typeof value === "string" && READ_ONLY_ACTIONS.has(value as BrowserExternalNetworkActionKind);
}

function isSource(value: unknown): value is BrowserExternalNetworkRunnerManifestSource {
  return value === "cli-harness" || value === "explicit-local-config" || value === "test-only";
}

function isRunnerMode(value: unknown): value is BrowserExternalNetworkRunnerManifestMode {
  return value === "simulated-external" || value === "disabled" || value === "future-real-external";
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function sanitizeRunnerId(value: string): string {
  return sanitizeBrowserText(value, 120)
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "external-network-runner";
}

function hasForbiddenContent(value: string): boolean {
  return /(sk-[a-z0-9]|api[_-]?key|token|secret|password|<html|<body|hidden reasoning)/i.test(value);
}

function sanitizeStringArray(values: readonly unknown[]): readonly string[] {
  return unique(
    values
      .filter((value): value is string => typeof value === "string")
      .map((value) => sanitizeBrowserText(value, 160)),
  );
}

function isSafeInteger(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function unique<T extends string>(values: readonly T[]): readonly T[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function invalid(
  reason: string,
): BrowserExternalNetworkRunnerManifestValidationResult {
  return {
    ok: false,
    reason,
    evidence: [
      "browser-external-network-runner-manifest:invalid",
      "browser-external-network-runner-manifest:no-network-execution",
      "browser-external-network-runner-manifest:safe-error",
    ],
    warnings: ["browser-external-network-runner-manifest:blocked"],
  };
}

function invalidLoad(
  reason: string,
  evidence: readonly string[] = [],
): BrowserExternalNetworkRunnerManifestLoadResult {
  return {
    status: "invalid",
    reason,
    evidence: [
      ...evidence,
      "browser-external-network-runner-manifest-load:invalid",
      "browser-external-network-runner-manifest-load:safe-error",
      "browser-external-network-runner-manifest-load:no-default-runner",
    ],
    warnings: ["browser-external-network-runner-manifest-load:blocked"],
    redactions: ["manifest-content"],
  };
}
