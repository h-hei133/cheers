import { ConfigState } from "../../config/state.js";
import { configurationBinding } from "../../core/shell/configuration.js";
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getRuntimeConfig } from "../../config/runtimeConfig.js";

import { ApprovalTrustPolicy } from "../../core/shell/approvalTrustPolicy.js";
import { routeInteractiveCommand } from "./interactiveCommandRouter.js";
import { runNonInteractivePrompt } from "../../entrypoints/cliRuntimeModule.js";
import { forgetSessionTodos } from "../../core/commands/todoCommandRuntime.js";
import type { SessionMessage } from "../../session/schema/sessionMessage.js";
import type { CommandReport } from '../../core/commands/report/contract.js';
import { reportText } from '../../core/commands/report/projection.js';

function createHarness(root = "/tmp/project-alpha") {
  const lines: string[] = [];
  const reports: CommandReport[] = [];
  let agentMode: "plan" | "build" = "build";
  let viewMode: "compact" | "verbose" = "compact";
  const turns: SessionMessage[] = [];
  return {
    lines,
    reports,
    input: {
      readline: {} as never,
      mcpGateway: {} as never,
      fallbackSessionId: undefined,
      sessionManager: {
        getSession: () => ({ turns: structuredClone(turns) }),
        addTurn: (_id: string, message: SessionMessage) => turns.push(structuredClone(message)),
      } as never,
      runtimeContext: {
        runtimeConfig: getRuntimeConfig(root),
        configuration: new ConfigState(getRuntimeConfig(root), configurationBinding({ projectRoot: root, session: { id: "sess_1234567890abcdef" } })),
        cwd: root,
        projectRoot: root,
        session: { id: "sess_1234567890abcdef" },
      } as never,
      renderer: {
        renderLine: (line: string) => lines.push(line),
        renderReport: (report: CommandReport) => { reports.push(report); lines.push(reportText(report)); },
      } as never,
      sessionRuntime: {
        getViewMode: () => viewMode,
        setViewMode: (nextMode: "compact" | "verbose") => { viewMode = nextMode; },
        getAgentMode: () => agentMode,
        setAgentMode: (nextMode: "plan" | "build") => {
          agentMode = nextMode;
        },
        getState: () => "idle",
        getCurrentRunController: () => null,
      } as never,
      logger: {
        error: () => undefined,
        info: () => undefined,
      } as never,
      approvalTrustPolicy: new ApprovalTrustPolicy(),
      turnNumber: 0,
      setActiveNonInteractiveApprovalMode: () => undefined,
    },
    getAgentMode: () => agentMode,
    getViewMode: () => viewMode,
  };
}

