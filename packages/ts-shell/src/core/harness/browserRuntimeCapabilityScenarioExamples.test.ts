import { describe, expect, it } from "vitest";
import { parseBrowserCommandArgs } from "../context/browserCommandContract.js";
import { runBrowserCommandAsync } from "../context/browserCommandRunner.js";
import { runBrowserActionLoopExecutor } from "../context/browserActionLoopExecutor.js";
import { renderBrowserRuntimeSurface } from "../context/browserRuntimeSurface.js";
import { renderBrowserPublicReadOnlyWebSurface } from "../context/browserPublicReadOnlyWebSurface.js";
import { createBrowserPublicReadOnlyWebScenarioFixture } from "./browserPublicReadOnlyWebScenarioFixtures.js";
import { createBrowserPublicReadOnlyWebManifest } from "../context/browserPublicReadOnlyWebManifest.js";
import { decideBrowserPublicReadOnlyWebPolicy } from "../context/browserPublicReadOnlyWebPolicy.js";
import { runBrowserPublicReadOnlyWebExecutor } from "../context/browserPublicReadOnlyWebExecutor.js";
import { createBrowserPublicReadOnlyWebReceipt } from "../context/browserPublicReadOnlyWebReceipt.js";
import { adaptCommandResultToSidebarEvent } from "../context/sidebar/sidebarCommandEventAdapter.js";
import {
  browserRuntimeRequest,
  createBrowserRuntimeMvpScenarioFixture,
  publicBrowserRuntimeManifestLoad,
} from "./browserRuntimeCapabilityScenarioFixtures.js";
import {
  createBrowserEvalBenchmarkReport,
  renderBrowserEvalBenchmarkReport,
} from "./browserEvalBenchmarkReport.js";
import { runBrowserEvalBenchmark } from "./browserEvalBenchmarkRunner.js";
import type { BrowserEvalBenchmarkTask } from "./browserEvalBenchmarkModel.js";

