import { afterEach, describe, expect, it } from "vitest";
import { parseBrowserCommandArgs } from "../../browserCommandContract.js";
import { runBrowserExternalRunnerProcess } from "./runner.js";
import { createBrowserExternalRunnerRequest } from "./protocol.js";
import { createBrowserExternalRunnerScenarioFixture } from "../../../core/harness/browserExternalRunnerScenarioFixtures.js";

describe("browser external runner process", () => {
  const cleanupFns: (() => void)[] = [];

  afterEach(() => {
    for (const cleanup of cleanupFns.splice(0)) {
      cleanup();
    }
  });

  it("handles success with safe JSON response", async () => {
    const fixture = createBrowserExternalRunnerScenarioFixture();
    cleanupFns.push(fixture.cleanup);
    const request = runnerRequest();

    const result = await runBrowserExternalRunnerProcess({
      manifest: fixture.manifest,
      request,
    });

    expect(result.status).toBe("executed");
    expect(result.response?.executed).toBe(true);
    expect(result.stdoutSummary).toContain("raw stdout excluded");
  });

  it("blocks malformed runner output without leaking raw stdout", async () => {
    const fixture = createBrowserExternalRunnerScenarioFixture({ kind: "malformed" });
    cleanupFns.push(fixture.cleanup);

    const result = await runBrowserExternalRunnerProcess({
      manifest: fixture.manifest,
      request: runnerRequest(),
    });

    expect(result.status).toBe("invalid-response");
    expect(result.stdoutSummary).not.toContain("RAW_RUNNER_PAYLOAD");
    expect(result.redactions).toContain("raw-runner-output");
  });

  it("times out slow runners", async () => {
    const fixture = createBrowserExternalRunnerScenarioFixture({ kind: "timeout" });
    cleanupFns.push(fixture.cleanup);

    const result = await runBrowserExternalRunnerProcess({
      manifest: fixture.manifest,
      request: runnerRequest(),
    });

    expect(result.status).toBe("timed-out");
    expect(result.timedOut).toBe(true);
  });

  it("rejects unsafe runner response content", async () => {
    const fixture = createBrowserExternalRunnerScenarioFixture({ kind: "unsafe-output" });
    cleanupFns.push(fixture.cleanup);

    const result = await runBrowserExternalRunnerProcess({
      manifest: fixture.manifest,
      request: runnerRequest(),
    });

    expect(result.status).toBe("invalid-response");
    expect(JSON.stringify(result)).not.toContain("sk-testsecret123");
  });
});

function runnerRequest() {
  const request = parseBrowserCommandArgs(["execute", "observe", "local-fixture://route103-demo"]).contract!.execution!;
  return createBrowserExternalRunnerRequest({
    request,
    mode: "test-local",
    fixtureId: "fixture:route103-demo",
    safeUrl: "local-fixture://route103-demo",
    outputBudgetBytes: 4096,
    sandboxDecision: "local-fixture:allowed",
    allowlistDecision: "network:none",
    confirmationDecision: "sandbox:confirmed",
  });
}
