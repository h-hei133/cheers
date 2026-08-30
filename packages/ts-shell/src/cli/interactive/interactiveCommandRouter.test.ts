import { describe, expect, it } from "vitest";

import { ApprovalTrustPolicy } from "../../core/shell/approvalTrustPolicy.js";
import { routeInteractiveCommand } from "./interactiveCommandRouter.js";

function createHarness() {
  const lines: string[] = [];
  let agentMode: "plan" | "build" = "build";
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
        getViewMode: () => "compact",
        setViewMode: () => undefined,
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
  };
}

describe("interactive command router", () => {
  it("routes /cd workspace navigation commands out of normal prompt execution", async () => {
    const harness = createHarness();

    const result = await routeInteractiveCommand({
      ...harness.input,
      prompt: "/cd /tmp/project-alpha",
    });

    expect(result.turnNumber).toBe(0);
  });

  it("routes agent mode commands and requests prompt refresh", async () => {
    const harness = createHarness();

    const result = await routeInteractiveCommand({
      ...harness.input,
      prompt: "/mode plan",
    });

    expect(result).toEqual({
      turnNumber: 0,
      refreshPromptChrome: true,
    });
    expect(harness.getAgentMode()).toBe("plan");
    expect(harness.lines).toEqual([
      "\nAgent mode updated to plan.",
      "Plan mode prioritizes planning and diagnosis over direct edits/tool execution.",
      "",
    ]);
  });
});
