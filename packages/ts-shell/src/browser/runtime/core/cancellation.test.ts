import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runBrowserActionLoopExecutor } from "../../actionLoopExecutor.js";
import { runBrowserCommandAsync } from "../../commandRunner.js";
import { parseBrowserCommandArgs } from "../../commandContract.js";
import { BrowserRuntimeAdapterExecutor } from "./adapterExecutor.js";
import { renderBrowserRuntimeSurface } from "./surface.js";
import { createBrowserRuntimeAdapterFixture, protocolResponse } from "../../../test-utils/browser/runtime/adapter/fixtures.js";
import { browserRuntimeRequest, createBrowserRuntimeMvpScenarioFixture } from "../../../test-utils/browser/runtime/capability/fixtures.js";

describe("browser runtime cancellation and outcomes", () => {
  const cleanups: (() => void)[] = [];
  afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); });

  it.each(["failed", "blocked"] as const)("does not act after a %s observation", async status => {
    const fixture = createBrowserRuntimeMvpScenarioFixture();
    const execute = vi.fn(input => ({ ...fixture.executor.execute(input), status }));
    const result = await runBrowserActionLoopExecutor({ request: browserRuntimeRequest("click", "Save draft"),
      manifest: fixture.manifest, executor: { kind: fixture.executor.kind, execute } });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(status);
    expect(result.receipt.executed).toBe(false);
    expect(renderBrowserRuntimeSurface(result)).toContain(`Outcome: ${status}`);
  });

  it("does not dispatch an action after cancellation during observation", async () => {
    const fixture = createBrowserRuntimeMvpScenarioFixture();
    const controller = new AbortController();
    const execute = vi.fn(input => { const result = fixture.executor.execute(input); controller.abort(); return result; });
    const result = await runBrowserActionLoopExecutor({ request: browserRuntimeRequest("click", "Save draft"),
      manifest: fixture.manifest, executor: { kind: fixture.executor.kind, execute }, signal: controller.signal });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("cancelled");
    expect(result.receipt).toMatchObject({ executed: false, actionApplied: false });
  });

  it("keeps an action that completed before cancellation", async () => {
    const fixture = createBrowserRuntimeMvpScenarioFixture();
    const controller = new AbortController();
    const result = await runBrowserActionLoopExecutor({ request: browserRuntimeRequest("click", "Save draft"),
      manifest: fixture.manifest, signal: controller.signal,
      executor: { kind: fixture.executor.kind, execute(input) {
        const result = fixture.executor.execute(input);
        if (input.request.actionKind === "click") controller.abort();
        return result;
      } },
    });
    expect(result.status).toBe("cancelled");
    expect(result.receipt).toMatchObject({ executed: false, actionApplied: true });
    expect(renderBrowserRuntimeSurface(result)).toContain("Action applied: yes");
  });

  it("does not upgrade valid JSON from a nonzero process exit", async () => {
    const fixture = createBrowserRuntimeAdapterFixture(); cleanups.push(fixture.cleanup);
    fs.appendFileSync(fixture.runnerPath, "\nprocess.exitCode = 7;\n");
    const parsed = parseBrowserCommandArgs(["execute", "observe", fixture.origin]);
    const result = await runBrowserCommandAsync({ contract: parsed.contract!, browserExternalRuntimeManifest: fixture.externalManifest });
    expect(result.output).toContain("Outcome: failed");
    expect(result.output).toContain("Executed: no");
    expect(result.output).not.toContain("Status: executed");
  });

  it.each(["blocked", "failed"] as const)("keeps action effects unknown after a dispatched %s response", async status => {
    const fixture = createBrowserRuntimeAdapterFixture(); cleanups.push(fixture.cleanup);
    if (fixture.skillManifest.status !== "valid" || fixture.skillManifest.runtimeManifest.status !== "valid") throw new Error("invalid fixture");
    const executor = new BrowserRuntimeAdapterExecutor(fixture.skillManifest, {
      ...fixture.skillBinding, run: () => ({ ...protocolResponse("click", fixture.origin), status: status === "failed" ? "error" : status }),
    });
    const result = await executor.execute({ request: browserRuntimeRequest("click", "Save draft"), manifest: fixture.skillManifest.runtimeManifest.manifest });
    expect(result.status).toBe(status);
    expect(result.actionApplied).toBeNull();
  });

  it("forwards a host pre-cancel to the runtime without invoking its binding", async () => {
    const fixture = createBrowserRuntimeAdapterFixture(); cleanups.push(fixture.cleanup);
    const run = vi.fn(() => protocolResponse("observe", fixture.origin));
    const controller = new AbortController(); controller.abort();
    const result = await runBrowserCommandAsync({ contract: parseBrowserCommandArgs(["execute", "observe", fixture.origin]).contract!,
      signal: controller.signal, browserExternalRuntimeManifest: fixture.skillManifest, browserSkillRuntimeBinding: { ...fixture.skillBinding, run } });
    expect(run).not.toHaveBeenCalled();
    expect(result.output).toContain("Outcome: cancelled");
  });
});
