import { afterEach, describe, expect, it } from "vitest";
import { parseBrowserCommandArgs } from "../../browser/commandContract.js";
import { runBrowserCommandAsync } from "../../browser/commandRunner.js";
import { buildCliCommandExecution } from "../../entrypoints/cliCommandExecutionBridge.js";
import type { StreamingRenderer } from "../../presentation/terminal/streaming.js";
import { renderAgentCliScenarioReport } from "./agentCliScenarioReport.js";
import type { AgentCliScenarioResult } from "./agentCliScenarioModel.js";
import {
  createBrowserPersistentReplayScenarioFixture,
  type BrowserPersistentReplayScenarioFixture,
} from "./browserPersistentReplayScenarioFixtures.js";

describe("browser persistent replay scenario examples", () => {
  const fixtures: BrowserPersistentReplayScenarioFixture[] = [];

  afterEach(() => {
    for (const fixture of fixtures.splice(0)) {
      fixture.cleanup();
    }
  });

  it("writes a persistent replay-ready receipt during explicit browser execution", async () => {
    const fixture = track(createBrowserPersistentReplayScenarioFixture({ kind: "external-runner" }));

    const execute = await runCommand("/browser execute observe local-fixture://route108-demo", fixture);

    expect(execute.output).toContain("Executed: yes");
    expect(execute.output).toContain("Browser receipt cache");
    expect(execute.output).toContain("Cache write: yes");
    expect(fixture.readCacheFile()).toContain("browser-persistent-receipt-cache/v1");
    expect(fixture.readCacheFile()).not.toContain("RAW_");
    expect(fixture.readCacheFile()).not.toContain("sk-");
  });

  it("replays from persistent cache with a fresh cache store", async () => {
    const fixture = track(createBrowserPersistentReplayScenarioFixture({ kind: "external-runner" }));
    const execute = await runCommand("/browser execute observe local-fixture://route108-demo", fixture);
    const receiptId = receiptIdFrom(execute.output);
    fixture.actionCache.clear();
    const separateProcess = {
      ...fixture,
      receiptCacheStore: fixture.freshReceiptCacheStore(),
    };

    const replay = await runCommand(`/browser replay ${receiptId}`, separateProcess);

    expect(replay.output).toContain("Browser replay");
    expect(replay.output).toContain("Executed: yes");
    expect(replay.output).toContain("Cache source: persistent");
    expect(replay.output).toContain("Replay source:");
  });

  it("runs execute and replay through separate CLI bridge invocations with explicit cache env", async () => {
    const fixture = track(createBrowserPersistentReplayScenarioFixture({ kind: "external-runner" }));
    const first = renderer();
    await buildCliCommandExecution({
      prompt: "/browser execute observe local-fixture://route108-demo",
      cwd: process.cwd(),
      renderer: first as StreamingRenderer,
      printMode: true,
      interactive: false,
      env: fixture.persistentEnv,
    });
    const executeOutput = first.lines.join("\n");
    expect(executeOutput).toContain("Cache write: yes");

    const second = renderer();
    await buildCliCommandExecution({
      prompt: `/browser replay ${receiptIdFrom(executeOutput)}`,
      cwd: process.cwd(),
      renderer: second as StreamingRenderer,
      printMode: true,
      interactive: false,
      env: fixture.persistentEnv,
    });
    const replayOutput = second.lines.join("\n");
    expect(replayOutput).toContain("Executed: yes");
    expect(replayOutput).toContain("Cache source: persistent");
  });

  it("blocks invalidated and deleted persistent receipts", async () => {
    const fixture = track(createBrowserPersistentReplayScenarioFixture({ kind: "external-runner" }));
    const execute = await runCommand("/browser execute observe local-fixture://route108-demo", fixture);
    const receiptId = receiptIdFrom(execute.output);
    fixture.actionCache.clear();

    fixture.receiptCacheStore.invalidate(receiptId, "route108 invalidation");
    const invalidated = await runCommand(`/browser replay ${receiptId}`, fixture);
    expect(invalidated.output).toContain("Outcome: blocked");

    await runCommand("/browser execute observe local-fixture://route108-demo", fixture);
    fixture.actionCache.clear();
    fixture.receiptCacheStore.delete(receiptId, "route108 delete");
    const deleted = await runCommand(`/browser replay ${receiptId}`, fixture);
    expect(deleted.output).toContain("Outcome: blocked");
  });

  it("keeps no-cache behavior explicit and rejects unsafe cache records", async () => {
    const fixture = track(createBrowserPersistentReplayScenarioFixture({ kind: "external-runner" }));
    const noCache = await runCommand("/browser replay status", {
      ...fixture,
      receiptCacheStore: undefined,
    });
    expect(noCache.output).toContain("Cache configured: no");

    fixture.readCacheFile();
    const file = `${fixture.cacheRoot}/browser-receipt-cache.jsonl`;
    await import("node:fs").then((fs) =>
      fs.writeFileSync(file, "{\"version\":\"browser-persistent-receipt-cache/v1\",\"receiptId\":\"bad\",\"status\":\"active\",\"evidenceSummary\":\"RAW_SECRET\"}\n", "utf8"),
    );
    const status = await runCommand("/browser replay cache status", fixture);
    expect(status.output).toContain("Unsafe/skipped records: 1");
    expect(status.output).not.toContain("RAW_SECRET");
  });

  it("summarizes persistent cache status safely in scenario reports", () => {
    const report = renderAgentCliScenarioReport({
      scenarioId: "route108-report",
      name: "route108-report",
      status: "passed",
      steps: [{
        stepId: "execute",
        status: "passed",
        process: {
          spec: { promptSummary: "/browser execute observe" },
          exitCode: 0,
          signal: null,
          timedOut: false,
          output: {
            stdoutLineCount: 12,
            stderrLineCount: 0,
            combined: "Browser execution\n- Executed: yes\nBrowser receipt cache\n- Cache status: active\n",
          },
        },
      }],
      assertions: [],
      safetyChecks: [],
      blockers: [],
      redactions: [],
    } as AgentCliScenarioResult);

    expect(report).toContain("receiptCache=active");
    expect(report).not.toContain("RAW_");
  });

  function track<T extends BrowserPersistentReplayScenarioFixture>(fixture: T): T {
    fixtures.push(fixture);
    return fixture;
  }

  async function runCommand(
    command: string,
    fixture: BrowserPersistentReplayScenarioFixture & { readonly receiptCacheStore?: BrowserPersistentReplayScenarioFixture["receiptCacheStore"] },
  ) {
    const args = command.replace(/^\/browser\s*/, "").split(/\s+/).filter(Boolean);
    const parsed = parseBrowserCommandArgs(args);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || !parsed.contract) {
      throw new Error("parse failed");
    }
    return runBrowserCommandAsync({
      contract: parsed.contract,
      browserExecutor: fixture.bridge.browserExecutor,
      browserSandboxAuthority: fixture.bridge.browserSandboxAuthority,
      browserNetworkAllowlist: fixture.bridge.browserNetworkAllowlist,
      browserExecutionConfirmations: fixture.bridge.browserExecutionConfirmations,
      browserCliExecutionBridgeSummary: fixture.bridge.browserCliExecutionBridgeSummary,
      browserActionCache: fixture.actionCache,
      browserReceiptCacheStore: fixture.receiptCacheStore,
    });
  }

  function receiptIdFrom(output: string): string {
    const receiptId = output.match(/^- Receipt id:\s*(.+)$/im)?.[1]?.trim();
    if (!receiptId) {
      throw new Error(`missing receipt id in output:\n${output}`);
    }
    return receiptId;
  }

  function renderer(): Pick<StreamingRenderer, "renderLine"> & { readonly lines: string[] } {
    const lines: string[] = [];
    return {
      lines,
      renderLine: (line: string) => {
        lines.push(line);
      },
    };
  }
});
