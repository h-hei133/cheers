import fs from "node:fs";
import {
  validateBrowserExternalRunnerManifest,
  type BrowserExternalRunnerManifest,
} from "../../browser/runtime/external/manifest.js";
import {
  validateBrowserLocalFixtureManifest,
  type BrowserLocalFixtureManifest,
} from "./browserLocalFixtureManifest.js";
import type { BrowserLocalFixture } from "./browserLocalFixture.js";

export const BROWSER_CLI_LOCAL_FIXTURE_MANIFEST_ENV =
  "PRIVATE_AGENTS_BROWSER_LOCAL_FIXTURE_MANIFEST";
export const BROWSER_CLI_EXTERNAL_RUNNER_MANIFEST_ENV =
  "PRIVATE_AGENTS_BROWSER_EXTERNAL_RUNNER_MANIFEST";

export type BrowserCliExecutorInjectionStatus =
  | "disabled"
  | "valid"
  | "missing-manifest"
  | "invalid-manifest";

export interface BrowserCliExecutorInjection {
  readonly status: BrowserCliExecutorInjectionStatus;
  readonly source: "none" | "cli-harness" | "test-only";
  readonly manifestStatus: "missing" | "valid" | "invalid";
  readonly manifest?: BrowserLocalFixtureManifest;
  readonly externalRunnerManifest?: BrowserExternalRunnerManifest;
  readonly fixture?: BrowserLocalFixture;
  readonly reason: string;
  readonly evidence: readonly string[];
  readonly warnings: readonly string[];
  readonly redactions: readonly string[];
}

export function loadBrowserCliExecutorInjectionFromEnv(input: {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly readFile?: (path: string) => string;
} = {}): BrowserCliExecutorInjection {
  const env = input.env ?? process.env;
  const externalManifestPath = env[BROWSER_CLI_EXTERNAL_RUNNER_MANIFEST_ENV];
  const manifestPath = env[BROWSER_CLI_LOCAL_FIXTURE_MANIFEST_ENV];
  if (externalManifestPath) {
    return loadExternalRunnerManifest({
      manifestPath: externalManifestPath,
      readFile: input.readFile,
    });
  }
  if (!manifestPath) {
    return {
      status: "disabled",
      source: "none",
      manifestStatus: "missing",
      reason: "No CLI browser local fixture manifest was provided.",
      evidence: [
        "browser-cli-executor-injection:disabled",
        "browser-cli-executor-injection:no-default-execution",
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
    return invalid("Manifest file could not be read.", "missing-manifest");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return invalid("Manifest JSON could not be parsed.", "invalid-manifest");
  }
  const validation = validateBrowserLocalFixtureManifest(parsed);
  if (validation.ok === false) {
    return invalid(validation.reason, "invalid-manifest", validation.evidence);
  }
  return {
    status: "valid",
    source: validation.manifest.source,
    manifestStatus: "valid",
    manifest: validation.manifest,
    fixture: validation.fixture,
    reason: "Explicit CLI harness local fixture manifest is valid.",
    evidence: [
      ...validation.evidence,
      "browser-cli-executor-injection:valid",
      "browser-cli-executor-injection:test-local-only",
      "browser-cli-executor-injection:no-provider-model-browser-network",
    ],
    warnings: validation.warnings,
    redactions: validation.manifest.redactions,
  };
}

function loadExternalRunnerManifest(input: {
  readonly manifestPath: string;
  readonly readFile?: (path: string) => string;
}): BrowserCliExecutorInjection {
  const readFile = input.readFile ?? ((path) => fs.readFileSync(path, "utf8"));
  let raw: string;
  try {
    raw = readFile(input.manifestPath);
  } catch {
    return invalid("External runner manifest file could not be read.", "missing-manifest");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return invalid("External runner manifest JSON could not be parsed.", "invalid-manifest");
  }
  const validation = validateBrowserExternalRunnerManifest(parsed);
  if (validation.ok === false) {
    return invalid(validation.reason, "invalid-manifest", validation.evidence);
  }
  return {
    status: "valid",
    source: validation.manifest.source === "test-only" ? "test-only" : "cli-harness",
    manifestStatus: "valid",
    externalRunnerManifest: validation.manifest,
    fixture: validation.fixture,
    reason: "Explicit CLI external runner manifest is valid.",
    evidence: [
      ...validation.evidence,
      "browser-cli-executor-injection:external-runner-valid",
      "browser-cli-executor-injection:test-local-only",
      "browser-cli-executor-injection:no-provider-model-browser-network",
    ],
    warnings: validation.warnings,
    redactions: validation.manifest.redactions,
  };
}

function invalid(
  reason: string,
  status: "missing-manifest" | "invalid-manifest",
  evidence: readonly string[] = [],
): BrowserCliExecutorInjection {
  return {
    status,
    source: "none",
    manifestStatus: "invalid",
    reason,
    evidence: [
      ...evidence,
      `browser-cli-executor-injection:${status}`,
      "browser-cli-executor-injection:safe-error",
      "browser-cli-executor-injection:no-default-execution",
    ],
    warnings: ["browser-cli-executor-injection:blocked"],
    redactions: ["manifest-content"],
  };
}
