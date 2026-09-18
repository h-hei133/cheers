import { describe, expect, it } from "vitest";
import { createBrowserActionContract } from "../../browser/browserActionContract.js";
import { runBrowserActionLoopExecutor } from "../../browser/browserActionLoopExecutor.js";
import { runBrowserCommandAsync } from "../../browser/browserCommandRunner.js";
import { parseBrowserCommandArgs } from "../../browser/browserCommandContract.js";
import { BrowserDirectPlaywrightAdapter } from "../../browser/browserDirectPlaywrightAdapter.js";
import { createBrowserExecutionRequest } from "../../browser/browserExecutionContract.js";
import { compareBrowserToolServerBackend } from "../../browser/browserToolServerBackendComparison.js";
import { renderBrowserPlaywrightAdapterSurface } from "../../browser/browserPlaywrightAdapterSurface.js";
import { decideBrowserRuntimeDirection } from "../../browser/runtime/core/directionDecision.js";
import type { BrowserEvalBenchmarkTask } from "../../eval/browser/benchmarkModel.js";
import { runBrowserEvalBenchmark } from "../../eval/browser/benchmarkRunner.js";
import { createBrowserEvalBenchmarkReport } from "../../eval/browser/benchmarkReport.js";
import { browserRuntimeRequest } from "./browserRuntimeCapabilityScenarioFixtures.js";
import { createBrowserPlaywrightAdapterSpikeFixture } from "./browserPlaywrightAdapterSpikeFixtures.js";

