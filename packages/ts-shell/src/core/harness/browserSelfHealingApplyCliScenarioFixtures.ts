import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  BROWSER_CLI_EXTERNAL_RUNNER_MANIFEST_ENV,
  BROWSER_CLI_LOCAL_FIXTURE_MANIFEST_ENV,
} from "../context/browserCliExecutorInjection.js";
import {
  createBrowserExternalRunnerManifest,
  serializeBrowserExternalRunnerManifest,
  validateBrowserExternalRunnerManifest,
} from "../context/browser/runtime/external/manifest.js";
import {
  createBrowserLocalFixtureManifest,
  serializeBrowserLocalFixtureManifest,
  validateBrowserLocalFixtureManifest,
} from "../context/browserLocalFixtureManifest.js";

export type BrowserSelfHealingApplyCliManifestKind =
  | "external-runner"
  | "skill-runner"
  | "local-fixture";

export interface BrowserSelfHealingApplyCliManifestFacts {
  readonly manifestKind: BrowserSelfHealingApplyCliManifestKind | "unknown";
  readonly valid: boolean;
  readonly runnerBindingPatched: boolean;
  readonly skillMetadataReady: boolean;
  readonly skillBindingReady: boolean;
  readonly localFixtureAllowlistPatched: boolean;
  readonly fixtureSummaryRefreshed: boolean;
  readonly warningMarkers: readonly string[];
}

export interface BrowserSelfHealingApplyCliScenarioFixture {
  readonly root: string;
  readonly manifestPath: string;
  readonly manifestKind: BrowserSelfHealingApplyCliManifestKind;
  readonly env: Readonly<Record<string, string>>;
  readonly proposalIds: {
    readonly runnerBinding: string;
    readonly skillMetadata: string;
    readonly allowlist: string;
    readonly fixtureRefresh: string;
    readonly externalBlocked: string;
    readonly unsafeEvidence: string;
  };
  inspectManifest(): BrowserSelfHealingApplyCliManifestFacts;
  cleanup(): void;
}

