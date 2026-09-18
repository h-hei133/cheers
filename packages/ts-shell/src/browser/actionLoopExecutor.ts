import { createBrowserAccessibilitySnapshot } from "./accessibilitySnapshot.js";
import { createBrowserActionTarget } from "./actionTarget.js";
import {
  decideBrowserActionLoopPolicy,
  type BrowserActionLoopPolicyDecision,
} from "./actionLoopPolicy.js";
import { createBrowserDomSnapshot } from "./domSnapshot.js";
import type { BrowserExecutionRequest } from "./executionContract.js";
import { createBrowserObservation } from "./observationModel.js";
import { createBrowserObservationProvenance } from "./observationProvenance.js";
import { createBrowserRuntimeReceipt, type BrowserRuntimeReceipt } from "./runtime/core/receipt.js";
import { createBrowserRuntimeSession } from "./runtime/core/session.js";
import {
  decideBrowserRuntimeAvailability,
  type BrowserRuntimeAvailability,
} from "./runtime/core/availability.js";
import {
  validateBrowserRuntimeManifest,
  type BrowserRuntimeManifest,
  type BrowserRuntimeManifestLoadResult,
} from "./runtime/core/manifest.js";
import type {
  BrowserRuntimeExecutor,
  BrowserRuntimeExecutorResult,
} from "./runtime/core/executor.js";
import { createBrowserSelectorRepairSeed } from "./selectorRepairSeed.js";
import type { BrowserObservation } from "./observationModel.js";
import type { BrowserActionTarget } from "./actionTarget.js";
import type { BrowserSelectorRepairSeed } from "./selectorRepairSeed.js";

export interface BrowserRuntimeActionLoopResult {
  readonly status: "executed" | "blocked" | "unavailable";
  readonly availability: BrowserRuntimeAvailability;
  readonly policy: BrowserActionLoopPolicyDecision;
  readonly receipt: BrowserRuntimeReceipt;
  readonly observation?: BrowserObservation;
  readonly actionTarget?: BrowserActionTarget;
  readonly repairSeed?: BrowserSelectorRepairSeed;
  readonly executorResult?: BrowserRuntimeExecutorResult;
  readonly evidence: readonly string[];
}

export async function runBrowserActionLoopExecutor(input: {
  readonly request: BrowserExecutionRequest;
  readonly manifestLoad?: BrowserRuntimeManifestLoadResult;
  readonly manifest?: BrowserRuntimeManifest;
  readonly executor?: BrowserRuntimeExecutor;
  readonly now?: () => string;
}): Promise<BrowserRuntimeActionLoopResult> {
  const manifestLoad = input.manifestLoad ?? validateBrowserRuntimeManifest(input.manifest);
  const availability = decideBrowserRuntimeAvailability({
    manifestLoad,
    executorAvailable: !!input.executor,
  });
  if (manifestLoad.status !== "valid" || !input.executor) {
    const policy = decideBrowserActionLoopPolicy({ request: input.request });
    const receipt = createBrowserRuntimeReceipt({
      request: input.request,
      policy,
    });
    return {
      status: "unavailable",
      availability,
      policy,
      receipt,
      evidence: [
        ...availability.evidence,
        ...policy.evidence,
        "browser-action-loop-executor:unavailable",
      ],
    };
  }
  const manifest = manifestLoad.manifest;
  const session = createBrowserRuntimeSession({
    manifest,
    currentUrl: input.request.action.url ??
      (input.request.actionKind === "navigate" ? input.request.action.target : manifest.allowedOrigins[0]),
    now: input.now,
  });
  const earlyPolicy = decideBrowserActionLoopPolicy({
    request: input.request,
    manifest,
    session,
  });
  if (!earlyPolicy.allowed && input.request.actionKind !== "click" && input.request.actionKind !== "type") {
    const receipt = createBrowserRuntimeReceipt({
      request: input.request,
      manifest,
      policy: earlyPolicy,
    });
    return blocked({
      availability,
      policy: earlyPolicy,
      receipt,
      evidence: manifestLoad.evidence,
    });
  }
  const snapshotRequest = input.request.actionKind === "click" || input.request.actionKind === "type"
    ? ({
        ...input.request,
        actionKind: "observe",
        action: { ...input.request.action, actionKind: "observe" },
      } as BrowserExecutionRequest)
    : input.request;
  const firstResult = await input.executor.execute({ request: snapshotRequest, manifest });
  const observation = createObservation({
    request: input.request,
    manifest,
    executorResult: firstResult,
    now: input.now,
  });
  const target = input.request.actionKind === "click" || input.request.actionKind === "type"
    ? createBrowserActionTarget({
        request: input.request,
        accessibilitySnapshot: observation.accessibilitySnapshot,
        provenanceSnapshotId: observation.accessibilitySnapshot?.snapshotId ?? observation.observationId,
      })
    : undefined;
  const policy = decideBrowserActionLoopPolicy({
    request: input.request,
    manifest,
    session,
    target,
  });
  const repairSeed = target ? createBrowserSelectorRepairSeed({
    target,
    accessibilitySnapshot: observation.accessibilitySnapshot,
  }) : undefined;
  if (!policy.allowed) {
    const receipt = createBrowserRuntimeReceipt({
      request: input.request,
      manifest,
      policy,
      executorResult: firstResult,
      observation,
      actionTarget: target,
      repairSeed,
    });
    return blocked({
      availability,
      policy,
      receipt,
      observation,
      actionTarget: target,
      repairSeed,
      executorResult: firstResult,
      evidence: manifestLoad.evidence,
    });
  }
  const actionResult = input.request.actionKind === "click" || input.request.actionKind === "type"
    ? await input.executor.execute({ request: input.request, manifest })
    : firstResult;
  const finalObservation = actionResult === firstResult
    ? observation
    : createObservation({
        request: input.request,
        manifest,
        executorResult: actionResult,
        now: input.now,
      });
  const receipt = createBrowserRuntimeReceipt({
    request: input.request,
    manifest,
    policy,
    executorResult: actionResult,
    observation: finalObservation,
    actionTarget: target,
    repairSeed,
  });
  return {
    status: "executed",
    availability,
    policy,
    receipt,
    observation: finalObservation,
    actionTarget: target,
    repairSeed,
    executorResult: actionResult,
    evidence: [
      ...availability.evidence,
      ...policy.evidence,
      ...firstResult.evidence,
      ...actionResult.evidence,
      ...(repairSeed?.evidence ?? []),
      "browser-action-loop-executor:executed",
      "browser-action-loop-executor:no-auto-multistep",
      "browser-action-loop-executor:no-provider-or-model-call",
    ],
  };
}

