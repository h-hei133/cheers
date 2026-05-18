import { sanitizeBrowserText } from "./browserCapabilityModel.js";

export type BrowserPlaywrightMcpSuitability =
  | "core-runtime"
  | "optional-backend"
  | "not-recommended";

export interface BrowserPlaywrightMcpBackendComparison {
  readonly toolSchemaMaturity: "high" | "medium" | "low";
  readonly controlPlaneVisibility: "strong" | "partial" | "weak";
  readonly permissionMappingComplexity: "low" | "medium" | "high";
  readonly evidenceMappingQuality: "high" | "medium" | "low";
  readonly serverLifecycleComplexity: "low" | "medium" | "high";
  readonly sandboxBoundaryComplexity: "low" | "medium" | "high";
  readonly suitability: BrowserPlaywrightMcpSuitability;
  readonly reason: string;
  readonly warnings: readonly string[];
  readonly evidence: readonly string[];
}

export function comparePlaywrightMcpBackend(input: Partial<BrowserPlaywrightMcpBackendComparison> = {}): BrowserPlaywrightMcpBackendComparison {
  const comparison = {
    toolSchemaMaturity: input.toolSchemaMaturity ?? "high",
    controlPlaneVisibility: input.controlPlaneVisibility ?? "partial",
    permissionMappingComplexity: input.permissionMappingComplexity ?? "high",
    evidenceMappingQuality: input.evidenceMappingQuality ?? "high",
    serverLifecycleComplexity: input.serverLifecycleComplexity ?? "high",
    sandboxBoundaryComplexity: input.sandboxBoundaryComplexity ?? "high",
  } satisfies Omit<BrowserPlaywrightMcpBackendComparison, "suitability" | "reason" | "warnings" | "evidence">;
  const suitability = decideSuitability(comparison);
  return {
    ...comparison,
    suitability,
    reason: sanitizeBrowserText(reasonFor(suitability), 240),
    warnings: suitability === "optional-backend"
      ? ["playwright-mcp:not-core-runtime", "playwright-mcp:no-server-launch"]
      : ["playwright-mcp:recheck-before-use"],
    evidence: [
      "playwright-mcp-backend-comparison:pure",
      `playwright-mcp-backend-comparison:suitability:${suitability}`,
      "playwright-mcp-backend-comparison:no-mcp-launch",
      "playwright-mcp-backend-comparison:no-provider-or-model-call",
    ],
  };
}

function decideSuitability(input: {
  readonly toolSchemaMaturity: "high" | "medium" | "low";
  readonly controlPlaneVisibility: "strong" | "partial" | "weak";
  readonly permissionMappingComplexity: "low" | "medium" | "high";
  readonly evidenceMappingQuality: "high" | "medium" | "low";
  readonly serverLifecycleComplexity: "low" | "medium" | "high";
  readonly sandboxBoundaryComplexity: "low" | "medium" | "high";
}): BrowserPlaywrightMcpSuitability {
  if (
    input.toolSchemaMaturity === "high" &&
    input.controlPlaneVisibility === "strong" &&
    input.permissionMappingComplexity === "low" &&
    input.serverLifecycleComplexity === "low" &&
    input.sandboxBoundaryComplexity === "low"
  ) {
    return "core-runtime";
  }
  if (
    input.toolSchemaMaturity === "low" ||
    input.evidenceMappingQuality === "low" ||
    input.controlPlaneVisibility === "weak"
  ) {
    return "not-recommended";
  }
  return "optional-backend";
}

function reasonFor(suitability: BrowserPlaywrightMcpSuitability): string {
  switch (suitability) {
    case "core-runtime":
      return "Playwright MCP could be a core runtime only if lifecycle, sandbox, and permission mapping stay simple and visible.";
    case "optional-backend":
      return "Playwright MCP has mature browser tools and strong evidence shape, but server lifecycle and permission mapping make it a better optional backend than core runtime.";
    case "not-recommended":
      return "Playwright MCP should not be used until tool schema, evidence, and control-plane visibility are strong enough.";
  }
}