export function createBrowserSelfHealingApplyCliScenarioFixture(input: {
  readonly manifestKind: BrowserSelfHealingApplyCliManifestKind;
}): BrowserSelfHealingApplyCliScenarioFixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "browser-self-healing-cli-"));
  const runnerPath = path.join(root, "runner.cjs");
  fs.writeFileSync(runnerPath, runnerScript(), "utf8");
  const manifestPath = path.join(root, `${input.manifestKind}.json`);
  if (input.manifestKind === "local-fixture") {
    const manifest = createBrowserLocalFixtureManifest({
      fixture: {
        id: "fixture:route115-demo",
        title: "Route 115 local fixture",
        url: "local-fixture://route115-demo",
        textSummary: "Route 115 stale safe fixture summary.",
        allowedActions: ["observe", "extract", "navigate-local"],
      },
    });
    fs.writeFileSync(
      manifestPath,
      serializeBrowserLocalFixtureManifest({
        ...manifest,
        allowedLocalOrigins: [],
      }),
      "utf8",
    );
  } else {
    const skillManaged = input.manifestKind === "skill-runner";
    const manifest = createBrowserExternalRunnerManifest({
      source: skillManaged ? "skill-managed" : "test-only",
      runnerMode: skillManaged ? "skill-managed" : "test-local",
      runnerId: skillManaged ? "skill:route115-browser-runner" : "route115-test-runner",
      runnerRef: skillManaged ? "skill:route115-browser-runner" : undefined,
      runnerCommand: skillManaged ? undefined : { command: process.execPath, args: [runnerPath] },
      fixture: {
        id: "fixture:route115-demo",
        title: "Route 115 external runner fixture",
        url: "local-fixture://route115-demo",
        textSummary: "Route 115 safe external runner fixture summary.",
        allowedActions: ["observe", "extract", "navigate-local"],
      },
    });
    fs.writeFileSync(manifestPath, serializeBrowserExternalRunnerManifest(manifest), "utf8");
  }
  return {
    root,
    manifestPath,
    manifestKind: input.manifestKind,
    env: input.manifestKind === "local-fixture"
      ? { [BROWSER_CLI_LOCAL_FIXTURE_MANIFEST_ENV]: manifestPath }
      : { [BROWSER_CLI_EXTERNAL_RUNNER_MANIFEST_ENV]: manifestPath },
    proposalIds: {
      runnerBinding: proposalId("missing-runner-binding"),
      skillMetadata: proposalId("missing-skill-metadata"),
      allowlist: proposalId("allowlist-blocked"),
      fixtureRefresh: proposalId("stale-fixture"),
      externalBlocked: proposalId("external-url-blocked"),
      unsafeEvidence: proposalId("unsafe-evidence"),
    },
    inspectManifest() {
      return inspectBrowserSelfHealingApplyCliManifest(manifestPath);
    },
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

export function inspectBrowserSelfHealingApplyCliManifest(
  manifestPath: string,
): BrowserSelfHealingApplyCliManifestFacts {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    return emptyFacts("unknown", false);
  }
  const external = validateBrowserExternalRunnerManifest(parsed);
  if (external.ok) {
    const warnings = external.manifest.warnings;
    return {
      manifestKind: external.manifest.runnerMode === "skill-managed" ? "skill-runner" : "external-runner",
      valid: true,
      runnerBindingPatched: Boolean(external.manifest.runnerRef) &&
        warnings.includes("self-healing-manifest-patch:runner-binding"),
      skillMetadataReady: Boolean(external.manifest.skillRunnerMetadata),
      skillBindingReady: Boolean(external.manifest.skillRunnerBinding),
      localFixtureAllowlistPatched: false,
      fixtureSummaryRefreshed: false,
      warningMarkers: warnings.filter((warning) => warning.startsWith("self-healing-manifest-patch:")),
    };
  }
  const local = validateBrowserLocalFixtureManifest(parsed);
  if (local.ok) {
    const warnings = local.manifest.warnings;
    return {
      manifestKind: "local-fixture",
      valid: true,
      runnerBindingPatched: false,
      skillMetadataReady: false,
      skillBindingReady: false,
      localFixtureAllowlistPatched: local.manifest.allowedLocalOrigins.includes(local.manifest.fixtures[0]?.url ?? ""),
      fixtureSummaryRefreshed: local.manifest.fixtures[0]?.textSummary ===
        "Route 114 refreshed sanitized fixture summary.",
      warningMarkers: warnings.filter((warning) => warning.startsWith("self-healing-manifest-patch:")),
    };
  }
  return emptyFacts("unknown", false);
}

export function writeInvalidBrowserSelfHealingApplyCliManifest(root?: string): string {
  const manifestRoot = root ?? fs.mkdtempSync(path.join(os.tmpdir(), "browser-self-healing-cli-invalid-"));
  const manifestPath = path.join(manifestRoot, "invalid.json");
  fs.writeFileSync(manifestPath, "{ invalid json", "utf8");
  return manifestPath;
}

function proposalId(kind: string): string {
  return `browser-self-healing-proposal:route115:${kind}`;
}

function emptyFacts(
  manifestKind: BrowserSelfHealingApplyCliManifestFacts["manifestKind"],
  valid: boolean,
): BrowserSelfHealingApplyCliManifestFacts {
  return {
    manifestKind,
    valid,
    runnerBindingPatched: false,
    skillMetadataReady: false,
    skillBindingReady: false,
    localFixtureAllowlistPatched: false,
    fixtureSummaryRefreshed: false,
    warningMarkers: [],
  };
}

function runnerScript(): string {
  return [
    "let input = '';",
    "process.stdin.on('data', chunk => { input += chunk; });",
    "process.stdin.on('end', () => {",
    "  const request = JSON.parse(input);",
    "  process.stdout.write(JSON.stringify({",
    "    status: 'executed', executed: true, mode: 'test-local',",
    "    evidence: { safeTitle: 'Route 115 fixture', safeUrl: request.safeUrl, safeObservationSummary: 'Route 115 safe observed summary.' },",
    "    warnings: [], redactions: [], rawContent: 'excluded', providerCall: 'none', modelCall: 'none', browserSessionPersistence: 'none'",
    "  }));",
    "});",
  ].join("\n");
}
