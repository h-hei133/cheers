import fs from "node:fs";
import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import { createBrowserNetworkAllowlist } from "./browserNetworkAllowlist.js";
import { createBrowserSandboxAuthority } from "./browserSandboxAuthority.js";
import type { BrowserExecutionConfirmationRecord } from "./browserExecutionConfirmation.js";
import type { BrowserExternalNetworkActionKind } from "./browserExternalNetworkRunnerManifest.js";
import { validateBrowserControlledNetworkOrigin } from "./browserControlledNetworkOrigin.js";

export const BROWSER_CLI_CONTROLLED_NETWORK_RUNNER_MANIFEST_ENV =
  "PRIVATE_AGENTS_BROWSER_CONTROLLED_NETWORK_RUNNER_MANIFEST";
export const BROWSER_CONTROLLED_NETWORK_RUNNER_MANIFEST_VERSION =
  "browser-controlled-network-runner-manifest/v1" as const;

export type BrowserControlledNetworkRunnerManifestSource = "cli-harness" | "test-only";

export interface BrowserControlledNetworkRunnerManifest {
  readonly manifestVersion: typeof BROWSER_CONTROLLED_NETWORK_RUNNER_MANIFEST_VERSION;
  readonly source: BrowserControlledNetworkRunnerManifestSource;
  readonly runnerMode: "controlled-network-test";
  readonly allowedLoopbackOrigin: string;
  readonly allowedActionKinds: readonly BrowserExternalNetworkActionKind[];
  readonly runId: string;
  readonly timeoutMs: number;
  readonly outputBudgetBytes: number;
  readonly evidenceContract: "safe-summary-only";
  readonly publicNetworkAllowed: false;
  readonly browserLaunchAllowed: false;
  readonly warnings: readonly string[];
}

export type BrowserControlledNetworkRunnerManifestLoadResult =
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
      readonly manifest: BrowserControlledNetworkRunnerManifest;
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

export interface BrowserControlledNetworkHarnessContext {
  readonly browserSandboxAuthority?: ReturnType<typeof createBrowserSandboxAuthority>;
  readonly browserNetworkAllowlist?: ReturnType<typeof createBrowserNetworkAllowlist>;
  readonly browserExecutionConfirmations?: readonly BrowserExecutionConfirmationRecord[];
}

const ACTIONS = new Set(["navigate", "observe", "extract"]);
const SENSITIVE_ACTIONS = ["auth", "payment", "destructive", "upload", "download", "screenshot", "ocr"] as const;

export function createBrowserControlledNetworkRunnerManifest(input: {
  readonly source?: BrowserControlledNetworkRunnerManifestSource;
  readonly allowedLoopbackOrigin: string;
  readonly allowedActionKinds?: readonly BrowserExternalNetworkActionKind[];
  readonly runId?: string;
  readonly timeoutMs?: number;
  readonly outputBudgetBytes?: number;
  readonly warnings?: readonly string[];
}): BrowserControlledNetworkRunnerManifest {
  return {
    manifestVersion: BROWSER_CONTROLLED_NETWORK_RUNNER_MANIFEST_VERSION,
    source: input.source ?? "test-only",
    runnerMode: "controlled-network-test",
    allowedLoopbackOrigin: input.allowedLoopbackOrigin,
    allowedActionKinds: input.allowedActionKinds ?? ["navigate", "observe", "extract"],
    runId: sanitizeId(input.runId ?? "route118-controlled-network"),
    timeoutMs: input.timeoutMs ?? 1500,
    outputBudgetBytes: input.outputBudgetBytes ?? 2048,
    evidenceContract: "safe-summary-only",
    publicNetworkAllowed: false,
    browserLaunchAllowed: false,
    warnings: sanitizeList(input.warnings ?? []),
  };
}

export function serializeBrowserControlledNetworkRunnerManifest(
  manifest: BrowserControlledNetworkRunnerManifest,
): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function validateBrowserControlledNetworkRunnerManifest(
  value: unknown,
): BrowserControlledNetworkRunnerManifestLoadResult {
  if (!isRecord(value)) {
    return invalid("Controlled-network runner manifest must be a JSON object.");
  }
  if (value.manifestVersion !== BROWSER_CONTROLLED_NETWORK_RUNNER_MANIFEST_VERSION) {
    return invalid("Controlled-network runner manifest version is unsupported.");
  }
  if (value.source !== "cli-harness" && value.source !== "test-only") {
    return invalid("Controlled-network runner manifest source is unsupported.");
  }
  if (value.runnerMode !== "controlled-network-test") {
    return invalid("Controlled-network runner mode is unsupported.");
  }
  if (value.publicNetworkAllowed !== false || value.browserLaunchAllowed !== false) {
    return invalid("Controlled-network runner must disable public network and browser launch.");
  }
  if (value.evidenceContract !== "safe-summary-only") {
    return invalid("Controlled-network runner manifest must use safe-summary-only evidence.");
  }
  const runId = sanitizeId(stringValue(value.runId) ?? "controlled-network-run");
  if (hasForbiddenContent(runId)) {
    return invalid("Controlled-network run id contains unsafe content.");
  }
  const origin = stringValue(value.allowedLoopbackOrigin);
  const originValidation = origin
    ? validateBrowserControlledNetworkOrigin({ origin, runId })
    : undefined;
  if (!originValidation) {
    return invalid("Controlled-network manifest requires loopback origin.");
  }
  if (originValidation.ok === false) {
    return invalid(originValidation.reason, originValidation.evidence, originValidation.redactions);
  }
  const actions = parseActions(value.allowedActionKinds);
  if (actions.ok === false) {
    return invalid(actions.reason);
  }
  if (!isSafeInteger(value.timeoutMs, 50, 10_000) || !isSafeInteger(value.outputBudgetBytes, 256, 16_384)) {
    return invalid("Controlled-network runner manifest requires bounded timeout and output budgets.");
  }
  const manifest: BrowserControlledNetworkRunnerManifest = {
    manifestVersion: BROWSER_CONTROLLED_NETWORK_RUNNER_MANIFEST_VERSION,
    source: value.source,
    runnerMode: "controlled-network-test",
    allowedLoopbackOrigin: originValidation.origin.origin,
    allowedActionKinds: actions.actions,
    runId,
    timeoutMs: value.timeoutMs,
    outputBudgetBytes: value.outputBudgetBytes,
    evidenceContract: "safe-summary-only",
    publicNetworkAllowed: false,
    browserLaunchAllowed: false,
    warnings: sanitizeList(Array.isArray(value.warnings) ? value.warnings : []),
  };
  return {
    status: "valid",
    manifest,
    reason: "Explicit controlled-network runner manifest is valid.",
    evidence: [
      ...originValidation.evidence,
      ...originValidation.origin.evidence,
      "browser-controlled-network-runner-manifest:validated",
      "browser-controlled-network-runner-manifest:no-public-internet",
      "browser-controlled-network-runner-manifest:no-browser-launch",
    ],
    warnings: manifest.warnings,
    redactions: [],
  };
}

