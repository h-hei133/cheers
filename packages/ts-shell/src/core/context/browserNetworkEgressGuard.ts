import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import type { BrowserExecutionRequest } from "./browserExecutionContract.js";
import { parseBrowserNetworkTarget } from "./browserNetworkAllowlist.js";

export type BrowserNetworkMode = "controlled-only" | "public-readonly" | "future-public" | "disabled";
export type BrowserNetworkEgressDecisionStatus =
  | "allowed-controlled-origin"
  | "allowed-public-readonly-origin"
  | "blocked-no-allowlist"
  | "blocked-origin-mismatch"
  | "blocked-public-origin"
  | "blocked-private-network"
  | "blocked-credential-url"
  | "blocked-unsupported-scheme"
  | "blocked-redirect-escape"
  | "blocked-sensitive-action"
  | "blocked-output-budget";

export interface BrowserNetworkEgressDecision {
  readonly status: BrowserNetworkEgressDecisionStatus;
  readonly allowed: boolean;
  readonly requestedOrigin: string;
  readonly effectiveOrigin: string;
  readonly allowedOrigin?: string;
  readonly publicNetwork: boolean;
  readonly controlledNetwork: boolean;
  readonly privateNetworkBlocked: boolean;
  readonly credentialsRedacted: boolean;
  readonly reason: string;
  readonly warnings: readonly string[];
  readonly redactions: readonly string[];
  readonly nextAction: string;
  readonly evidence: readonly string[];
}

export function decideBrowserNetworkEgress(input: {
  readonly request: BrowserExecutionRequest;
  readonly requestedUrl: string;
  readonly allowedOrigins: readonly string[];
  readonly controlledOrigin?: string;
  readonly redirectTarget?: string;
  readonly networkMode: BrowserNetworkMode;
  readonly outputBudgetBytes: number;
  readonly observedOutputBytes?: number;
}): BrowserNetworkEgressDecision {
  const target = parseBrowserNetworkTarget(input.redirectTarget ?? input.requestedUrl);
  const requested = parseBrowserNetworkTarget(input.requestedUrl);
  const effectiveOrigin = target.hasCredentials ? "credential-url-redacted" : target.origin ?? target.scheme ?? "invalid-target";
  const requestedOrigin = requested.hasCredentials ? "credential-url-redacted" : requested.origin ?? requested.scheme ?? "invalid-target";
  if (isSensitive(input.request.actionKind)) {
    return decision("blocked-sensitive-action", requestedOrigin, effectiveOrigin, input, "Sensitive browser actions are blocked.", ["sensitive-browser-action"], "Keep sensitive actions blocked.");
  }
  if (target.hasCredentials || requested.hasCredentials) {
    return decision("blocked-credential-url", requestedOrigin, effectiveOrigin, input, "Credential-bearing URLs are blocked.", ["credential-url"], "Remove URL credentials.", ["url-credentials"]);
  }
  if (target.parseError || !target.scheme || !["http", "https"].includes(target.scheme)) {
    return decision("blocked-unsupported-scheme", requestedOrigin, effectiveOrigin, input, "URL scheme is unsupported.", ["unsupported-scheme"], "Use the harness-issued loopback HTTP origin.");
  }
  if ((input.observedOutputBytes ?? 0) > input.outputBudgetBytes) {
    return decision("blocked-output-budget", requestedOrigin, effectiveOrigin, input, "Network output exceeded the route budget.", ["output-budget-exceeded"], "Keep output bounded and summarized.");
  }
  if (input.redirectTarget && effectiveOrigin !== requestedOrigin) {
    if (
      input.networkMode === "controlled-only" &&
      effectiveOrigin !== input.controlledOrigin
    ) {
      return decision("blocked-redirect-escape", requestedOrigin, effectiveOrigin, input, "Redirect target escaped the controlled origin.", ["redirect-escape"], "Block the redirect and keep public internet disabled.");
    }
    if (
      input.networkMode === "public-readonly" &&
      !input.allowedOrigins.includes(effectiveOrigin)
    ) {
      return decision("blocked-redirect-escape", requestedOrigin, effectiveOrigin, input, "Redirect target escaped the explicit public read-only allowlist.", ["redirect-escape"], "Block the redirect and keep the explicit origin allowlist unchanged.");
    }
  }
  if (input.networkMode === "public-readonly") {
    if (!input.allowedOrigins.length) {
      return decision("blocked-no-allowlist", requestedOrigin, effectiveOrigin, input, "Public read-only execution requires an explicit allowlist.", ["missing-public-allowlist"], "Provide an exact https origin in the manifest.");
    }
    if (target.scheme !== "https") {
      return decision("blocked-unsupported-scheme", requestedOrigin, effectiveOrigin, input, "Public read-only execution requires https.", ["unsupported-scheme"], "Use an explicitly allowlisted https origin.");
    }
    if (isPrivateOrigin(effectiveOrigin)) {
      return decision("blocked-private-network", requestedOrigin, effectiveOrigin, input, "Private/local origins are blocked for public read-only execution.", ["private-origin"], "Use public https origins only.");
    }
    if (!input.allowedOrigins.includes(effectiveOrigin)) {
      return decision("blocked-origin-mismatch", requestedOrigin, effectiveOrigin, input, "Effective origin does not match the explicit public read-only allowlist.", ["origin-mismatch"], "Add the exact public origin to the manifest.");
    }
    return decision("allowed-public-readonly-origin", requestedOrigin, effectiveOrigin, input, "Public read-only origin is explicitly allowlisted.", [], "Proceed with read-only GET/HEAD request.", []);
  }
  if (input.networkMode !== "controlled-only" || !input.controlledOrigin) {
    return decision("blocked-public-origin", requestedOrigin, effectiveOrigin, input, "Only controlled-network mode is enforceable in this route.", ["public-network-disabled"], "Use controlled loopback only.");
  }
  if (!input.allowedOrigins.includes(input.controlledOrigin)) {
    return decision("blocked-no-allowlist", requestedOrigin, effectiveOrigin, input, "Controlled origin is not explicitly allowlisted.", ["missing-controlled-allowlist"], "Add the harness-issued origin to the route-scoped allowlist.");
  }
  if (effectiveOrigin !== input.controlledOrigin) {
    const privateBlocked = isPrivateOrigin(effectiveOrigin);
    return decision(
      privateBlocked ? "blocked-private-network" : "blocked-public-origin",
      requestedOrigin,
      effectiveOrigin,
      input,
      privateBlocked ? "Private origin is not the harness-issued controlled origin." : "Public origin is blocked in this route.",
      [privateBlocked ? "private-origin" : "public-origin"],
      "Use only the harness-issued loopback origin.",
    );
  }
  if (!input.allowedOrigins.includes(effectiveOrigin)) {
    return decision("blocked-origin-mismatch", requestedOrigin, effectiveOrigin, input, "Effective origin does not match the explicit allowlist.", ["origin-mismatch"], "Use only the allowlisted controlled origin.");
  }
  return decision("allowed-controlled-origin", requestedOrigin, effectiveOrigin, input, "Controlled loopback origin is allowed.", [], "Proceed with controlled-network request.", []);
}

