import {
  NOOP_BROWSER_EXECUTOR,
  blockedBrowserExecutorResult,
  browserExecutorIsAvailable,
  type BrowserExecutor,
} from "./browserExecutor.js";
import type { BrowserExecutionRequest } from "./browserExecutionContract.js";
import {
  renderBrowserCliExecutionBridgeSummary,
  type BrowserCliExecutionBridgeSummary,
} from "./browserCliExecutionBridge.js";
import {
  renderBrowserRuntimeAvailabilitySurface,
} from "./browserRuntimeAvailabilitySurface.js";
import type { BrowserExecutionConfirmationRecord } from "./browserExecutionConfirmation.js";
import { createBrowserExecutionResult } from "./browserExecutionResult.js";
import { renderBrowserExecutionSurface } from "./browserExecutionSurface.js";
import { renderBrowserExecutionReceiptSurface } from "./browserExecutionReceiptSurface.js";
import { renderBrowserExternalRunnerSurface } from "./browserExternalRunnerSurface.js";
import { renderBrowserExecutionLifecycleSurface } from "./browserExecutionLifecycleSurface.js";
import { decideBrowserExecutionPolicy } from "./browserExecutionPolicy.js";
import type { BrowserNetworkAllowlist } from "./browserNetworkAllowlist.js";
import { runBrowserRuntimePreflight } from "./browserRuntimePreflight.js";
import { renderBrowserSandboxSurface } from "./browserSandboxSurface.js";
import type { BrowserSandboxAuthority } from "./browserSandboxAuthority.js";
import { renderBrowserSkillRunnerSurface } from "./browserSkillRunnerSurface.js";
import {
  hasBrowserSkillExecutionEvidence,
  renderBrowserSkillExecutionSurface,
} from "./browserSkillExecutionSurface.js";
import type { BrowserActionCache } from "./browserActionCache.js";
import type { BrowserReceiptCacheStore } from "./browserReceiptCacheStore.js";

export interface BrowserExecutionCommandRunResult {
  readonly output: string;
  readonly evidence: readonly string[];
}

export async function runBrowserExecutionCommand(input: {
  readonly request: BrowserExecutionRequest;
  readonly executor?: BrowserExecutor;
  readonly sandboxAuthority?: BrowserSandboxAuthority;
  readonly networkAllowlist?: BrowserNetworkAllowlist;
  readonly confirmations?: readonly BrowserExecutionConfirmationRecord[];
  readonly cliExecutionBridgeSummary?: BrowserCliExecutionBridgeSummary;
  readonly actionCache?: BrowserActionCache;
  readonly receiptCacheStore?: BrowserReceiptCacheStore;
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
  const preflight = runBrowserRuntimePreflight({
    request,
    policy,
    executorKind: executor.kind,
    authority: input.sandboxAuthority,
    allowlist: input.networkAllowlist,
    confirmations: input.confirmations,
  });
  const executorResult = policy.allowed && ["pass", "warning"].includes(preflight.preflightStatus)
    ? await executor.execute(request, { now: input.now })
    : blockedBrowserExecutorResult({
        request,
        code: preflight.preflightStatus === "pass" ? policy.status : `preflight-${preflight.preflightStatus}`,
        message: preflight.blockers[0] ?? policy.reason,
      });
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
            `- Cache write: ${persistentCacheResult?.written ? "yes" : "no"}`,
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
