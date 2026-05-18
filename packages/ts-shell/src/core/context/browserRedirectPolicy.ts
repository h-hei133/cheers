import type { BrowserExecutionRequest } from "./browserExecutionContract.js";
import {
  decideBrowserNetworkEgress,
  type BrowserNetworkEgressDecision,
} from "./browserNetworkEgressGuard.js";

export interface BrowserRedirectPolicyDecision {
  readonly status:
    | "redirect-none"
    | "redirect-allowed-controlled-origin"
    | "blocked-redirect-escape"
    | "blocked-credential-url"
    | "blocked-unsupported-scheme";
  readonly allowed: boolean;
  readonly originalOrigin: string;
  readonly targetOrigin: string;
  readonly egressDecision: BrowserNetworkEgressDecision;
  readonly evidence: readonly string[];
}

export function decideBrowserRedirectPolicy(input: {
  readonly request: BrowserExecutionRequest;
  readonly requestedUrl: string;
  readonly redirectTarget?: string;
  readonly allowedOrigins: readonly string[];
  readonly controlledOrigin: string;
  readonly outputBudgetBytes: number;
}): BrowserRedirectPolicyDecision {
  if (!input.redirectTarget) {
    const egressDecision = decideBrowserNetworkEgress({
      request: input.request,
      requestedUrl: input.requestedUrl,
      allowedOrigins: input.allowedOrigins,
      controlledOrigin: input.controlledOrigin,
      networkMode: "controlled-only",
      outputBudgetBytes: input.outputBudgetBytes,
    });
    return {
      status: "redirect-none",
      allowed: true,
      originalOrigin: egressDecision.requestedOrigin,
      targetOrigin: egressDecision.effectiveOrigin,
      egressDecision,
      evidence: ["browser-redirect-policy:none"],
    };
  }
  const egressDecision = decideBrowserNetworkEgress({
    request: input.request,
    requestedUrl: input.requestedUrl,
    redirectTarget: input.redirectTarget,
    allowedOrigins: input.allowedOrigins,
    controlledOrigin: input.controlledOrigin,
    networkMode: "controlled-only",
    outputBudgetBytes: input.outputBudgetBytes,
  });
  const status = egressDecision.status === "allowed-controlled-origin"
    ? "redirect-allowed-controlled-origin"
    : egressDecision.status === "blocked-credential-url"
      ? "blocked-credential-url"
    : egressDecision.status === "blocked-unsupported-scheme"
      ? "blocked-unsupported-scheme"
    : "blocked-redirect-escape";
  return {
    status,
    allowed: egressDecision.allowed,
    originalOrigin: egressDecision.requestedOrigin,
    targetOrigin: egressDecision.effectiveOrigin,
    egressDecision,
    evidence: [
      `browser-redirect-policy:${status}`,
      "browser-redirect-policy:public-network-no",
    ],
  };
}
