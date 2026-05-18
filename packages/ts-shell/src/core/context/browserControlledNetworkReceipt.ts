import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import type { BrowserExecutionRequest } from "./browserExecutionContract.js";
import type { BrowserControlledNetworkRunnerManifest } from "./browserControlledNetworkRunnerManifest.js";
import type { BrowserControlledNetworkPolicyDecision } from "./browserControlledNetworkPolicy.js";
import type { BrowserControlledNetworkExecutorResult } from "./browserControlledNetworkExecutor.js";

export interface BrowserControlledNetworkReceipt {
  readonly receiptId: string;
  readonly controlledOrigin: string;
  readonly actionKind: BrowserExecutionRequest["actionKind"];
  readonly policyStatus: string;
  readonly requestStatus: string;
  readonly publicNetwork: false;
  readonly browserLaunched: false;
  readonly statusCodeSummary: string;
  readonly safeTitle?: string;
  readonly safeSummary: string;
  readonly timeoutMs: number;
  readonly outputBudgetBytes: number;
  readonly redactions: readonly string[];
  readonly warnings: readonly string[];
  readonly executed: boolean;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}

export function createBrowserControlledNetworkReceipt(input: {
  readonly request: BrowserExecutionRequest;
  readonly manifest: BrowserControlledNetworkRunnerManifest;
  readonly policy: BrowserControlledNetworkPolicyDecision;
  readonly executor: BrowserControlledNetworkExecutorResult;
}): BrowserControlledNetworkReceipt {
  return {
    receiptId: receiptId(input.request.requestId, input.policy.status, input.executor.status),
    controlledOrigin: input.manifest.allowedLoopbackOrigin,
    actionKind: input.request.actionKind,
    policyStatus: input.policy.status,
    requestStatus: input.executor.status,
    publicNetwork: false,
    browserLaunched: false,
    statusCodeSummary: input.executor.statusCode ? `http ${input.executor.statusCode}` : "none",
    safeTitle: input.executor.safeTitle,
    safeSummary: sanitizeBrowserText(input.executor.safeSummary ?? input.executor.errorSummary ?? input.policy.reason, 240),
    timeoutMs: input.manifest.timeoutMs,
    outputBudgetBytes: input.manifest.outputBudgetBytes,
    redactions: unique(input.executor.redactions),
    warnings: unique([...input.policy.warnings, ...input.executor.warnings]),
    executed: input.executor.executed,
    nextAction: input.executor.executed
      ? "Use the controlled-network evidence only as test harness proof; public internet remains blocked."
      : input.policy.nextAction,
    evidence: [
      ...input.policy.evidence,
      ...input.executor.evidence,
      "browser-controlled-network-receipt:created",
      "browser-controlled-network-receipt:public-network-no",
      "browser-controlled-network-receipt:browser-launched-no",
    ],
  };
}

function receiptId(requestId: string, policyStatus: string, requestStatus: string): string {
  return `browser-controlled-network:${`${requestId}:${policyStatus}:${requestStatus}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`;
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
