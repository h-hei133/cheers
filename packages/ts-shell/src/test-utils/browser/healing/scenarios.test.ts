import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createBrowserActionCache } from "../../../browser/actionCache.js";
import { createBrowserActionCacheEntryFromReceipt, type BrowserActionCacheEntry } from "../../../browser/actionCacheEntry.js";
import { safeReceipt } from "../../../browser/actionCacheEntry.test.js";
import { createBrowserReceiptCacheManifest } from "../../../browser/receipt/manifest.js";
import { createBrowserReceiptCacheStore } from "../../../browser/receipt/store.js";
import { FakeBrowserExecutor, NOOP_BROWSER_EXECUTOR } from "../../../browser/executor.js";
import { createBrowserNetworkAllowlist } from "../../../browser/networkAllowlist.js";
import { runBrowserReplayCommand } from "../../../browser/replayCommandRunner.js";
import { createBrowserSandboxAuthority } from "../../../browser/sandboxAuthority.js";
import { createBrowserReplayScenarioFixture, type BrowserReplayScenarioFixture } from "../replay/fixtures.js";
import {
  captureCliOutput,
  deterministicCliScenarioTimestamp,
  type AgentCliScenarioResult,
} from "../../cli/model.js";
import { renderAgentCliScenarioReport } from "../../cli/report.js";