function createObservation(input: {
  readonly request: BrowserExecutionRequest;
  readonly manifest: BrowserRuntimeManifest;
  readonly executorResult: BrowserRuntimeExecutorResult;
  readonly now?: () => string;
}): BrowserObservation {
  const domSnapshot = createBrowserDomSnapshot({
    snapshotId: `dom:${input.request.requestId}`,
    url: input.executorResult.url,
    rawHtml: input.executorResult.html,
    title: input.executorResult.title,
    outputBudgetChars: input.manifest.outputBudgetChars,
  });
  const accessibilitySnapshot = createBrowserAccessibilitySnapshot({
    snapshotId: `accessibility:${input.request.requestId}`,
    nodes: input.executorResult.accessibilityNodes,
    domSnapshot,
  });
  const provenance = createBrowserObservationProvenance({
    observationId: `observation:${input.request.requestId}`,
    runtimeId: input.manifest.manifestId,
    urlSummary: input.executorResult.url,
    originSummary: domSnapshot.originSummary,
    actionKind: input.request.actionKind,
    domSnapshotId: domSnapshot.snapshotId,
    accessibilitySnapshotId: accessibilitySnapshot.snapshotId,
    timestamp: input.now?.(),
  });
  return createBrowserObservation({
    observationId: provenance.observationId,
    runtimeStatus: input.executorResult.status,
    urlSummary: input.executorResult.url,
    originSummary: domSnapshot.originSummary,
    domSnapshot,
    accessibilitySnapshot,
    evidenceSource: input.executorResult.runtimeMode,
    provenance,
    renderedText: input.executorResult.renderedText,
    warnings: input.executorResult.warnings,
    redactions: input.executorResult.redactions,
  });
}

function blocked(input: {
  readonly availability: BrowserRuntimeAvailability;
  readonly policy: BrowserActionLoopPolicyDecision;
  readonly receipt: BrowserRuntimeReceipt;
  readonly observation?: BrowserObservation;
  readonly actionTarget?: BrowserActionTarget;
  readonly repairSeed?: BrowserSelectorRepairSeed;
  readonly executorResult?: BrowserRuntimeExecutorResult;
  readonly evidence: readonly string[];
}): BrowserRuntimeActionLoopResult {
  return {
    status: "blocked",
    availability: input.availability,
    policy: input.policy,
    receipt: input.receipt,
    observation: input.observation,
    actionTarget: input.actionTarget,
    repairSeed: input.repairSeed,
    executorResult: input.executorResult,
    evidence: [
      ...input.availability.evidence,
      ...input.policy.evidence,
      ...input.evidence,
      ...(input.repairSeed?.evidence ?? []),
      "browser-action-loop-executor:blocked",
    ],
  };
}
