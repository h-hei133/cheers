import { sanitizeBrowserText } from "./capabilityModel.js";
import type { BrowserExternalNetworkHandoffPolicyDecision } from "./externalNetworkHandoffPolicy.js";
import type { BrowserExternalNetworkHandoffExecutorResult } from "./externalNetworkHandoffExecutor.js";

export interface BrowserExternalNetworkHandoffReceipt {
  readonly receiptId: string;
  readonly targetOrigin: string;
  readonly actionKind: string;
  readonly runnerMode: string;
  readonly gateSummary: string;
  readonly handoffStatus: string;
  readonly realNetworkExecution: false;
  readonly browserLaunched: false;
  readonly evidenceSummary: string;
  readonly warnings: readonly string[];
  readonly redactions: readonly string[];
  readonly nextAction: string;
  readonly evidence: readonly string[];
}

export function createBrowserExternalNetworkHandoffReceipt(input: {
  readonly policy: BrowserExternalNetworkHandoffPolicyDecision;
  readonly executor: BrowserExternalNetworkHandoffExecutorResult;
}): BrowserExternalNetworkHandoffReceipt {
  const request = input.executor.request;
  const response = input.executor.response;
  return {
    receiptId: receiptId(request.requestId, input.policy.status, response.status),
    targetOrigin: request.targetOrigin,
    actionKind: request.actionKind,
    runnerMode: request.runnerMode,
    gateSummary: `sandbox=${request.sandboxStatus}; allowlist=${request.allowlistStatus}; confirmation=${request.confirmationStatus}; preflight=${request.preflightStatus}`,
    handoffStatus: response.status,
    realNetworkExecution: false,
    browserLaunched: false,
    evidenceSummary: sanitizeBrowserText(response.safeSummary ?? response.errorSummary ?? "safe summary unavailable", 220),
    warnings: unique([...input.policy.warnings, ...response.warnings]),
    redactions: unique(response.redactions),
    nextAction: input.policy.nextAction,
    evidence: [
      ...input.policy.evidence,
      ...input.executor.evidence,
      "browser-external-network-handoff-receipt:created",
      "browser-external-network-handoff-receipt:no-real-network",
      "browser-external-network-handoff-receipt:no-browser-launch",
    ],
  };
}

function receiptId(requestId: string, policyStatus: string, responseStatus: string): string {
  return `browser-external-network-handoff:${`${requestId}:${policyStatus}:${responseStatus}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`;
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
