import { describe, expect, it, vi } from "vitest";
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
        cleanupStatus: "closed",
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
    expect(result.cleanupStatus).toBe("unknown");
    expect(JSON.stringify(result)).not.toContain("sk-testsecret123");
  });
  it("keeps missing cleanup evidence unknown", async () => {
    const request = parseBrowserCommandArgs(["execute", "observe"]).contract!.execution!;
    const result = await runBrowserPlaywrightLifecycle({ request, fixture: createBrowserLocalFixture(),
      availabilityChecker: () => createBrowserPlaywrightAvailability({ status: "available", runtimeKind: "module" }),
      runner: () => ({ safeObservationSummary: "Operation settled without a close receipt." }),
    });
    expect(result).toMatchObject({ status: "failed", executed: false, cleanupStatus: "unknown" });
    expect(result.evidence.actionTraceSummary).not.toContain("cleanup:closed");
  });

  it("passes cancellation to an injected runner and waits for its settlement", async () => {
    const request = parseBrowserCommandArgs(["execute", "observe"]).contract!.execution!;
    const controller = new AbortController();
    let release!: (result: { cleanupStatus: "closed"; actionApplied: true }) => void;
    let ready!: () => void;
    const started = new Promise<void>(resolve => { ready = resolve; });
    let settled = false;
    const pending = runBrowserPlaywrightLifecycle({ request, fixture: createBrowserLocalFixture(), signal: controller.signal,
      availabilityChecker: () => createBrowserPlaywrightAvailability({ status: "available", runtimeKind: "module" }),
      runner: ({ signal }) => { expect(signal).toBe(controller.signal); ready(); return new Promise(resolve => { release = resolve; }); },
    }).then(value => { settled = true; return value; });
    await started; controller.abort();
    await new Promise(resolve => setImmediate(resolve));
    expect(settled).toBe(false);
    release({ cleanupStatus: "closed", actionApplied: true });
    expect(await pending).toMatchObject({ status: "cancelled", executed: false, cleanupStatus: "closed", actionApplied: true });
  });

  it("pre-cancels without invoking the availability checker or runner", async () => {
    const controller = new AbortController(); controller.abort();
    const runner = vi.fn(); const checker = vi.fn();
    const result = await runBrowserPlaywrightLifecycle({ request: parseBrowserCommandArgs(["execute", "observe"]).contract!.execution!,
      fixture: createBrowserLocalFixture(), signal: controller.signal, runner, availabilityChecker: checker });
    expect(result).toMatchObject({ status: "cancelled", cleanupStatus: "not-started" });
    expect(runner).not.toHaveBeenCalled(); expect(checker).not.toHaveBeenCalled();
  });

});
