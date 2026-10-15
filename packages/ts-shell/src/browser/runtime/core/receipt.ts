import { sanitizeBrowserText } from "../../capabilityModel.js";
import type { BrowserExecutionRequest } from "../../executionContract.js";
import type { BrowserActionTarget } from "../../actionTarget.js";
import type { BrowserActionLoopPolicyDecision } from "../../actionLoopPolicy.js";
import type { BrowserObservation } from "../../observationModel.js";
import type { BrowserRuntimeManifest } from "./manifest.js";
import type { BrowserRuntimeExecutorResult } from "./executor.js";
import type { BrowserSelectorRepairSeed } from "../../selectorRepairSeed.js";

export interface BrowserRuntimeReceipt {
  readonly receiptId: string;
  readonly runtimeMode: BrowserRuntimeManifest["runtimeMode"] | "unavailable";
  readonly actionKind: BrowserExecutionRequest["actionKind"];
  readonly originScope: readonly string[];
  readonly domSnapshotId?: string;
  readonly accessibilitySnapshotId?: string;
  readonly provenanceId?: string;
  readonly actionTargetId?: string;
  readonly selectorRepairReadiness?: BrowserSelectorRepairSeed["readiness"];
  readonly status: "executed" | "blocked" | "failed" | "cancelled";
  readonly executed: boolean;
  readonly actionApplied: boolean | null;
  readonly processCleanupStatus: "closed" | "not-started" | "unknown";
  readonly runtimeCleanupStatus: "closed" | "not-started" | "unknown";
  readonly browserLaunched: boolean | null;
  readonly publicAutomation: boolean;
  readonly jsRenderedSupport: boolean;
  readonly policyStatus: BrowserActionLoopPolicyDecision["status"];
  readonly observationId?: string;
  readonly redactions: readonly string[];
  readonly warnings: readonly string[];
  readonly nextAction: string;
  readonly rawContent: "excluded";
  readonly providerCall: "none";
  readonly modelCall: "none";
}

export function createBrowserRuntimeReceipt(input: {
  readonly request: BrowserExecutionRequest;
  readonly manifest?: BrowserRuntimeManifest;
  readonly policy: BrowserActionLoopPolicyDecision;
  readonly executorResult?: BrowserRuntimeExecutorResult;
  readonly observation?: BrowserObservation;
  readonly actionTarget?: BrowserActionTarget;
  readonly repairSeed?: BrowserSelectorRepairSeed;
}): BrowserRuntimeReceipt {
  const outcome = input.executorResult?.status;
  const status = outcome === "cancelled" ? "cancelled" : outcome === "failed" ? "failed"
    : input.policy.allowed && (outcome === "observed" || outcome === "acted") ? "executed" : "blocked";
  const executed = status === "executed";
  return {
    receiptId: deterministicReceiptId(input.request.requestId, input.policy.status),
    runtimeMode: input.manifest?.runtimeMode ?? "unavailable",
    actionKind: input.request.actionKind,
    originScope: input.manifest?.allowedOrigins ?? [],
    domSnapshotId: input.observation?.domSnapshot?.snapshotId,
    accessibilitySnapshotId: input.observation?.accessibilitySnapshot?.snapshotId,
    provenanceId: input.observation?.provenance.provenanceId,
    actionTargetId: input.actionTarget?.targetId,
    selectorRepairReadiness: input.repairSeed?.readiness,
    status,
    executed,
    actionApplied: input.executorResult ? input.executorResult.actionApplied : false,
    processCleanupStatus: input.executorResult ? input.executorResult.processCleanupStatus ?? "unknown" : "not-started",
    runtimeCleanupStatus: input.executorResult ? input.executorResult.runtimeCleanupStatus ?? "unknown" : "not-started",
    browserLaunched: input.executorResult ? input.executorResult.browserLaunched : false,
    publicAutomation: input.executorResult?.publicAutomation ?? false,
    jsRenderedSupport: input.manifest?.jsRenderedSupport ?? false,
    policyStatus: input.policy.status,
    observationId: input.observation?.observationId,
    redactions: unique([
      ...(input.observation?.redactions ?? []),
      ...(input.executorResult?.redactions ?? []),
    ]),
    warnings: unique([
      ...input.policy.warnings,
      ...(input.observation?.warnings ?? []),
      ...(input.executorResult?.warnings ?? []),
      ...(input.repairSeed?.warnings ?? []),
    ]),
    nextAction: sanitizeBrowserText(executed ? "Review sanitized browser observation." : input.policy.allowed ? "Inspect the stopped runtime and its cleanup evidence before another action." : input.policy.nextAction, 220),
    rawContent: "excluded",
    providerCall: "none",
    modelCall: "none",
  };
}

function deterministicReceiptId(requestId: string, status: string): string {
  const normalized = sanitizeBrowserText(`${requestId}:${status}`, 140)
    .toLowerCase()
    .replace(/[^a-z0-9:._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `browser-runtime-receipt:${normalized || "receipt"}`;
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort();
}
