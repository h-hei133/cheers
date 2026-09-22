import { describe, expect, it } from "vitest";
import { parseBrowserCommandArgs } from "./commandContract.js";
import { createBrowserLocalFixture } from "./localFixture.js";
import { createBrowserPlaywrightAvailability } from "./playwrightAvailability.js";
import { runBrowserPlaywrightLifecycle } from "./playwrightLifecycle.js";

describe("browser Playwright lifecycle", () => {
  it("represents unavailable runtime without launching or cleanup residue", async () => {
    const request = parseBrowserCommandArgs(["execute", "observe"]).contract!.execution!;
    const fixture = createBrowserLocalFixture({ fixtureId: "fixture:route101" });
    const result = await runBrowserPlaywrightLifecycle({ request, fixture });

    expect(result.status).toBe("unavailable");
    expect(result.executed).toBe(false);
    expect(result.cleanupStatus).toBe("not-started");
    expect(result.evidence.executed).toBe("no");
    expect(result.evidence.actionTraceSummary).toContain("cleanup:not-started");
  });

  it("represents cleanup on successful injected local execution", async () => {
    const request = parseBrowserCommandArgs(["execute", "observe"]).contract!.execution!;
    const fixture = createBrowserLocalFixture({ fixtureId: "fixture:route101" });
    const result = await runBrowserPlaywrightLifecycle({
      request,
      fixture,
      availabilityChecker: () => createBrowserPlaywrightAvailability({
        status: "available",
        runtimeKind: "module",
      }),
      runner: () => ({
        safeObservationSummary: "Observed safe local fixture content.",
        stdout: "bounded stdout",
        stderr: "",
      }),
      now: () => "2026-05-17T05:06:07.000Z",
    });

    expect(result.status).toBe("executed");
    expect(result.executed).toBe(true);
    expect(result.cleanupStatus).toBe("closed");
    expect(result.evidence.actionTraceSummary).toContain("cleanup:closed");
    expect(result.evidence.stdoutSummary).toContain("bounded stdout");
  });

  it("fails safely and still records cleanup status", async () => {
    const request = parseBrowserCommandArgs(["execute", "observe"]).contract!.execution!;
    const fixture = createBrowserLocalFixture({ fixtureId: "fixture:route101" });
    const result = await runBrowserPlaywrightLifecycle({
      request,
      fixture,
      availabilityChecker: () => createBrowserPlaywrightAvailability({
        status: "available",
        runtimeKind: "module",
      }),
      runner: () => {
        throw new Error("raw <html>sk-testsecret123</html>");
      },
    });

    expect(result.status).toBe("failed");
    expect(result.executed).toBe(false);
    expect(result.cleanupStatus).toBe("failed-safe");
    expect(JSON.stringify(result)).not.toContain("sk-testsecret123");
  });
});
