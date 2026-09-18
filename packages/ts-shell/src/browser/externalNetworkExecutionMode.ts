import { sanitizeBrowserText } from "./capabilityModel.js";
import type { BrowserExecutionRequest } from "./executionContract.js";
import { parseBrowserNetworkTarget } from "./networkAllowlist.js";

export type BrowserExternalNetworkExecutionMode =
  | "disabled"
  | "blocked-by-policy"
  | "ready-for-future-runner"
  | "explicit-external-runner-required"
  | "future-runtime-required";

export type BrowserExternalNetworkRiskLevel = "low" | "medium" | "high" | "blocked";

export interface BrowserExternalNetworkIntent {
  readonly actionKind: BrowserExecutionRequest["actionKind"];
  readonly rawTargetSummary: string;
  readonly normalizedOrigin: string;
  readonly scheme?: string;
  readonly hostname?: string;
  readonly hasCredentialUrl: boolean;
  readonly riskLevel: BrowserExternalNetworkRiskLevel;
  readonly executed: false;
  readonly nextAction: string;
  readonly redactions: readonly string[];
  readonly evidence: readonly string[];
}

export function isExternalNetworkExecutionRequest(
  request: BrowserExecutionRequest,
): boolean {
  if (!["navigate", "observe", "extract"].includes(request.actionKind)) {
    return false;
  }
  const target = externalNetworkTarget(request);
  if (!target) {
    return false;
  }
  if (request.actionKind === "navigate") {
    return !target.startsWith("local-fixture://");
  }
  return target.startsWith("http://") || target.startsWith("https://");
}

export function createBrowserExternalNetworkIntent(
  request: BrowserExecutionRequest,
): BrowserExternalNetworkIntent {
  const target = parseBrowserNetworkTarget(externalNetworkTarget(request));
  const redacted = target.hasCredentials;
  const normalizedOrigin = redacted
    ? "credential-url-redacted"
    : target.origin ?? target.scheme ?? "invalid-target";
  const riskLevel = riskLevelForRequest(request, redacted);
  return {
    actionKind: request.actionKind,
    rawTargetSummary: redacted
      ? "credential-url-redacted"
      : sanitizeBrowserText(request.action.url ?? request.action.target ?? "(missing target)", 160),
    normalizedOrigin: sanitizeBrowserText(normalizedOrigin, 160),
    scheme: target.scheme,
    hostname: target.hostname,
    hasCredentialUrl: target.hasCredentials,
    riskLevel,
    executed: false,
    nextAction: riskLevel === "blocked"
      ? "Keep this browser action blocked."
      : "Evaluate sandbox, allowlist, confirmation, and external runner policy.",
    redactions: redacted ? ["url-credentials"] : [],
    evidence: [
      "browser-external-network-intent:deterministic",
      "browser-external-network-intent:no-network-call",
      `browser-external-network-intent:risk:${riskLevel}`,
    ],
  };
}

function externalNetworkTarget(request: BrowserExecutionRequest): string | undefined {
  return request.action.url ?? request.action.target ?? request.action.extractionGoal;
}

function riskLevelForRequest(
  request: BrowserExecutionRequest,
  hasCredentialUrl: boolean,
): BrowserExternalNetworkRiskLevel {
  if (hasCredentialUrl) {
    return "blocked";
  }
  if (["auth", "payment", "destructive", "upload", "download", "screenshot"].includes(request.actionKind)) {
    return "blocked";
  }
  if (request.actionKind === "click" || request.actionKind === "type") {
    return "high";
  }
  if (request.actionKind === "navigate") {
    return "medium";
  }
  return "low";
}
