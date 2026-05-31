import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createBrowserReceiptCacheManifest } from "../context/browser/receipt/browserReceiptCacheManifest.js";
import { createBrowserReceiptCacheStore } from "../context/browser/receipt/browserReceiptCacheStore.js";
import { runBrowserCommandAsync } from "../context/browserCommandRunner.js";
import { parseBrowserCommandArgs } from "../context/browserCommandContract.js";
import { createBrowserNetworkAllowlist } from "../context/browserNetworkAllowlist.js";
import { createBrowserSandboxAuthority } from "../context/browserSandboxAuthority.js";
import { runBrowserReplayCommand } from "../context/browserReplayCommandRunner.js";
import { createBrowserReplayScenarioFixture, type BrowserReplayScenarioFixture } from "./browserReplayScenarioFixtures.js";
import { safeReceipt } from "../context/browserActionCacheEntry.test.js";
import {
  captureCliOutput,
  deterministicCliScenarioTimestamp,
  type AgentCliScenarioResult,
} from "./agentCliScenarioModel.js";
import { renderAgentCliScenarioReport } from "./agentCliScenarioReport.js";

describe("browser self-healing apply scenario examples", () => {
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

  it("applies cache repair with explicit cache context", async () => {
    const root = tempRoot();
    fs.writeFileSync(path.join(root, "browser-receipt-cache.jsonl"), "not-json\n", "utf8");
    const store = createBrowserReceiptCacheStore({
      manifest: createBrowserReceiptCacheManifest({ cacheRoot: root }),
    });
    const result = await runRepairApply({
      proposalId: proposalId("corrupted-cache-record"),
      receiptCacheStore: store,
      confirm: true,
    });

    expect(result.output).toContain("Outcome: applied");
    expect(result.output).toContain("Target: cache");
    expect(result.output).toContain("Metadata/cache changed: yes");
    expect(result.output).toContain("Browser executed: no");
    expect(result.output).toContain("Replay executed: no");
    expect(fs.readFileSync(path.join(root, "browser-receipt-cache.jsonl"), "utf8")).not.toContain("not-json");
  });

  it("missing runner proposal blocks without manifest context", async () => {
    const result = await runRepairApply({
      proposalId: proposalId("missing-runner-binding"),
      confirm: true,
    });

    expect(result.output).toContain("Outcome: blocked");
    expect(result.output).toContain("Proposal kind: add-runner-binding");
    expect(result.output).toContain("missing-explicit-manifest-context");
  });

  it("runner binding requires an explicit manifest path even with bridge summary context", async () => {
    const result = await runRepairApply({
      proposalId: proposalId("missing-runner-binding"),
      confirm: true,
      cliExecutionBridgeSummary: {
        executorSource: "test-only",
        manifestStatus: "valid",
        executionMode: "test-local",
        dependencyDecision: "external-runner-only",
        externalRunnerStatus: "allowed",
        reason: "explicit test manifest",
        evidence: ["test-manifest"],
        warnings: [],
        redactions: [],
      },
    });

    expect(result.output).toContain("Proposal kind: add-runner-binding");
    expect(result.output).toContain("Apply status: apply-allowed");
    expect(result.output).toContain("missing-explicit-manifest");
  });

  it("applies confirmation only to explicit local/test command context", async () => {
    const result = await runRepairApply({
      proposalId: proposalId("sandbox-or-confirmation-missing"),
      confirm: true,
      confirmations: [{ kind: "sandbox", status: "confirmed" }],
    });

    expect(result.output).toContain("Outcome: applied");
    expect(result.output).toContain("Target: confirmation");
    expect(result.output).toContain("confirmation context updated");
    expect(result.output).toContain("Replay executed: no");
  });

  it("blocks unsafe evidence and external URL proposals", async () => {
    const unsafe = await runRepairApply({
      proposalId: proposalId("unsafe-evidence"),
      confirm: true,
    });
    const external = await runRepairApply({
      proposalId: proposalId("external-url-blocked"),
      confirm: true,
    });

    expect(unsafe.output).toContain("Apply status: apply-blocked-unsafe");
    expect(external.output).toContain("Apply status: apply-blocked-external-network");
  });

  it("status and invalid apply do not execute browser or replay", async () => {
    const status = await runBrowserCommandAsync({
      contract: parseContract(["repair", "status"]),
    });
    const missing = parseBrowserCommandArgs(["repair", "apply"]);

    expect(status.output).toContain("Browser executed: no");
    expect(status.output).toContain("Replay executed: no");
    expect(missing.ok).toBe(false);
    expect(missing.errorOutput).toContain("Browser executed: no");
    expect(missing.errorOutput).toContain("Replay executed: no");
  });

  it("after apply, replay still requires explicit /browser replay", async () => {
    const fixture = track(createBrowserReplayScenarioFixture({ kind: "external-runner" }));
    const receipt = safeReceipt();
    fixture.seed(receipt);
    const repair = await runRepairApply({
      proposalId: proposalId("sandbox-or-confirmation-missing"),
      confirm: true,
      confirmations: [{ kind: "sandbox", status: "confirmed" }],
    });

    expect(repair.output).toContain("Next action: Run /browser replay <receipt-id> explicitly");

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

  it("scenario report summarizes repair apply result", () => {
    const report = renderAgentCliScenarioReport(cliResultWithOutput([
      "Browser self-healing apply",
      "Result",
      "- Outcome: applied",
      "- Target: cache",
      "- Metadata/cache changed: yes",
      "- Browser executed: no",
      "- Replay executed: no",
    ].join("\n")));

    expect(report).toContain("repairApply=applied/cache/changed=yes");
  });

  async function runRepairApply(input: {
    readonly proposalId: string;
    readonly confirm?: boolean;
    readonly receiptCacheStore?: Parameters<typeof runBrowserCommandAsync>[0]["browserReceiptCacheStore"];
    readonly confirmations?: Parameters<typeof runBrowserCommandAsync>[0]["browserExecutionConfirmations"];
    readonly cliExecutionBridgeSummary?: Parameters<typeof runBrowserCommandAsync>[0]["browserCliExecutionBridgeSummary"];
  }) {
    return runBrowserCommandAsync({
      contract: parseContract(["repair", "apply", input.proposalId, ...(input.confirm ? ["--confirm"] : [])]),
      browserReceiptCacheStore: input.receiptCacheStore,
      browserExecutionConfirmations: input.confirmations,
      browserCliExecutionBridgeSummary: input.cliExecutionBridgeSummary,
    });
  }

  function parseContract(args: readonly string[]) {
    const parsed = parseBrowserCommandArgs(args);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || !parsed.contract) {
      throw new Error("parse failed");
    }
    return parsed.contract;
  }

  function proposalId(kind: string): string {
    return `browser-self-healing-proposal:browser-replay-plan:test:${kind}`;
  }

  function tempRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "browser-self-healing-apply-"));
    roots.push(root);
    return root;
  }

  function track<T extends BrowserReplayScenarioFixture>(fixture: T): T {
    fixtures.push(fixture);
    return fixture;
  }

  function cliResultWithOutput(output: string): AgentCliScenarioResult {
    return {
      scenarioId: "browser-self-healing-apply-report",
      name: "repair apply report",
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
