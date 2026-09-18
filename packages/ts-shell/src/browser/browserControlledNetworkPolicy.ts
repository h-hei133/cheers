import type { BrowserExecutionRequest } from "./browserExecutionContract.js";
import type { BrowserRuntimePreflight } from "./runtime/core/preflight.js";
import type { BrowserExternalNetworkIntent } from "./browserExternalNetworkExecutionMode.js";
import type { BrowserControlledNetworkRunnerManifest } from "./browserControlledNetworkRunnerManifest.js";
import { validateBrowserControlledNetworkOrigin } from "./browserControlledNetworkOrigin.js";

export type BrowserControlledNetworkPolicyStatus =
  | "controlled-network-allowed"
  | "blocked-no-controlled-manifest"
  | "blocked-public-origin"
  | "blocked-origin-mismatch"
  | "blocked-no-confirmation"
  | "blocked-no-allowlist"
  | "blocked-sensitive-action"
  | "blocked-browser-launch"
  | "blocked-unsafe-url";

export interface BrowserControlledNetworkPolicyDecision {
  readonly status: BrowserControlledNetworkPolicyStatus;
  readonly allowed: boolean;
  readonly reason: string;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly nextAction: string;
  readonly evidence: readonly string[];
}

export function decideBrowserControlledNetworkPolicy(input: {
  readonly request: BrowserExecutionRequest;
  readonly intent: BrowserExternalNetworkIntent;
  readonly preflight: BrowserRuntimePreflight;
  readonly manifest?: BrowserControlledNetworkRunnerManifest;
  readonly manifestStatus: "missing" | "valid" | "invalid";
}): BrowserControlledNetworkPolicyDecision {
  if (input.intent.hasCredentialUrl || input.preflight.networkDecision.status === "blocked-credential-url") {
    return decision("blocked-unsafe-url", "Credential-bearing browser URLs are blocked.", ["credential-url"], "Remove URL credentials.");
  }
  if (isSensitive(input.request.actionKind)) {
    return decision("blocked-sensitive-action", "Sensitive browser actions are blocked.", ["sensitive-browser-action"], "Keep auth, payment, destructive, upload, download, screenshot, and OCR blocked.");
  }
  if (!["navigate", "observe", "extract"].includes(input.request.actionKind)) {
    return decision("blocked-sensitive-action", "Controlled-network only supports navigate, observe, and extract.", ["unsupported-action"], "Use read-oriented actions only.");
  }
  if (!input.manifest || input.manifestStatus !== "valid") {
    return decision("blocked-no-controlled-manifest", "No valid controlled-network runner manifest was provided.", ["missing-controlled-network-runner-manifest"], "Provide an explicit test-only controlled-network manifest.");
  }
  if (input.manifest.browserLaunchAllowed) {
    return decision("blocked-browser-launch", "Controlled-network route does not allow browser launch.", ["browser-launch-requested"], "Keep browserLaunchAllowed false.");
  }
  if (input.manifest.publicNetworkAllowed) {
    return decision("blocked-public-origin", "Controlled-network route does not allow public network.", ["public-network-requested"], "Keep publicNetworkAllowed false.");
  }
  const controlledOrigin = validateBrowserControlledNetworkOrigin({
    origin: input.intent.normalizedOrigin,
    expectedOrigin: input.manifest.allowedLoopbackOrigin,
    runId: input.manifest.runId,
  });
  if (controlledOrigin.ok === false) {
    return input.intent.normalizedOrigin.startsWith("http")
      ? decision("blocked-origin-mismatch", controlledOrigin.reason, ["origin-mismatch"], "Use the harness-issued loopback origin.")
      : decision("blocked-public-origin", controlledOrigin.reason, ["public-or-unsafe-origin"], "Use only the harness-issued loopback origin.");
  }
  if (input.preflight.networkDecision.status !== "allowed") {
    return decision("blocked-no-allowlist", input.preflight.networkDecision.reason, [input.preflight.networkDecision.status], input.preflight.networkDecision.nextAction);
  }
  if (!["confirmed", "not-required"].includes(input.preflight.confirmationDecision.status)) {
    return decision("blocked-no-confirmation", input.preflight.confirmationDecision.reason, [input.preflight.confirmationDecision.status], input.preflight.confirmationDecision.nextAction);
  }
  if (!["allowed", "future-runtime-required"].includes(input.preflight.sandboxDecision.status)) {
    return decision("blocked-unsafe-url", input.preflight.sandboxDecision.reason, [input.preflight.sandboxDecision.status], input.preflight.sandboxDecision.nextAction);
  }
  if (!input.manifest.allowedActionKinds.includes(input.request.actionKind as never)) {
    return decision("blocked-sensitive-action", "Controlled-network manifest does not allow this action.", ["action-not-allowed"], "Use navigate, observe, or extract only.");
  }
  return decision("controlled-network-allowed", "Controlled-network request is allowed for the harness-issued loopback origin.", [], "Execute only the controlled loopback request.", [
    ...controlledOrigin.evidence,
    ...controlledOrigin.origin.evidence,
  ]);
}

function decision(
  status: BrowserControlledNetworkPolicyStatus,
  reason: string,
  blockers: readonly string[],
  nextAction: string,
  extraEvidence: readonly string[] = [],
): BrowserControlledNetworkPolicyDecision {
  return {
    status,
    allowed: status === "controlled-network-allowed",
    reason,
    blockers,
    warnings: status === "controlled-network-allowed" ? ["controlled loopback only"] : [],
    nextAction,
    evidence: [
      `browser-controlled-network-policy:${status}`,
      "browser-controlled-network-policy:no-public-internet",
      "browser-controlled-network-policy:no-browser-launch",
      ...extraEvidence,
    ],
  };
}

function isSensitive(actionKind: BrowserExecutionRequest["actionKind"]): boolean {
  return ["auth", "payment", "destructive", "upload", "download", "screenshot"].includes(actionKind);
}
