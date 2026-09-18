import {
  validateBrowserExternalNetworkHandoffResponse,
  type BrowserExternalNetworkHandoffRequest,
  type BrowserExternalNetworkHandoffResponse,
} from "./browserExternalNetworkHandoffProtocol.js";

export interface BrowserExternalNetworkHandoffExecutorResult {
  readonly request: BrowserExternalNetworkHandoffRequest;
  readonly response: BrowserExternalNetworkHandoffResponse;
  readonly browserLaunched: false;
  readonly realNetworkExecution: false;
  readonly evidence: readonly string[];
}

export function runBrowserExternalNetworkHandoffExecutor(input: {
  readonly request: BrowserExternalNetworkHandoffRequest;
  readonly simulatedResponse?: BrowserExternalNetworkHandoffResponse;
}): BrowserExternalNetworkHandoffExecutorResult {
  const response = input.simulatedResponse ?? {
    status: "simulated",
    executed: false,
    realNetworkExecution: false,
    safeTitle: "Simulated external browser handoff",
    safeSummary: `${input.request.actionKind} handoff prepared for ${input.request.targetOrigin}; no browser or network was launched.`,
    warnings: ["simulated-only"],
    redactions: [],
    evidence: [
      "browser-external-network-handoff-executor:simulated-response",
      "browser-external-network-handoff-executor:no-network-call",
    ],
  };
  const validation = validateBrowserExternalNetworkHandoffResponse({
    response,
    outputBudgetBytes: input.request.outputBudgetBytes,
  });
  return {
    request: input.request,
    response: validation.response,
    browserLaunched: false,
    realNetworkExecution: false,
    evidence: [
      ...validation.evidence,
      ...validation.response.evidence,
      "browser-external-network-handoff-executor:simulated-only",
      "browser-external-network-handoff-executor:no-browser-launch",
      "browser-external-network-handoff-executor:no-real-network",
      "browser-external-network-handoff-executor:no-mcp-launch",
      "browser-external-network-handoff-executor:no-provider-or-model-call",
    ],
  };
}
