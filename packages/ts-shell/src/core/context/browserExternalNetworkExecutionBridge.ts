import type { BrowserExecutionRequest } from "./browserExecutionContract.js";
import {
  decideBrowserExecutionPolicy,
} from "./browserExecutionPolicy.js";
import type { BrowserExecutionConfirmationRecord } from "./browserExecutionConfirmation.js";
import type { BrowserNetworkAllowlist } from "./browserNetworkAllowlist.js";
import type { BrowserSandboxAuthority } from "./browserSandboxAuthority.js";
import {
  runBrowserRuntimePreflight,
  type BrowserRuntimePreflight,
} from "./browserRuntimePreflight.js";
import {
  createBrowserExternalNetworkIntent,
  type BrowserExternalNetworkExecutionMode,
  type BrowserExternalNetworkIntent,
} from "./browserExternalNetworkExecutionMode.js";
import {
  decideBrowserExternalNetworkRunnerPolicy,
  type BrowserExternalNetworkRunnerMode,
  type BrowserExternalNetworkRunnerPolicyDecision,
} from "./browserExternalNetworkRunnerPolicy.js";
import {
  createBrowserExternalNetworkExecutionReceipt,
  type BrowserExternalNetworkExecutionReceipt,
} from "./browserExternalNetworkExecutionReceipt.js";

export interface BrowserExternalNetworkExecutionBridgeResult {
  readonly mode: BrowserExternalNetworkExecutionMode;
  readonly status: "blocked" | "ready-for-future-runner";
  readonly request: BrowserExecutionRequest;
  readonly intent: BrowserExternalNetworkIntent;
  readonly preflight: BrowserRuntimePreflight;
  readonly runner: BrowserExternalNetworkRunnerPolicyDecision;
  readonly receipt: BrowserExternalNetworkExecutionReceipt;
  readonly executed: false;
  readonly evidence: readonly string[];
}

export function runBrowserExternalNetworkExecutionBridge(input: {
  readonly request: BrowserExecutionRequest;
  readonly sandboxAuthority?: BrowserSandboxAuthority;
  readonly networkAllowlist?: BrowserNetworkAllowlist;
  readonly confirmations?: readonly BrowserExecutionConfirmationRecord[];
  readonly runnerMode?: BrowserExternalNetworkRunnerMode;
}): BrowserExternalNetworkExecutionBridgeResult {
  const intent = createBrowserExternalNetworkIntent(input.request);
  const policy = decideBrowserExecutionPolicy({
    request: { ...input.request, mode: "future-runtime" },
    executorAvailable: true,
  });
  const preflight = runBrowserRuntimePreflight({
    request: { ...input.request, mode: "future-runtime" },
    policy,
    executorKind: "noop",
    authority: input.sandboxAuthority,
    allowlist: input.networkAllowlist,
    confirmations: input.confirmations,
  });
  const gatesReady = gatesAreRepresented(preflight);
  const runner = decideBrowserExternalNetworkRunnerPolicy({
    request: input.request,
    runnerMode: input.runnerMode,
    gatesReady,
  });
  const receipt = createBrowserExternalNetworkExecutionReceipt({
    request: input.request,
    intent,
    preflight: gatesReady ? { ...preflight, blockers: [] } : preflight,
    runner,
  });
  const mode = modeFor({ preflight, runner });
  return {
    mode,
    status: receipt.readinessStatus,
    request: input.request,
    intent,
    preflight,
    runner,
    receipt,
    executed: false,
    evidence: [
      ...receipt.evidence,
      `browser-external-network-bridge:mode:${mode}`,
      "browser-external-network-bridge:no-browser-launch",
      "browser-external-network-bridge:no-network-call",
      "browser-external-network-bridge:no-mcp-launch",
    ],
  };
}

function gatesAreRepresented(preflight: BrowserRuntimePreflight): boolean {
  return (
    preflight.networkDecision.status === "allowed" &&
    ["confirmed", "not-required"].includes(preflight.confirmationDecision.status) &&
    ["allowed", "future-runtime-required"].includes(preflight.sandboxDecision.status)
  );
}

function modeFor(input: {
  readonly preflight: BrowserRuntimePreflight;
  readonly runner: BrowserExternalNetworkRunnerPolicyDecision;
}): BrowserExternalNetworkExecutionMode {
  if (input.runner.status === "ready-for-future-runner") {
    return "ready-for-future-runner";
  }
  if (input.runner.status === "blocked-runner-disabled" || input.runner.status === "blocked-no-runner") {
    return "explicit-external-runner-required";
  }
  if (input.preflight.sandboxDecision.status === "future-runtime-required") {
    return "future-runtime-required";
  }
  if (input.runner.status.startsWith("blocked")) {
    return "blocked-by-policy";
  }
  return "disabled";
}
