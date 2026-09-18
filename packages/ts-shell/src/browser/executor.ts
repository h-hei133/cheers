import type { BrowserExecutionRequest } from "./executionContract.js";

export type BrowserExecutorKind =
  | "noop"
  | "fake-test"
  | "local-fixture"
  | "playwright-local"
  | "explicit-local"
  | "external-runner"
  | "skill-runner";
export type BrowserExecutorStatus = "executed" | "blocked" | "failed" | "skipped";

export interface BrowserExecutorContext {
  readonly now?: () => string;
}

export interface BrowserExecutorEvidence {
  readonly label: string;
  readonly value: string;
}

export interface BrowserExecutorError {
  readonly code: string;
  readonly message: string;
}

export interface BrowserExecutorResult {
  readonly status: BrowserExecutorStatus;
  readonly executorKind: BrowserExecutorKind;
  readonly executed: boolean;
  readonly runtime: string;
  readonly evidence: readonly BrowserExecutorEvidence[];
  readonly warnings: readonly string[];
  readonly error?: BrowserExecutorError;
  readonly rawContent: "excluded";
  readonly providerCall: "none";
  readonly modelCall: "none";
  readonly browserSessionPersistence: "none";
}

export interface BrowserExecutor {
  readonly kind: BrowserExecutorKind;
  execute(
    request: BrowserExecutionRequest,
    context?: BrowserExecutorContext,
  ): Promise<BrowserExecutorResult> | BrowserExecutorResult;
}

export const NOOP_BROWSER_EXECUTOR: BrowserExecutor = {
  kind: "noop",
  execute(request) {
    return blockedBrowserExecutorResult({
      request,
      code: "browser-executor-missing",
      message: "No explicit browser executor was injected.",
    });
  },
};

export class FakeBrowserExecutor implements BrowserExecutor {
  readonly kind = "fake-test" as const;

  execute(request: BrowserExecutionRequest, context: BrowserExecutorContext = {}): BrowserExecutorResult {
    const timestamp = context.now?.() ?? "2026-05-17T00:00:00.000Z";
    return {
      status: "executed",
      executorKind: this.kind,
      executed: true,
      runtime: "fake/test browser executor",
      evidence: [
        { label: "request id", value: request.requestId },
        { label: "action", value: request.actionKind },
        { label: "timestamp", value: timestamp },
        { label: "raw content", value: "excluded" },
      ],
      warnings: ["fake/test executor; no real browser launched"],
      rawContent: "excluded",
      providerCall: "none",
      modelCall: "none",
      browserSessionPersistence: "none",
    };
  }
}

export function browserExecutorIsAvailable(
  executor: BrowserExecutor | undefined,
): boolean {
  return !!executor && executor.kind !== "noop";
}

export function blockedBrowserExecutorResult(input: {
  readonly request: BrowserExecutionRequest;
  readonly code: string;
  readonly message: string;
}): BrowserExecutorResult {
  return {
    status: "blocked",
    executorKind: "noop",
    executed: false,
    runtime: "none",
    evidence: [
      { label: "request id", value: input.request.requestId },
      { label: "executor", value: "not injected" },
      { label: "raw content", value: "excluded" },
    ],
    warnings: [],
    error: {
      code: input.code,
      message: input.message,
    },
    rawContent: "excluded",
    providerCall: "none",
    modelCall: "none",
    browserSessionPersistence: "none",
  };
}