describe("interactive command router", () => {
  it.each(["interactive", "piped", "print"])("lists current tools in the %s command path", async mode => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "command-tools-"));
    const harness = createHarness(root);
    const snapshot = vi.fn(async () => ({ clients: [], tools: [{ serverName: "fixture", toolName: "Read",
      qualifiedName: "mcp__fixture__Read", description: "Read a fixture", annotations: { readOnlyHint: true } }] }));
    Object.assign(harness.input.runtimeContext, { cwd: root, projectRoot: root, skillOptions: { noSkills: true },
      runtimeConfig: { ...getRuntimeConfig(root), enableMcpTools: true, allowedTools: ["mcp__fixture__Read"] } });
    harness.input.mcpGateway = { snapshot, refresh: snapshot } as never;
    try {
      if (mode === "interactive") await routeInteractiveCommand({ ...harness.input, prompt: "/tools" });
      else await runNonInteractivePrompt({ ...harness.input, prompt: "/tools", printMode: mode === "print" });
      expect(harness.lines.join("\n")).toContain("### Tools (1)");
      expect(harness.lines.join("\n")).toContain("| mcp__fixture__Read | allowed |");
      expect(harness.reports).toHaveLength(1);
      expect(harness.reports[0]?.facts.tools).toMatchObject([{ name: 'mcp__fixture__Read', planMode: 'allowed' }]);
      expect(snapshot).toHaveBeenCalledOnce();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
  it("returns an exit signal to a scripted host", async () => {
    const harness = createHarness();
    expect(await runNonInteractivePrompt({ ...harness.input, prompt: "/exit", printMode: true })).toBe("exit");
    expect(harness.lines.join("\n")).not.toContain("blocked");
  });
  it.each([true, false])("persists and restores checklist state in scripted mode (print=%s)", async (printMode) => {
    const harness = createHarness();
    const sessionId = "sess_1234567890abcdef";
    forgetSessionTodos(sessionId);
    await runNonInteractivePrompt({ ...harness.input, prompt: "/todo add persisted-script-task", printMode });
    forgetSessionTodos(sessionId);
    harness.lines.length = 0;
    await runNonInteractivePrompt({ ...harness.input, prompt: "/todo list", printMode });
    expect(harness.lines.join("\n")).toContain("persisted-script-task");
    await runNonInteractivePrompt({ ...harness.input, prompt: "/todo clear", printMode });
    forgetSessionTodos(sessionId);
    harness.lines.length = 0;
    await runNonInteractivePrompt({ ...harness.input, prompt: "/todo list", printMode });
    expect(harness.lines.join("\n")).toContain("No tasks currently");
  });

  it.each(["interactive", "piped", "print"])("switches and reads the session view in %s mode", async (mode) => {
    const harness = createHarness();
    for (const prompt of ["/view developer", "/view status", "/view user"]) {
      if (mode === "interactive") {
        await routeInteractiveCommand({ ...harness.input, prompt });
      } else {
        await runNonInteractivePrompt({ ...harness.input, prompt, printMode: mode === "print" });
      }
      expect(harness.getViewMode()).toBe(prompt === "/view user" ? "compact" : "verbose");
    }
    expect(harness.lines.join("\n")).toContain("Current view mode: developer (verbose)");
    expect(harness.lines.join("\n")).toContain("View mode updated to user (compact)");
  });

  it("routes /compact to the session runtime and prints the outcome", async () => {
    const harness = createHarness();
    const calls: Array<[string, string | undefined]> = [];
    const result = await routeInteractiveCommand({
      ...harness.input,
      sessionRuntime: {
        ...(harness.input.sessionRuntime as object),
        compactHistory: async (sessionId: string, instructions?: string) => {
          calls.push([sessionId, instructions]);
          return { status: "compacted", summarized: 6, kept: 4, tokensBefore: 8_000, tokensAfter: 2_000 };
        },
      } as never,
      prompt: "/compact focus on the failing test",
    });
    expect(calls).toEqual([["sess_1234567890abcdef", "focus on the failing test"]]);
    expect(harness.lines.join("\n")).toContain("Condensed 6 earlier messages");
    expect(result.turnNumber).toBe(0);
  });

  it.each(["--preview=false", "--render=false", "--json=false", "--verbose keep it", "preview --json", "--constraint", "--source invalid"])("blocks invalid compact arguments without touching history: %s", async args => {
    const harness = createHarness();
    const compactHistory = vi.fn();
    Object.assign(harness.input.sessionRuntime, { compactHistory });
    await routeInteractiveCommand({ ...harness.input, prompt: `/compact ${args}` });
    expect(compactHistory).not.toHaveBeenCalled();
    expect(harness.lines.join("\n")).toContain("Outcome: blocked");
    expect(harness.lines.join("\n")).not.toContain("Condensed");
  });

  it.each(["/clear --preview", "/reset other-session", "/exit later", "/quit --no", "/retry changed-prompt", "/reload --preview"])("keeps the interactive session intact for invalid control input %s", async prompt => {
    const harness = createHarness();
    const result = await routeInteractiveCommand({ ...harness.input, prompt });
    expect(result.clearRequested).toBeUndefined();
    expect(result.exitRequested).toBeUndefined();
    expect(result.retryRequested).toBeUndefined();
    expect(harness.lines.join("\n")).toContain("Invalid /");
    expect(result.turnNumber).toBe(0);
  });

  it("routes /cd workspace navigation commands out of normal prompt execution", async () => {
    const harness = createHarness();

    const result = await routeInteractiveCommand({
      ...harness.input,
      prompt: "/cd /tmp/project-alpha",
    });

    expect(result.turnNumber).toBe(0);
  });

  it("treats a retired mode command as an unknown command rather than routing it", () => {
    // Mode switching moved to Shift+Tab, so /mode no longer exists to route.
    const harness = createHarness();
    return routeInteractiveCommand({ ...harness.input, prompt: "/mode plan" }).then((result) => {
      expect(result.refreshPromptChrome).toBeUndefined();
      expect(harness.getAgentMode()).toBe("build");
    });
  });
});
