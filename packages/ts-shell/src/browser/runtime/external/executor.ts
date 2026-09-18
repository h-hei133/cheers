import {
  blockedBrowserExecutorResult,
  type BrowserExecutor,
  type BrowserExecutorContext,
  type BrowserExecutorResult,
} from "../../../core/context/browserExecutor.js";
import type { BrowserExecutionRequest } from "../../../core/context/browserExecutionContract.js";
import {
  createBrowserLocalExecutionAuthority,
  decideBrowserLocalExecutionAuthority,
  type BrowserLocalExecutionAuthority,
} from "../../../core/context/browserLocalExecutionAuthority.js";
import type { BrowserLocalFixture } from "../../../core/context/browserLocalFixture.js";
import {
  createBrowserExternalRunnerRequest,
  type BrowserExternalRunnerMode,
} from "./protocol.js";
import {
  decideBrowserSkillManagedRunnerPolicy,
  type BrowserSkillManagedRunnerMetadata,
} from "../../../core/context/browserSkillManagedRunnerPolicy.js";
import {
  runBrowserExternalRunnerProcess,
  type BrowserExternalRunnerProcessResult,
} from "./runner.js";
import type { BrowserExternalRunnerManifest } from "./manifest.js";

export class BrowserExternalRunnerExecutor implements BrowserExecutor {
  readonly kind = "external-runner" as const;
  readonly manifest: BrowserExternalRunnerManifest;
  readonly fixture: BrowserLocalFixture;
  readonly authority: BrowserLocalExecutionAuthority;
  readonly skillMetadata?: BrowserSkillManagedRunnerMetadata;

  constructor(input: {
    readonly manifest: BrowserExternalRunnerManifest;
    readonly fixture: BrowserLocalFixture;
    readonly authority?: BrowserLocalExecutionAuthority;
    readonly skillMetadata?: BrowserSkillManagedRunnerMetadata;
  }) {
    this.manifest = input.manifest;
    this.fixture = input.fixture;
    this.authority =
      input.authority ??
      createBrowserLocalExecutionAuthority({
        mode: "local-fixture",
        allowedFixtureIds: [input.fixture.fixtureId],
      });
    this.skillMetadata = input.skillMetadata;
  }

