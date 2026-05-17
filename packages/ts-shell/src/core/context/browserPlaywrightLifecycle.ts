import type { BrowserExecutionRequest } from "./browserExecutionContract.js";
import type { BrowserLocalFixture } from "./browserLocalFixture.js";
import {
  resolveBrowserPlaywrightAvailability,
  type BrowserPlaywrightAvailability,
  type BrowserPlaywrightAvailabilityChecker,
} from "./browserPlaywrightAvailability.js";
import {
  buildBrowserPlaywrightLocalEvidence,
  type BrowserPlaywrightLocalEvidence,
} from "./browserPlaywrightLocalEvidence.js";

export interface BrowserPlaywrightLocalRunnerResult {
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
  }) => BrowserPlaywrightLocalRunnerResult | Promise<BrowserPlaywrightLocalRunnerResult>;

export type BrowserPlaywrightLifecycleStatus =
  | "executed"
  | "unavailable"
  | "failed";

export interface BrowserPlaywrightLifecycleResult {
  readonly status: BrowserPlaywrightLifecycleStatus;
  readonly executed: boolean;
  readonly availability: BrowserPlaywrightAvailability;
  readonly evidence: BrowserPlaywrightLocalEvidence;
  readonly cleanupStatus: "closed" | "not-started" | "failed-safe";
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
}): Promise<BrowserPlaywrightLifecycleResult> {
  const availability = await resolveBrowserPlaywrightAvailability({
    checker: input.availabilityChecker,
  });
  if (availability.status !== "available" || !input.runner) {
    const reason = availability.status !== "available"
      ? availability.reason
      : "No explicit Playwright local runner was injected.";
    return {
      status: "unavailable",
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
    });
    const timestamp = input.now?.() ?? "2026-05-17T00:00:00.000Z";
    const trace = [
      `fixture:${input.fixture.fixtureId}`,
      `action:${input.request.actionKind}`,
      `runtime:${availability.runtimeKind}`,
      `timestamp:${timestamp}`,
      ...(runnerResult.actionTrace ?? []),
      "cleanup:closed",
    ];
    return {
      status: "executed",
      executed: true,
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
        executed: true,
      }),
      cleanupStatus: "closed",
      reason: "Playwright local fixture execution completed and closed the runtime.",
      nextAction: "Review sanitized local evidence; keep external network and persistence disabled.",
      warnings: runnerResult.warnings ?? [],
    };
  } catch {
    return {
      status: "failed",
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
          "cleanup:failed-safe",
        ],
        warnings: ["browser-playwright-lifecycle:runner-failed"],
        executed: false,
      }),
      cleanupStatus: "failed-safe",
      reason: "Playwright local runner failed without exposing raw details.",
      nextAction: "Keep execution blocked and inspect the injected runner in a focused test.",
      warnings: ["browser-playwright-lifecycle:runner-failed"],
    };
  }
}
