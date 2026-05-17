import type { BrowserActionKind } from "./browserCapabilityModel.js";
import type {
  BrowserExecutionApproval,
  BrowserExecutionRequest,
} from "./browserExecutionContract.js";

export type BrowserExecutionPolicyStatus =
  | "allowed"
  | "blocked-no-executor"
  | "blocked-unsupported-action"
  | "blocked-sensitive"
  | "blocked-confirmation-required"
  | "blocked-sandbox-required"
  | "blocked-unsafe-target"
  | "future-runtime-required";

export interface BrowserExecutionPolicyDecision {
  readonly status: BrowserExecutionPolicyStatus;
  readonly allowed: boolean;
  readonly reason: string;
  readonly nextAction: string;
  readonly requirements: readonly string[];
  readonly warnings: readonly string[];
  readonly evidence: readonly string[];
}

export function decideBrowserExecutionPolicy(input: {
  readonly request: BrowserExecutionRequest;
  readonly executorAvailable: boolean;
}): BrowserExecutionPolicyDecision {
  const { request } = input;
  if (request.mode === "disabled" || !input.executorAvailable) {
    return decision("blocked-no-executor", {
      reason: "No explicit browser executor was injected for this command.",
      nextAction: "Inject a non-default fake/test or explicit-local executor before retrying.",
      requirements: request.requirements,
    });
  }
  if (isSensitiveOrUnsupported(request.action.actionKind)) {
    return decision("blocked-sensitive", {
      reason: `Browser execution for ${request.action.actionKind} is outside the safe prototype boundary.`,
      nextAction: "Use preview or dry-run only; plan a separate sandbox hardening route for this action.",
      requirements: request.requirements,
    });
  }
  if (request.actionKind === "click" || request.actionKind === "type") {
    return decision("blocked-confirmation-required", {
      reason: "State-changing click/type execution requires a future confirmation policy.",
      nextAction: "Use /browser dry-run for click/type until confirmation semantics are designed.",
      requirements: request.requirements,
    });
  }
  if (request.actionKind === "navigate" && request.approval !== "network-runtime") {
    return decision("blocked-confirmation-required", {
      reason: "Navigation requires explicit network/runtime confirmation.",
      nextAction: "Use a route-scoped executor with network-runtime approval after sandbox policy is reviewed.",
      requirements: request.requirements,
      warnings: ["network access remains non-default"],
    });
  }
  if (request.actionKind === "observe" || request.actionKind === "extract") {
    return decision("allowed", {
      reason: "Read-only browser execution is allowed with the explicitly injected executor.",
      nextAction: "Review sanitized evidence and keep raw page content excluded.",
      requirements: request.requirements,
      warnings: request.mode === "fake-test" ? ["fake/test executor only"] : [],
    });
  }
  if (request.actionKind === "navigate") {
    return decision("allowed", {
      reason: "Navigation is allowed only for the explicitly injected executor and route-scoped approval.",
      nextAction: "Capture sanitized navigation evidence and do not persist browser session state.",
      requirements: request.requirements,
      warnings: ["network access must be handled by the injected executor boundary"],
    });
  }
  return decision("future-runtime-required", {
    reason: "This browser action needs future runtime hardening.",
    nextAction: "Keep this action in preview/dry-run until a dedicated route enables it.",
    requirements: request.requirements,
  });
}

export function browserExecutionApprovalForAction(
  actionKind: BrowserActionKind,
): BrowserExecutionApproval {
  if (actionKind === "navigate") {
    return "none";
  }
  if (actionKind === "observe" || actionKind === "extract") {
    return "read-only";
  }
  return "none";
}

function isSensitiveOrUnsupported(actionKind: BrowserActionKind): boolean {
  return [
    "auth",
    "payment",
    "destructive",
    "upload",
    "download",
    "screenshot",
    "status",
    "wait",
  ].includes(actionKind);
}

function decision(
  status: BrowserExecutionPolicyStatus,
  input: {
    readonly reason: string;
    readonly nextAction: string;
    readonly requirements: readonly string[];
    readonly warnings?: readonly string[];
  },
): BrowserExecutionPolicyDecision {
  return {
    status,
    allowed: status === "allowed",
    reason: input.reason,
    nextAction: input.nextAction,
    requirements: input.requirements,
    warnings: input.warnings ?? [],
    evidence: [
      "browser-execution-policy:deterministic",
      "browser-execution-policy:no-provider-or-model-call",
      "browser-execution-policy:no-dynamic-discovery",
    ],
  };
}
