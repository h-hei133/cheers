import {
  NOOP_BROWSER_EXECUTOR,
  blockedBrowserExecutorResult,
  browserExecutorIsAvailable,
  type BrowserExecutor,
} from "./browserExecutor.js";
import type { BrowserExecutionRequest } from "./browserExecutionContract.js";
import type { BrowserExecutionConfirmationRecord } from "./browserExecutionConfirmation.js";
import { createBrowserExecutionResult } from "./browserExecutionResult.js";
import { renderBrowserExecutionSurface } from "./browserExecutionSurface.js";
import { renderBrowserExecutionLifecycleSurface } from "./browserExecutionLifecycleSurface.js";
import { decideBrowserExecutionPolicy } from "./browserExecutionPolicy.js";
import type { BrowserNetworkAllowlist } from "./browserNetworkAllowlist.js";
import { runBrowserRuntimePreflight } from "./browserRuntimePreflight.js";
import { renderBrowserSandboxSurface } from "./browserSandboxSurface.js";
import type { BrowserSandboxAuthority } from "./browserSandboxAuthority.js";

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
          : executor.kind === "explicit-local"
            ? "explicit-local"
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
  const result = createBrowserExecutionResult({
    request,
    policy,
    executorResult,
  });
  return {
    output: [
      renderBrowserExecutionSurface(result),
      "",
      renderBrowserSandboxSurface(preflight, result.executed),
      "",
      renderBrowserExecutionLifecycleSurface({ result, preflight }),
    ].join("\n"),
    evidence: [
      ...result.evidence,
      ...preflight.evidence,
      "browser-execution-command-runner:non-default",
      "browser-execution-command-runner:no-mcp-launch",
      "browser-execution-command-runner:no-provider-or-model-call",
    ],
  };
}
