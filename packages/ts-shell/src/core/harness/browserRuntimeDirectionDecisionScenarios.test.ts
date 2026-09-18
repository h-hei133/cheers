import { describe, expect, it } from "vitest";
import { compareBrowserToolServerBackend } from "../context/browserToolServerBackendComparison.js";
import { renderBrowserPlaywrightAdapterSurface } from "../context/browserPlaywrightAdapterSurface.js";
import { decideBrowserRuntimeDirection } from "../../browser/runtime/core/directionDecision.js";
import { auditBrowserPlaywrightRuntimeAvailability } from "../context/browserPlaywrightRuntimeAvailability.js";

describe("browser runtime direction decision scenarios", () => {
  it("Direct Playwright available and controllable recommends core runtime", async () => {
    const availability = await availablePlaywright();
    const comparison = compareBrowserToolServerBackend();
    const decision = decideBrowserRuntimeDirection({
      availability,
      toolServerComparison: comparison,
      directAdapterScenarioPassed: true,
    });

    expect(decision.recommendedCoreRuntime).toBe("direct-playwright");
    expect(decision.optionalBackends).toContain("browser-tool-server");
    expect(decision.rejectedPaths).toContain("hand-rolled-low-level-runtime");
  });

  it("Direct Playwright unavailable recommends dependency decision before implementation", async () => {
    const availability = await auditBrowserPlaywrightRuntimeAvailability({
      allowRuntimeImportCheck: false,
    });
    const decision = decideBrowserRuntimeDirection({
      availability,
      toolServerComparison: compareBrowserToolServerBackend(),
      directAdapterScenarioPassed: false,
    });

    expect(decision.recommendedCoreRuntime).toBe("dependency-decision-required");
    expect(decision.route126Prerequisites.join(" ")).toContain("dependency");
  });

  it("tool-server backend mature but control plane weaker recommends optional backend", async () => {
    const comparison = compareBrowserToolServerBackend({
      toolSchemaMaturity: "high",
      evidenceMappingQuality: "high",
      controlPlaneVisibility: "partial",
      permissionMappingComplexity: "high",
      serverLifecycleComplexity: "high",
      sandboxBoundaryComplexity: "high",
    });

    expect(comparison.suitability).toBe("optional-backend");
    expect(comparison.evidence).toContain("browser-tool-server-backend-comparison:no-tool-server-launch");
  });

  it("action-layer planner useful but not core runtime recommends future planner layer", async () => {
    const decision = decideBrowserRuntimeDirection({
      availability: await auditBrowserPlaywrightRuntimeAvailability(),
      toolServerComparison: compareBrowserToolServerBackend(),
      actionLayerPlannerUseful: true,
    });

    expect(decision.rejectedPaths).toContain("hand-rolled-low-level-runtime");
    expect(decision.reasons.join(" ")).toContain("action-layer");
    expect(decision.recommendedCoreRuntime).toBe("dependency-decision-required");
  });

  it("decision report is concise and redacted", async () => {
    const availability = await availablePlaywright();
    const comparison = compareBrowserToolServerBackend();
    const decision = decideBrowserRuntimeDirection({
      availability,
      toolServerComparison: comparison,
      directAdapterScenarioPassed: true,
    });
    const output = renderBrowserPlaywrightAdapterSurface({
      availability,
      toolServerComparison: comparison,
      decision,
      tested: ["observe", "extract", "click", "type", "sk-route125SECRET"],
      notDone: ["no tool-server launch", "no public automation"],
    });

    expect(output.split("\n").length).toBeLessThan(25);
    expect(output).toContain("Raw content: excluded");
    expect(output).not.toContain("sk-route125SECRET");
  });
});

async function availablePlaywright() {
  return auditBrowserPlaywrightRuntimeAvailability({
    rootPackageJson: { dependencies: { playwright: "0.0.0-test" } },
    allowRuntimeImportCheck: true,
    runtimeImport: async () => ({ chromium: {} }),
  });
}
