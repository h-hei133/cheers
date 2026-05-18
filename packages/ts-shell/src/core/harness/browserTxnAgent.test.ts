import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMvpIntegratedFlow } from "../../orchestration/runMvpIntegratedFlow.js";
import { getPwRuntimeStatus, type PwRuntimeStatus } from "../context/pwRuntime.js";
import { disabledBrowserRuntimeStatus, readyBrowserRuntimeStatus } from "./browserAgentFixtures.js";

describe("Route 129 browser transaction agent loop", () => {
  let workspaceRoot = "";
  let readyStatus: PwRuntimeStatus | undefined;

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "browser-txn-agent-"));
    readyStatus = await getPwRuntimeStatus();
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it("prompt triggers observe -> extract transaction", async () => {
    if (readyStatus?.status !== "ready") {
      return;
    }
    const result = await runBrowserPrompt("Use the local browser fixture and tell me the rendered text", readyStatus);
    expect(result.status).toBe("completed");
    expect(result.finalOutput).toContain("Browser task completed");
    expect(result.finalOutput).toContain("Transaction: success");
    expect(result.finalOutput).toContain("JS rendered Playwright route ready");
    expect(result.codingResult?.evidence.some((entry) => entry.startsWith("browser-agent-transaction:"))).toBe(true);
  }, 30000);

  it("prompt triggers observe -> click -> extract transaction", async () => {
    if (readyStatus?.status !== "ready") {
      return;
    }
    const result = await runBrowserPrompt(
      "Use the local browser fixture, click the status button, and report the new state",
      readyStatus,
    );
    expect(result.status).toBe("completed");
    expect(result.finalOutput).toContain("observe -> click -> extract");
    expect(result.finalOutput).toContain("Clicked Save draft");
  }, 30000);

  it("prompt triggers observe -> type -> extract transaction", async () => {
    if (readyStatus?.status !== "ready") {
      return;
    }
    const result = await runBrowserPrompt(
      "Type this safe note into the local browser fixture and confirm the state changed",
      readyStatus,
    );
    expect(result.status).toBe("completed");
    expect(result.finalOutput).toContain("observe -> type -> extract");
    expect(result.finalOutput).toContain("Updated Safe note");
    expect(JSON.stringify(result)).not.toContain("safe local note");
  }, 30000);

  it("low confidence plan stops before action", async () => {
    const result = await runBrowserPrompt(
      "Use the browser for this vague local fixture task",
      readyBrowserRuntimeStatus(),
    );
    expect(result.terminalClassification).toBe("stopped");
    expect(result.finalOutput).toContain("planner-low-confidence");
    expect(result.finalOutput).toContain("Cleanup: not-started");
  });

  it("policy blocked stops before adapter call", async () => {
    const result = await runBrowserPrompt(
      "Use the browser to open https://example.com and report the text",
      readyBrowserRuntimeStatus(),
    );
    expect(result.terminalClassification).toBe("stopped");
    expect(result.finalOutput).toContain("policy-blocked");
    expect(result.finalOutput).toContain("Cleanup: not-started");
  });

  it("repair success is summarized in final result", async () => {
    if (readyStatus?.status !== "ready") {
      return;
    }
    const result = await runBrowserPrompt(
      "Use the local browser fixture with selector repair, click the missing target, and report the state",
      readyStatus,
    );
    expect(result.status).toBe("completed");
    expect(result.finalOutput).toContain("Repair: succeeded");
    expect(result.finalOutput).toContain("Clicked Save draft after repair");
  }, 30000);

  it("repair failure is actionable", async () => {
    if (readyStatus?.status !== "ready") {
      return;
    }
    const result = await runBrowserPrompt(
      "Use the local browser fixture with repair failure, click the missing target, and report the state",
      readyStatus,
    );
    expect(result.terminalClassification).toBe("stopped");
    expect(result.finalOutput).toContain("repair-failed");
    expect(result.finalOutput).toContain("choose one visible safe target");
  }, 30000);

  it("transaction observation drives the final answer", async () => {
    if (readyStatus?.status !== "ready") {
      return;
    }
    const result = await runBrowserPrompt(
      "Use the local browser fixture, click the status button, and report the new state",
      readyStatus,
    );

    expect(result.status).toBe("completed");
    expect(result.finalOutput).toContain("Clicked Save draft");
    expect(result.codingResult?.evidence.join("\n")).toContain("browser-agent-transaction");
  }, 30000);

  it("terminal output explains what happened", async () => {
    if (readyStatus?.status !== "ready") {
      return;
    }
    const result = await runBrowserPrompt(
      "Use the local browser fixture, click the status button, and report the new state",
      readyStatus,
    );

    expect(result.finalOutput).toContain("TransactionId:");
    expect(result.finalOutput).toContain("Plan: observe -> click -> extract");
    expect(result.finalOutput).toContain("EvidenceId:");
    expect(result.finalOutput).toContain("Raw DOM: excluded");
  }, 30000);

  it("runtime unavailable does not fake execution", async () => {
    const result = await runBrowserPrompt(
      "Use the local browser fixture and tell me the rendered text",
      disabledBrowserRuntimeStatus(),
    );
    expect(result.terminalClassification).toBe("stopped");
    expect(result.finalOutput).toContain("runtime-disabled");
    expect(result.finalOutput).toContain("Cleanup: not-started");
    expect(JSON.stringify(result)).not.toContain("<button");
  });

  async function runBrowserPrompt(prompt: string, status: PwRuntimeStatus) {
    return runMvpIntegratedFlow({
      sessionId: `sess_${Math.random().toString(16).slice(2)}`,
      workspaceRoot,
      prompt,
      maxTurns: 4,
      browserRuntimeStatus: status,
    });
  }
});
