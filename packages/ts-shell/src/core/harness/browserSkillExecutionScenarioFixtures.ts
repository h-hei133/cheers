import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  BROWSER_CLI_EXTERNAL_RUNNER_MANIFEST_ENV,
} from "../context/browserCliExecutorInjection.js";
import {
  createBrowserExternalRunnerManifest,
  serializeBrowserExternalRunnerManifest,
  type BrowserExternalRunnerManifest,
} from "../context/browserExternalRunnerManifest.js";
import { createBrowserSkillRunnerBinding } from "../context/browserSkillRunnerBinding.js";
import { createBrowserSkillRunnerMetadata } from "../context/browserSkillRunnerMetadata.js";

export type BrowserSkillExecutionFixtureKind =
  | "success"
  | "missing-binding"
  | "unsafe-capability"
  | "malformed"
  | "timeout"
  | "unsafe-output";

export interface BrowserSkillExecutionScenarioFixture {
  readonly root: string;
  readonly manifestPath: string;
  readonly runnerPath?: string;
  readonly manifest: BrowserExternalRunnerManifest;
  readonly env: Readonly<Record<string, string>>;
  cleanup(): void;
}

export function createBrowserSkillExecutionScenarioFixture(input: {
  readonly kind?: BrowserSkillExecutionFixtureKind;
} = {}): BrowserSkillExecutionScenarioFixture {
  const kind = input.kind ?? "success";
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "private-agents-browser-skill-runner-"));
  const runnerPath = kind === "missing-binding" || kind === "unsafe-capability"
    ? undefined
    : path.join(root, "skill-runner.cjs");
  if (runnerPath) {
    fs.writeFileSync(runnerPath, runnerScript(kind as Exclude<BrowserSkillExecutionFixtureKind, "missing-binding" | "unsafe-capability">), "utf8");
  }
  const manifestPath = path.join(root, "browser-skill-runner-manifest.json");
  const metadata = createBrowserSkillRunnerMetadata({
    runnerId: "skill:route106-browser-runner",
    skillId: "skill:route106-browser-runner",
    skillName: "Route 106 browser runner skill",
    actions: kind === "unsafe-capability"
      ? ["observe", "auth", "arbitrary-js"]
      : ["observe", "extract", "navigate-local"],
  });
  const binding = runnerPath
    ? createBrowserSkillRunnerBinding({
        metadata,
        runnerCommand: {
          command: process.execPath,
          args: [runnerPath],
        },
        timeoutMs: kind === "timeout" ? 120 : 1500,
      })
    : undefined;
  const manifest = createBrowserExternalRunnerManifest({
    source: "skill-managed",
    runnerMode: "skill-managed",
    runnerId: "skill:route106-browser-runner",
    runnerRef: "skill:route106-browser-runner",
    skillRunnerMetadata: metadata,
    skillRunnerBinding: binding,
    fixture: {
      id: "fixture:route106-demo",
      title: "Route 106 skill runner fixture",
      url: "local-fixture://route106-demo",
      textSummary: "Route 106 safe skill runner fixture summary for observe and extract.",
      allowedActions: ["observe", "extract", "navigate-local"],
    },
  });
  fs.writeFileSync(manifestPath, serializeBrowserExternalRunnerManifest(manifest), "utf8");
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

function runnerScript(kind: Exclude<BrowserSkillExecutionFixtureKind, "missing-binding" | "unsafe-capability">): string {
  if (kind === "malformed") {
    return "process.stdin.resume(); process.stdin.on('end', () => process.stdout.write('not json RAW_SKILL_PAYLOAD'));\n";
  }
  if (kind === "timeout") {
    return "process.stdin.resume(); setTimeout(() => process.stdout.write('{}'), 5000);\n";
  }
  if (kind === "unsafe-output") {
    return [
      "process.stdin.resume();",
      "process.stdin.on('end', () => process.stdout.write(JSON.stringify({",
      "status: 'executed', executed: true, mode: 'skill-managed-test-local',",
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
    "  const extraction = request.action === 'extract' ? 'Safe skill extracted Route 106 fixture summary.' : undefined;",
    "  const observation = request.action !== 'extract' ? 'Safe skill observed Route 106 fixture summary.' : undefined;",
    "  process.stdout.write(JSON.stringify({",
    "    status: 'executed', executed: true, mode: 'skill-managed-test-local',",
    "    evidence: {",
    "      safeTitle: 'Route 106 skill runner fixture',",
    "      safeUrl: request.safeUrl,",
    "      safeObservationSummary: observation,",
    "      safeExtractionSummary: extraction,",
    "      actionTraceSummary: `skill:${request.action};fixture:${request.fixtureId}`,",
    "      receiptHint: 'skill-managed-local-test',",
    "      replayHint: 'local-fixture-safe'",
    "    },",
    "    warnings: [], redactions: [], rawContent: 'excluded', providerCall: 'none', modelCall: 'none', browserSessionPersistence: 'none'",
    "  }));",
    "});",
  ].join("\n");
}
