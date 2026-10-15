import {
  NOOP_BROWSER_EXECUTOR,
  blockedBrowserExecutorResult,
  cancelledBrowserExecutorResult,
  browserExecutorIsAvailable,
  type BrowserExecutor,
} from "./executor.js";
import type { BrowserExecutionRequest } from "./executionContract.js";
import {
  renderBrowserCliExecutionBridgeSummary,
  type BrowserCliExecutionBridgeSummary,
} from "./cliExecutionBridge.js";
import {
  renderBrowserRuntimeAvailabilitySurface,
} from "./runtime/core/availabilitySurface.js";
import type { BrowserExecutionConfirmationRecord } from "./executionConfirmation.js";
import { createBrowserExecutionResult } from "./executionResult.js";
import { renderBrowserExecutionSurface } from "./executionSurface.js";
import { renderBrowserExecutionReceiptSurface } from "./executionReceiptSurface.js";
import { renderBrowserExternalRunnerSurface } from "./runtime/external/surface.js";
import { renderBrowserExecutionLifecycleSurface } from "./executionLifecycleSurface.js";
import { decideBrowserExecutionPolicy } from "./executionPolicy.js";
import type { BrowserNetworkAllowlist } from "./networkAllowlist.js";
import { runBrowserRuntimePreflight } from "./runtime/core/preflight.js";
import { renderBrowserSandboxSurface } from "./sandboxSurface.js";
import type { BrowserSandboxAuthority } from "./sandboxAuthority.js";
import { renderBrowserSkillRunnerSurface } from "./skill/runner/surface.js";
import {
  hasBrowserSkillExecutionEvidence,
  renderBrowserSkillExecutionSurface,
} from "./skill/execution/surface.js";
import type { BrowserActionCache } from "./actionCache.js";
import type { BrowserReceiptCacheStore } from "./receipt/store.js";
import {
  isExternalNetworkExecutionRequest,
} from "./externalNetworkExecutionMode.js";
import {
  runBrowserExternalNetworkExecutionBridgeWithControlledNetwork,
} from "./externalNetworkExecutionBridge.js";
import {
  renderBrowserExternalNetworkExecutionSurface,
} from "./externalNetworkExecutionSurface.js";
import type { BrowserExternalNetworkRunnerMode } from "./externalNetworkRunnerPolicy.js";
import type { BrowserExternalNetworkRunnerManifestLoadResult } from "./externalNetworkRunnerManifest.js";
import type { BrowserControlledNetworkRunnerManifestLoadResult } from "./controlledNetworkRunnerManifest.js";
import type { BrowserPublicReadOnlyWebManifestLoadResult } from "./publicReadOnlyWebManifest.js";
import type { BrowserPublicReadOnlyHttpClient } from "./publicReadOnlyWebExecutor.js";

export interface BrowserExecutionCommandRunResult {
  readonly output: string;
  readonly evidence: readonly string[];
}

