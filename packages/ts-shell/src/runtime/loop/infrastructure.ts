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
  | "tool-result-messages"
  | "tool-outcome"
  | "after-tool-annotation"
  | "save-point"
  | "next-turn-preparation"
  | "steering-queue"
  | "follow-up-queue"
  | "next-turn-delivery-policy"
  | "verification-intent"
  | "verification-result"
  | "evidence-proof-input"
  | "result-terminal-projection"
  | "loop-finalization"
  | "product-loop-closeout"
  | "product-completion-packet"
  | "repair-handoff"
  | "repair-proposal"
  | "repair-authority"
  | "repair-apply-request"
  | "repair-apply"
  | "post-repair-verification"
  | "session-active-path"
  | "context-rebuild-input"
  | "context-rebuild-projection"
  | "continuation-readiness"
  | "replay-safe-loop-state"
  | "branch-gap"
  | "compaction-gap"
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
  "tool-result-messages",
  "tool-outcome",
  "after-tool-annotation",
  "save-point",
  "next-turn-preparation",
  "steering-queue",
  "follow-up-queue",
  "next-turn-delivery-policy",
  "verification-intent",
  "verification-result",
  "evidence-proof-input",
  "result-terminal-projection",
  "loop-finalization",
  "product-loop-closeout",
  "product-completion-packet",
  "repair-handoff",
  "repair-proposal",
  "repair-authority",
  "repair-apply-request",
  "repair-apply",
  "post-repair-verification",
  "session-active-path",
  "context-rebuild-input",
  "context-rebuild-projection",
  "continuation-readiness",
  "replay-safe-loop-state",
  "branch-gap",
  "compaction-gap",
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
    entry("tool-result-messages", "turn", "next_turn", "connected", "ToolResultMessageBatch", [
      "next-turn-success",
      "tool-success",
    ]),
    entry("tool-outcome", "tools", "tools", "connected", "ToolOutcomeBundleProjection", [
      "tool-success",
      "task-success",
      "next-turn-success",
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
    entry("steering-queue", "turn", "next_turn", "connected", "SteeringQueueProjection", [
      "next-turn-success",
      "steering-delivery-success",
    ]),
    entry("follow-up-queue", "turn", "next_turn", "connected", "FollowUpQueueProjection", [
      "next-turn-success",
      "follow-up-delivery-success",
    ]),
    entry("next-turn-delivery-policy", "turn", "next_turn", "connected", "NextTurnDeliveryPolicyProjection", [
      "next-turn-success",
      "provider-called",
    ]),
    entry("verification-intent", "verification", "verification", "connected", "VerificationLoopIntent", [
      "verification-success",
      "task-success",
    ]),
    entry("verification-result", "verification", "verification", "connected", "VerificationResultObservation", [
      "verification-success",
      "command-success",
      "task-success",
    ]),
    entry("evidence-proof-input", "evidence", "result", "connected", "RepairVerdictProofInput", [
      "evidence-input-is-not-terminal-result",
      "terminal-success",
    ]),
    entry("result-terminal-projection", "result", "result", "connected", "RepairVerdictTerminalProjection", [
      "rendered-output-is-not-success",
    ]),
    entry("loop-finalization", "runtime/loop", "control", "connected", "LoopFinalizationDecision", [
      "loop-decision-is-not-terminal-truth",
      "await-user-is-not-success",
      "continue-next-turn-is-not-success",
    ]),
    entry("product-loop-closeout", "runtime/loop", "control", "connected", "ProductLoopCloseoutProjection", [
      "product-closeout-is-not-terminal-truth",
      "session-carry-forward-is-not-terminal-truth",
      "rendered-output-is-not-terminal-truth",
    ]),
    entry("product-completion-packet", "runtime/loop", "product", "connected", "ProductCompletionPacket", [
      "product-completion-packet-is-not-terminal-truth",
      "product-consumer-is-not-terminal-truth",
      "event-emission-is-not-terminal-truth",
    ]),
    entry("repair-handoff", "repair", "repair", "connected", "RepairRequiredHandoff", [
      "repair-success",
    ]),
    entry("repair-proposal", "repair", "repair", "connected", "RepairProposalObservation", [
      "repair-success",
    ]),
    entry("repair-authority", "repair", "repair", "connected", "RepairAuthorityObservation", [
      "repair-success",
    ]),
    entry("repair-apply-request", "repair", "repair", "connected", "RepairApplyRequestObservation", [
      "repair-success",
    ]),
    entry("repair-apply", "repair", "repair", "connected", "RepairApplyObservation", [
      "repair-success",
    ]),
    entry("post-repair-verification", "verification", "verification", "connected", "PostRepairVerificationRequirement/Request/ResultObservation", [
      "verification-success",
      "repair-success",
    ]),
    entry("session-active-path", "session", "session", "partial", "SessionTreeProjection.activePathProjection", [
      "session-storage-backed-branching",
    ]),
    entry("context-rebuild-input", "context", "context", "connected", "LoopContextRebuildInput", [
      "context-completeness",
      "continuation-success",
    ]),
    entry("context-rebuild-projection", "context", "context", "connected", "SessionContextRebuildProjection", [
      "context-rebuild-success",
    ]),
    entry("continuation-readiness", "session", "continuation", "connected", "ContinuationReadinessProjection", [
      "continuation-success",
      "provider-success",
    ]),
    entry("replay-safe-loop-state", "session", "continuation", "connected", "ReplaySafeLoopStateSummary", [
      "terminal-success",
      "context-completeness",
    ]),
    entry("branch-gap", "session", "session", "unsupported", "branch unsupported/projection-only facts", [
      "storage-backed-branching",
      "branch-summary-truth",
    ]),
    entry("compaction-gap", "session", "session", "unsupported", "compaction unsupported/projection-only facts", [
      "storage-backed-compaction",
      "compaction-summary-truth",
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
