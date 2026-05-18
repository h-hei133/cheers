import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SandboxEnforcer } from "../../sandbox/sandboxEnforcer.js";
import { ToolRuntime } from "../tools/runtime.js";
import { runMvpIntegratedFlow } from "../../orchestration/runMvpIntegratedFlow.js";
import { getPwRuntimeStatus, type PwRuntimeStatus } from "../context/pwRuntime.js";
import { disabledBrowserRuntimeStatus, readyBrowserRuntimeStatus } from "./browserAgentFixtures.js";

describe("Route 128 browser agent loop", () => {
  let workspaceRoot = "";
  let readyStatus: PwRuntimeStatus | undefined;

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "browser-agent-loop-"));
    readyStatus = await getPwRuntimeStatus();
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it("uses runtime status for browser tool availability", async () => {
    const runtimeConfig = {
      provider: "openai" as const,
      daemonEnabled: false,
      maxTurns: 6,
      disabledTools: [],
      hiddenToolPrefixes: [],
      enableMcpTools: true,
      configSources: [],
    };
    const disabledRuntime = new ToolRuntime(new SandboxEnforcer({ workspaceRoot }), {
      runtimeConfig,
      browserRuntimeStatus: disabledBrowserRuntimeStatus(),
    });
    expect(disabledRuntime.listVisibleTools()).not.toContain("browser.observe");

    if (readyStatus?.status === "ready") {
      const readyRuntime = new ToolRuntime(new SandboxEnforcer({ workspaceRoot }), {
        runtimeConfig,
        browserRuntimeStatus: readyStatus,
      });
      expect(readyRuntime.listVisibleTools()).toContain("browser.observe");
      expect(readyRuntime.listVisibleTools()).toContain("browser.click");
    }
  });

  it("reports unavailable browser runtime without faking execution", async () => {
    const result = await runBrowserPrompt(
      "Use the local browser fixture and tell me the rendered text",
      disabledBrowserRuntimeStatus(),
    );

    expect(result.terminalClassification).toBe("stopped");
    expect(result.finalOutput).toContain("Browser task stopped");
    expect(result.finalOutput).toContain("runtime-disabled");
    expect(result.finalOutput).toContain("Cleanup: not-started");
    expect(JSON.stringify(result)).not.toContain("<button");
  });

  it("blocks public web before Direct Playwright runtime calls", async () => {
    const result = await runBrowserPrompt(
      "Use the browser to open https://example.com and report the text",
      readyStatus?.status === "ready" ? readyStatus : readyBrowserRuntimeStatus(),
    );

    expect(result.terminalClassification).toBe("stopped");
    expect(result.finalOutput).toContain("Browser task stopped");
    expect(result.finalOutput).toContain("policy-blocked");
    expect(result.finalOutput).toContain("Cleanup: not-started");
  });

  it("observes, clicks, types, and carries sanitized browser observations when ready", async () => {
    if (readyStatus?.status !== "ready") {
      return;
    }

    const observe = await runBrowserPrompt(
      "Use the local browser fixture and tell me the rendered text",
      readyStatus,
    );
    expect(observe.status).toBe("completed");
    expect(observe.finalOutput).toContain("Browser task completed");
    expect(observe.finalOutput).toContain("JS rendered Playwright route ready");
    expect(observe.codingResult?.evidence.some((entry) => entry.startsWith("browser-agent-observation:"))).toBe(true);

    const click = await runBrowserPrompt(
      "Use the local browser fixture, click the status button, and report the new state",
      readyStatus,
    );
    expect(click.status).toBe("completed");
    expect(click.finalOutput).toContain("Clicked Save draft");

    const type = await runBrowserPrompt(
      "Type this safe note into the local browser fixture and confirm the state changed",
      readyStatus,
    );
    expect(type.status).toBe("completed");
    expect(type.finalOutput).toContain("Updated Safe note");
    expect(JSON.stringify(type)).not.toContain("safe local note");
  }, 30000);

  it("maps target-missing and timeout browser paths to stopped results with cleanup evidence", async () => {
    if (readyStatus?.status !== "ready") {
      return;
    }

    const missing = await runBrowserPrompt(
      "Use the local browser fixture, click the missing target, and report the result",
      readyStatus,
    );
    expect(missing.terminalClassification).toBe("stopped");
    expect(missing.finalOutput).toContain("action-target-missing");
    expect(missing.finalOutput).toContain("Cleanup: closed");

    const timeout = await runBrowserPrompt(
      "Use the local browser timeout fixture and tell me the rendered text",
      readyStatus,
    );
    expect(timeout.terminalClassification).toBe("stopped");
    expect(timeout.finalOutput).toMatch(/action-timeout|navigation-timeout/);
    expect(timeout.finalOutput).toContain("Cleanup: closed");
  }, 30000);

  it("keeps raw DOM, secrets, screenshots, and session material out of browser transcript output", async () => {
    if (readyStatus?.status !== "ready") {
      return;
    }

    const result = await runBrowserPrompt(
      "Use the local browser secret redaction fixture and report visible text",
      readyStatus,
    );
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("<input");
    expect(serialized).not.toContain("sk-route126SECRET");
    expect(serialized).not.toContain("session-cookie");
    expect(serialized).not.toContain("screenshot");
    expect(serialized).toContain("raw-dom-excluded");
  }, 30000);

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
