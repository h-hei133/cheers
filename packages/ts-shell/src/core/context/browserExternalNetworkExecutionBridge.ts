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
} from "./browser/runtime/core/preflight.js";
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
import type { BrowserExternalNetworkRunnerManifestLoadResult } from "./browserExternalNetworkRunnerManifest.js";
import {
  createBrowserExternalNetworkHandoffRequest,
} from "./browserExternalNetworkHandoffProtocol.js";
import {
  decideBrowserExternalNetworkHandoffPolicy,
  type BrowserExternalNetworkHandoffPolicyDecision,
} from "./browserExternalNetworkHandoffPolicy.js";
import {
  runBrowserExternalNetworkHandoffExecutor,
} from "./browserExternalNetworkHandoffExecutor.js";
import {
  createBrowserExternalNetworkHandoffReceipt,
  type BrowserExternalNetworkHandoffReceipt,
} from "./browserExternalNetworkHandoffReceipt.js";
import type { BrowserControlledNetworkRunnerManifestLoadResult } from "./browserControlledNetworkRunnerManifest.js";
import {
  decideBrowserControlledNetworkPolicy,
  type BrowserControlledNetworkPolicyDecision,
} from "./browserControlledNetworkPolicy.js";
import {
  runBrowserControlledNetworkExecutor,
} from "./browserControlledNetworkExecutor.js";
import {
  createBrowserControlledNetworkReceipt,
  type BrowserControlledNetworkReceipt,
} from "./browserControlledNetworkReceipt.js";
import type { BrowserPublicReadOnlyWebManifestLoadResult } from "./browserPublicReadOnlyWebManifest.js";
import {
  decideBrowserPublicReadOnlyWebPolicy,
  type BrowserPublicReadOnlyWebPolicyDecision,
} from "./browserPublicReadOnlyWebPolicy.js";
import {
  runBrowserPublicReadOnlyWebExecutor,
  type BrowserPublicReadOnlyHttpClient,
  type BrowserPublicReadOnlyWebExecutorResult,
} from "./browserPublicReadOnlyWebExecutor.js";
import {
  createBrowserPublicReadOnlyWebReceipt,
  type BrowserPublicReadOnlyWebReceipt,
} from "./browserPublicReadOnlyWebReceipt.js";

export interface BrowserExternalNetworkExecutionBridgeResult {
  readonly mode: BrowserExternalNetworkExecutionMode;
  readonly status: "blocked" | "ready-for-future-runner" | "simulated-handoff" | "controlled-network-executed" | "public-readonly-executed";
  readonly request: BrowserExecutionRequest;
  readonly intent: BrowserExternalNetworkIntent;
  readonly preflight: BrowserRuntimePreflight;
  readonly runner: BrowserExternalNetworkRunnerPolicyDecision;
  readonly handoffPolicy?: BrowserExternalNetworkHandoffPolicyDecision;
  readonly handoffReceipt?: BrowserExternalNetworkHandoffReceipt;
  readonly controlledNetworkPolicy?: BrowserControlledNetworkPolicyDecision;
  readonly controlledNetworkReceipt?: BrowserControlledNetworkReceipt;
  readonly publicReadOnlyPolicy?: BrowserPublicReadOnlyWebPolicyDecision;
  readonly publicReadOnlyExecutor?: BrowserPublicReadOnlyWebExecutorResult;
  readonly publicReadOnlyReceipt?: BrowserPublicReadOnlyWebReceipt;
  readonly runnerManifestStatus: "missing" | "valid" | "invalid";
  readonly controlledRunnerManifestStatus: "missing" | "valid" | "invalid";
  readonly receipt: BrowserExternalNetworkExecutionReceipt;
  readonly executed: boolean;
  readonly evidence: readonly string[];
}

