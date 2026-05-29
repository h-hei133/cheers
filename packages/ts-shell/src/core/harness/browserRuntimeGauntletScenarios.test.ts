import { describe, expect, it } from "vitest";
import { createBrowserActionContract } from "../context/browserActionContract.js";
import { createBrowserExecutionRequest } from "../context/browserExecutionContract.js";
import { runBrowserActionLoopExecutor } from "../context/browserActionLoopExecutor.js";
import { BrowserRuntimeAdapterExecutor } from "../context/browserRuntimeAdapterExecutor.js";
import { applyBrowserSelectorRepair } from "../context/browserSelectorRepairApplyExecutor.js";
import { createBrowserRuntimeGauntletManifest } from "../context/browserRuntimeGauntletManifest.js";
import { browserRuntimeRequest } from "./browserRuntimeCapabilityScenarioFixtures.js";
import { createBrowserRuntimeAdapterFixture } from "./browserRuntimeAdapterFixtures.js";
import type { BrowserEvalBenchmarkTask } from "./browserEvalBenchmarkModel.js";
import { runBrowserEvalBenchmark } from "./browserEvalBenchmarkRunner.js";
import {
  createBrowserEvalBenchmarkReport,
  renderBrowserEvalBenchmarkReport,
} from "./browserEvalBenchmarkReport.js";

