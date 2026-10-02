import type {
  StartupWarmContextCache,
} from "./startupWarmContextCache.js";
import type {
  StartupWarmContextCacheHealth,
  StartupWarmContextCacheReadResult,
  StartupWarmContextCacheWriteResult,
} from "./startupWarmContextHealth.js";

export interface StartupWarmContextSurfaceInput {
  readonly outcome: "status" | "rebuilt" | "blocked";
  readonly health: StartupWarmContextCacheHealth;
  readonly read?: StartupWarmContextCacheReadResult;
  readonly write?: StartupWarmContextCacheWriteResult;
  readonly cache?: StartupWarmContextCache;
  readonly blocker?: string;
}

export function renderStartupWarmContextSurface(
  input: StartupWarmContextSurfaceInput,
): string {
  const cache = input.read ? input.read.cache : input.cache ?? input.write?.cache;
  return [
    "Startup warm context",
    "Result",
    `- Outcome: ${input.outcome}`,
    ...(input.blocker ? [`- BlockerKind: startup-warm-context-blocked`, `- Reason: ${input.blocker}`] : []),
    `- Cache mode: ${input.health.mode}`,
    `- Cache found: ${input.health.found ? "yes" : "no"}`,
    `- Cache writable: ${input.health.writable ? "yes" : "no"}`,
    `- Staleness: ${input.health.staleness}`,
    `- Project: ${cache?.projectRef.projectRootHash ?? "unknown"}`,
    "- Injected into model: no",
    "- Startup auto-load: no",
    "- Provider/model call: none",
    "- Vector store: none",
    "- Discardable: yes",
    "",
    "Summaries",
    `- Edit: ${cache?.editCapabilitySummary.summary ?? "No cache available."}`,
    `- Compact: ${cache?.compactSummary.summary ?? "No cache available."}`,
    `- Memory: ${cache?.memoryWakeupSummary.summary ?? "No cache available."}`,
    `- Validation: ${cache?.validationSummary.summary ?? "No cache available."}`,
    `- Route phase: ${cache?.routePhaseSummary.summary ?? "No cache available."}`,
    "",
    "Warnings",
    ...warningLines(cache?.warnings ?? input.health.evidence),
    "",
    "Redactions",
    ...warningLines(cache?.redactions ?? ["none"]),
    "",
    "Next action",
    nextAction(input),
  ].join("\n");
}

function warningLines(values: readonly string[]): readonly string[] {
  if (values.length === 0) {
    return ["- none"];
  }
  return values.map((value) => `- ${value}`);
}

function nextAction(input: StartupWarmContextSurfaceInput): string {
  if (input.blocker) {
    if (input.health.staleness === "invalid") return "- Rebuild the invalid cache with /warmup rebuild after checking the explicit cache path.";
    return "- Provide an explicit project/cache root harness, then rerun /warmup status or /warmup rebuild.";
  }
  if (input.outcome === "rebuilt") {
    return "- Use /warmup status to inspect the discardable cache. It was not injected into model context.";
  }
  if (!input.health.found) {
    return "- Run /warmup rebuild only from an explicit local cache harness.";
  }
  if (input.health.staleness === "stale") {
    return "- Rebuild the warm cache when the safe source summaries change.";
  }
  if (input.health.staleness === "unknown") return "- Freshness has not been checked against current sources. Rebuild to refresh the local summaries.";
  return "- Continue normally. Warm cache remains a local status surface only.";
}
