import type { BrowserExecutionRequest } from "./executionContract.js";
import type { BrowserLocalFixture } from "./localFixture.js";
import {
  resolveBrowserPlaywrightAvailability,
  type BrowserPlaywrightAvailability,
  type BrowserPlaywrightAvailabilityChecker,
} from "./playwrightAvailability.js";
import {
  buildBrowserPlaywrightLocalEvidence,
  type BrowserPlaywrightLocalEvidence,
} from "./playwrightLocalEvidence.js";

export interface BrowserPlaywrightLocalRunnerResult {
  /** Supplied by the resource owner after its close operation has settled. */
  readonly cleanupStatus?: "closed" | "not-started" | "unknown";
  readonly actionApplied?: boolean | null;
  readonly safeTitle?: string;
  readonly safeUrl?: string;
  readonly safeObservationSummary?: string;
  readonly safeExtractionSummary?: string;
  readonly actionTrace?: readonly string[];
  readonly stdout?: string;
  readonly stderr?: string;
  readonly warnings?: readonly string[];
}

export type BrowserPlaywrightLocalRunner =
  (input: {
    readonly request: BrowserExecutionRequest;
    readonly fixture: BrowserLocalFixture;
    readonly availability: BrowserPlaywrightAvailability;
    readonly signal?: AbortSignal;
  }) => BrowserPlaywrightLocalRunnerResult | Promise<BrowserPlaywrightLocalRunnerResult>;

export type BrowserPlaywrightLifecycleStatus =
  | "executed"
  | "unavailable"
  | "failed"
  | "cancelled";

export interface BrowserPlaywrightLifecycleResult {
  readonly status: BrowserPlaywrightLifecycleStatus;
  readonly executed: boolean;
  readonly availability: BrowserPlaywrightAvailability;
  readonly evidence: BrowserPlaywrightLocalEvidence;
  readonly cleanupStatus: "closed" | "not-started" | "unknown";
  readonly actionApplied: boolean | null;
  readonly reason: string;
  readonly nextAction: string;
  readonly warnings: readonly string[];
}

export async function runBrowserPlaywrightLifecycle(input: {
  readonly request: BrowserExecutionRequest;
  readonly fixture: BrowserLocalFixture;
  readonly availabilityChecker?: BrowserPlaywrightAvailabilityChecker;
  readonly runner?: BrowserPlaywrightLocalRunner;
  readonly now?: () => string;
  readonly signal?: AbortSignal;
}): Promise<BrowserPlaywrightLifecycleResult> {
  const availability = await resolveBrowserPlaywrightAvailability({
    checker: input.signal?.aborted ? undefined : input.availabilityChecker,
  });
  if (input.signal?.aborted || availability.status !== "available" || !input.runner) {
    const reason = input.signal?.aborted ? "Playwright local execution cancelled before dispatch." : availability.status !== "available"
      ? availability.reason
      : "No explicit Playwright local runner was injected.";
    return {
      status: input.signal?.aborted ? "cancelled" : "unavailable",
      executed: false,
      availability,
      evidence: buildBrowserPlaywrightLocalEvidence({
        executionId: input.request.requestId,
        runtimeKind: availability.runtimeKind,
        mode: "unavailable",
        fixture: input.fixture,
        request: input.request,
        safeObservationSummary: reason,
        actionTrace: [
          `fixture:${input.fixture.fixtureId}`,
          "prepare:local-fixture",
          `availability:${availability.status}`,
          "cleanup:not-started",
        ],
        warnings: availability.warnings,
        executed: false,
      }),
      cleanupStatus: "not-started",
      actionApplied: false,
      reason,
      nextAction: availability.status !== "available"
        ? availability.nextAction
        : "Inject a deterministic local Playwright runner before enabling execution.",
      warnings: availability.warnings,
    };
  }
  try {
    const runnerResult = await input.runner({
      request: input.request,
      fixture: input.fixture,
      availability,
      signal: input.signal,
    });
    const cleanupStatus = runnerResult.cleanupStatus ?? "unknown";
    const executed = !input.signal?.aborted && cleanupStatus === "closed";
    const timestamp = input.now?.() ?? "2026-05-17T00:00:00.000Z";
    const trace = [
      `fixture:${input.fixture.fixtureId}`,
      `action:${input.request.actionKind}`,
      `runtime:${availability.runtimeKind}`,
      `timestamp:${timestamp}`,
      ...(runnerResult.actionTrace ?? []),
      `cleanup:${cleanupStatus}`,
    ];
    return {
      status: input.signal?.aborted ? "cancelled" : executed ? "executed" : "failed",
      executed,
      availability,
      evidence: buildBrowserPlaywrightLocalEvidence({
        executionId: input.request.requestId,
        runtimeKind: availability.runtimeKind,
        mode: "local-fixture",
        fixture: {
          ...input.fixture,
          safeTitle: runnerResult.safeTitle ?? input.fixture.safeTitle,
          safeUrl: runnerResult.safeUrl ?? input.fixture.safeUrl,
        },
        request: input.request,
        safeObservationSummary: runnerResult.safeObservationSummary ?? input.fixture.safeTextSummary,
        safeExtractionSummary: runnerResult.safeExtractionSummary,
        actionTrace: trace,
        stdout: runnerResult.stdout,
        stderr: runnerResult.stderr,
        warnings: runnerResult.warnings,
        executed,
      }),
      cleanupStatus,
      actionApplied: runnerResult.actionApplied === undefined ? null : runnerResult.actionApplied,
      reason: input.signal?.aborted ? "Playwright local execution cancelled; prior effects may remain." : executed
        ? "Playwright local fixture execution completed; the runner reported runtime closure."
        : "Playwright local runner settled without verified runtime closure.",
      nextAction: "Review sanitized local evidence; keep external network and persistence disabled.",
      warnings: [...(runnerResult.warnings ?? []), ...(cleanupStatus !== "closed" ? ["browser-playwright-lifecycle:cleanup-unverified"] : [])],
    };
  } catch {
    return {
      status: input.signal?.aborted ? "cancelled" : "failed",
      executed: false,
      availability,
      evidence: buildBrowserPlaywrightLocalEvidence({
        executionId: input.request.requestId,
        runtimeKind: availability.runtimeKind,
        mode: "blocked",
        fixture: input.fixture,
        request: input.request,
        safeObservationSummary: "Playwright local runner failed without exposing raw details.",
        actionTrace: [
          `fixture:${input.fixture.fixtureId}`,
          `action:${input.request.actionKind}`,
          "runner:failed",
          "cleanup:unknown",
        ],
        warnings: ["browser-playwright-lifecycle:runner-failed"],
        executed: false,
      }),
      cleanupStatus: "unknown",
      actionApplied: null,
      reason: "Playwright local runner failed without exposing raw details.",
      nextAction: "Keep execution blocked and inspect the injected runner in a focused test.",
      warnings: ["browser-playwright-lifecycle:runner-failed"],
    };
  }
}
