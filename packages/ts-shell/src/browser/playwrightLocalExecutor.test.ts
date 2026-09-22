import { describe, expect, it } from "vitest";
import { parseBrowserCommandArgs } from "./commandContract.js";
import { createBrowserLocalExecutionAuthority } from "./localExecutionAuthority.js";
import { createBrowserLocalFixture } from "./localFixture.js";
import { createBrowserPlaywrightAvailability } from "./playwrightAvailability.js";
import { BrowserPlaywrightLocalExecutor } from "./playwrightLocalExecutor.js";

describe("browser Playwright local executor", () => {
  it("blocks without local fixture authority", async () => {
    const request = parseBrowserCommandArgs(["execute", "observe"]).contract!.execution!;
    const executor = new BrowserPlaywrightLocalExecutor({
      authority: createBrowserLocalExecutionAuthority({ mode: "disabled" }),
    });

    const result = await executor.execute(request);

    expect(result.status).toBe("blocked");
    expect(result.executed).toBe(false);
    expect(result.error?.code).toBe("blocked-disabled");
  });

  it("blocks external URLs before runtime execution", async () => {
    const request = parseBrowserCommandArgs(["execute", "navigate", "https://example.com"]).contract!.execution!;
    const result = await new BrowserPlaywrightLocalExecutor().execute(request);

    expect(result.status).toBe("blocked");
    expect(result.executed).toBe(false);
    expect(result.error?.code).toBe("blocked-external-url");
  });

  it("returns unavailable when no runtime is present", async () => {
    const request = parseBrowserCommandArgs(["execute", "observe"]).contract!.execution!;
    const result = await new BrowserPlaywrightLocalExecutor().execute(request);

    expect(result.status).toBe("skipped");
    expect(result.executed).toBe(false);
    expect(result.runtime).toBe("playwright-local unavailable");
    expect(result.evidence).toContainEqual({ label: "availability", value: "unavailable" });
    expect(result.evidence).toContainEqual({ label: "cleanup", value: "not-started" });
  });

  it("executes through an injected local runner with bounded evidence", async () => {
    const request = parseBrowserCommandArgs(["execute", "extract", "headline"]).contract!.execution!;
    const fixture = createBrowserLocalFixture({
      fixtureId: "fixture:route101",
      title: "Route 101 fixture",
      url: "local-fixture://route101",
      text: "Route 101 safe summary.",
      allowedActions: ["observe", "extract", "navigate-local"],
    });
    const executor = new BrowserPlaywrightLocalExecutor({
      fixture,
      availabilityChecker: () => createBrowserPlaywrightAvailability({
        status: "available",
        runtimeKind: "module",
        version: "test-version",
      }),
      runner: () => ({
        safeExtractionSummary: "Extracted safe route 101 headline.",
        stdout: "<html>sk-testsecret123</html>",
        stderr: "",
        actionTrace: ["module-runner:local-fixture"],
      }),
    });

    const result = await executor.execute(request, {
      now: () => "2026-05-17T08:09:10.000Z",
    });

    expect(result.status).toBe("executed");
    expect(result.executed).toBe(true);
    expect(result.executorKind).toBe("playwright-local");
    expect(result.runtime).toBe("playwright-local module");
    expect(result.evidence).toContainEqual({ label: "availability", value: "available" });
    expect(JSON.stringify(result)).toContain("Extracted safe route 101 headline.");
    expect(JSON.stringify(result)).not.toContain("sk-testsecret123");
    expect(result.browserSessionPersistence).toBe("none");
  });
});
