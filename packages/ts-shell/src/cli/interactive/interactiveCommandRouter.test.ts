import { describe, expect, it } from "vitest";

import { ApprovalTrustPolicy } from "../../core/shell/approvalTrustPolicy.js";
import { routeInteractiveCommand } from "./interactiveCommandRouter.js";
import { runNonInteractivePrompt } from "../../entrypoints/cliRuntimeModule.js";

function createHarness() {
  const lines: string[] = [];
  let agentMode: "plan" | "build" = "build";
  let viewMode: "compact" | "verbose" = "compact";
  return {
    lines,
    input: {
      readline: {} as never,
      mcpGateway: {} as never,
      fallbackSessionId: undefined,
      sessionManager: {} as never,
      runtimeContext: {
        cwd: "/tmp/project-alpha",
        projectRoot: "/tmp/project-alpha",
        session: { id: "sess_1234567890abcdef" },
      } as never,
      renderer: {
        renderLine: (line: string) => lines.push(line),
      } as never,
      sessionRuntime: {
        getViewMode: () => viewMode,
        setViewMode: (nextMode: "compact" | "verbose") => { viewMode = nextMode; },
        getAgentMode: () => agentMode,
        setAgentMode: (nextMode: "plan" | "build") => {
          agentMode = nextMode;
        },
        getState: () => "idle",
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
