import type { BrowserExecutionRequest } from "./browserExecutionContract.js";
import type { BrowserRuntimePreflight } from "./browserRuntimePreflight.js";
import type { BrowserExternalNetworkIntent } from "./browserExternalNetworkExecutionMode.js";
import type { BrowserExternalNetworkRunnerPolicyDecision } from "./browserExternalNetworkRunnerPolicy.js";

export interface BrowserExternalNetworkExecutionReceipt {
  readonly receiptId: string;
  readonly targetOrigin: string;
  readonly actionKind: BrowserExecutionRequest["actionKind"];
  readonly allowlistStatus: string;
  readonly confirmationStatus: string;
  readonly sandboxStatus: string;
  readonly preflightStatus: string;
  readonly externalRunnerStatus: BrowserExternalNetworkRunnerPolicyDecision["status"];
  readonly externalNetworkRunnerManifestStatus: "missing" | "valid" | "invalid";
  readonly handoffStatus?: string;
  readonly handoffReceiptId?: string;
  readonly riskLevel: string;
  readonly blockedReasons: readonly string[];
  readonly readinessStatus: "blocked" | "ready-for-future-runner";
  readonly executed: false;
  readonly redactions: readonly string[];
  readonly nextAction: string;
  readonly evidence: readonly string[];
}

export function createBrowserExternalNetworkExecutionReceipt(input: {
  readonly request: BrowserExecutionRequest;
  readonly intent: BrowserExternalNetworkIntent;
  readonly preflight: BrowserRuntimePreflight;
  readonly runner: BrowserExternalNetworkRunnerPolicyDecision;
  readonly manifestStatus?: "missing" | "valid" | "invalid";
  readonly handoffStatus?: string;
  readonly handoffReceiptId?: string;
}): BrowserExternalNetworkExecutionReceipt {
  const blockedReasons = unique([
    ...input.preflight.blockers,
    ...input.runner.blockers,
  ]);
  const readinessStatus = input.runner.status === "ready-for-future-runner" && blockedReasons.length === 0
    ? "ready-for-future-runner"
    : "blocked";
  return {
    receiptId: receiptId(input.request.requestId, input.runner.status),
    targetOrigin: input.intent.normalizedOrigin,
    actionKind: input.request.actionKind,
    allowlistStatus: input.preflight.networkDecision.status,
    confirmationStatus: input.preflight.confirmationDecision.status,
    sandboxStatus: input.preflight.sandboxDecision.status,
    preflightStatus: input.preflight.preflightStatus,
    externalRunnerStatus: input.runner.status,
    externalNetworkRunnerManifestStatus: input.manifestStatus ?? "missing",
    handoffStatus: input.handoffStatus,
    handoffReceiptId: input.handoffReceiptId,
    riskLevel: input.intent.riskLevel,
    blockedReasons,
    readinessStatus,
    executed: false,
    redactions: unique(input.intent.redactions),
    nextAction: input.runner.nextAction,
    evidence: [
      ...input.intent.evidence,
      ...input.preflight.evidence,
      ...input.runner.evidence,
      ...(input.handoffStatus ? [`browser-external-network-receipt:handoff:${input.handoffStatus}`] : []),
      "browser-external-network-receipt:no-browser-launch",
      "browser-external-network-receipt:no-network-call",
      "browser-external-network-receipt:raw-content-excluded",
    ],
  };
}

function receiptId(requestId: string, runnerStatus: string): string {
  return `browser-external-network-receipt:${`${requestId}:${runnerStatus}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`;
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}
