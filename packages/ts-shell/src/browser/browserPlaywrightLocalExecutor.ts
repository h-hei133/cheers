import {
  blockedBrowserExecutorResult,
  type BrowserExecutor,
  type BrowserExecutorContext,
  type BrowserExecutorResult,
} from "./browserExecutor.js";
import type { BrowserExecutionRequest } from "./browserExecutionContract.js";
import {
  createBrowserLocalExecutionAuthority,
  decideBrowserLocalExecutionAuthority,
  type BrowserLocalExecutionAuthority,
} from "./browserLocalExecutionAuthority.js";
import {
  createBrowserLocalFixture,
  type BrowserLocalFixture,
} from "./browserLocalFixture.js";
import {
  runBrowserPlaywrightLifecycle,
  type BrowserPlaywrightLocalRunner,
} from "./browserPlaywrightLifecycle.js";
import type { BrowserPlaywrightAvailabilityChecker } from "./browserPlaywrightAvailability.js";

export class BrowserPlaywrightLocalExecutor implements BrowserExecutor {
  readonly kind = "playwright-local" as const;
  readonly fixture: BrowserLocalFixture;
  readonly authority: BrowserLocalExecutionAuthority;
  readonly availabilityChecker?: BrowserPlaywrightAvailabilityChecker;
  readonly runner?: BrowserPlaywrightLocalRunner;

  constructor(input: {
    readonly fixture?: BrowserLocalFixture;
    readonly authority?: BrowserLocalExecutionAuthority;
    readonly availabilityChecker?: BrowserPlaywrightAvailabilityChecker;
    readonly runner?: BrowserPlaywrightLocalRunner;
  } = {}) {
    this.fixture = input.fixture ?? createBrowserLocalFixture();
    this.authority =
      input.authority ??
      createBrowserLocalExecutionAuthority({
        mode: "local-fixture",
        allowedFixtureIds: [this.fixture.fixtureId],
      });
    this.availabilityChecker = input.availabilityChecker;
    this.runner = input.runner;
  }

  async execute(
    request: BrowserExecutionRequest,
    context: BrowserExecutorContext = {},
  ): Promise<BrowserExecutorResult> {
    if (request.actionKind === "navigate" && !request.action.url?.startsWith("local-fixture://")) {
      return blockedBrowserExecutorResult({
        request,
        code: "blocked-external-url",
        message: "Playwright local execution only accepts local-fixture:// navigation targets.",
      });
    }
    const decision = decideBrowserLocalExecutionAuthority({
      request,
      authority: this.authority,
      executorKind: this.kind,
      fixture: this.fixture,
    });
    if (!decision.allowed) {
      return blockedBrowserExecutorResult({
        request,
        code: decision.status,
        message: decision.reason,
      });
    }
    const lifecycle = await runBrowserPlaywrightLifecycle({
      request,
      fixture: this.fixture,
      availabilityChecker: this.availabilityChecker,
      runner: this.runner,
      now: context.now,
    });
    const evidence = lifecycle.evidence;
    return {
      status: lifecycle.status === "executed"
        ? "executed"
        : lifecycle.status === "failed"
          ? "failed"
          : "skipped",
      executorKind: this.kind,
      executed: lifecycle.executed,
      runtime: lifecycle.availability.status === "available"
        ? `playwright-local ${lifecycle.availability.runtimeKind}`
        : "playwright-local unavailable",
      evidence: [
        { label: "request id", value: request.requestId },
        { label: "runtime kind", value: lifecycle.availability.runtimeKind },
        { label: "availability", value: lifecycle.availability.status },
        { label: "execution mode", value: evidence.mode },
        { label: "fixture id", value: evidence.fixtureId },
        { label: "safe title", value: evidence.safeTitle },
        { label: "safe url", value: evidence.safeUrl },
        { label: "safe observation", value: evidence.safeObservationSummary },
        { label: "safe extraction", value: evidence.safeExtractionSummary },
        { label: "action trace", value: evidence.actionTraceSummary },
        { label: "stdout summary", value: evidence.stdoutSummary },
        { label: "stderr summary", value: evidence.stderrSummary },
        { label: "cleanup", value: lifecycle.cleanupStatus },
        ...evidence.redactions.map((value) => ({ label: "redaction", value })),
      ],
      warnings: [
        "playwright-local executor; local fixture only, no external network or persistent browser session",
        ...lifecycle.availability.warnings,
        ...lifecycle.warnings,
        ...evidence.warnings,
      ],
      error: lifecycle.executed
        ? undefined
        : {
            code: lifecycle.status,
            message: lifecycle.reason,
          },
      rawContent: "excluded",
      providerCall: "none",
      modelCall: "none",
      browserSessionPersistence: "none",
    };
  }
}
