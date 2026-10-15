import { runBrowserProcess, type BrowserProcessCleanup } from "../../runtime/process.js";
import type {
  BrowserExecutor,
  BrowserExecutorContext,
  BrowserExecutorResult,
} from "../../executor.js";
import { blockedBrowserExecutorResult, cancelledBrowserExecutorResult } from "../../executor.js";
import type { BrowserExecutionRequest } from "../../executionContract.js";
import {
  decideBrowserLocalExecutionAuthority,
  type BrowserLocalExecutionAuthority,
} from "../../localExecutionAuthority.js";
import type { BrowserLocalFixture } from "../../localFixture.js";
import { sanitizeBrowserEvidenceText } from "../../localFixture.js";
import {
  browserExternalRunnerHasForbiddenContent,
} from "../../runtime/external/protocol.js";
import {
  prepareBrowserSkillExecutionBridge,
} from "./bridge.js";
import {
  validateBrowserSkillExecutionResponse,
  type BrowserSkillExecutionResponse,
  type BrowserSkillExecutionStatus,
} from "./protocol.js";
import type { BrowserSkillRunnerBinding } from "../runner/binding.js";
import type { BrowserSkillRunnerMetadata } from "../runner/metadata.js";

export interface BrowserSkillExecutionProcessResult {
  readonly status: BrowserSkillExecutionStatus | "cancelled";
  readonly started: boolean;
  readonly cleanupStatus: BrowserProcessCleanup;
  readonly terminationFailed?: true;
  readonly outputFailed?: true;
  readonly response?: BrowserSkillExecutionResponse;
  readonly exitCode?: number | null;
  readonly signal?: string | null;
  readonly timedOut: boolean;
  readonly stdoutSummary: string;
  readonly stderrSummary: string;
  readonly warnings: readonly string[];
  readonly redactions: readonly string[];
  readonly evidence: readonly string[];
}

export class BrowserSkillExecutionExecutor implements BrowserExecutor {
  readonly kind = "skill-runner" as const;
  readonly metadata: BrowserSkillRunnerMetadata;
  readonly binding: BrowserSkillRunnerBinding;
  readonly fixture: BrowserLocalFixture;
  readonly authority: BrowserLocalExecutionAuthority;

  constructor(input: {
    readonly metadata: BrowserSkillRunnerMetadata;
    readonly binding: BrowserSkillRunnerBinding;
    readonly fixture: BrowserLocalFixture;
    readonly authority: BrowserLocalExecutionAuthority;
  }) {
    this.metadata = input.metadata;
    this.binding = input.binding;
    this.fixture = input.fixture;
    this.authority = input.authority;
  }

