import { afterEach, describe, expect, it } from "vitest";
import { parseBrowserCommandArgs } from "../../../core/context/browserCommandContract.js";
import { BrowserExternalRunnerExecutor } from "./executor.js";
import { validateBrowserExternalRunnerManifest } from "./manifest.js";
import { createBrowserExternalRunnerScenarioFixture } from "../../../core/harness/browserExternalRunnerScenarioFixtures.js";

describe("browser external runner executor", () => {
  const cleanupFns: (() => void)[] = [];

  afterEach(() => {
    for (const cleanup of cleanupFns.splice(0)) {
      cleanup();
    }
  });

  it("returns executed evidence for safe external runner responses", async () => {
    const fixture = createBrowserExternalRunnerScenarioFixture();
    cleanupFns.push(fixture.cleanup);
    const validation = validateBrowserExternalRunnerManifest(fixture.manifest);
    expect(validation.ok).toBe(true);
    const executor = new BrowserExternalRunnerExecutor({
      manifest: validation.ok ? validation.manifest : fixture.manifest,
      fixture: validation.ok ? validation.fixture : undefined!,
    });
    const request = parseBrowserCommandArgs(["execute", "observe", "local-fixture://route103-demo"]).contract!.execution!;

    const result = await executor.execute(request);

    expect(result.status).toBe("executed");
    expect(result.executed).toBe(true);
    expect(result.evidence.some((item) => item.label === "safe observation")).toBe(true);
  });

  it("blocks unsafe external runner responses", async () => {
    const fixture = createBrowserExternalRunnerScenarioFixture({ kind: "unsafe-output" });
    cleanupFns.push(fixture.cleanup);
    const validation = validateBrowserExternalRunnerManifest(fixture.manifest);
    expect(validation.ok).toBe(true);
    const executor = new BrowserExternalRunnerExecutor({
      manifest: validation.ok ? validation.manifest : fixture.manifest,
      fixture: validation.ok ? validation.fixture : undefined!,
    });
    const request = parseBrowserCommandArgs(["execute", "observe", "local-fixture://route103-demo"]).contract!.execution!;

    const result = await executor.execute(request);

    expect(result.executed).toBe(false);
    expect(result.error?.code).toBe("external-runner-invalid-response");
    expect(JSON.stringify(result)).not.toContain("sk-testsecret123");
  });
});
