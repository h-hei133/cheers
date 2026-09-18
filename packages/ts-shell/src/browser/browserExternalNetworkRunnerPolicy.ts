import type { BrowserExecutionRequest } from "./browserExecutionContract.js";

export type BrowserExternalNetworkRunnerStatus =
  | "blocked-no-runner"
  | "blocked-runner-disabled"
  | "blocked-unsupported-action"
  | "blocked-sensitive-action"
  | "ready-for-future-runner";

export type BrowserExternalNetworkRunnerMode = "none" | "disabled" | "future-runner";

export interface BrowserExternalNetworkRunnerPolicyDecision {
  readonly status: BrowserExternalNetworkRunnerStatus;
  readonly runnerMode: BrowserExternalNetworkRunnerMode;
  readonly callable: false;
  readonly reason: string;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly nextAction: string;
  readonly evidence: readonly string[];
}

export function decideBrowserExternalNetworkRunnerPolicy(input: {
  readonly request: BrowserExecutionRequest;
  readonly runnerMode?: BrowserExternalNetworkRunnerMode;
  readonly gatesReady?: boolean;
}): BrowserExternalNetworkRunnerPolicyDecision {
  const runnerMode = input.runnerMode ?? "disabled";
  if (isSensitive(input.request.actionKind)) {
    return decision("blocked-sensitive-action", runnerMode, "Sensitive browser actions are blocked for external-network execution.", ["sensitive-browser-action"], "Keep auth, payment, destructive, upload, download, screenshot, and OCR blocked.");
  }
  if (!["navigate", "observe", "extract"].includes(input.request.actionKind)) {
    return decision("blocked-unsupported-action", runnerMode, "External-network runner only accepts read-oriented navigate/observe/extract intents.", ["unsupported-external-network-action"], "Keep this action in preview/dry-run until a dedicated confirmation route owns it.");
  }
  if (!input.gatesReady) {
    return decision("blocked-no-runner", runnerMode, "External-network gates are incomplete.", ["external-network-gates-incomplete"], "Represent sandbox, allowlist, and confirmation before considering a future runner.");
  }
  if (runnerMode === "future-runner") {
    return decision("ready-for-future-runner", runnerMode, "External-network gates are represented; future runner remains non-callable in this route.", [], "Route 117 may design an explicit external runner while keeping default execution disabled.", ["external-network-runner-policy:future-runner-not-called"]);
  }
  if (runnerMode === "none") {
    return decision("blocked-no-runner", runnerMode, "No external-network runner is configured.", ["missing-external-network-runner"], "Keep external execution disabled until a future route adds a runner design.");
  }
  return decision("blocked-runner-disabled", runnerMode, "External-network runner is disabled by default.", ["external-network-runner-disabled"], "Keep external execution disabled unless a future explicit runner route is approved.");
}

function decision(
  status: BrowserExternalNetworkRunnerStatus,
  runnerMode: BrowserExternalNetworkRunnerMode,
  reason: string,
  blockers: readonly string[],
  nextAction: string,
  extraEvidence: readonly string[] = [],
): BrowserExternalNetworkRunnerPolicyDecision {
  return {
    status,
    runnerMode,
    callable: false,
    reason,
    blockers,
    warnings: status === "ready-for-future-runner" ? ["future runner represented; not callable"] : [],
    nextAction,
    evidence: [
      `browser-external-network-runner-policy:${status}`,
      "browser-external-network-runner-policy:disabled-by-default",
      "browser-external-network-runner-policy:no-runner-call",
      "browser-external-network-runner-policy:no-network-call",
      ...extraEvidence,
    ],
  };
}

function isSensitive(actionKind: BrowserExecutionRequest["actionKind"]): boolean {
  return ["auth", "payment", "destructive", "upload", "download", "screenshot"].includes(actionKind);
}
