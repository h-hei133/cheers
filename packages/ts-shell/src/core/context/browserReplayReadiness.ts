import type { BrowserExecutionActionKind, BrowserExecutionMode } from "./browserExecutionContract.js";
import type { BrowserExecutorKind } from "./browserExecutor.js";
import type { BrowserEvidenceBundle } from "./browserEvidenceBundle.js";
import type { BrowserExecutionReceiptStatus } from "./browserExecutionReceipt.js";

export type BrowserReplayReadinessStatus =
  | "replay-ready"
  | "replay-blocked"
  | "replay-needs-confirmation"
  | "replay-needs-skill-runner"
  | "replay-needs-runner"
  | "replay-unsafe"
  | "replay-not-applicable";

export interface BrowserReplayReadiness {
  readonly status: BrowserReplayReadinessStatus;
  readonly reasons: readonly string[];
  readonly nextAction: string;
  readonly actionCacheMetadata: BrowserActionCacheMetadata;
  readonly replayExecution: "not-started";
  readonly persistence: "none";
}

export interface BrowserActionCacheMetadata {
  readonly cacheConcept: "action-layer-cache";
  readonly cacheKey: string;
  readonly cacheStatus: "not-persisted" | "not-applicable";
  readonly variableKeys: readonly string[];
  readonly deterministicActionEvidence: readonly string[];
}

export function classifyBrowserReplayReadiness(input: {
  readonly requestId: string;
  readonly actionKind: BrowserExecutionActionKind;
  readonly mode: BrowserExecutionMode;
  readonly executorKind: BrowserExecutorKind;
  readonly receiptStatus: BrowserExecutionReceiptStatus;
  readonly executed: boolean;
  readonly evidenceBundle: BrowserEvidenceBundle;
  readonly sandboxDecision: string;
  readonly allowlistDecision: string;
  readonly confirmationDecision: string;
  readonly runnerId?: string;
  readonly manifestId?: string;
  readonly skillRunnerRequired?: boolean;
}): BrowserReplayReadiness {
  const reasons: string[] = [];
  const localOrTestScoped = isLocalOrTestScoped(input.mode, input.evidenceBundle.safeUrl);
  const replaySafeAction = ["observe", "extract", "navigate"].includes(input.actionKind);
  const stableTarget = input.evidenceBundle.safeOriginOrFixtureId !== "fixture:unknown" ||
    input.evidenceBundle.safeUrl.startsWith("local-fixture://");
  const decisionsRecorded = [input.sandboxDecision, input.allowlistDecision, input.confirmationDecision]
    .every((value) => value && value !== "unknown");
  const runnerRecorded = !!input.runnerId || input.executorKind !== "external-runner";
  const statusAllowsReplay = input.executed && input.receiptStatus === "executed";
  const safetyBlockers = input.evidenceBundle.safety.blockers;
  const externalOnlyBlockers = safetyBlockers.length > 0 &&
    safetyBlockers.every((blocker) => blocker === "unsafe-external-url" || blocker === "external-url-evidence");
  const unsafe = input.evidenceBundle.safety.safetyStatus === "unsafe" ||
    (input.evidenceBundle.safety.safetyStatus === "blocked" && !externalOnlyBlockers);

  if (unsafe) {
    reasons.push("unsafe-evidence");
  }
  if (!statusAllowsReplay) {
    reasons.push(`receipt-status:${input.receiptStatus}`);
  }
  if (!localOrTestScoped) {
    reasons.push("not-local-or-test-scoped");
  }
  if (!replaySafeAction) {
    reasons.push(`unsupported-action:${input.actionKind}`);
  }
  if (!stableTarget) {
    reasons.push("missing-stable-local-target");
  }
  if (!decisionsRecorded) {
    reasons.push("missing-sandbox-allowlist-confirmation-decision");
  }
  if (!runnerRecorded) {
    reasons.push("missing-explicit-runner");
  }
  if (input.skillRunnerRequired) {
    reasons.push("missing-skill-runner-execution-bridge");
  }
  if (input.evidenceBundle.safeUrl === "external-url:redacted") {
    reasons.push("external-url-blocked");
  }
  if (["auth", "payment", "destructive", "upload", "download", "screenshot"].includes(input.actionKind)) {
    reasons.push("sensitive-or-unsupported-browser-action");
  }

  const status = readinessStatus({
    reasons,
    unsafe,
    statusAllowsReplay,
    runnerRecorded,
    skillRunnerRequired: input.skillRunnerRequired ?? false,
    decisionsRecorded,
    replaySafeAction,
    localOrTestScoped,
  });
  return {
    status,
    reasons: reasons.length > 0 ? reasons : ["local-test-safe-read-only-action"],
    nextAction: nextActionFor(status),
    actionCacheMetadata: {
      cacheConcept: "action-layer-cache",
      cacheKey: deterministicBrowserActionCacheKey(input.requestId, input.actionKind, input.evidenceBundle.safeOriginOrFixtureId),
      cacheStatus: status === "replay-ready" ? "not-persisted" : "not-applicable",
      variableKeys: [],
      deterministicActionEvidence: [
        `action=${input.actionKind}`,
        `target=${input.evidenceBundle.safeOriginOrFixtureId}`,
        `mode=${input.mode}`,
        "replay-execution:not-started",
      ],
    },
    replayExecution: "not-started",
    persistence: "none",
  };
}

