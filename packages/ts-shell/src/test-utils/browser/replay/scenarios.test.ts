import { afterEach, describe, expect, it } from "vitest";
import { parseBrowserCommandArgs } from "../../../browser/commandContract.js";
import { runBrowserCommandAsync } from "../../../browser/commandRunner.js";
import { renderAgentCliScenarioReport } from "../../cli/report.js";
import type { AgentCliScenarioResult } from "../../cli/model.js";
import {
  createBrowserReplayScenarioFixture,
  type BrowserReplayScenarioFixture,
} from "./fixtures.js";

describe("browser replay scenario examples", () => {
  const fixtures: BrowserReplayScenarioFixture[] = [];

  afterEach(() => {
    for (const fixture of fixtures.splice(0)) {
      fixture.cleanup();
    }
  });

  it("executes external runner observe, caches the receipt, and replays explicitly", async () => {
    const fixture = createBrowserReplayScenarioFixture({ kind: "external-runner" });
    fixtures.push(fixture);

    const execute = await runCommand("/browser execute observe local-fixture://route103-demo", fixture);
    expect(execute.output).toContain("Executed: yes");
    expect(fixture.actionCache.summary().entryCount).toBe(1);

    const receiptId = receiptIdFrom(execute.output);
    const replay = await runCommand(`/browser replay ${receiptId}`, fixture);

    expect(replay.output).toContain("Browser replay");
    expect(replay.output).toContain("Executed: yes");
    expect(replay.output).toContain("New receipt id: browser-receipt:browser-replay");
    expect(replay.output).toContain("Replay source:");
  });

  it("executes skill-managed observe, caches the receipt, and replays explicitly", async () => {
    const fixture = createBrowserReplayScenarioFixture({ kind: "skill-managed" });
    fixtures.push(fixture);

    const execute = await runCommand("/browser execute observe local-fixture://route106-demo", fixture);
    expect(execute.output).toContain("Skill-managed browser execution");
    expect(execute.output).toContain("Executed: yes");

    const replay = await runCommand(`/browser replay ${receiptIdFrom(execute.output)}`, fixture);
    expect(replay.output).toContain("Browser replay");
    expect(replay.output).toContain("Executed: yes");
    expect(replay.output).toContain("Replay status: executed");
  });

  it("blocks external, malformed, timeout, and unsafe receipts from replay", async () => {
    const fixture = createBrowserReplayScenarioFixture({ kind: "external-runner" });
    fixtures.push(fixture);
    const execute = await runCommand("/browser execute observe local-fixture://route103-demo", fixture);
    const entry = fixture.actionCache.get(receiptIdFrom(execute.output));
    expect(entry).toBeDefined();
    if (!entry) return;

    const blockedEntries = [
      { id: "external", safeUrl: "external-url:redacted", status: "executed", replayStatus: "replay-ready" },
      { id: "malformed", safeUrl: entry.safeUrl, status: "invalid-response", replayStatus: "replay-blocked" },
      { id: "timeout", safeUrl: entry.safeUrl, status: "timed-out", replayStatus: "replay-blocked" },
      { id: "unsafe", safeUrl: entry.safeUrl, status: "unsafe-output", replayStatus: "replay-unsafe" },
    ] as const;
    for (const blocked of blockedEntries) {
      fixture.actionCache.add({
        ...entry,
        entryId: `browser-action-cache-entry:${blocked.id}`,
        sourceReceiptId: `browser-receipt:${blocked.id}`,
        sourceReceiptStatus: blocked.status,
        safeUrl: blocked.safeUrl,
        replayReadinessSnapshot: {
          ...entry.replayReadinessSnapshot,
          status: blocked.replayStatus,
          reasons: [blocked.id],
        },
      });
      const replay = await runCommand(`/browser replay browser-receipt:${blocked.id}`, fixture);
      expect(replay.output).toContain("Outcome: blocked");
      expect(replay.output).not.toContain("RAW_");
    }
  });

  it("reports replay status without persistence claims", async () => {
    const fixture = createBrowserReplayScenarioFixture({ kind: "external-runner" });
    fixtures.push(fixture);

    const execute = await runCommand("/browser execute observe local-fixture://route103-demo", fixture);
    expect(execute.output).toContain("Browser action cache");

    const status = await runCommand("/browser replay status", fixture);
    expect(status.output).toContain("Cache status: available");
    expect(status.output).toContain("Persistence: none");
    expect(status.output).toContain("Automatic replay: no");
  });

  it("summarizes replay safely in scenario reports", async () => {
    const report = renderAgentCliScenarioReport({
      scenarioId: "route107-report",
      name: "route107-report",
      status: "passed",
      steps: [{
        stepId: "replay",
        status: "passed",
        process: {
          spec: { promptSummary: "/browser replay browser-receipt:demo" },
          exitCode: 0,
          signal: null,
          timedOut: false,
          output: {
            stdoutLineCount: 10,
            stderrLineCount: 0,
            combined: "Browser replay\n- Replay status: executed\n- Executed: yes\n",
          },
        },
      }],
      assertions: [],
      safetyChecks: [],
      blockers: [],
      redactions: [],
    } as AgentCliScenarioResult);

    expect(report).toContain("replayCommand=executed");
  });

  async function runCommand(command: string, fixture: BrowserReplayScenarioFixture) {
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
    });
  }

  function receiptIdFrom(output: string): string {
    const receiptId = output.match(/^- Receipt id:\s*(.+)$/im)?.[1]?.trim();
    if (!receiptId) {
      throw new Error(`missing receipt id in output:\n${output}`);
    }
    return receiptId;
  }
});