export function loadBrowserControlledNetworkRunnerManifestFromEnv(input: {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly readFile?: (path: string) => string;
} = {}): BrowserControlledNetworkRunnerManifestLoadResult {
  const env = input.env ?? process.env;
  const manifestPath = env[BROWSER_CLI_CONTROLLED_NETWORK_RUNNER_MANIFEST_ENV];
  if (!manifestPath) {
    return {
      status: "missing",
      reason: "No controlled-network runner manifest was provided.",
      evidence: [
        "browser-controlled-network-runner-manifest-load:missing",
        "browser-controlled-network-runner-manifest-load:no-default-runner",
      ],
      warnings: [],
      redactions: [],
    };
  }
  const readFile = input.readFile ?? ((path) => fs.readFileSync(path, "utf8"));
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFile(manifestPath));
  } catch {
    return invalid("Controlled-network runner manifest could not be read or parsed.");
  }
  const validation = validateBrowserControlledNetworkRunnerManifest(parsed);
  return validation.status === "valid"
    ? {
        ...validation,
        evidence: [
          ...validation.evidence,
          "browser-controlled-network-runner-manifest-load:valid",
          "browser-controlled-network-runner-manifest-load:explicit-only",
        ],
      }
    : validation;
}

export function createBrowserControlledNetworkHarnessContext(
  loadResult: BrowserControlledNetworkRunnerManifestLoadResult,
): BrowserControlledNetworkHarnessContext {
  if (loadResult.status !== "valid") {
    return {};
  }
  return {
    browserSandboxAuthority: createBrowserSandboxAuthority({ mode: "future-runtime" }),
    browserNetworkAllowlist: createBrowserNetworkAllowlist({
      allowedOrigins: [{
        origin: loadResult.manifest.allowedLoopbackOrigin,
        mode: "future-runtime",
        label: "controlled-network-runner-manifest",
      }],
      allowPrivateNetworkInTest: true,
      evidence: [
        "browser-controlled-network-runner-manifest:harness-allowlist",
        "browser-controlled-network-runner-manifest:loopback-only",
      ],
    }),
    browserExecutionConfirmations: [{ kind: "network", status: "confirmed" }],
  };
}

function parseActions(value: unknown):
  | { readonly ok: true; readonly actions: readonly BrowserExternalNetworkActionKind[] }
  | { readonly ok: false; readonly reason: string } {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, reason: "Controlled-network manifest requires allowed action kinds." };
  }
  const actions: BrowserExternalNetworkActionKind[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !ACTIONS.has(item) || SENSITIVE_ACTIONS.includes(item as never)) {
      return { ok: false, reason: "Controlled-network manifest only allows navigate, observe, and extract." };
    }
    actions.push(item as BrowserExternalNetworkActionKind);
  }
  return { ok: true, actions: Array.from(new Set(actions)) };
}

function invalid(
  reason: string,
  evidence: readonly string[] = [],
  redactions: readonly string[] = [],
): BrowserControlledNetworkRunnerManifestLoadResult {
  return {
    status: "invalid",
    reason,
    evidence: [
      ...evidence,
      "browser-controlled-network-runner-manifest:invalid",
      "browser-controlled-network-runner-manifest:safe-error",
      "browser-controlled-network-runner-manifest:no-default-runner",
    ],
    warnings: ["browser-controlled-network-runner-manifest:blocked"],
    redactions,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function isSafeInteger(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function sanitizeId(value: string): string {
  return sanitizeBrowserText(value, 120)
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "controlled-network-run";
}

function sanitizeList(values: readonly unknown[]): readonly string[] {
  return Array.from(new Set(values
    .filter((value): value is string => typeof value === "string")
    .map((value) => sanitizeBrowserText(value, 160))
    .filter(Boolean)));
}

function hasForbiddenContent(value: string): boolean {
  return /(sk-[a-z0-9]|api[_-]?key|token|secret|password|hidden reasoning|<html|<body)/i.test(value);
}