export async function runBrowserExecutionCommand(input: {
  readonly signal?: AbortSignal;
  readonly request: BrowserExecutionRequest;
  readonly executor?: BrowserExecutor;
  readonly sandboxAuthority?: BrowserSandboxAuthority;
  readonly networkAllowlist?: BrowserNetworkAllowlist;
  readonly confirmations?: readonly BrowserExecutionConfirmationRecord[];
  readonly cliExecutionBridgeSummary?: BrowserCliExecutionBridgeSummary;
  readonly actionCache?: BrowserActionCache;
  readonly receiptCacheStore?: BrowserReceiptCacheStore;
  readonly externalNetworkRunnerMode?: BrowserExternalNetworkRunnerMode;
  readonly externalNetworkRunnerManifest?: BrowserExternalNetworkRunnerManifestLoadResult;
  readonly controlledNetworkRunnerManifest?: BrowserControlledNetworkRunnerManifestLoadResult;
  readonly publicReadOnlyWebManifest?: BrowserPublicReadOnlyWebManifestLoadResult;
  readonly publicReadOnlyHttpClient?: BrowserPublicReadOnlyHttpClient;
  readonly now?: () => string;
}): Promise<BrowserExecutionCommandRunResult> {
  const executor = input.executor ?? NOOP_BROWSER_EXECUTOR;
  const request = {
    ...input.request,
    mode:
      executor.kind === "fake-test"
        ? "fake-test"
        : executor.kind === "local-fixture"
          ? "local-fixture"
          : executor.kind === "playwright-local"
            ? "playwright-local"
          : executor.kind === "explicit-local"
            ? "explicit-local"
          : executor.kind === "external-runner"
            ? "test-local"
            : executor.kind === "skill-runner"
              ? "skill-managed"
            : input.request.mode,
  } as BrowserExecutionRequest;
  const policy = decideBrowserExecutionPolicy({
    request,
    executorAvailable: browserExecutorIsAvailable(executor),
  });
  if (isExternalNetworkExecutionRequest(request) && executor.kind === "noop") {
    const bridge = await runBrowserExternalNetworkExecutionBridgeWithControlledNetwork({
      signal: input.signal,
      request,
      sandboxAuthority: input.sandboxAuthority,
      networkAllowlist: input.networkAllowlist,
      confirmations: input.confirmations,
      runnerMode: input.externalNetworkRunnerMode,
      runnerManifest: input.externalNetworkRunnerManifest,
      controlledRunnerManifest: input.controlledNetworkRunnerManifest,
      publicReadOnlyWebManifest: input.publicReadOnlyWebManifest,
      publicReadOnlyHttpClient: input.publicReadOnlyHttpClient,
    });
    return {
      output: [
        renderBrowserExternalNetworkExecutionSurface(bridge),
        "",
        renderBrowserCliExecutionBridgeSummary(input.cliExecutionBridgeSummary),
      ].join("\n"),
      evidence: [
        ...bridge.evidence,
        ...(input.cliExecutionBridgeSummary?.evidence ?? []),
        "browser-execution-command-runner:external-network-bridge",
        ...(bridge.publicReadOnlyReceipt?.executed
          ? ["browser-execution-command-runner:public-readonly-web-executed"]
          : []),
        "browser-execution-command-runner:no-browser-launch",
        bridge.publicReadOnlyReceipt?.publicNetwork === true
          ? "browser-execution-command-runner:public-network-explicit"
          : bridge.publicReadOnlyReceipt?.publicNetwork === null
            ? "browser-execution-command-runner:network-outcome-unknown"
            : bridge.controlledNetworkReceipt?.networkUsed === true
              ? "browser-execution-command-runner:controlled-loopback-request"
              : bridge.controlledNetworkReceipt?.networkUsed === null
                ? "browser-execution-command-runner:network-outcome-unknown"
                : "browser-execution-command-runner:no-network-call",
        "browser-execution-command-runner:no-mcp-launch",
        "browser-execution-command-runner:no-provider-or-model-call",
      ],
    };
  }
  const preflight = runBrowserRuntimePreflight({
    request,
    policy,
    executorKind: executor.kind,
    authority: input.sandboxAuthority,
    allowlist: input.networkAllowlist,
    confirmations: input.confirmations,
  });
  const settledResult = input.signal?.aborted ? cancelledBrowserExecutorResult(request, executor.kind) : policy.allowed && ["pass", "warning"].includes(preflight.preflightStatus)
    ? await executor.execute(request, { now: input.now, signal: input.signal })
    : blockedBrowserExecutorResult({
        request,
        code: preflight.preflightStatus === "pass" ? policy.status : `preflight-${preflight.preflightStatus}`,
        message: preflight.blockers[0] ?? policy.reason,
      });
  const executorResult = input.signal?.aborted && settledResult.status !== "cancelled"
    ? { ...settledResult, status: "cancelled" as const, executed: false,
        evidence: [...settledResult.evidence, { label: "action outcome", value: "cancellation does not roll back prior effects" }] }
    : settledResult;
  const receiptExecutorResult = {
    ...executorResult,
    evidence: [
      ...executorResult.evidence,
      { label: "sandbox decision", value: `${preflight.sandboxDecision.authority.mode}:${preflight.sandboxDecision.status}` },
      { label: "allowlist decision", value: `network:${preflight.networkDecision.status}` },
      { label: "confirmation decision", value: `${preflight.confirmationDecision.kind}:${preflight.confirmationDecision.status}` },
    ],
  };
  const result = createBrowserExecutionResult({
    request,
    policy,
    executorResult: receiptExecutorResult,
    skillRunnerMetadata: input.cliExecutionBridgeSummary?.skillRunnerMetadata,
    skillRunnerReadiness: input.cliExecutionBridgeSummary?.skillRunnerReadiness,
    now: input.now,
  });
  const cacheResult = result.receipt.replayReadiness.status === "replay-ready"
    ? input.actionCache?.addReceipt(result.receipt)
    : undefined;
  const persistentCacheResult = result.receipt.replayReadiness.status === "replay-ready"
    ? input.receiptCacheStore?.writeReceipt(result.receipt)
    : undefined;
  return {
    output: [
      renderBrowserExecutionSurface(result),
      ...(executor.kind === "external-runner"
        ? ["", renderBrowserExternalRunnerSurface(result)]
        : []),
      ...(hasBrowserSkillExecutionEvidence(result)
        ? ["", renderBrowserSkillExecutionSurface(result)]
        : []),
      "",
      renderBrowserExecutionReceiptSurface(result.receipt),
      ...(input.cliExecutionBridgeSummary?.skillRunnerMetadata || input.cliExecutionBridgeSummary?.skillRunnerReadiness
        ? ["", renderBrowserSkillRunnerSurface({
            metadata: input.cliExecutionBridgeSummary.skillRunnerMetadata,
            readiness: input.cliExecutionBridgeSummary.skillRunnerReadiness,
            fallbackReason: input.cliExecutionBridgeSummary.reason,
          })]
        : []),
      "",
      renderBrowserSandboxSurface(preflight, result.executed),
      "",
      renderBrowserExecutionLifecycleSurface({ result, preflight }),
      "",
      renderBrowserRuntimeAvailabilitySurface({
        availability: availabilityFromExecutorResult(executorResult),
        currentMode: request.mode,
        nextAction: executorResult.error?.message,
      }),
      "",
      renderBrowserCliExecutionBridgeSummary(input.cliExecutionBridgeSummary),
      ...(input.actionCache
        ? [
            "",
            "Browser action cache",
            `- Cache write: ${cacheResult?.ok ? "yes" : "no"}`,
            `- Cache status: ${result.receipt.replayReadiness.status}`,
            "- Persistence: none",
            "- Automatic replay: no",
          ]
        : []),
      ...(input.receiptCacheStore
        ? [
            "",
            "Browser receipt cache",
            `- Cache write: ${persistentCacheResult?.outcome ?? "not-run"}`,
            `- Lock cleanup: ${persistentCacheResult?.cleanup ?? "not-acquired"}`,
            `- Blockers/warnings: ${[...(persistentCacheResult?.blockers ?? []), ...(persistentCacheResult?.warnings ?? [])].join("; ") || "none"}`,
            `- Cache status: ${persistentCacheResult?.record?.status ?? result.receipt.replayReadiness.status}`,
            `- Receipt id: ${persistentCacheResult?.record?.receiptId ?? result.receipt.receiptId}`,
            "- Persistence: explicit only",
            "- Raw evidence stored: no",
            "- Automatic replay: no",
          ]
        : []),
    ].join("\n"),
    evidence: [
      ...result.evidence,
      ...preflight.evidence,
      ...(input.cliExecutionBridgeSummary?.evidence ?? []),
      ...(cacheResult?.ok ? cacheResult.evidence : []),
      ...(persistentCacheResult?.evidence ?? []),
      "browser-execution-command-runner:non-default",
      "browser-execution-command-runner:no-mcp-launch",
      "browser-execution-command-runner:no-provider-or-model-call",
    ],
  };
}

function availabilityFromExecutorResult(
  result: Awaited<ReturnType<BrowserExecutor["execute"]>>,
): string {
  const availability = result.evidence.find((item) => item.label === "availability")?.value;
  if (availability) {
    return availability;
  }
  if (result.executorKind === "local-fixture" || result.executorKind === "fake-test") {
    return "not-required";
  }
  return result.executed ? "available" : "unavailable";
}