  async execute(
    request: BrowserExecutionRequest,
    _context: BrowserExecutorContext = {},
  ): Promise<BrowserExecutorResult> {
    const authorityDecision = decideBrowserLocalExecutionAuthority({
      request,
      authority: this.authority,
      executorKind: this.kind,
      fixture: this.fixture,
    });
    if (!authorityDecision.allowed) {
      return blockedBrowserExecutorResult({
        request,
        code: authorityDecision.status,
        message: authorityDecision.reason,
      });
    }
    if (!this.manifest.allowedActions.includes(actionForRunner(request))) {
      return blockedBrowserExecutorResult({
        request,
        code: "external-runner-action-blocked",
        message: `External runner manifest does not allow ${request.actionKind}.`,
      });
    }
    if (this.manifest.runnerMode === "skill-managed") {
      const decision = decideBrowserSkillManagedRunnerPolicy({
        metadata: this.skillMetadata,
      });
      if (!decision.allowed) {
        return blockedBrowserExecutorResult({
          request,
          code: decision.status,
          message: decision.reason,
        });
      }
    }
    const runnerRequest = createBrowserExternalRunnerRequest({
      request,
      mode: this.manifest.runnerMode,
      fixtureId: this.fixture.fixtureId,
      safeUrl: this.fixture.safeUrl,
      outputBudgetBytes: this.manifest.outputBudgetBytes,
      sandboxDecision: "local-fixture:allowed",
      allowlistDecision: "network:none",
      confirmationDecision: "sandbox:confirmed",
    });
    const processResult = await runBrowserExternalRunnerProcess({
      manifest: this.manifest,
      request: runnerRequest,
    });
    if (!processResult.response || processResult.response.status !== "executed" || !processResult.response.executed) {
      return processBlockedResult(request, this.manifest.runnerMode, processResult);
    }
    const evidence = processResult.response.evidence;
    return {
      status: "executed",
      executorKind: this.kind,
      executed: true,
      runtime: `external browser runner (${this.manifest.runnerMode})`,
      evidence: [
        { label: "request id", value: request.requestId },
        { label: "action", value: request.actionKind },
        { label: "execution mode", value: this.manifest.runnerMode },
        { label: "runner id", value: this.manifest.runnerId },
        { label: "runner source", value: this.manifest.source },
        { label: "manifest id", value: this.manifest.runnerId },
        { label: "manifest source", value: this.manifest.source },
        { label: "runner status", value: processResult.response.status },
        { label: "sandbox decision", value: runnerRequest.sandboxDecision },
        { label: "allowlist decision", value: runnerRequest.allowlistDecision },
        { label: "confirmation decision", value: runnerRequest.confirmationDecision },
        { label: "timeout ms", value: String(this.manifest.timeoutMs) },
        { label: "output budget bytes", value: String(this.manifest.outputBudgetBytes) },
        { label: "fixture id", value: this.fixture.fixtureId },
        { label: "safe title", value: evidence.safeTitle ?? this.fixture.safeTitle },
        { label: "safe url", value: evidence.safeUrl ?? this.fixture.safeUrl },
        { label: "safe observation", value: evidence.safeObservationSummary ?? "none" },
        { label: "safe extraction", value: evidence.safeExtractionSummary ?? "none" },
        { label: "action trace", value: evidence.actionTraceSummary ?? "external runner trace summarized" },
        { label: "raw content", value: "excluded" },
        ...processResult.redactions.map((value) => ({ label: "redaction", value })),
      ],
      warnings: [
        "external runner process; no browser dependency, MCP launch, provider call, or persistent session",
        ...processResult.warnings,
        ...(processResult.response.evidence.warnings ?? []),
      ],
      rawContent: "excluded",
      providerCall: "none",
      modelCall: "none",
      browserSessionPersistence: "none",
    };
  }
}

function processBlockedResult(
  request: BrowserExecutionRequest,
  mode: BrowserExternalRunnerMode,
  processResult: BrowserExternalRunnerProcessResult,
): BrowserExecutorResult {
  return {
    status: processResult.status === "timed-out" || processResult.status === "invalid-response"
      ? "blocked"
      : "failed",
    executorKind: "external-runner",
    executed: false,
    runtime: `external browser runner (${mode})`,
    evidence: [
      { label: "request id", value: request.requestId },
      { label: "action", value: request.actionKind },
      { label: "execution mode", value: mode },
      { label: "runner id", value: "external-runner" },
      { label: "runner source", value: "external-runner" },
      { label: "manifest id", value: "manifest-scoped" },
      { label: "manifest source", value: "manifest-scoped" },
      { label: "runner status", value: processResult.status },
      { label: "sandbox decision", value: "local-fixture:allowed" },
      { label: "allowlist decision", value: "network:none" },
      { label: "confirmation decision", value: "sandbox:confirmed" },
      { label: "timeout/output budget", value: "manifest-scoped" },
      { label: "stdout summary", value: processResult.stdoutSummary },
      { label: "stderr summary", value: processResult.stderrSummary },
      { label: "raw content", value: "excluded" },
      ...processResult.redactions.map((value) => ({ label: "redaction", value })),
    ],
    warnings: processResult.warnings,
    error: {
      code: `external-runner-${processResult.status}`,
      message: processResult.status === "timed-out"
        ? "External browser runner timed out."
        : "External browser runner response was unavailable, malformed, or unsafe.",
    },
    rawContent: "excluded",
    providerCall: "none",
    modelCall: "none",
    browserSessionPersistence: "none",
  };
}

function actionForRunner(request: BrowserExecutionRequest) {
  if (request.actionKind === "navigate") {
    return "navigate-local";
  }
  if (request.actionKind === "extract") {
    return "extract";
  }
  return "observe";
}
