import type { BrowserActionContract } from "./actionContract.js";
import type { BrowserCapabilityState } from "./capabilityModel.js";

export type BrowserActionReadinessStatus =
  | "supported-preview"
  | "blocked-sensitive"
  | "blocked-destructive"
  | "blocked-auth"
  | "blocked-payment"
  | "blocked-no-backend"
  | "blocked-dynamic-discovery"
  | "blocked-unsupported-action"
  | "blocked-ambiguous-target"
  | "future-runtime-required";

export interface BrowserActionReadiness {
  readonly status: BrowserActionReadinessStatus;
  readonly executable: false;
  readonly executed: false;
  readonly reason: string;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}

export function classifyBrowserActionReadiness(input: {
  readonly contract: BrowserActionContract;
  readonly capability: BrowserCapabilityState;
}): BrowserActionReadiness {
  const contract = input.contract;
  if (contract.requiresAuth || contract.actionKind === "auth") {
    return blocked("blocked-auth", "Browser actions requiring authentication are blocked in the preview boundary.");
  }
  if (contract.actionKind === "payment") {
    return blocked("blocked-payment", "Payment browser automation is blocked.");
  }
  if (contract.actionKind === "destructive" || contract.risk === "destructive") {
    return blocked("blocked-destructive", "Destructive browser automation is blocked.");
  }
  if (["screenshot", "download", "upload"].includes(contract.actionKind)) {
    return blocked(
      "future-runtime-required",
      `${contract.actionKind} requires a future browser runtime and is not preview-enabled here.`,
    );
  }
  if (hasAmbiguousTarget(contract)) {
    return blocked("blocked-ambiguous-target", "The browser preview request is missing a clear target, URL, text, or extraction goal.");
  }
  if (input.capability.boundary.dynamicDiscovery) {
    return blocked("blocked-dynamic-discovery", "Dynamic browser or MCP discovery is outside this boundary.");
  }
  if (!input.capability.supportedPreviewActions.includes(contract.actionKind)) {
    return blocked("blocked-unsupported-action", "This browser action is not supported by the preview classifier.");
  }
  return {
    status: "supported-preview",
    executable: false,
    executed: false,
    reason: "Preview can describe readiness, risk, and future evidence, but execution is disabled.",
    nextAction: "Use the preview to decide whether a future browser runtime route should implement this action.",
    evidence: [
      "browser-action-readiness:preview-only",
      "browser-action-readiness:no-execution-claim",
      "browser-action-readiness:no-provider-or-model-call",
    ],
  };
}

function hasAmbiguousTarget(contract: BrowserActionContract): boolean {
  if (contract.actionKind === "navigate") {
    return !contract.url || !/^https?:\/\//i.test(contract.url);
  }
  if (contract.actionKind === "click") {
    return !contract.target;
  }
  if (contract.actionKind === "type") {
    return !contract.target || !contract.text;
  }
  if (contract.actionKind === "extract") {
    return !contract.extractionGoal;
  }
  if (contract.actionKind === "wait") {
    return !contract.target;
  }
  return false;
}

function blocked(
  status: BrowserActionReadinessStatus,
  reason: string,
): BrowserActionReadiness {
  return {
    status,
    executable: false,
    executed: false,
    reason,
    nextAction: "Keep this as preview-only until a dedicated browser sandbox/runtime route reopens it.",
    evidence: [
      "browser-action-readiness:blocked-before-execution",
      "browser-action-readiness:no-browser-execution",
      "browser-action-readiness:no-provider-or-model-call",
    ],
  };
}
