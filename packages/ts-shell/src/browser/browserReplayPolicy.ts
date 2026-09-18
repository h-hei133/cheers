import type { BrowserActionCacheEntry } from "./browserActionCacheEntry.js";

export type BrowserReplayPolicyStatus =
  | "replay-allowed"
  | "replay-blocked"
  | "replay-needs-runner"
  | "replay-needs-confirmation"
  | "replay-unsafe"
  | "replay-not-found"
  | "replay-not-applicable"
  | "future-runtime-required";

export interface BrowserReplayPolicyDecision {
  readonly status: BrowserReplayPolicyStatus;
  readonly allowed: boolean;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly nextAction: string;
  readonly evidence: readonly string[];
}

export interface DecideBrowserReplayPolicyInput {
  readonly entry?: BrowserActionCacheEntry;
  readonly runnerAvailable?: boolean;
  readonly skillRunnerBindingAvailable?: boolean;
  readonly sandboxConfirmed?: boolean;
  readonly allowlistConfirmed?: boolean;
  readonly confirmationRecorded?: boolean;
}

export function decideBrowserReplayPolicy(
  input: DecideBrowserReplayPolicyInput,
): BrowserReplayPolicyDecision {
  const entry = input.entry;
  if (!entry) {
    return decision("replay-not-found", ["cache-entry-missing"], "Run /browser replay status or execute a replay-ready local/test browser action first.");
  }
  const blockers: string[] = [];
  const warnings: string[] = [];
  const localTarget = entry.safeUrl.startsWith("local-fixture://") || entry.fixtureId.startsWith("fixture:");
  const safeAction = ["observe", "extract", "navigate"].includes(entry.actionKind);
  const safeMode = ["test-local", "external-local", "skill-managed", "local-fixture", "playwright-local"].includes(entry.executionMode);
  const executedSource = entry.sourceReceiptStatus === "executed";
  const replayReady = entry.replayReadinessSnapshot.status === "replay-ready";
  const decisionsRecorded = Boolean(input.sandboxConfirmed && input.allowlistConfirmed && input.confirmationRecorded);
  const runnerAvailable = Boolean(input.runnerAvailable);
  const skillNeedsBinding = entry.executionMode === "skill-managed" || entry.runnerSource === "skill-managed";

  if (!executedSource) {
    blockers.push(`source-receipt-status:${entry.sourceReceiptStatus}`);
  }
  if (!replayReady) {
    blockers.push(`replay-readiness:${entry.replayReadinessSnapshot.status}`);
  }
  if (!localTarget) {
    blockers.push("external-url-blocked");
  }
  if (!safeAction) {
    blockers.push(`unsupported-action:${entry.actionKind}`);
  }
  if (!safeMode) {
    blockers.push(`unsupported-mode:${entry.executionMode}`);
  }
  if (entry.replayReadinessSnapshot.status === "replay-unsafe") {
    blockers.push("unsafe-replay-evidence");
  }
  if (["timed-out", "invalid-response", "unsafe-output", "failed", "blocked", "unavailable"].includes(entry.sourceReceiptStatus)) {
    blockers.push("original-receipt-not-replayable");
  }
  if (!runnerAvailable) {
    blockers.push("missing-current-runner");
  }
  if (skillNeedsBinding && !input.skillRunnerBindingAvailable) {
    blockers.push("missing-current-skill-binding");
  }
  if (!decisionsRecorded) {
    blockers.push("missing-current-sandbox-allowlist-confirmation");
  }
  if (entry.warnings.some((warning) => /raw|secret|unsafe|screenshot|ocr/i.test(warning))) {
    warnings.push("browser-replay-policy:source-warning-reviewed");
  }

  if (blockers.length === 0) {
    return {
      status: "replay-allowed",
      allowed: true,
      blockers: [],
      warnings,
      nextAction: "Replay may execute only because this request is explicit and local/test scoped.",
      evidence: baseEvidence("replay-allowed"),
    };
  }
  if (blockers.includes("unsafe-replay-evidence")) {
    return decision("replay-unsafe", blockers, "Unsafe browser evidence cannot be replayed.", warnings);
  }
  if (blockers.includes("missing-current-runner") || blockers.includes("missing-current-skill-binding")) {
    return decision("replay-needs-runner", blockers, "Provide the same explicit local/test runner or skill binding before replay.", warnings);
  }
  if (blockers.includes("missing-current-sandbox-allowlist-confirmation")) {
    return decision("replay-needs-confirmation", blockers, "Replay requires current sandbox, allowlist, and confirmation decisions.", warnings);
  }
  if (!safeMode) {
    return decision("future-runtime-required", blockers, "This receipt requires a future replay runtime.", warnings);
  }
  if (!safeAction || !localTarget) {
    return decision("replay-not-applicable", blockers, "Replay is local/test scoped and read-only only.", warnings);
  }
  return decision("replay-blocked", blockers, "Replay blocked by receipt status or replay readiness.", warnings);
}

function decision(
  status: BrowserReplayPolicyStatus,
  blockers: readonly string[],
  nextAction: string,
  warnings: readonly string[] = [],
): BrowserReplayPolicyDecision {
  return {
    status,
    allowed: false,
    blockers,
    warnings,
    nextAction,
    evidence: baseEvidence(status),
  };
}

function baseEvidence(status: BrowserReplayPolicyStatus): readonly string[] {
  return [
    `browser-replay-policy:${status}`,
    "browser-replay-policy:explicit-only",
    "browser-replay-policy:local-test-scoped",
    "browser-replay-policy:no-provider-or-model-call",
    "browser-replay-policy:no-persistence",
  ];
}