function decision(
  status: BrowserNetworkEgressDecisionStatus,
  requestedOrigin: string,
  effectiveOrigin: string,
  input: {
    readonly allowedOrigins: readonly string[];
    readonly controlledOrigin?: string;
  },
  reason: string,
  warnings: readonly string[],
  nextAction: string,
  redactions: readonly string[] = [],
): BrowserNetworkEgressDecision {
  return {
    status,
    allowed: status === "allowed-controlled-origin" || status === "allowed-public-readonly-origin",
    requestedOrigin: sanitizeBrowserText(requestedOrigin, 160),
    effectiveOrigin: sanitizeBrowserText(effectiveOrigin, 160),
    allowedOrigin: status === "allowed-public-readonly-origin" ? effectiveOrigin : input.controlledOrigin,
    publicNetwork: status === "allowed-public-readonly-origin",
    controlledNetwork: status === "allowed-controlled-origin",
    privateNetworkBlocked: status === "blocked-private-network",
    credentialsRedacted: redactions.includes("url-credentials"),
    reason,
    warnings,
    redactions,
    nextAction,
    evidence: [
      `browser-network-egress-guard:${status}`,
      "browser-network-egress-guard:public-network-no",
      "browser-network-egress-guard:no-network-call",
    ],
  };
}

function isSensitive(actionKind: BrowserExecutionRequest["actionKind"]): boolean {
  return ["auth", "payment", "destructive", "upload", "download", "screenshot"].includes(actionKind);
}

function isPrivateOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "::1" || hostname.startsWith("127.") ||
      hostname.startsWith("10.") || hostname.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
  } catch {
    return false;
  }
}
