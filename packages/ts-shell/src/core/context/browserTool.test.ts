import { describe, expect, it } from "vitest";
import { createBrowserToolDefinitions } from "./browserTool.js";
import type { PwRuntimeStatus } from "./pwRuntime.js";

describe("browser tool runtime receipt metadata", () => {
  it("attaches browser unavailable and cleanup receipt projection without launching browser", async () => {
    const tool = createBrowserToolDefinitions({
      runtimeStatus: disabledRuntimeStatus(),
    }).find((candidate) => candidate.name === "browser.observe");
    if (!tool) {
      throw new Error("browser.observe tool missing");
    }

    const result = await tool.execute(
      { page: "local-fixture://pw/static" },
      { taskId: "task_browser_receipt", workspaceRoot: process.cwd() },
    );

    expect(result.success).toBe(false);
    expect(result.metadata).toMatchObject({
      executionPath: "browser-tool",
      browserRuntimeStatus: "not-ready",
      browserCleanupStatus: "not-started",
      rawContent: "excluded",
      runtimeReceipt: {
        resultSummary: expect.stringContaining("browser:stopped:runtime-disabled"),
        cleanupSummary: "cleanup:not-started",
      },
    });
  });
});

function disabledRuntimeStatus(): PwRuntimeStatus {
  return {
    status: "disabled",
    reasonCode: "runtime-disabled",
    dependency: "none",
    browserName: "chromium",
    executableSource: "none",
    realBrowserValidationAvailable: false,
    passiveStatusCheck: true,
    browserLaunched: false,
    providerCall: "none",
    modelCall: "none",
    mcpLaunched: false,
    reason: "Direct Playwright runtime status checks are disabled.",
    skipReason: "direct-playwright-disabled",
    nextAction: "Enable the explicit runtime status check before attempting controlled browser validation.",
    warnings: ["pw-runtime:disabled"],
    evidence: ["pw-runtime:disabled", "pw-runtime:no-mcp-launch"],
  };
}