  async execute(
    request: BrowserExecutionRequest,
    context: BrowserExecutorContext = {},
  ): Promise<BrowserExecutorResult> {
    if (context.signal?.aborted) return cancelledBrowserExecutorResult(request, this.kind);
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
    const bridge = prepareBrowserSkillExecutionBridge({
      request,
      metadata: this.metadata,
      binding: this.binding,
      fixture: this.fixture,
      sandboxDecision: "local-fixture:allowed",
      allowlistDecision: "network:none",
      confirmationDecision: "sandbox:confirmed",
    });
    if (!bridge.allowed || !bridge.request) {
      return blockedBrowserExecutorResult({
        request,
        code: bridge.status,
        message: bridge.reason,
      });
    }
    const processResult = await runBrowserSkillExecutionProcess({
      binding: this.binding,
      request: bridge.request,
      signal: context.signal,
    });
    if (processResult.status !== "executed" || !processResult.response || processResult.response.status !== "executed" || !processResult.response.executed) {
      return processBlockedResult(request, this.metadata, this.binding, processResult);
    }
    const evidence = processResult.response.evidence;
    return {
      status: "executed",
      executorKind: this.kind,
      executed: true,
      runtime: `skill-managed browser runner (${processResult.response.mode})`,
      evidence: [
        { label: "request id", value: request.requestId },
        { label: "action", value: request.actionKind },
        { label: "execution mode", value: processResult.response.mode },
        { label: "runner id", value: this.binding.runnerId },
        { label: "runner source", value: "skill-managed" },
        { label: "manifest id", value: this.binding.runnerId },
        { label: "manifest source", value: this.binding.source },
        { label: "skill runner id", value: this.metadata.runnerId },
        { label: "skill id", value: this.metadata.skillId },
        { label: "skill name", value: this.metadata.skillName },
        { label: "skill binding mode", value: this.binding.mode },
        { label: "skill execution", value: "skill-managed" },
        { label: "runner status", value: processResult.response.status },
        { label: "process cleanup", value: processResult.cleanupStatus },
        { label: "sandbox decision", value: bridge.request.sandboxDecision },
        { label: "allowlist decision", value: bridge.request.allowlistDecision },
        { label: "confirmation decision", value: bridge.request.confirmationDecision },
        { label: "timeout ms", value: String(this.binding.timeoutMs) },
        { label: "output budget bytes", value: String(this.binding.outputBudgetBytes) },
        { label: "fixture id", value: this.fixture.fixtureId },
        { label: "safe title", value: evidence.safeTitle ?? this.fixture.safeTitle },
        { label: "safe url", value: evidence.safeUrl ?? this.fixture.safeUrl },
        { label: "safe observation", value: evidence.safeObservationSummary ?? "none" },
        { label: "safe extraction", value: evidence.safeExtractionSummary ?? "none" },
        { label: "action trace", value: evidence.actionTraceSummary ?? "skill runner trace summarized" },
        { label: "raw content", value: "excluded" },
        ...processResult.redactions.map((value) => ({ label: "redaction", value })),
      ],
      warnings: [
        "skill-managed runner process; no dynamic discovery, MCP launch, provider call, or persistent session",
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

export async function runBrowserSkillExecutionProcess(input: {
  readonly binding: BrowserSkillRunnerBinding;
  readonly request: unknown;
  readonly signal?: AbortSignal;
}): Promise<BrowserSkillExecutionProcessResult> {
  if (!input.binding.runnerCommand) {
    return blocked("unavailable", "No explicit skill runner command was configured.");
  }
  if (input.binding.mode === "future-skill-runtime") {
    return blocked("unavailable", "Future skill runtime is not executable in this route.");
  }
  const requestJson = JSON.stringify(input.request);
  if (browserExternalRunnerHasForbiddenContent(requestJson)) {
    return blocked("invalid-response", "Skill runner request contains unsafe content.");
  }
  const budget = input.binding.outputBudgetBytes;
  const native = await runBrowserProcess({
    command: input.binding.runnerCommand.command,
    args: input.binding.runnerCommand.args,
    cwd: input.binding.runnerCommand.cwd,
    env: { PATH: process.env.PATH ?? "", NODE_NO_WARNINGS: "1", CHEERS_BROWSER_SKILL_RUNNER: input.binding.mode },
    request: input.request,
    timeoutMs: input.binding.timeoutMs,
    outputBudgetBytes: budget,
    signal: input.signal,
  });
  const common = {
    exitCode: native.exitCode,
    started: native.started,
    cleanupStatus: native.cleanupStatus,
    terminationFailed: native.terminationFailed,
    outputFailed: native.outputFailed,
    timedOut: native.status === "timeout",
    stdoutSummary: summarizeOutput(native.stdout, budget),
    stderrSummary: summarizeOutput(native.stderr, budget),
    redactions: ["raw-skill-output"],
    evidence: [
      `browser-skill-execution-process:process-cleanup:${native.cleanupStatus}`,
      "browser-skill-execution-process:stdout-stderr-summarized",
      "browser-skill-execution-process:no-provider-or-model-call",
    ],
  };
  if (native.status !== "completed") {
    const status = native.status === "timeout" ? "timed-out" : native.status === "cancelled" ? "cancelled" : "failed";
    return { ...common, status, warnings: [
      `browser-skill-execution-process:${status}`,
      ...(native.terminationFailed ? ["browser-skill-execution-process:termination-unverified"] : []),
      ...(native.outputFailed ? ["browser-skill-execution-process:output-failed"] : []),
    ] };
  }
  const parsed = parseRunnerStdout(native.stdout);
  if (!parsed.ok) {
    return { ...common, status: "invalid-response", warnings: ["browser-skill-execution-process:invalid-response"] };
  }
  const validation = validateBrowserSkillExecutionResponse(parsed.value);
  if (!validation.ok) {
    return {
      ...common,
      status: "unsafe-output",
      warnings: [...validation.warnings, "browser-skill-execution-process:unsafe-response"],
      redactions: [...common.redactions, ...validation.redactions],
      evidence: [...common.evidence, ...validation.evidence, "browser-skill-execution-process:response-rejected"],
    };
  }
  return {
    ...common,
    status: validation.value.status,
    response: validation.value,
    stdoutSummary: "valid JSON response received; raw stdout excluded",
    warnings: validation.warnings,
    redactions: [...common.redactions, ...validation.redactions],
    evidence: [...common.evidence, ...validation.evidence, "browser-skill-execution-process:executed"],
  };
}

function processBlockedResult(
  request: BrowserExecutionRequest,
  metadata: BrowserSkillRunnerMetadata,
  binding: BrowserSkillRunnerBinding,
  processResult: BrowserSkillExecutionProcessResult,
): BrowserExecutorResult {
  return {
    status: processResult.status === "cancelled" ? "cancelled" : processResult.status === "timed-out" ||
      processResult.status === "invalid-response" ||
      processResult.status === "unsafe-output"
      ? "blocked"
      : "failed",
    executorKind: "skill-runner",
    executed: false,
    runtime: `skill-managed browser runner (${binding.mode})`,
    evidence: [
      { label: "request id", value: request.requestId },
      { label: "action", value: request.actionKind },
      { label: "execution mode", value: binding.mode },
      { label: "runner id", value: binding.runnerId },
      { label: "runner source", value: "skill-managed" },
      { label: "manifest id", value: binding.runnerId },
      { label: "manifest source", value: binding.source },
      { label: "skill runner id", value: metadata.runnerId },
      { label: "skill id", value: metadata.skillId },
      { label: "skill binding mode", value: binding.mode },
      { label: "skill execution", value: "skill-managed" },
      { label: "runner status", value: processResult.status },
      { label: "process cleanup", value: processResult.cleanupStatus },
      { label: "action applied", value: processResult.started ? "unknown" : "no" },
      { label: "sandbox decision", value: "local-fixture:allowed" },
      { label: "allowlist decision", value: "network:none" },
      { label: "confirmation decision", value: "sandbox:confirmed" },
      { label: "timeout/output budget", value: "binding-scoped" },
      { label: "fixture id", value: "manifest-scoped" },
      { label: "stdout summary", value: processResult.stdoutSummary },
      { label: "stderr summary", value: processResult.stderrSummary },
      { label: "raw content", value: "excluded" },
      ...processResult.redactions.map((value) => ({ label: "redaction", value })),
    ],
    warnings: processResult.warnings,
    error: {
      code: `skill-runner-${processResult.status}`,
      message: processResult.status === "timed-out"
        ? "Skill-managed browser runner timed out."
        : "Skill-managed browser runner response was unavailable, malformed, or unsafe.",
    },
    rawContent: "excluded",
    providerCall: "none",
    modelCall: "none",
    browserSessionPersistence: "none",
  };
}

function parseRunnerStdout(stdout: string):
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false } {
  try {
    return { ok: true, value: JSON.parse(stdout.trim()) };
  } catch {
    return { ok: false };
  }
}

function blocked(
  status: BrowserSkillExecutionStatus,
  reason: string,
): BrowserSkillExecutionProcessResult {
  return {
    status,
    started: false,
    cleanupStatus: "not-started",
    timedOut: false,
    stdoutSummary: "none",
    stderrSummary: sanitizeBrowserEvidenceText(reason, 180).value,
    warnings: ["browser-skill-execution-process:blocked"],
    redactions: [],
    evidence: [
      `browser-skill-execution-process:status:${status}`,
      "browser-skill-execution-process:no-default-execution",
    ],
  };
}


function summarizeOutput(value: string, budget: number): string {
  if (!value.trim()) {
    return "none";
  }
  const summarized = sanitizeBrowserEvidenceText(value.slice(0, Math.min(budget, 240)), 180).value;
  return browserExternalRunnerHasForbiddenContent(summarized)
    ? "skill runner output redacted"
    : summarized;
}
