import { describe, expect, it } from "vitest";
import { comparePlaywrightMcpBackend } from "../context/browserPlaywrightMcpBackendComparison.js";
import { renderBrowserPlaywrightAdapterSurface } from "../context/browserPlaywrightAdapterSurface.js";
import { decideBrowserRuntimeDirection } from "../context/browserRuntimeDirectionDecision.js";
import { auditBrowserPlaywrightRuntimeAvailability } from "../context/browserPlaywrightRuntimeAvailability.js";

describe("browser runtime direction decision scenarios", () => {
  it("Direct Playwright available and controllable recommends core runtime", async () => {
    const availability = await availablePlaywright();
    const comparison = comparePlaywrightMcpBackend();
    const decision = decideBrowserRuntimeDirection({
      availability,
      mcpComparison: comparison,
      directAdapterScenarioPassed: true,
    });

    expect(decision.recommendedCoreRuntime).toBe("direct-playwright");
    expect(decision.optionalBackends).toContain("playwright-mcp");
    expect(decision.rejectedPaths).toContain("hand-rolled-low-level-runtime");
  });

  it("Direct Playwright unavailable recommends dependency decision before implementation", async () => {
    const availability = await auditBrowserPlaywrightRuntimeAvailability({
      allowRuntimeImportCheck: false,
    });
    const decision = decideBrowserRuntimeDirection({
      availability,
      mcpComparison: comparePlaywrightMcpBackend(),
      directAdapterScenarioPassed: false,
    });

    expect(decision.recommendedCoreRuntime).toBe("dependency-decision-required");
    expect(decision.route126Prerequisites.join(" ")).toContain("dependency");
  });

  it("MCP backend mature but control plane weaker recommends optional backend", async () => {
    const comparison = comparePlaywrightMcpBackend({
      toolSchemaMaturity: "high",
      evidenceMappingQuality: "high",
      controlPlaneVisibility: "partial",
      permissionMappingComplexity: "high",
      serverLifecycleComplexity: "high",
      sandboxBoundaryComplexity: "high",
    });

    expect(comparison.suitability).toBe("optional-backend");
    expect(comparison.evidence).toContain("playwright-mcp-backend-comparison:no-mcp-launch");
  });

  it("Stagehand-like planner useful but not core runtime recommends future planner layer", async () => {
    const decision = decideBrowserRuntimeDirection({
      availability: await auditBrowserPlaywrightRuntimeAvailability(),
      mcpComparison: comparePlaywrightMcpBackend(),
      stagehandPlannerUseful: true,
    });

    expect(decision.rejectedPaths).toContain("hand-rolled-low-level-runtime");
    expect(decision.reasons.join(" ")).toContain("Stagehand-like");
    expect(decision.recommendedCoreRuntime).toBe("dependency-decision-required");
  });

  it("decision report is concise and redacted", async () => {
    const availability = await availablePlaywright();
    const comparison = comparePlaywrightMcpBackend();
    const decision = decideBrowserRuntimeDirection({
      availability,
      mcpComparison: comparison,
      directAdapterScenarioPassed: true,
    });
    const output = renderBrowserPlaywrightAdapterSurface({
      availability,
      mcpComparison: comparison,
      decision,
      tested: ["observe", "extract", "click", "type", "sk-route125SECRET"],
      notDone: ["no package install", "no MCP launch", "no public automation"],
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
