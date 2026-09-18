import { sanitizeBrowserText } from "./browserCapabilityModel.js";

export type BrowserToolServerSuitability =
  | "core-runtime"
  | "optional-backend"
  | "not-recommended";

export interface BrowserToolServerBackendComparison {
  readonly toolSchemaMaturity: "high" | "medium" | "low";
  readonly controlPlaneVisibility: "strong" | "partial" | "weak";
  readonly permissionMappingComplexity: "low" | "medium" | "high";
  readonly evidenceMappingQuality: "high" | "medium" | "low";
  readonly serverLifecycleComplexity: "low" | "medium" | "high";
  readonly sandboxBoundaryComplexity: "low" | "medium" | "high";
  readonly suitability: BrowserToolServerSuitability;
  readonly reason: string;
  readonly warnings: readonly string[];
  readonly evidence: readonly string[];
}

export function compareBrowserToolServerBackend(input: Partial<BrowserToolServerBackendComparison> = {}): BrowserToolServerBackendComparison {
  const comparison = {
    toolSchemaMaturity: input.toolSchemaMaturity ?? "high",
    controlPlaneVisibility: input.controlPlaneVisibility ?? "partial",
    permissionMappingComplexity: input.permissionMappingComplexity ?? "high",
    evidenceMappingQuality: input.evidenceMappingQuality ?? "high",
    serverLifecycleComplexity: input.serverLifecycleComplexity ?? "high",
    sandboxBoundaryComplexity: input.sandboxBoundaryComplexity ?? "high",
  } satisfies Omit<BrowserToolServerBackendComparison, "suitability" | "reason" | "warnings" | "evidence">;
  const suitability = decideSuitability(comparison);
  return {
    ...comparison,
    suitability,
    reason: sanitizeBrowserText(reasonFor(suitability), 240),
    warnings: suitability === "optional-backend"
      ? ["browser-tool-server:not-core-runtime", "browser-tool-server:no-server-launch"]
      : ["browser-tool-server:recheck-before-use"],
    evidence: [
      "browser-tool-server-backend-comparison:pure",
      `browser-tool-server-backend-comparison:suitability:${suitability}`,
      "browser-tool-server-backend-comparison:no-tool-server-launch",
      "browser-tool-server-backend-comparison:no-provider-or-model-call",
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
}): BrowserToolServerSuitability {
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

function reasonFor(suitability: BrowserToolServerSuitability): string {
  switch (suitability) {
    case "core-runtime":
      return "browser tool server could be a core runtime only if lifecycle, sandbox, and permission mapping stay simple and visible.";
    case "optional-backend":
      return "browser tool server has mature browser tools and strong evidence shape, but server lifecycle and permission mapping make it a better optional backend than core runtime.";
    case "not-recommended":
      return "browser tool server should not be used until tool schema, evidence, and control-plane visibility are strong enough.";
  }
}
