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
import { redactBrowserExecutionEvidence } from "./browserExecutionEvidenceRedactor.js";

export interface BrowserPlaywrightCliExecutorPlan {
  readonly runtime: "playwright-cli";
  readonly status: "unavailable" | "local-fixture-ready";
  readonly reason: string;
  readonly evidence: readonly string[];
}

export function createBrowserPlaywrightCliExecutorPlan(input: {
  readonly hasProcessRunner?: boolean;
  readonly fixture?: BrowserLocalFixture;
} = {}): BrowserPlaywrightCliExecutorPlan {
  if (!input.hasProcessRunner) {
    return {
      runtime: "playwright-cli",
      status: "unavailable",
      reason: "No explicit Playwright CLI process runner was injected.",
      evidence: [
        "browser-playwright-cli-executor:unavailable",
        "browser-playwright-cli-executor:no-process-spawn",
        "browser-playwright-cli-executor:no-mcp-launch",
      ],
    };
  }
  return {
    runtime: "playwright-cli",
    status: "local-fixture-ready",
    reason: `Local fixture ${input.fixture?.fixtureId ?? "not-supplied"} can be used by an injected runner.`,
    evidence: [
      "browser-playwright-cli-executor:local-fixture-ready",
      "browser-playwright-cli-executor:non-default",
      "browser-playwright-cli-executor:no-external-network",
    ],
  };
}

export class BrowserPlaywrightCliLocalFixtureExecutor implements BrowserExecutor {
  readonly kind = "local-fixture" as const;
  readonly fixture: BrowserLocalFixture;
  readonly authority: BrowserLocalExecutionAuthority;

  constructor(input: {
    readonly fixture?: BrowserLocalFixture;
    readonly authority?: BrowserLocalExecutionAuthority;
  } = {}) {
    this.fixture = input.fixture ?? createBrowserLocalFixture();
    this.authority =
      input.authority ??
      createBrowserLocalExecutionAuthority({
        mode: "local-fixture",
        allowedFixtureIds: [this.fixture.fixtureId],
      });
  }

  execute(
    request: BrowserExecutionRequest,
    context: BrowserExecutorContext = {},
  ): BrowserExecutorResult {
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
    const timestamp = context.now?.() ?? "2026-05-17T00:00:00.000Z";
    const evidence = redactBrowserExecutionEvidence({
      actionId: request.requestId,
      executionMode: "local-fixture",
      runtimeName: "playwright-cli local fixture executor",
      target: this.fixture.fixtureId,
      safeTitle: this.fixture.safeTitle,
      safeUrl: this.fixture.safeUrl,
      safeSummary: summaryForAction(request, this.fixture),
      actionTrace: [
        `fixture:${this.fixture.fixtureId}`,
        `action:${request.actionKind}`,
        `timestamp:${timestamp}`,
      ],
      warnings: this.fixture.warnings,
      executed: true,
    });
    return {
      status: "executed",
      executorKind: this.kind,
      executed: true,
      runtime: "playwright-cli local fixture executor",
      evidence: [
        { label: "request id", value: request.requestId },
        { label: "action", value: request.actionKind },
        { label: "execution mode", value: evidence.executionMode },
        { label: "fixture id", value: this.fixture.fixtureId },
        { label: "safe title", value: evidence.safeTitle },
        { label: "safe url", value: evidence.safeUrl },
        { label: "safe summary", value: evidence.safeSummary },
        { label: "action trace", value: evidence.actionTraceSummary },
        ...evidence.redactions.map((value) => ({ label: "redaction", value })),
      ],
      warnings: [
        "local fixture executor; no external network or persistent browser session",
        ...evidence.warnings,
      ],
      rawContent: "excluded",
      providerCall: "none",
      modelCall: "none",
      browserSessionPersistence: "none",
    };
  }
}

function summaryForAction(
  request: BrowserExecutionRequest,
  fixture: BrowserLocalFixture,
): string {
  if (request.actionKind === "extract") {
    return `Extraction summary: ${fixture.safeTextSummary}`;
  }
  if (request.actionKind === "observe") {
    return `Accessibility summary: ${fixture.safeTextSummary}`;
  }
  return `Local navigation summary: ${fixture.safeTextSummary}`;
}
