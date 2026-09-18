import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createBrowserExternalRunnerManifest, serializeBrowserExternalRunnerManifest, validateBrowserExternalRunnerManifest } from "../../browser/runtime/external/manifest.js";
import { createBrowserLocalFixtureManifest, serializeBrowserLocalFixtureManifest, validateBrowserLocalFixtureManifest } from "../../browser/browserLocalFixtureManifest.js";
import { parseBrowserCommandArgs } from "../../browser/browserCommandContract.js";
import { runBrowserCommandAsync } from "../../browser/browserCommandRunner.js";
import { createBrowserReplayScenarioFixture, type BrowserReplayScenarioFixture } from "./browserReplayScenarioFixtures.js";
import { safeReceipt } from "../../browser/browserActionCacheEntry.test.js";
import { runBrowserReplayCommand } from "../../browser/browserReplayCommandRunner.js";
import { createBrowserNetworkAllowlist } from "../../browser/browserNetworkAllowlist.js";
import { createBrowserSandboxAuthority } from "../../browser/browserSandboxAuthority.js";
import {
  captureCliOutput,
  deterministicCliScenarioTimestamp,
  type AgentCliScenarioResult,
} from "./agentCliScenarioModel.js";
import { renderAgentCliScenarioReport } from "./agentCliScenarioReport.js";