describe("browser Direct Playwright adapter spike scenarios", () => {
  it("Playwright unavailable produces deterministic unavailable status", async () => {
    const fixture = await createBrowserPlaywrightAdapterSpikeFixture();
    const result = await runBrowserActionLoopExecutor({
      request: browserRuntimeRequest("observe", fixture.origin),
      manifestLoad: fixture.manifestLoad,
      executor: new BrowserDirectPlaywrightAdapter({ availability: fixture.unavailable }),
    });

    expect(fixture.unavailable.status).toBe("blocked-by-policy");
    expect(result.receipt.executed).toBe(false);
    expect(result.executorResult?.evidence).toContain("playwright-evidence-mapper:status:unavailable");
    expect(JSON.stringify(result)).not.toContain("sk-route125SECRET");
  });

  it("injected Playwright-like observe produces DOM/accessibility/provenance receipt", async () => {
    const fixture = await createBrowserPlaywrightAdapterSpikeFixture();
    const result = await runBrowserActionLoopExecutor({
      request: browserRuntimeRequest("observe", fixture.origin),
      manifestLoad: fixture.manifestLoad,
      executor: new BrowserDirectPlaywrightAdapter({
        availability: fixture.available,
        client: fixture.client,
      }),
    });

    expect(result.receipt.executed).toBe(true);
    expect(result.receipt.runtimeMode).toBe("direct-playwright-core");
    expect(result.receipt.domSnapshotId).toContain("dom:");
    expect(result.receipt.accessibilitySnapshotId).toContain("accessibility:");
    expect(result.receipt.provenanceId).toContain("browser-provenance:");
  });

  it("injected JS-rendered observe captures rendered text", async () => {
    const fixture = await createBrowserPlaywrightAdapterSpikeFixture();
    const result = await runDirect(fixture, browserRuntimeRequest("extract", fixture.origin));

    expect(result.observation?.textSummary).toContain("JS rendered Playwright fixture ready");
    expect(result.receipt.executed).toBe(true);
  });

  it("injected click produces post-action observation", async () => {
    const fixture = await createBrowserPlaywrightAdapterSpikeFixture();
    const result = await runDirect(fixture, browserRuntimeRequest("click", "Save draft"));

    expect(result.receipt.executed).toBe(true);
    expect(result.observation?.textSummary).toContain("Clicked Save draft");
    expect(result.receipt.actionTargetId).toContain("browser-target:click");
  });

  it("injected type produces post-action observation without exposing value", async () => {
    const fixture = await createBrowserPlaywrightAdapterSpikeFixture();
    const result = await runDirect(fixture, browserRuntimeRequest("type", "Safe note", "secret typed value"));
    const serialized = JSON.stringify(result.receipt) + JSON.stringify(result.observation);

    expect(result.receipt.executed).toBe(true);
    expect(result.observation?.textSummary).toContain("Updated Safe note");
    expect(serialized).not.toContain("secret typed value");
  });

  it("unsafe target is blocked by existing policy before adapter call", async () => {
    const fixture = await createBrowserPlaywrightAdapterSpikeFixture();
    const result = await runDirect(fixture, browserRuntimeRequest("type", "Password", "secret"));

    expect(result.receipt.executed).toBe(false);
    expect(result.policy.status).toBe("blocked-sensitive-target");
  });

  it("invalid adapter response is blocked", async () => {
    const fixture = await createBrowserPlaywrightAdapterSpikeFixture();
    const result = await runBrowserActionLoopExecutor({
      request: browserRuntimeRequest("observe", fixture.origin),
      manifestLoad: fixture.manifestLoad,
      executor: new BrowserDirectPlaywrightAdapter({
        availability: fixture.available,
        client: fixture.invalidClient,
      }),
    });

    expect(result.receipt.executed).toBe(false);
    expect(result.receipt.warnings).toEqual(expect.arrayContaining(["direct-playwright-adapter:invalid-evidence"]));
  });

  it("timeout/unavailable is handled safely", async () => {
    const fixture = await createBrowserPlaywrightAdapterSpikeFixture();
    const result = await runBrowserActionLoopExecutor({
      request: browserRuntimeRequest("observe", fixture.origin),
      manifestLoad: fixture.manifestLoad,
      executor: new BrowserDirectPlaywrightAdapter({
        availability: fixture.available,
        client: fixture.timeoutClient,
      }),
    });

    expect(result.receipt.executed).toBe(true);
    expect(result.executorResult?.status).toBe("failed");
    expect(JSON.stringify(result.receipt) + JSON.stringify(result.observation)).not.toContain("<main>");
  });

  it("raw DOM/secrets are redacted from receipt and observation", async () => {
    const fixture = await createBrowserPlaywrightAdapterSpikeFixture();
    const result = await runDirect(fixture, browserRuntimeRequest("observe", fixture.origin));
    const serialized = JSON.stringify(result.receipt) + JSON.stringify(result.observation);

    expect(result.receipt.redactions).toEqual(expect.arrayContaining(["secret-looking-field", "hidden-reasoning-label"]));
    expect(serialized).not.toContain("sk-route125SECRET");
    expect(serialized).not.toContain("hidden reasoning");
    expect(serialized).not.toContain("<main>");
  });

  it("sidebar/report summary includes adapter status", async () => {
    const fixture = await createBrowserPlaywrightAdapterSpikeFixture();
    const comparison = compareBrowserToolServerBackend();
    const decision = decideBrowserRuntimeDirection({
      availability: fixture.available,
      toolServerComparison: comparison,
      directAdapterScenarioPassed: true,
    });
    const output = renderBrowserPlaywrightAdapterSurface({
      availability: fixture.available,
      toolServerComparison: comparison,
      decision,
      tested: ["observe", "extract", "click", "type"],
    });

    expect(output).toContain("Direct Playwright availability");
    expect(output).toContain("Recommended core: direct-playwright");
    expect(output).toContain("tool-server launched: no");
  });

  it("integrates Direct Playwright direction into /browser runtime status", async () => {
    const fixture = await createBrowserPlaywrightAdapterSpikeFixture();
    const comparison = compareBrowserToolServerBackend();
    const decision = decideBrowserRuntimeDirection({
      availability: fixture.available,
      toolServerComparison: comparison,
      directAdapterScenarioPassed: true,
    });
    const parsed = parseBrowserCommandArgs(["runtime", "status"]);
    const result = await runBrowserCommandAsync({
      contract: parsed.contract!,
      browserPlaywrightAvailability: fixture.available,
      browserToolServerComparison: comparison,
      browserRuntimeDirectionDecision: decision,
    });

    expect(result.output).toContain("Browser runtime status");
    expect(result.output).toContain("Direct Playwright availability");
    expect(result.output).toContain("Recommended core: direct-playwright");
    expect(result.output).toContain("tool-server launched: no");
  });

  it("reuses existing eval gauntlet through injected Playwright-like adapter", async () => {
    const fixture = await createBrowserPlaywrightAdapterSpikeFixture();
    const tasks: readonly BrowserEvalBenchmarkTask[] = [
      {
        taskId: "route125-observe",
        description: "observe direct playwright fixture",
        request: browserRuntimeRequest("observe", fixture.origin),
        expectations: [{ kind: "contains", text: "Route 125 Direct Playwright" }, { kind: "executed", value: true }],
      },
      {
        taskId: "route125-click",
        description: "click controlled button",
        request: browserRuntimeRequest("click", "Save draft"),
        expectations: [{ kind: "contains", text: "Clicked Save draft" }, { kind: "executed", value: true }],
      },
      {
        taskId: "route125-block-password",
        description: "block sensitive password target",
        request: browserRuntimeRequest("type", "Password", "secret"),
        expectations: [{ kind: "blocked", policyStatus: "blocked-sensitive-target" }],
      },
    ];
    const scores = await runBrowserEvalBenchmark({
      tasks,
      manifestLoad: fixture.manifestLoad,
      executor: new BrowserDirectPlaywrightAdapter({
        availability: fixture.available,
        client: fixture.client,
      }),
    });
    const report = createBrowserEvalBenchmarkReport(scores);

    expect(report.status).toBe("passed");
    expect(JSON.stringify(report)).not.toContain("sk-route125SECRET");
  });
});

async function runDirect(
  fixture: Awaited<ReturnType<typeof createBrowserPlaywrightAdapterSpikeFixture>>,
  request: ReturnType<typeof browserRuntimeRequest>,
) {
  return runBrowserActionLoopExecutor({
    request,
    manifestLoad: fixture.manifestLoad,
    executor: new BrowserDirectPlaywrightAdapter({
      availability: fixture.available,
      client: fixture.client,
    }),
  });
}