describe("browser runtime adapter gauntlet scenarios", () => {
  it("runs expanded browser eval gauntlet with controlled adapter evidence", async () => {
    const fixture = createBrowserRuntimeAdapterFixture();
    try {
      const tasks: readonly BrowserEvalBenchmarkTask[] = [
        {
          taskId: "observe-rendered-title",
          description: "observe rendered title and heading",
          request: browserRuntimeRequest("observe", fixture.origin),
          expectations: [{ kind: "contains", text: "Route 124 Adapter" }, { kind: "executed", value: true }],
        },
        {
          taskId: "extract-visible-text",
          description: "extract visible rendered text",
          request: browserRuntimeRequest("extract", fixture.origin),
          expectations: [{ kind: "contains", text: "JS rendered adapter dashboard ready" }, { kind: "executed", value: true }],
        },
        {
          taskId: "identify-button-click",
          description: "click button by accessible name",
          request: browserRuntimeRequest("click", "Save draft"),
          expectations: [{ kind: "contains", text: "Clicked Save draft" }, { kind: "executed", value: true }],
        },
        {
          taskId: "type-safe-input",
          description: "type into safe input",
          request: browserRuntimeRequest("type", "Safe note", "hello"),
          expectations: [{ kind: "contains", text: "Updated Safe note" }, { kind: "executed", value: true }],
        },
        {
          taskId: "block-password",
          description: "block password field",
          request: browserRuntimeRequest("type", "Password", "secret"),
          expectations: [{ kind: "blocked", policyStatus: "blocked-sensitive-target" }],
        },
      ];
      if (fixture.externalManifest.status !== "valid") {
        throw new Error("fixture manifest must be valid");
      }
      const scores = await runBrowserEvalBenchmark({
        tasks,
        manifestLoad: fixture.externalManifest.runtimeManifest,
        executor: new BrowserRuntimeAdapterExecutor(fixture.externalManifest),
      });
      const report = createBrowserEvalBenchmarkReport(scores);
      const gauntlet = createBrowserRuntimeGauntletManifest(tasks.length);
      const rendered = renderBrowserEvalBenchmarkReport(report);
      expect(gauntlet.taskCount).toBe(tasks.length);
      expect(report.status).toBe("passed");
      expect(rendered).toContain("Skipped: 0");
      expect(rendered).toContain("Provider/model call: none");
      expect(rendered).not.toContain("sk-route124SECRET");
    } finally {
      fixture.cleanup();
    }
  });

  it("applies selector repair metadata before explicit controlled action execution", async () => {
    const fixture = createBrowserRuntimeAdapterFixture();
    try {
      if (fixture.externalManifest.status !== "valid" || fixture.externalManifest.runtimeManifest.status !== "valid") {
        throw new Error("fixture manifest must be valid");
      }
      const missing = await runBrowserActionLoopExecutor({
        request: browserRuntimeRequest("click", "Missing button"),
        manifestLoad: fixture.externalManifest.runtimeManifest,
        executor: new BrowserRuntimeAdapterExecutor(fixture.externalManifest),
      });
      const candidate = missing.repairSeed?.candidateTargetIds.find((item) => item.includes("Save draft"));
      const applied = applyBrowserSelectorRepair({
        request: browserRuntimeRequest("click", "Missing button"),
        manifest: fixture.externalManifest.runtimeManifest.manifest,
        repairSeed: missing.repairSeed,
        selectedCandidate: candidate,
        confidence: 0.92,
        confirmed: true,
      });
      expect(missing.repairSeed?.readiness).toBe("preview-ready");
      expect(applied.decision.status).toBe("allowed");
      expect(applied.metadataOnly).toBe(true);
      expect(applied.automaticActionExecuted).toBe(false);
      const executed = await runBrowserActionLoopExecutor({
        request: applied.repairedRequest!,
        manifestLoad: fixture.externalManifest.runtimeManifest,
        executor: new BrowserRuntimeAdapterExecutor(fixture.externalManifest),
      });
      expect(executed.receipt.executed).toBe(true);
      expect(executed.observation?.textSummary).toContain("Clicked Save draft");
    } finally {
      fixture.cleanup();
    }
  });

  it("blocks low-confidence and public selector repair apply", async () => {
    const fixture = createBrowserRuntimeAdapterFixture();
    try {
      if (fixture.externalManifest.status !== "valid" || fixture.externalManifest.runtimeManifest.status !== "valid") {
        throw new Error("fixture manifest must be valid");
      }
      const missing = await runBrowserActionLoopExecutor({
        request: browserRuntimeRequest("click", "Missing button"),
        manifestLoad: fixture.externalManifest.runtimeManifest,
        executor: new BrowserRuntimeAdapterExecutor(fixture.externalManifest),
      });
      const lowConfidence = applyBrowserSelectorRepair({
        request: browserRuntimeRequest("click", "Missing button"),
        manifest: fixture.externalManifest.runtimeManifest.manifest,
        repairSeed: missing.repairSeed,
        selectedCandidate: "button:Save draft",
        confidence: 0.2,
        confirmed: true,
      });
      const publicRepair = applyBrowserSelectorRepair({
        request: createBrowserExecutionRequest({
          mode: "test-local",
          source: "scenario-harness",
          action: createBrowserActionContract({
            actionKind: "click",
            target: "Missing button",
            url: "https://example.com",
            userIntentSummary: "public repair",
            requiresNetwork: true,
            requiresAuth: false,
          }),
        }),
        manifest: fixture.externalManifest.runtimeManifest.manifest,
        repairSeed: missing.repairSeed,
        selectedCandidate: "button:Save draft",
        confidence: 0.92,
        confirmed: true,
      });
      expect(lowConfidence.decision.status).toBe("blocked-low-confidence");
      expect(publicRepair.decision.status).toBe("blocked-public-origin");
    } finally {
      fixture.cleanup();
    }
  });

  it("handles invalid runner and keeps raw DOM/secrets out of gauntlet report", async () => {
    const fixture = createBrowserRuntimeAdapterFixture();
    try {
      const invalid = await runBrowserActionLoopExecutor({
        request: browserRuntimeRequest("observe", fixture.origin),
        manifestLoad: fixture.invalidManifest.status === "valid" ? fixture.invalidManifest.runtimeManifest : undefined,
        executor: new BrowserRuntimeAdapterExecutor(fixture.invalidManifest),
      });
      const timeout = await runBrowserActionLoopExecutor({
        request: browserRuntimeRequest("observe", fixture.origin),
        manifestLoad: fixture.timeoutManifest.status === "valid" ? fixture.timeoutManifest.runtimeManifest : undefined,
        executor: new BrowserRuntimeAdapterExecutor(fixture.timeoutManifest),
      });
      const rendered = JSON.stringify(invalid.receipt) + JSON.stringify(timeout.receipt);
      expect(invalid.receipt.executed).toBe(false);
      expect(timeout.receipt.executed).toBe(false);
      expect(rendered).not.toContain("<main>");
      expect(rendered).not.toContain("sk-route124SECRET");
    } finally {
      fixture.cleanup();
    }
  });
});