describe("browser self-healing manifest patch scenario examples", () => {
  const roots: string[] = [];
  const fixtures: BrowserReplayScenarioFixture[] = [];

  afterEach(() => {
    for (const fixture of fixtures.splice(0)) {
      fixture.cleanup();
    }
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("add-runner-binding writes explicit local/test manifest", async () => {
    const manifestPath = writeExternalManifest();
    const result = await repairApply(proposalId("missing-runner-binding"), manifestPath);

    expect(result.output).toContain("Outcome: applied");
    expect(result.output).toContain("Manifest patch: patch-allowed");
    expect(result.output).toContain("Patch kind: add-runner-binding");
    expect(result.output).toContain("Browser executed: no");
    expect(result.output).toContain("Replay executed: no");
    const validated = validateBrowserExternalRunnerManifest(JSON.parse(fs.readFileSync(manifestPath, "utf8")));
    expect(validated.ok).toBe(true);
  });

  it("add-skill-metadata writes explicit local/test manifest", async () => {
    const manifestPath = writeExternalManifest();
    const result = await repairApply(proposalId("missing-skill-metadata"), manifestPath);
    const validated = validateBrowserExternalRunnerManifest(JSON.parse(fs.readFileSync(manifestPath, "utf8")));

    expect(result.output).toContain("Patch kind: add-skill-metadata");
    expect(result.output).toContain("Outcome: applied");
    expect(validated.ok).toBe(true);
    if (validated.ok) {
      expect(validated.manifest.skillRunnerMetadata?.execution).toBe("metadata-only");
    }
  });

  it("updates local-fixture allowlist in explicit local/test manifest", async () => {
    const manifestPath = writeLocalFixtureManifest();
    const result = await repairApply(proposalId("allowlist-blocked"), manifestPath);
    const validated = validateBrowserLocalFixtureManifest(JSON.parse(fs.readFileSync(manifestPath, "utf8")));

    expect(result.output).toContain("Patch kind: update-allowlist-local-fixture");
    expect(result.output).toContain("Outcome: applied");
    expect(validated.ok).toBe(true);
  });

  it("refreshes sanitized fixture summary only", async () => {
    const manifestPath = writeLocalFixtureManifest();
    const result = await repairApply(proposalId("stale-fixture"), manifestPath);
    const raw = fs.readFileSync(manifestPath, "utf8");

    expect(result.output).toContain("Patch kind: refresh-fixture-summary");
    expect(result.output).toContain("Outcome: applied");
    expect(raw).toContain("Route 114 refreshed sanitized fixture summary");
    expect(raw).not.toContain("RAW_");
  });

  it("blocks external network and unsafe manifest patches", async () => {
    const localManifest = writeLocalFixtureManifest();
    const external = await repairApply(proposalId("external-url-blocked"), localManifest);
    const unsafe = await repairApply(proposalId("unsafe-evidence"), localManifest);

    expect(external.output).toContain("Apply status: apply-blocked-external-network");
    expect(unsafe.output).toContain("Apply status: apply-blocked-unsafe");
  });

  it("missing manifest context returns blocked-safe plan", async () => {
    const result = await repairApply(proposalId("missing-runner-binding"));

    expect(result.output).toContain("Outcome: blocked");
    expect(result.output).toContain("missing-explicit-manifest-context");
    expect(result.output).toContain("Browser executed: no");
  });

  it("after apply, replay still requires explicit /browser replay command", async () => {
    const manifestPath = writeExternalManifest();
    const apply = await repairApply(proposalId("missing-runner-binding"), manifestPath);
    const fixture = track(createBrowserReplayScenarioFixture({ kind: "external-runner" }));
    const receipt = safeReceipt();
    fixture.seed(receipt);

    expect(apply.output).toContain("Run /browser replay <receipt-id> explicitly");

    const replay = await runBrowserReplayCommand({
      request: { mode: "replay", receiptId: receipt.receiptId, sourceCommand: "/browser replay" },
      actionCache: fixture.actionCache,
      executor: fixture.bridge.browserExecutor,
      sandboxAuthority: createBrowserSandboxAuthority({ mode: "local-fixture" }),
      networkAllowlist: createBrowserNetworkAllowlist(),
      confirmations: fixture.bridge.browserExecutionConfirmations,
      cliExecutionBridgeSummary: fixture.bridge.browserCliExecutionBridgeSummary,
    });
    expect(replay.output).toContain("Browser replay");
    expect(replay.output).toContain("Executed: yes");
  });

  it("report includes manifest patch summary", () => {
    const report = renderAgentCliScenarioReport(cliResultWithOutput([
      "Browser self-healing apply",
      "Result",
      "- Outcome: applied",
      "- Target: runner-binding",
      "- Metadata/cache changed: yes",
      "- Manifest patch: patch-allowed",
      "- Browser executed: no",
      "- Replay executed: no",
    ].join("\n")));

    expect(report).toContain("repairApply=applied/runner-binding/changed=yes/manifestPatch=patch-allowed");
  });

  async function repairApply(proposalIdValue: string, manifestPath?: string) {
    const parsed = parseBrowserCommandArgs([
      "repair",
      "apply",
      proposalIdValue,
      "--confirm",
      ...(manifestPath ? ["--manifest", manifestPath] : []),
    ]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || !parsed.contract) {
      throw new Error("parse failed");
    }
    return runBrowserCommandAsync({ contract: parsed.contract });
  }

  function writeExternalManifest(): string {
    const root = tempRoot();
    const runnerPath = path.join(root, "runner.cjs");
    fs.writeFileSync(runnerPath, "process.stdin.resume();\n", "utf8");
    const manifestPath = path.join(root, "external-runner.json");
    fs.writeFileSync(manifestPath, serializeBrowserExternalRunnerManifest(createBrowserExternalRunnerManifest({
      source: "test-only",
      runnerMode: "test-local",
      runnerId: "route114-test-runner",
      runnerCommand: { command: process.execPath, args: [runnerPath] },
    })), "utf8");
    return manifestPath;
  }

  function writeLocalFixtureManifest(): string {
    const root = tempRoot();
    const manifestPath = path.join(root, "local-fixture.json");
    fs.writeFileSync(manifestPath, serializeBrowserLocalFixtureManifest(createBrowserLocalFixtureManifest()), "utf8");
    return manifestPath;
  }

  function tempRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "browser-manifest-patch-scenario-"));
    roots.push(root);
    return root;
  }

  function proposalId(kind: string): string {
    return `browser-self-healing-proposal:browser-replay-plan:test:${kind}`;
  }

  function track<T extends BrowserReplayScenarioFixture>(fixture: T): T {
    fixtures.push(fixture);
    return fixture;
  }

  function cliResultWithOutput(output: string): AgentCliScenarioResult {
    return {
      scenarioId: "browser-manifest-patch-report",
      name: "manifest patch report",
      status: "passed",
      startedAt: deterministicCliScenarioTimestamp(1),
      finishedAt: deterministicCliScenarioTimestamp(2),
      steps: [{
        stepId: "repair",
        status: "passed",
        process: {
          spec: {
            command: "private-agents",
            args: ["/browser", "repair"],
            cwd: "/tmp",
            timeoutMs: 1000,
            promptSummary: "/browser repair apply",
          },
          exitCode: 0,
          signal: null,
          timedOut: false,
          durationMs: 1,
          output: captureCliOutput({ stdout: output, stderr: "" }),
          evidence: [],
          warnings: [],
          redactions: [],
        },
        assertions: [],
        evidence: [],
        warnings: [],
        blockers: [],
      }],
      assertions: [],
      safetyChecks: [],
      evidence: [],
      warnings: [],
      blockers: [],
      redactions: [],
    };
  }
});
