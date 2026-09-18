import type { BrowserActionCacheEntry } from "./browserActionCacheEntry.js";
import { createBrowserActionContract } from "./browserActionContract.js";
import {
  createBrowserExecutionRequest,
  type BrowserExecutionRequest,
} from "./browserExecutionContract.js";
import {
  decideBrowserReplayPolicy,
  type BrowserReplayPolicyDecision,
} from "./browserReplayPolicy.js";
import type { BrowserPersistentReceiptCacheRecordStatus } from "./browserPersistentReceiptCache.js";
import type { BrowserReceiptCacheIntegrityStatus } from "../../browser/receipt/browserReceiptCacheIntegrity.js";

export interface BrowserReplayPlan {
  readonly replayPlanId: string;
  readonly sourceReceiptId: string;
  readonly cacheEntryId: string;
  readonly actionKind: BrowserExecutionRequest["actionKind"];
  readonly runnerMode: string;
  readonly fixtureOrTarget: string;
  readonly revalidationSummary: string;
  readonly expectedEvidence: readonly string[];
  readonly policy: BrowserReplayPolicyDecision;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly nextAction: string;
  readonly willExecute: boolean;
  readonly cacheRecordStatus?: BrowserPersistentReceiptCacheRecordStatus;
  readonly cacheIntegrityStatus?: BrowserReceiptCacheIntegrityStatus;
  readonly skillMetadataAvailable?: boolean;
  readonly request?: BrowserExecutionRequest;
  readonly evidence: readonly string[];
}

export function planBrowserReplay(input: {
  readonly entry?: BrowserActionCacheEntry;
  readonly sourceCommand?: "/browser replay" | "test";
  readonly runnerAvailable?: boolean;
  readonly skillRunnerBindingAvailable?: boolean;
  readonly sandboxConfirmed?: boolean;
  readonly allowlistConfirmed?: boolean;
  readonly confirmationRecorded?: boolean;
  readonly cacheRecordStatus?: BrowserPersistentReceiptCacheRecordStatus;
  readonly cacheIntegrityStatus?: BrowserReceiptCacheIntegrityStatus;
  readonly skillMetadataAvailable?: boolean;
}): BrowserReplayPlan {
  const policy = decideBrowserReplayPolicy({
    entry: input.entry,
    runnerAvailable: input.runnerAvailable,
    skillRunnerBindingAvailable: input.skillRunnerBindingAvailable,
    sandboxConfirmed: input.sandboxConfirmed,
    allowlistConfirmed: input.allowlistConfirmed,
    confirmationRecorded: input.confirmationRecorded,
  });
  const entry = input.entry;
  const request = policy.allowed && entry ? requestFromEntry(entry) : undefined;
  return {
    replayPlanId: entry ? deterministicBrowserReplayPlanId(entry.entryId) : "browser-replay-plan:not-found",
    sourceReceiptId: entry?.sourceReceiptId ?? "none",
    cacheEntryId: entry?.entryId ?? "none",
    actionKind: entry?.actionKind ?? "observe",
    runnerMode: entry?.executionMode ?? "none",
    fixtureOrTarget: entry?.safeUrl ?? "none",
    revalidationSummary: policy.allowed
      ? "current runner, sandbox, allowlist, and confirmation revalidated"
      : `blocked:${policy.blockers.join(",") || policy.status}`,
    expectedEvidence: entry
      ? [
          `source-receipt=${entry.sourceReceiptId}`,
          `cache-entry=${entry.entryId}`,
          `action=${entry.actionKind}`,
          `target=${entry.fixtureId}`,
        ]
      : [],
    policy,
    blockers: policy.blockers,
    warnings: policy.warnings,
    nextAction: policy.nextAction,
    willExecute: policy.allowed,
    cacheRecordStatus: input.cacheRecordStatus,
    cacheIntegrityStatus: input.cacheIntegrityStatus,
    skillMetadataAvailable: input.skillMetadataAvailable,
    request,
    evidence: [
      ...policy.evidence,
      "browser-replay-planner:explicit-request",
      "browser-replay-planner:revalidated-before-execution",
      "browser-replay-planner:no-automatic-replay",
    ],
  };
}

export function deterministicBrowserReplayPlanId(entryId: string): string {
  return entryId.replace(/^browser-action-cache-entry:/, "browser-replay-plan:");
}

function requestFromEntry(entry: BrowserActionCacheEntry): BrowserExecutionRequest {
  const action = createBrowserActionContract({
    actionKind: entry.actionKind,
    url: entry.actionKind === "navigate" ? entry.safeUrl : undefined,
    target: entry.actionKind === "observe" ? entry.safeUrl : undefined,
    extractionGoal: entry.actionKind === "extract" ? `Replay extraction for ${entry.fixtureId}` : undefined,
    userIntentSummary: `Replay ${entry.actionKind} from ${entry.sourceReceiptId}.`,
    requiresNetwork: false,
    requiresAuth: false,
  });
  return createBrowserExecutionRequest({
    requestId: `browser-replay:${entry.sourceReceiptId.replace(/[^a-zA-Z0-9:_-]+/g, "-")}`,
    mode: entry.executionMode,
    action,
    approval: "read-only",
    source: "scenario-harness",
  });
}
