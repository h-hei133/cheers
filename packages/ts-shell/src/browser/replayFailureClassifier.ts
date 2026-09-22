import type { BrowserReplayPlan } from "./replayPlanner.js";

export type BrowserReplayFailureKind =
  | "missing-cache-entry"
  | "invalidated-or-deleted-receipt"
  | "missing-runner-binding"
  | "missing-skill-metadata"
  | "sandbox-or-confirmation-missing"
  | "allowlist-blocked"
  | "unsafe-evidence"
  | "timeout"
  | "malformed-response"
  | "external-url-blocked"
  | "unsupported-action"
  | "stale-fixture"
  | "corrupted-cache-record"
  | "none";

export type BrowserReplayFailureSeverity = "info" | "repairable" | "blocked";

export interface BrowserReplayFailureClassification {
  readonly kind: BrowserReplayFailureKind;
  readonly severity: BrowserReplayFailureSeverity;
  readonly reason: string;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}

export function classifyBrowserReplayFailure(input: {
  readonly plan: BrowserReplayPlan;
}): BrowserReplayFailureClassification {
  const plan = input.plan;
  const blockers = plan.blockers;
  if (plan.willExecute) {
    return classification("none", "info", "Replay is allowed.", "No repair preview is needed.");
  }
  if (plan.cacheIntegrityStatus === "corrupted" || blockers.includes("cache-record-corrupted")) {
    return classification("corrupted-cache-record", "repairable", "Persistent cache has corrupt records.", "Run /browser replay cache repair, then retry explicitly.");
  }
  if (plan.cacheIntegrityStatus === "unsafe") {
    return classification("unsafe-evidence", "blocked", "Persistent cache contains unsafe records.", "Delete or repair the explicit cache before relying on replay.");
  }
  if (plan.cacheRecordStatus === "deleted" || plan.cacheRecordStatus === "invalidated") {
    return classification("invalidated-or-deleted-receipt", "blocked", "The cached receipt was invalidated or deleted.", "Run a new explicit local/test browser execution.");
  }
  if (blockers.includes("cache-entry-missing")) {
    return classification("missing-cache-entry", "repairable", "No replay cache entry was found.", "Run /browser replay status or execute a replay-ready local/test browser action.");
  }
  if (blockers.includes("external-url-blocked")) {
    return classification("external-url-blocked", "blocked", "Replay target is outside local/test scope.", "Keep replay local/test scoped; external network remains blocked.");
  }
  if (blockers.includes("unsafe-replay-evidence")) {
    return classification("unsafe-evidence", "blocked", "Replay evidence is unsafe.", "Discard the unsafe record and run a new sanitized local/test action.");
  }
  if (blockers.includes("missing-current-skill-binding") && plan.skillMetadataAvailable === false) {
    return classification("missing-skill-metadata", "repairable", "Skill-managed replay is missing metadata.", "Provide explicit local/test skill metadata before replay.");
  }
  if (blockers.includes("missing-current-runner") || blockers.includes("missing-current-skill-binding")) {
    return classification("missing-runner-binding", "repairable", "Replay needs the current local/test runner or binding.", "Provide the same explicit local/test runner or skill binding.");
  }
  if (blockers.includes("missing-current-sandbox-allowlist-confirmation")) {
    return classification("sandbox-or-confirmation-missing", "repairable", "Replay needs current sandbox, allowlist, and confirmation gates.", "Confirm the current local/test replay gates before retrying.");
  }
  if (blockers.some((blocker) => blocker.includes("timed-out"))) {
    return classification("timeout", "repairable", "Original local/test action timed out.", "Preview a local/test retry with the same sanitized action and runner gates.");
  }
  if (blockers.some((blocker) => blocker.includes("invalid-response") || blocker.includes("malformed"))) {
    return classification("malformed-response", "repairable", "Original local/test runner response was malformed.", "Preview a local/test retry after fixing the runner response contract.");
  }
  if (blockers.some((blocker) => blocker.startsWith("unsupported-action:"))) {
    return classification("unsupported-action", "blocked", "Replay action is unsupported.", "Use observe, extract, or local navigate only.");
  }
  if (blockers.some((blocker) => blocker.includes("fixture"))) {
    return classification("stale-fixture", "repairable", "Replay fixture appears stale.", "Refresh the local/test fixture and retry explicitly.");
  }
  return classification("missing-cache-entry", "repairable", "Replay is blocked.", plan.nextAction);
}

function classification(
  kind: BrowserReplayFailureKind,
  severity: BrowserReplayFailureSeverity,
  reason: string,
  nextAction: string,
): BrowserReplayFailureClassification {
  return {
    kind,
    severity,
    reason,
    nextAction,
    evidence: [
      `browser-replay-failure-classifier:${kind}`,
      "browser-replay-failure-classifier:preview-only",
    ],
  };
}
