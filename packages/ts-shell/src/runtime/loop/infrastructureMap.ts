export type LoopInfrastructureCategory =
  | "prompt-input"
  | "turn-snapshot"
  | "runtime-phase"
  | "model-boundary"
  | "provider-metadata"
  | "tool-call-batch"
  | "before-tool-policy"
  | "execution-receipt"
  | "tool-result-details"
  | "after-tool-annotation"
  | "save-point"
  | "next-turn-preparation"
  | "session-active-path"
  | "context-rebuild-projection"
  | "package-resource-inventory"
  | "runtime-events"
  | "json-event-stream"
  | "product-surface"
  | "result-facts"
  | "not-proven-claims"
  | "product-loop-replacement";

export type LoopInfrastructureConnectionStatus =
  | "connected"
  | "partial"
  | "unsupported"
  | "not_proven";

export interface LoopInfrastructureMapEntry {
  readonly category: LoopInfrastructureCategory;
  readonly ownerDomain: string;
  readonly loopStage: string;
  readonly connectionStatus: LoopInfrastructureConnectionStatus;
  readonly evidenceSurface: string;
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface LoopInfrastructureMap {
  readonly entries: readonly LoopInfrastructureMapEntry[];
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export const LOOP_INFRASTRUCTURE_CATEGORIES = [
  "prompt-input",
  "turn-snapshot",
  "runtime-phase",
  "model-boundary",
  "provider-metadata",
  "tool-call-batch",
  "before-tool-policy",
  "execution-receipt",
  "tool-result-details",
  "after-tool-annotation",
  "save-point",
  "next-turn-preparation",
  "session-active-path",
  "context-rebuild-projection",
  "package-resource-inventory",
  "runtime-events",
  "json-event-stream",
  "product-surface",
  "result-facts",
  "not-proven-claims",
  "product-loop-replacement",
] as const satisfies readonly LoopInfrastructureCategory[];

export function createLoopInfrastructureMap(): LoopInfrastructureMap {
  const entries: readonly LoopInfrastructureMapEntry[] = [
    entry("prompt-input", "runtime/loop", "input", "connected", "safe prompt summary"),
    entry("turn-snapshot", "turn", "turn", "connected", "RuntimeTurnSnapshot"),
    entry("runtime-phase", "turn", "turn", "connected", "snapshot phase and save point phase"),
    entry("model-boundary", "runtime/loop", "provider", "partial", "model boundary observation", [
      "real-provider-streaming",
      "provider-success",
    ]),
    entry("provider-metadata", "provider", "provider", "connected", "ProviderRegistryProjection", [
      "provider-called",
      "provider-success",
    ]),
    entry("tool-call-batch", "runtime/loop", "tools", "partial", "tool call batch metadata", [
      "real-tool-execution-batch",
      "tool-success",
    ]),
    entry("before-tool-policy", "tools", "tools", "connected", "ToolBeforePolicyDecision"),
    entry("execution-receipt", "runtime/execution", "execution", "connected", "RuntimeExecutionReceiptProjection", [
      "command-success",
    ]),
    entry("tool-result-details", "tools", "tools", "connected", "ToolReportSafeProjection", [
      "tool-success",
    ]),
    entry("after-tool-annotation", "tools", "tools", "connected", "ToolAfterObservationAnnotation", [
      "tool-success",
    ]),
    entry("save-point", "evidence", "save", "connected", "RuntimeEvidenceSavePoint", [
      "save-point-success",
    ]),
    entry("next-turn-preparation", "runtime/loop", "next_turn", "connected", "pending next turn facts", [
      "next-turn-success",
    ]),
    entry("session-active-path", "session", "session", "partial", "SessionTreeProjection.activePathProjection", [
      "session-storage-backed-branching",
    ]),
    entry("context-rebuild-projection", "context", "context", "connected", "SessionContextRebuildProjection", [
      "context-rebuild-success",
    ]),
    entry("package-resource-inventory", "runtime/resources", "resources", "connected", "package and static resource projections", [
      "package-loading",
      "dynamic-discovery",
    ]),
    entry("runtime-events", "runtime/events", "events", "connected", "RuntimeProjectionEvent"),
    entry("json-event-stream", "runtime/events", "events", "connected", "JsonRuntimeEventStreamEntry"),
    entry("product-surface", "presentation", "presentation", "connected", "ProductSurfaceViewModel sections", [
      "terminal-success",
    ]),
    entry("result-facts", "result", "result", "connected", "result and verdict facts", [
      "terminal-success",
    ]),
    entry("not-proven-claims", "evidence", "truthfulness", "connected", "explicit not-proven claims"),
    entry("product-loop-replacement", "runtime/loop", "boundary", "not_proven", "current product loop remains authoritative", [
      "full-product-loop-replacement",
    ]),
  ];

  return deepFreeze({
    entries,
    terminalSuccessClaim: false,
    notProvenClaims: Object.freeze([
      "terminal-success",
      "provider-success",
      "tool-success",
      "full-product-loop-replacement",
    ]),
  });
}

function entry(
  category: LoopInfrastructureCategory,
  ownerDomain: string,
  loopStage: string,
  connectionStatus: LoopInfrastructureConnectionStatus,
  evidenceSurface: string,
  notProvenClaims: readonly string[] = ["terminal-success"],
): LoopInfrastructureMapEntry {
  return {
    category,
    ownerDomain,
    loopStage,
    connectionStatus,
    evidenceSurface,
    notProvenClaims: Object.freeze([...new Set(["terminal-success", ...notProvenClaims])]),
    terminalSuccessClaim: false,
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}
