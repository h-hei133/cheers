import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import type { BrowserExecutionRequest } from "./browserExecutionContract.js";
import type { BrowserRuntimeManifest } from "./browser/runtime/core/manifest.js";
import {
  browserRuntimeActionAllowed,
  browserRuntimeOriginAllowed,
} from "./browser/runtime/core/manifest.js";
import type { BrowserRuntimeSession } from "./browser/runtime/core/session.js";
import type { BrowserActionTarget } from "./browserActionTarget.js";

export type BrowserActionLoopPolicyStatus =
  | "allowed"
  | "blocked-no-manifest"
  | "blocked-unsupported-action"
  | "blocked-public-origin"
  | "blocked-sensitive-target"
  | "blocked-missing-target"
  | "blocked-unsafe-action";

export interface BrowserActionLoopPolicyDecision {
  readonly status: BrowserActionLoopPolicyStatus;
  readonly allowed: boolean;
  readonly reason: string;
  readonly nextAction: string;
  readonly warnings: readonly string[];
  readonly evidence: readonly string[];
}

export function decideBrowserActionLoopPolicy(input: {
  readonly request: BrowserExecutionRequest;
  readonly manifest?: BrowserRuntimeManifest;
  readonly session?: BrowserRuntimeSession;
  readonly target?: BrowserActionTarget;
}): BrowserActionLoopPolicyDecision {
  if (!input.manifest) {
    return decision("blocked-no-manifest", "Explicit browser runtime manifest is required.", "Provide a controlled local/test manifest.");
  }
  const actionKind = input.request.actionKind;
  if (!browserRuntimeActionAllowed(input.manifest, actionKind)) {
    return decision("blocked-unsupported-action", `Action ${actionKind} is not allowed by the runtime manifest.`, "Use an action listed in the explicit manifest.");
  }
  if (["auth", "payment", "destructive", "upload", "download", "screenshot"].includes(actionKind)) {
    return decision("blocked-unsafe-action", `Action ${actionKind} is outside the controlled browser runtime.`, "Keep unsafe actions in preview only.");
  }
  const urlOrOrigin = input.request.action.url ??
    (actionKind === "navigate" ? input.request.action.target : undefined) ??
    input.session?.currentUrlSummary ??
    input.manifest.allowedOrigins[0];
  if (!browserRuntimeOriginAllowed(input.manifest, urlOrOrigin)) {
    return decision("blocked-public-origin", "Public browser automation origin is blocked for this route.", "Use controlled-runtime, local-fixture, or loopback test origins.");
  }
  if (actionKind === "click" || actionKind === "type") {
    if (input.target?.riskLevel === "sensitive") {
      return decision("blocked-sensitive-target", "Sensitive target is blocked for controlled click/type.", "Avoid password, payment, token, or credential fields.");
    }
    if (!input.target || input.target.riskLevel === "missing" || input.target.confidence < 0.5) {
      return decision("blocked-missing-target", "Action target was missing or low confidence.", "Use selector repair preview and do not execute automatically.");
    }
  }
  return decision("allowed", "Controlled local/test browser action is allowed.", "Review sanitized observation receipt.");
}

function decision(
  status: BrowserActionLoopPolicyStatus,
  reason: string,
  nextAction: string,
): BrowserActionLoopPolicyDecision {
  return {
    status,
    allowed: status === "allowed",
    reason: sanitizeBrowserText(reason, 220),
    nextAction: sanitizeBrowserText(nextAction, 220),
    warnings: status === "allowed" ? [] : [status],
    evidence: [
      "browser-action-loop-policy:deterministic",
      `browser-action-loop-policy:${status}`,
      "browser-action-loop-policy:no-public-click-type",
      "browser-action-loop-policy:no-provider-or-model-call",
    ],
  };
}
