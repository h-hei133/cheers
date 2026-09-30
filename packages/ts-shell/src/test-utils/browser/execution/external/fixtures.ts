import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  BROWSER_CLI_EXTERNAL_RUNNER_MANIFEST_ENV,
} from "../../../../browser/cliExecutorInjection.js";
import {
  createBrowserExternalRunnerManifest,
  serializeBrowserExternalRunnerManifest,
  type BrowserExternalRunnerManifest,
} from "../../../../browser/runtime/external/manifest.js";

export interface BrowserExternalRunnerScenarioFixture {
  readonly root: string;
  readonly manifestPath: string;
  readonly runnerPath: string;
  readonly manifest: BrowserExternalRunnerManifest;
  readonly env: Readonly<Record<string, string>>;
  cleanup(): void;
}

export type BrowserExternalRunnerFixtureKind =
  | "success"
  | "malformed"
  | "timeout"
  | "unsafe-output";

export function createBrowserExternalRunnerScenarioFixture(input: {
  readonly kind?: BrowserExternalRunnerFixtureKind;
  readonly unsafeManifest?: unknown;
} = {}): BrowserExternalRunnerScenarioFixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cheers-browser-external-runner-"));
  const runnerPath = path.join(root, "runner.cjs");
  const manifestPath = path.join(root, "browser-external-runner-manifest.json");
  fs.writeFileSync(runnerPath, runnerScript(input.kind ?? "success"), "utf8");
  const manifest = createBrowserExternalRunnerManifest({
    source: "cli-harness",
    runnerMode: "test-local",
    runnerId: `route103-${input.kind ?? "success"}-runner`,
    runnerCommand: {
      command: process.execPath,
      args: [runnerPath],
    },
    fixture: {
      id: "fixture:route103-demo",
      title: "Route 103 external runner fixture",
      url: "local-fixture://route103-demo",
      textSummary: "Route 103 safe external runner fixture summary for observe and extract.",
      allowedActions: ["observe", "extract", "navigate-local"],
    },
    timeoutMs: input.kind === "timeout" ? 120 : 1500,
    outputBudgetBytes: 4096,
  });
  fs.writeFileSync(
    manifestPath,
    input.unsafeManifest
      ? `${JSON.stringify(input.unsafeManifest, null, 2)}\n`
      : serializeBrowserExternalRunnerManifest(manifest),
    "utf8",
  );
  return {
    root,
    manifestPath,
    runnerPath,
    manifest,
    env: {
      [BROWSER_CLI_EXTERNAL_RUNNER_MANIFEST_ENV]: manifestPath,
    },
    cleanup: () => {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

function runnerScript(kind: BrowserExternalRunnerFixtureKind): string {
  if (kind === "malformed") {
    return "process.stdin.resume(); process.stdin.on('end', () => process.stdout.write('not json RAW_RUNNER_PAYLOAD'));\n";
  }
  if (kind === "timeout") {
    return "process.stdin.resume(); setTimeout(() => process.stdout.write('{}'), 5000);\n";
  }
  if (kind === "unsafe-output") {
    return [
      "process.stdin.resume();",
      "process.stdin.on('end', () => process.stdout.write(JSON.stringify({",
      "status: 'executed', executed: true, mode: 'test-local',",
      "evidence: { safeObservationSummary: '<html>sk-testsecret123</html>' },",
      "warnings: [], redactions: [], rawContent: 'excluded', providerCall: 'none', modelCall: 'none', browserSessionPersistence: 'none'",
      "})));",
    ].join("\n");
  }
  return [
    "let input = '';",
    "process.stdin.on('data', chunk => { input += chunk; });",
    "process.stdin.on('end', () => {",
    "  const request = JSON.parse(input);",
    "  const extraction = request.action === 'extract' ? 'Safe extracted Route 103 fixture summary.' : undefined;",
    "  const observation = request.action !== 'extract' ? 'Safe observed Route 103 fixture summary.' : undefined;",
    "  process.stdout.write(JSON.stringify({",
    "    status: 'executed', executed: true, mode: 'test-local',",
    "    evidence: {",
    "      safeTitle: 'Route 103 external runner fixture',",
    "      safeUrl: request.safeUrl,",
    "      safeObservationSummary: observation,",
    "      safeExtractionSummary: extraction,",
    "      actionTraceSummary: `runner:${request.action};fixture:${request.fixtureId}`",
    "    },",
    "    warnings: [], redactions: [], rawContent: 'excluded', providerCall: 'none', modelCall: 'none', browserSessionPersistence: 'none'",
    "  }));",
    "});",
  ].join("\n");
}
