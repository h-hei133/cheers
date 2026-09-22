import { describe, expect, it } from "vitest";
import { parseBrowserCommandArgs } from "./commandContract.js";
import { runBrowserExecutionCommand } from "./executionCommandRunner.js";
import { createBrowserSandboxAuthority } from "./sandboxAuthority.js";
import { BrowserPlaywrightCliLocalFixtureExecutor } from "./playwrightCliExecutor.js";

describe("browser execution lifecycle surface", () => {
  it("renders local fixture lifecycle evidence with Executed yes", async () => {
    const parsed = parseBrowserCommandArgs(["execute", "observe"]);
    const result = await runBrowserExecutionCommand({
      request: parsed.contract!.execution!,
      executor: new BrowserPlaywrightCliLocalFixtureExecutor(),
      sandboxAuthority: createBrowserSandboxAuthority({ mode: "local-fixture" }),
    });

    expect(result.output).toContain("Browser execution lifecycle");
    expect(result.output).toContain("- Mode: local-fixture");
    expect(result.output).toContain("- Executed: yes");
    expect(result.output).toContain("- Local fixture / target: fixture:");
  });
});