describe("browser runtime capability scenario examples", () => {
  it("reports runtime status unavailable when no explicit manifest is supplied", async () => {
    const parsed = parseBrowserCommandArgs(["runtime", "status"]);
    const result = await runBrowserCommandAsync({ contract: parsed.contract! });

    expect(result.output).toContain("Browser runtime status");
    expect(result.output).toContain("- Status: unavailable");
    expect(result.output).toContain("- Explicit manifest: required");
    expect(result.output).toContain("- Default runtime: disabled");
  });

  it("observes explicit simulated runtime and returns DOM plus accessibility snapshots", async () => {
    const fixture = createBrowserRuntimeMvpScenarioFixture();
    const result = await runBrowserActionLoopExecutor({
      request: browserRuntimeRequest("observe", fixture.page.url),
      manifestLoad: fixture.manifestLoad,
      executor: fixture.executor,
    });

    expect(result.receipt.executed).toBe(true);
    expect(result.receipt.domSnapshotId).toContain("dom:");
    expect(result.receipt.accessibilitySnapshotId).toContain("accessibility:");
    expect(result.observation?.textSummary).toContain("Route 123 Fixture");
    expect(result.observation?.interactiveSummary).toContain("button:Save draft");
  });

  it("shows JS-rendered fixture evidence without exposing raw page content", async () => {
    const fixture = createBrowserRuntimeMvpScenarioFixture();
    const result = await runBrowserActionLoopExecutor({
      request: browserRuntimeRequest("observe", fixture.page.url),
      manifestLoad: fixture.manifestLoad,
      executor: fixture.executor,
    });
    const surface = renderBrowserRuntimeSurface(result);

    expect(surface).toContain("JS rendered dashboard ready");
    expect(surface).not.toContain("<main>");
    expect(surface).not.toContain("sk-testSECRET");
    expect(surface).toContain("- Raw content: excluded");
  });

  it("extract uses DOM, accessibility, text observation, and provenance ids", async () => {
    const fixture = createBrowserRuntimeMvpScenarioFixture();
    const result = await runBrowserActionLoopExecutor({
      request: browserRuntimeRequest("extract", fixture.page.url),
      manifestLoad: fixture.manifestLoad,
      executor: fixture.executor,
    });

    expect(result.receipt.provenanceId).toContain("browser-provenance:");
    expect(result.observation?.linkSummary.join(" ")).toContain("Details");
    expect(result.observation?.provenance.citationLabels.join(" ")).toContain("browser-observation:");
  });

  it("controlled click produces a post-action observation", async () => {
    const fixture = createBrowserRuntimeMvpScenarioFixture();
    const result = await runBrowserActionLoopExecutor({
      request: browserRuntimeRequest("click", "Save draft"),
      manifestLoad: fixture.manifestLoad,
      executor: fixture.executor,
    });

    expect(result.receipt.executed).toBe(true);
    expect(result.receipt.actionTargetId).toContain("browser-target:click");
    expect(result.observation?.textSummary).toContain("Clicked Save draft");
  });

  it("controlled type into a safe field produces a post-action observation", async () => {
    const fixture = createBrowserRuntimeMvpScenarioFixture();
    const result = await runBrowserActionLoopExecutor({
      request: browserRuntimeRequest("type", "Safe note", "hello"),
      manifestLoad: fixture.manifestLoad,
      executor: fixture.executor,
    });

    expect(result.receipt.executed).toBe(true);
    expect(result.observation?.textSummary).toContain("Updated Safe note");
  });

  it("blocks type into password or payment fields", async () => {
    const fixture = createBrowserRuntimeMvpScenarioFixture();
    const password = await runBrowserActionLoopExecutor({
      request: browserRuntimeRequest("type", "Password", "secret"),
      manifestLoad: fixture.manifestLoad,
      executor: fixture.executor,
    });
    const payment = await runBrowserActionLoopExecutor({
      request: browserRuntimeRequest("type", "Credit card", "4111111111111111"),
      manifestLoad: fixture.manifestLoad,
      executor: fixture.executor,
    });

    expect(password.receipt.executed).toBe(false);
    expect(password.policy.status).toBe("blocked-sensitive-target");
    expect(payment.policy.status).toBe("blocked-sensitive-target");
  });

  it("blocks public click/type through manifest policy", async () => {
    const fixture = createBrowserRuntimeMvpScenarioFixture();
    const result = await runBrowserActionLoopExecutor({
      request: browserRuntimeRequest("click", "https://example.com"),
      manifestLoad: publicBrowserRuntimeManifestLoad(),
      executor: fixture.executor,
    });

    expect(result.receipt.executed).toBe(false);
    expect(result.availability.status).toBe("blocked-by-policy");
  });

  it("missing selector produces repair preview without automatic execution", async () => {
    const fixture = createBrowserRuntimeMvpScenarioFixture();
    const result = await runBrowserActionLoopExecutor({
      request: browserRuntimeRequest("click", "Missing button"),
      manifestLoad: fixture.manifestLoad,
      executor: fixture.executor,
    });

    expect(result.receipt.executed).toBe(false);
    expect(result.repairSeed?.readiness).toBe("preview-ready");
    expect(result.repairSeed?.automaticExecution).toBe(false);
    expect(result.repairSeed?.candidateTargetIds.join(" ")).toContain("button:Save draft");
  });

  it("redacts raw DOM secrets and hidden reasoning labels", async () => {
    const fixture = createBrowserRuntimeMvpScenarioFixture();
    const result = await runBrowserActionLoopExecutor({
      request: browserRuntimeRequest("observe", fixture.page.url),
      manifestLoad: fixture.manifestLoad,
      executor: fixture.executor,
    });
    const serialized = JSON.stringify(result.receipt) + JSON.stringify(result.observation);

    expect(result.receipt.redactions).toContain("secret-looking-field");
    expect(result.receipt.redactions).toContain("hidden-reasoning-label");
    expect(serialized).not.toContain("sk-testSECRET");
    expect(serialized).not.toContain("raw-user-value");
  });

  it("command integration renders runtime execution and sidebar-safe summary", async () => {
    const fixture = createBrowserRuntimeMvpScenarioFixture();
    const parsed = parseBrowserCommandArgs(["execute", "observe", fixture.page.url]);
    const result = await runBrowserCommandAsync({
      contract: parsed.contract!,
      browserRuntimeManifest: fixture.manifestLoad,
      browserRuntimeExecutor: fixture.executor,
    });
    const event = adaptCommandResultToSidebarEvent({
      command: "/browser",
      args: ["execute", "observe"],
      result: { kind: "local", output: result.output },
    });

    expect(result.output).toContain("Browser runtime execution");
    expect(result.output).toContain("DOM snapshot id:");
    expect(event.title).toBe("Browser execution");
    expect(event.summary).toContain("DOM snapshot id:");
    expect(event.rawContent).toBe(result.output);
  });

  it("keeps public HTTP read-only path unchanged", async () => {
    const fixture = createBrowserPublicReadOnlyWebScenarioFixture();
    const manifest = createBrowserPublicReadOnlyWebManifest({
      allowedPublicOrigins: [fixture.origin],
    });
    const request = browserRuntimeRequest("navigate", `${fixture.origin}/`);
    const policy = decideBrowserPublicReadOnlyWebPolicy({
      request,
      manifestLoad: {
        status: "valid",
        manifest,
        reason: "valid",
        evidence: [],
        warnings: [],
        redactions: [],
      },
      confirmations: [{ kind: "network", status: "confirmed" }],
      clientAvailable: true,
    });
    try {
      const executor = await runBrowserPublicReadOnlyWebExecutor({
        request,
        policy,
        manifest,
        httpClient: fixture.httpClient,
      });
      const receipt = createBrowserPublicReadOnlyWebReceipt({
        request,
        manifest,
        policy,
        executor,
      });
      const surface = renderBrowserPublicReadOnlyWebSurface(receipt);

      expect(receipt.executed).toBe(true);
      expect(surface).toContain("Public read-only web execution");
      expect(surface).toContain("Browser launched: no");
      expect(surface).toContain("JavaScript executed: no");
    } finally {
      fixture.cleanup();
    }
  });

  it("runs deterministic browser eval benchmark without provider or public network", async () => {
    const fixture = createBrowserRuntimeMvpScenarioFixture();
    const tasks: readonly BrowserEvalBenchmarkTask[] = [
      {
        taskId: "observe-title",
        description: "observe title and heading",
        request: browserRuntimeRequest("observe", fixture.page.url),
        expectations: [{ kind: "contains", text: "Route 123 Fixture" }, { kind: "executed", value: true }],
      },
      {
        taskId: "click-button",
        description: "click controlled button",
        request: browserRuntimeRequest("click", "Save draft"),
        expectations: [{ kind: "contains", text: "Clicked Save draft" }, { kind: "executed", value: true }],
      },
      {
        taskId: "block-unsafe",
        description: "block unsafe field",
        request: browserRuntimeRequest("type", "Password", "secret"),
        expectations: [{ kind: "blocked", policyStatus: "blocked-sensitive-target" }],
      },
    ];
    const scores = await runBrowserEvalBenchmark({
      tasks,
      manifestLoad: fixture.manifestLoad,
      executor: fixture.executor,
    });
    const report = createBrowserEvalBenchmarkReport(scores);

    expect(report.status).toBe("passed");
    expect(renderBrowserEvalBenchmarkReport(report)).toContain("Provider/model call: none");
  });
});
