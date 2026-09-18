import type { BrowserReplayFailureClassification } from "./replayFailureClassifier.js";

export type BrowserReplayRepairReadinessStatus =
  | "repair-ready-preview"
  | "repair-needs-runner"
  | "repair-needs-metadata"
  | "repair-needs-confirmation"
  | "repair-needs-cache-repair"
  | "repair-needs-allowlist"
  | "repair-blocked-unsafe"
  | "repair-blocked-external-network"
  | "repair-not-applicable";

export interface BrowserReplayRepairReadiness {
  readonly status: BrowserReplayRepairReadinessStatus;
  readonly repairable: boolean;
  readonly reason: string;
  readonly requiredGate: string;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}

export function decideBrowserReplayRepairReadiness(input: {
  readonly failure: BrowserReplayFailureClassification;
}): BrowserReplayRepairReadiness {
  const failure = input.failure;
  switch (failure.kind) {
    case "none":
      return readiness("repair-not-applicable", false, "Replay is already allowed.", "none", "No repair preview is needed.");
    case "missing-runner-binding":
      return readiness("repair-needs-runner", true, failure.reason, "explicit local/test runner", failure.nextAction);
    case "missing-skill-metadata":
      return readiness("repair-needs-metadata", true, failure.reason, "explicit skill metadata", failure.nextAction);
    case "sandbox-or-confirmation-missing":
      return readiness("repair-needs-confirmation", true, failure.reason, "sandbox/allowlist/confirmation", failure.nextAction);
    case "corrupted-cache-record":
      return readiness("repair-needs-cache-repair", true, failure.reason, "explicit cache repair", failure.nextAction);
    case "external-url-blocked":
      return readiness("repair-blocked-external-network", false, failure.reason, "external network blocked", failure.nextAction);
    case "unsafe-evidence":
      return readiness("repair-blocked-unsafe", false, failure.reason, "safe evidence required", failure.nextAction);
    case "timeout":
    case "malformed-response":
    case "missing-cache-entry":
    case "stale-fixture":
      return readiness("repair-ready-preview", true, failure.reason, "explicit local/test retry", failure.nextAction);
    case "unsupported-action":
    case "invalidated-or-deleted-receipt":
      return readiness("repair-not-applicable", false, failure.reason, "new local/test execution", failure.nextAction);
    case "allowlist-blocked":
      return readiness("repair-needs-allowlist", true, failure.reason, "current allowlist", failure.nextAction);
  }
}

function readiness(
  status: BrowserReplayRepairReadinessStatus,
  repairable: boolean,
  reason: string,
  requiredGate: string,
  nextAction: string,
): BrowserReplayRepairReadiness {
  return {
    status,
    repairable,
    reason,
    requiredGate,
    nextAction,
    evidence: [
      `browser-replay-repair-readiness:${status}`,
      "browser-replay-repair-readiness:preview-only",
      "browser-replay-repair-readiness:no-automatic-repair",
    ],
  };
}