export function deterministicBrowserActionCacheKey(
  requestId: string,
  actionKind: string,
  target: string,
): string {
  const basis = `${requestId}:${actionKind}:${target}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `browser-action-cache:${basis || "not-applicable"}`;
}

function readinessStatus(input: {
  readonly reasons: readonly string[];
  readonly unsafe: boolean;
  readonly statusAllowsReplay: boolean;
  readonly runnerRecorded: boolean;
  readonly skillRunnerRequired: boolean;
  readonly decisionsRecorded: boolean;
  readonly replaySafeAction: boolean;
  readonly localOrTestScoped: boolean;
}): BrowserReplayReadinessStatus {
  if (input.unsafe) {
    return "replay-unsafe";
  }
  if (!input.statusAllowsReplay) {
    if (input.skillRunnerRequired) {
      return "replay-needs-skill-runner";
    }
    return "replay-blocked";
  }
  if (input.skillRunnerRequired) {
    return "replay-needs-skill-runner";
  }
  if (!input.runnerRecorded) {
    return "replay-needs-runner";
  }
  if (!input.decisionsRecorded) {
    return "replay-needs-confirmation";
  }
  if (!input.replaySafeAction || !input.localOrTestScoped) {
    return "replay-blocked";
  }
  return "replay-ready";
}

function isLocalOrTestScoped(mode: BrowserExecutionMode, safeUrl: string): boolean {
  return ["fake-test", "local-fixture", "playwright-local", "test-local", "external-local", "skill-managed"].includes(mode) &&
    !safeUrl.startsWith("external-url:");
}

function nextActionFor(status: BrowserReplayReadinessStatus): string {
  if (status === "replay-ready") {
    return "Receipt is replay-ready for a future explicit replay route; no replay is executed here.";
  }
  if (status === "replay-needs-runner") {
    return "Record an explicit local/test runner before considering replay.";
  }
  if (status === "replay-needs-skill-runner") {
    return "Implement an explicit skill-managed runner bridge before considering replay.";
  }
  if (status === "replay-needs-confirmation") {
    return "Record sandbox, allowlist, and confirmation decisions before considering replay.";
  }
  if (status === "replay-unsafe") {
    return "Keep replay blocked until unsafe evidence is removed or redacted.";
  }
  if (status === "replay-not-applicable") {
    return "Replay does not apply to this browser execution result.";
  }
  return "Replay remains blocked; inspect receipt status and safety warnings.";
}
