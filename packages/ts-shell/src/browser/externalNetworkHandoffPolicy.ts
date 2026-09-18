import type { BrowserExecutionRequest } from "./executionContract.js";
import type { BrowserRuntimePreflight } from "./runtime/core/preflight.js";
import type { BrowserExternalNetworkIntent } from "./externalNetworkExecutionMode.js";
import type { BrowserExternalNetworkRunnerManifest } from "./externalNetworkRunnerManifest.js";

export type BrowserExternalNetworkHandoffPolicyStatus =
  | "handoff-allowed-simulated"
  | "blocked-no-allowlist"
  | "blocked-no-confirmation"
  | "blocked-sandbox"
  | "blocked-no-runner-manifest"
  | "blocked-runner-disabled"
  | "blocked-real-network-not-allowed"
  | "blocked-sensitive-action"
  | "blocked-unsafe-url"
  | "future-real-runner-required";

export interface BrowserExternalNetworkHandoffPolicyDecision {
  readonly status: BrowserExternalNetworkHandoffPolicyStatus;
  readonly allowed: boolean;
  readonly reason: string;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly nextAction: string;
  readonly evidence: readonly string[];
}

export function decideBrowserExternalNetworkHandoffPolicy(input: {
  readonly request: BrowserExecutionRequest;
  readonly intent: BrowserExternalNetworkIntent;
  readonly preflight: BrowserRuntimePreflight;
  readonly manifest?: BrowserExternalNetworkRunnerManifest;
  readonly manifestValid?: boolean;
}): BrowserExternalNetworkHandoffPolicyDecision {
  if (input.intent.hasCredentialUrl || input.preflight.networkDecision.status === "blocked-credential-url") {
    return decision("blocked-unsafe-url", "Credential-bearing browser URLs are blocked.", ["credential-url"], "Remove URL credentials and keep auth out of this route.");
  }
  if (["blocked-scheme", "blocked-private-network", "blocked-origin"].includes(input.preflight.networkDecision.status)) {
    return decision("blocked-unsafe-url", input.preflight.networkDecision.reason, [input.preflight.networkDecision.status], input.preflight.networkDecision.nextAction);
  }
  if (isSensitive(input.request.actionKind)) {
    return decision("blocked-sensitive-action", "Sensitive browser actions are blocked for external-network handoff.", ["sensitive-browser-action"], "Keep auth, payment, destructive, upload, download, screenshot, and OCR blocked.");
  }
  if (!["navigate", "observe", "extract"].includes(input.request.actionKind)) {
    return decision("blocked-sensitive-action", "Only navigate, observe, and extract can reach simulated external-network handoff.", ["unsupported-external-network-action"], "Keep this action blocked until a dedicated route owns it.");
  }
  if (input.preflight.networkDecision.status !== "allowed") {
    return decision("blocked-no-allowlist", input.preflight.networkDecision.reason, [input.preflight.networkDecision.status], input.preflight.networkDecision.nextAction);
  }
  if (!["confirmed", "not-required"].includes(input.preflight.confirmationDecision.status)) {
    return decision("blocked-no-confirmation", input.preflight.confirmationDecision.reason, [input.preflight.confirmationDecision.status], input.preflight.confirmationDecision.nextAction);
  }
  if (!["allowed", "future-runtime-required"].includes(input.preflight.sandboxDecision.status)) {
    return decision("blocked-sandbox", input.preflight.sandboxDecision.reason, [input.preflight.sandboxDecision.status], input.preflight.sandboxDecision.nextAction);
  }
  if (!input.manifest || input.manifestValid === false) {
    return decision("blocked-no-runner-manifest", "No valid external-network runner manifest was provided.", ["missing-external-network-runner-manifest"], "Provide an explicit route-scoped simulated external-network runner manifest.");
  }
  if (input.manifest.networkExecution !== false) {
    return decision("blocked-real-network-not-allowed", "Route 117 forbids real external network execution.", ["network-execution-requested"], "Keep networkExecution false in this route.");
  }
  if (input.manifest.runnerMode === "disabled") {
    return decision("blocked-runner-disabled", "External-network runner manifest is disabled.", ["external-network-runner-disabled"], "Use a simulated-external manifest only for this route.");
  }
  if (input.manifest.runnerMode === "future-real-external") {
    return decision("future-real-runner-required", "Future real external runner is declared but remains non-callable.", ["future-real-runner"], "Keep real external network runner design for a later route.");
  }
  if (!input.manifest.allowedActionKinds.includes(input.request.actionKind as never)) {
    return decision("blocked-sensitive-action", "External-network runner manifest does not allow this action.", ["action-not-allowed"], "Use navigate, observe, or extract only.");
  }
  if (!input.manifest.allowedOrigins.includes(input.intent.normalizedOrigin)) {
    return decision("blocked-unsafe-url", "External-network runner manifest does not allow this origin.", ["origin-not-allowed-by-runner"], "Add the exact https origin to the route-scoped manifest.");
  }
  return decision("handoff-allowed-simulated", "All gates passed for simulated external-network handoff.", [], "Render simulated handoff evidence; real network execution remains no.", [
    "simulated-external-network-handoff",
  ]);
}

function decision(
  status: BrowserExternalNetworkHandoffPolicyStatus,
  reason: string,
  blockers: readonly string[],
  nextAction: string,
  extraEvidence: readonly string[] = [],
): BrowserExternalNetworkHandoffPolicyDecision {
  return {
    status,
    allowed: status === "handoff-allowed-simulated",
    reason,
    blockers,
    warnings: status === "handoff-allowed-simulated" ? ["simulated handoff only"] : [],
    nextAction,
    evidence: [
      `browser-external-network-handoff-policy:${status}`,
      "browser-external-network-handoff-policy:no-real-network",
      "browser-external-network-handoff-policy:no-browser-launch",
      ...extraEvidence,
    ],
  };
}

function isSensitive(actionKind: BrowserExecutionRequest["actionKind"]): boolean {
  return ["auth", "payment", "destructive", "upload", "download", "screenshot"].includes(actionKind);
}