export function runBrowserExternalNetworkExecutionBridge(input: {
  readonly request: BrowserExecutionRequest;
  readonly sandboxAuthority?: BrowserSandboxAuthority;
  readonly networkAllowlist?: BrowserNetworkAllowlist;
  readonly confirmations?: readonly BrowserExecutionConfirmationRecord[];
  readonly runnerMode?: BrowserExternalNetworkRunnerMode;
  readonly runnerManifest?: BrowserExternalNetworkRunnerManifestLoadResult;
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
  const handoffPolicy = decideBrowserExternalNetworkHandoffPolicy({
    request: input.request,
    intent,
    preflight,
    manifest: input.runnerManifest?.status === "valid" ? input.runnerManifest.manifest : undefined,
    manifestValid: input.runnerManifest?.status !== "invalid",
  });
  const handoffRequest = handoffPolicy.allowed && input.runnerManifest?.status === "valid"
    ? createBrowserExternalNetworkHandoffRequest({
        request: input.request,
        targetOrigin: intent.normalizedOrigin,
        safeUrlSummary: intent.rawTargetSummary,
        allowlistStatus: preflight.networkDecision.status,
        confirmationStatus: preflight.confirmationDecision.status,
        sandboxStatus: preflight.sandboxDecision.status,
        preflightStatus: gatesReady ? "pass" : preflight.preflightStatus,
        runnerMode: input.runnerManifest.manifest.runnerMode,
        outputBudgetBytes: input.runnerManifest.manifest.outputBudgetBytes,
      })
    : undefined;
  const handoffExecutor = handoffRequest
    ? runBrowserExternalNetworkHandoffExecutor({ request: handoffRequest })
    : undefined;
  const handoffReceipt = handoffExecutor
    ? createBrowserExternalNetworkHandoffReceipt({
        policy: handoffPolicy,
        executor: handoffExecutor,
      })
    : undefined;
  const receipt = createBrowserExternalNetworkExecutionReceipt({
    request: input.request,
    intent,
    preflight: gatesReady ? { ...preflight, blockers: [] } : preflight,
    runner,
    handoffStatus: handoffPolicy.status,
    handoffReceiptId: handoffReceipt?.receiptId,
    manifestStatus: input.runnerManifest?.status ?? "missing",
  });
  const mode = modeFor({ preflight, runner });
  const status = handoffReceipt ? "simulated-handoff" : receipt.readinessStatus;
  return {
    mode,
    status,
    request: input.request,
    intent,
    preflight,
    runner,
    handoffPolicy,
    handoffReceipt,
    runnerManifestStatus: input.runnerManifest?.status ?? "missing",
    controlledRunnerManifestStatus: "missing",
    receipt,
    executed: false,
    evidence: [
      ...receipt.evidence,
      ...handoffPolicy.evidence,
      ...(handoffReceipt?.evidence ?? []),
      ...(input.runnerManifest?.evidence ?? []),
      `browser-external-network-bridge:mode:${mode}`,
      `browser-external-network-bridge:runner-manifest:${input.runnerManifest?.status ?? "missing"}`,
      "browser-external-network-bridge:controlled-runner-manifest:missing",
      "browser-external-network-bridge:no-browser-launch",
      "browser-external-network-bridge:no-network-call",
      "browser-external-network-bridge:no-mcp-launch",
    ],
  };
}

export async function runBrowserExternalNetworkExecutionBridgeWithControlledNetwork(input: {
  readonly request: BrowserExecutionRequest;
  readonly sandboxAuthority?: BrowserSandboxAuthority;
  readonly networkAllowlist?: BrowserNetworkAllowlist;
  readonly confirmations?: readonly BrowserExecutionConfirmationRecord[];
  readonly runnerMode?: BrowserExternalNetworkRunnerMode;
  readonly runnerManifest?: BrowserExternalNetworkRunnerManifestLoadResult;
  readonly controlledRunnerManifest?: BrowserControlledNetworkRunnerManifestLoadResult;
  readonly publicReadOnlyWebManifest?: BrowserPublicReadOnlyWebManifestLoadResult;
  readonly publicReadOnlyHttpClient?: BrowserPublicReadOnlyHttpClient;
}): Promise<BrowserExternalNetworkExecutionBridgeResult> {
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
  const handoffPolicy = decideBrowserExternalNetworkHandoffPolicy({
    request: input.request,
    intent,
    preflight,
    manifest: input.runnerManifest?.status === "valid" ? input.runnerManifest.manifest : undefined,
    manifestValid: input.runnerManifest?.status !== "invalid",
  });
  const handoffRequest = handoffPolicy.allowed && input.runnerManifest?.status === "valid"
    ? createBrowserExternalNetworkHandoffRequest({
        request: input.request,
        targetOrigin: intent.normalizedOrigin,
        safeUrlSummary: intent.rawTargetSummary,
        allowlistStatus: preflight.networkDecision.status,
        confirmationStatus: preflight.confirmationDecision.status,
        sandboxStatus: preflight.sandboxDecision.status,
        preflightStatus: gatesReady ? "pass" : preflight.preflightStatus,
        runnerMode: input.runnerManifest.manifest.runnerMode,
        outputBudgetBytes: input.runnerManifest.manifest.outputBudgetBytes,
      })
    : undefined;
  const handoffExecutor = handoffRequest
    ? runBrowserExternalNetworkHandoffExecutor({ request: handoffRequest })
    : undefined;
  const handoffReceipt = handoffExecutor
    ? createBrowserExternalNetworkHandoffReceipt({
        policy: handoffPolicy,
        executor: handoffExecutor,
      })
    : undefined;
  const controlledNetworkPolicy = decideBrowserControlledNetworkPolicy({
    request: input.request,
    intent,
    preflight,
    manifest: input.controlledRunnerManifest?.status === "valid"
      ? input.controlledRunnerManifest.manifest
      : undefined,
    manifestStatus: input.controlledRunnerManifest?.status ?? "missing",
  });
  const controlledNetworkExecutor = controlledNetworkPolicy.allowed && input.controlledRunnerManifest?.status === "valid"
    ? await runBrowserControlledNetworkExecutor({
        request: input.request,
        policy: controlledNetworkPolicy,
        manifest: input.controlledRunnerManifest.manifest,
      })
    : undefined;
  const controlledNetworkReceipt = controlledNetworkExecutor && input.controlledRunnerManifest?.status === "valid"
    ? createBrowserControlledNetworkReceipt({
        request: input.request,
        manifest: input.controlledRunnerManifest.manifest,
        policy: controlledNetworkPolicy,
        executor: controlledNetworkExecutor,
      })
    : undefined;
  const publicReadOnlyPolicy = shouldTryPublicReadOnly(input.request, controlledNetworkReceipt)
    ? decideBrowserPublicReadOnlyWebPolicy({
        request: input.request,
        manifestLoad: input.publicReadOnlyWebManifest,
        confirmations: input.confirmations,
        clientAvailable: true,
      })
    : undefined;
  const publicReadOnlyExecutor = publicReadOnlyPolicy?.allowed && input.publicReadOnlyWebManifest?.status === "valid"
    ? await runBrowserPublicReadOnlyWebExecutor({
        request: input.request,
        policy: publicReadOnlyPolicy,
        manifest: input.publicReadOnlyWebManifest.manifest,
        httpClient: input.publicReadOnlyHttpClient,
      })
    : publicReadOnlyPolicy && input.publicReadOnlyWebManifest?.status === "valid"
      ? await runBrowserPublicReadOnlyWebExecutor({
          request: input.request,
          policy: publicReadOnlyPolicy,
          manifest: input.publicReadOnlyWebManifest.manifest,
          httpClient: input.publicReadOnlyHttpClient,
        })
      : undefined;
  const publicReadOnlyReceipt = publicReadOnlyPolicy && publicReadOnlyExecutor && input.publicReadOnlyWebManifest?.status === "valid"
    ? createBrowserPublicReadOnlyWebReceipt({
        request: input.request,
        manifest: input.publicReadOnlyWebManifest.manifest,
        policy: publicReadOnlyPolicy,
        executor: publicReadOnlyExecutor,
      })
    : undefined;
  const receipt = createBrowserExternalNetworkExecutionReceipt({
    request: input.request,
    intent,
    preflight: gatesReady ? { ...preflight, blockers: [] } : preflight,
    runner,
    handoffStatus: handoffPolicy.status,
    handoffReceiptId: handoffReceipt?.receiptId,
    controlledNetworkStatus: controlledNetworkPolicy.status,
    controlledNetworkReceiptId: controlledNetworkReceipt?.receiptId,
    manifestStatus: input.runnerManifest?.status ?? "missing",
    controlledManifestStatus: input.controlledRunnerManifest?.status ?? "missing",
  });
  const mode = modeFor({ preflight, runner });
  const status = controlledNetworkReceipt?.executed
    ? "controlled-network-executed"
    : publicReadOnlyReceipt?.executed
      ? "public-readonly-executed"
    : handoffReceipt
      ? "simulated-handoff"
    : receipt.readinessStatus;
  return {
    mode,
    status,
    request: input.request,
    intent,
    preflight,
    runner,
    handoffPolicy,
    handoffReceipt,
    controlledNetworkPolicy,
    controlledNetworkReceipt,
    publicReadOnlyPolicy,
    publicReadOnlyExecutor,
    publicReadOnlyReceipt,
    runnerManifestStatus: input.runnerManifest?.status ?? "missing",
    controlledRunnerManifestStatus: input.controlledRunnerManifest?.status ?? "missing",
    receipt,
    executed: publicReadOnlyReceipt?.executed ?? false,
    evidence: [
      ...receipt.evidence,
      ...handoffPolicy.evidence,
      ...(handoffReceipt?.evidence ?? []),
      ...controlledNetworkPolicy.evidence,
      ...(controlledNetworkReceipt?.evidence ?? []),
      ...(publicReadOnlyPolicy?.evidence ?? []),
      ...(publicReadOnlyReceipt?.evidence ?? []),
      ...(input.runnerManifest?.evidence ?? []),
      ...(input.controlledRunnerManifest?.evidence ?? []),
      ...(input.publicReadOnlyWebManifest?.evidence ?? []),
      `browser-external-network-bridge:mode:${mode}`,
      `browser-external-network-bridge:runner-manifest:${input.runnerManifest?.status ?? "missing"}`,
      `browser-external-network-bridge:controlled-runner-manifest:${input.controlledRunnerManifest?.status ?? "missing"}`,
      "browser-external-network-bridge:no-browser-launch",
      controlledNetworkReceipt?.executed
        ? "browser-external-network-bridge:controlled-loopback-request"
        : publicReadOnlyReceipt?.executed
          ? "browser-external-network-bridge:public-readonly-request"
        : "browser-external-network-bridge:no-network-call",
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

function shouldTryPublicReadOnly(
  request: BrowserExecutionRequest,
  controlledNetworkReceipt: BrowserControlledNetworkReceipt | undefined,
): boolean {
  if (controlledNetworkReceipt?.executed) {
    return false;
  }
  const target = request.action.url ?? request.action.target ?? request.action.extractionGoal;
  return !!target && target.startsWith("https://");
}