describe("browser self-healing scenario examples", () => {
  const fixtures: BrowserReplayScenarioFixture[] = [];
  const tempRoots: string[] = [];

  afterEach(() => {
    for (const fixture of fixtures.splice(0)) {
      fixture.cleanup();
    }
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("proposes add-runner-binding for a missing runner", async () => {
    const result = await replayWithEntry(entryFor(), { executor: undefined });

    expect(result.output).toContain("Browser self-healing proposal");
    expect(result.output).toContain("Proposal: add-runner-binding");
    expect(result.output).toContain("Confidence: high");
    expect(result.output).toContain("Applied: no");
    expect(result.output).toContain("Executed: no");
  });

  it("proposes add-skill-metadata for skill-managed replay without metadata", async () => {
    const result = await replayWithEntry(entryFor({
      executionMode: "skill-managed",
      runnerSource: "skill-managed",
      skillRunnerId: undefined,
      skillRunnerStatus: undefined,
      bindingRef: undefined,
    }), {
      executor: NOOP_BROWSER_EXECUTOR,
    });

    expect(result.output).toContain("Proposal: add-skill-metadata");
    expect(result.output).toContain("Proposed patch: skill-metadata-patch");
  });

  it("proposes request-confirmation when current gates are missing", async () => {
    const fixture = track(createBrowserReplayScenarioFixture({ kind: "external-runner" }));
    const receipt = safeReceipt();
    fixture.seed(receipt);

    const result = await runBrowserReplayCommand({
      request: { mode: "replay", receiptId: receipt.receiptId, sourceCommand: "/browser replay" },
      actionCache: fixture.actionCache,
      executor: fixture.bridge.browserExecutor,
      sandboxAuthority: fixture.bridge.browserSandboxAuthority,
      networkAllowlist: fixture.bridge.browserNetworkAllowlist,
      confirmations: [],
    });

    expect(result.output).toContain("Proposal: request-confirmation");
    expect(result.output).toContain("Proposed patch: confirmation-patch");
  });

  it("proposes repair-cache for corrupted persistent cache", async () => {
    const root = tempRoot();
    fs.writeFileSync(path.join(root, "browser-receipt-cache.jsonl"), "not-json\n", "utf8");
    const store = createBrowserReceiptCacheStore({
      manifest: createBrowserReceiptCacheManifest({ cacheRoot: root }),
    });

    const result = await runBrowserReplayCommand({
      request: { mode: "replay", receiptId: "missing", sourceCommand: "/browser replay" },
      receiptCacheStore: store,
    });

    expect(result.output).toContain("Proposal: repair-cache");
    expect(result.output).toContain("Proposed patch: cache-repair-patch");
    expect(result.output).not.toContain("not-json");
  });

  it("blocks unsafe evidence proposals without raw evidence", async () => {
    const result = await replayWithEntry(entryFor({
      replayReadinessSnapshot: {
        ...entryFor().replayReadinessSnapshot,
        status: "replay-unsafe",
        reasons: ["unsafe"],
      },
    }));

    expect(result.output).toContain("Proposal: reject-unsafe-evidence");
    expect(result.output).toContain("Proposal status: unsafe");
    expect(result.output).not.toContain("RAW_");
  });

  it("blocks external URL self-healing proposals", async () => {
    const result = await replayWithEntry(entryFor({
      safeUrl: "https://example.com",
      fixtureId: "external:example",
    }));

    expect(result.output).toContain("Proposal: external-network-blocked");
    expect(result.output).toContain("Confidence: blocked");
    expect(result.output).toContain("Automatic replay: no");
  });

  it("proposes local runner retry for timeout and malformed local/test records", async () => {
    const timeout = await replayWithEntry(entryFor({ sourceReceiptStatus: "timed-out" }));
    const malformed = await replayWithEntry(entryFor({ sourceReceiptStatus: "invalid-response" }));

    expect(timeout.output).toContain("Proposal: retry-local-runner");
    expect(malformed.output).toContain("Proposal: retry-local-runner");
  });

  it("does not render a proposal for successful replay", async () => {
    const fixture = track(createBrowserReplayScenarioFixture({ kind: "external-runner" }));
    const receipt = safeReceipt();
    fixture.seed(receipt);

    const result = await runBrowserReplayCommand({
      request: { mode: "replay", receiptId: receipt.receiptId, sourceCommand: "/browser replay" },
      actionCache: fixture.actionCache,
      executor: fixture.bridge.browserExecutor,
      sandboxAuthority: fixture.bridge.browserSandboxAuthority,
      networkAllowlist: fixture.bridge.browserNetworkAllowlist,
      confirmations: fixture.bridge.browserExecutionConfirmations,
      cliExecutionBridgeSummary: fixture.bridge.browserCliExecutionBridgeSummary,
    });

    expect(result.output).toContain("Executed: yes");
    expect(result.output).toContain("Repair needed: no");
    expect(result.output).not.toContain("Browser self-healing proposal");
  });

  it("includes self-healing proposal summary in scenario reports", () => {
    const report = renderAgentCliScenarioReport(cliResultWithOutput([
      "Browser replay",
      "Result",
      "- Outcome: blocked",
      "- Repair readiness: repair-needs-runner",
      "Browser self-healing proposal",
      "- Proposal: add-runner-binding",
      "- Confidence: high",
    ].join("\n")));

    expect(report).toContain("selfHealing=add-runner-binding/high");
  });

  async function replayWithEntry(
    entry: BrowserActionCacheEntry,
    options: {
      readonly executor?: Parameters<typeof runBrowserReplayCommand>[0]["executor"];
      readonly cliExecutionBridgeSummary?: Parameters<typeof runBrowserReplayCommand>[0]["cliExecutionBridgeSummary"];
    } = {},
  ) {
    const cache = createBrowserActionCache();
    cache.add(entry);
    return runBrowserReplayCommand({
      request: { mode: "replay", receiptId: entry.sourceReceiptId, sourceCommand: "/browser replay" },
      actionCache: cache,
      executor: Object.hasOwn(options, "executor") ? options.executor : new FakeBrowserExecutor(),
      sandboxAuthority: createBrowserSandboxAuthority({ mode: "local-fixture" }),
      networkAllowlist: createBrowserNetworkAllowlist(),
      confirmations: [{ kind: "sandbox", status: "confirmed" }],
      cliExecutionBridgeSummary: options.cliExecutionBridgeSummary,
    });
  }

  function entryFor(overrides: Partial<BrowserActionCacheEntry> = {}): BrowserActionCacheEntry {
    const result = createBrowserActionCacheEntryFromReceipt({ receipt: safeReceipt() });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("entry failed");
    }
    return { ...result.entry, ...overrides };
  }

  function track<T extends BrowserReplayScenarioFixture>(fixture: T): T {
    fixtures.push(fixture);
    return fixture;
  }

  function tempRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "browser-self-healing-"));
    tempRoots.push(root);
    return root;
  }

  function cliResultWithOutput(output: string): AgentCliScenarioResult {
    return {
      scenarioId: "browser-self-healing-report",
      name: "report summary",
      status: "passed",
      startedAt: deterministicCliScenarioTimestamp(1),
      finishedAt: deterministicCliScenarioTimestamp(2),
      steps: [{
        stepId: "replay",
        status: "passed",
        process: {
          spec: {
            command: "cheers",
            args: ["/browser", "replay"],
            cwd: "/tmp",
            timeoutMs: 1000,
            promptSummary: "/browser replay",
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
