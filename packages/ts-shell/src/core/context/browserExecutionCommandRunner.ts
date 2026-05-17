import {
  NOOP_BROWSER_EXECUTOR,
  blockedBrowserExecutorResult,
  browserExecutorIsAvailable,
  type BrowserExecutor,
} from "./browserExecutor.js";
import type { BrowserExecutionRequest } from "./browserExecutionContract.js";
import { createBrowserExecutionResult } from "./browserExecutionResult.js";
import { renderBrowserExecutionSurface } from "./browserExecutionSurface.js";
import { decideBrowserExecutionPolicy } from "./browserExecutionPolicy.js";

export interface BrowserExecutionCommandRunResult {
  readonly output: string;
  readonly evidence: readonly string[];
}

export async function runBrowserExecutionCommand(input: {
  readonly request: BrowserExecutionRequest;
  readonly executor?: BrowserExecutor;
  readonly now?: () => string;
}): Promise<BrowserExecutionCommandRunResult> {
  const executor = input.executor ?? NOOP_BROWSER_EXECUTOR;
  const request = {
    ...input.request,
    mode: executor.kind === "fake-test" ? "fake-test" : executor.kind === "explicit-local" ? "explicit-local" : input.request.mode,
  } as BrowserExecutionRequest;
  const policy = decideBrowserExecutionPolicy({
    request,
    executorAvailable: browserExecutorIsAvailable(executor),
  });
  const executorResult = policy.allowed
    ? await executor.execute(request, { now: input.now })
    : blockedBrowserExecutorResult({
        request,
        code: policy.status,
        message: policy.reason,
      });
  const result = createBrowserExecutionResult({
    request,
    policy,
    executorResult,
  });
  return {
    output: renderBrowserExecutionSurface(result),
    evidence: [
      ...result.evidence,
      "browser-execution-command-runner:non-default",
      "browser-execution-command-runner:no-mcp-launch",
      "browser-execution-command-runner:no-provider-or-model-call",
    ],
  };
}
