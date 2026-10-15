import { runBrowserProcess, type BrowserProcessCleanup } from "../process.js";
import {
  browserExternalRunnerHasForbiddenContent,
  validateBrowserExternalRunnerResponse,
  type BrowserExternalRunnerRequest,
  type BrowserExternalRunnerResponse,
  type BrowserExternalRunnerStatus,
} from "./protocol.js";
import type { BrowserExternalRunnerManifest } from "./manifest.js";
import { sanitizeBrowserEvidenceText } from "../../localFixture.js";

export interface BrowserExternalRunnerProcessResult {
  readonly status: BrowserExternalRunnerStatus | "cancelled";
  readonly started: boolean;
  readonly cleanupStatus: BrowserProcessCleanup;
  readonly terminationFailed?: true;
  readonly outputFailed?: true;
  readonly response?: BrowserExternalRunnerResponse;
  readonly exitCode?: number | null;
  readonly signal?: string | null;
  readonly timedOut: boolean;
  readonly stdoutSummary: string;
  readonly stderrSummary: string;
  readonly warnings: readonly string[];
  readonly redactions: readonly string[];
  readonly evidence: readonly string[];
}

export async function runBrowserExternalRunnerProcess(input: {
  readonly manifest: BrowserExternalRunnerManifest;
  readonly request: BrowserExternalRunnerRequest;
  readonly signal?: AbortSignal;
}): Promise<BrowserExternalRunnerProcessResult> {
  if (!input.manifest.runnerCommand) {
    return blocked("unavailable", "No explicit external runner command was configured.");
  }
  if (input.manifest.runnerMode === "skill-managed") {
    return blocked("unavailable", "Skill-managed runner mode is policy-only in this route.");
  }
  const requestValidation = JSON.stringify(input.request);
  if (browserExternalRunnerHasForbiddenContent(requestValidation)) {
    return blocked("invalid-response", "External runner request contains unsafe content.");
  }
  const budget = input.manifest.outputBudgetBytes;
  const native = await runBrowserProcess({
    command: input.manifest.runnerCommand.command,
    args: input.manifest.runnerCommand.args,
    cwd: input.manifest.runnerCommand.cwd,
    env: { PATH: process.env.PATH ?? "", NODE_NO_WARNINGS: "1", CHEERS_BROWSER_EXTERNAL_RUNNER: "test-local" },
    request: input.request,
    timeoutMs: input.manifest.timeoutMs,
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
    redactions: ["raw-runner-output"],
    evidence: [
      `browser-external-runner-process:process-cleanup:${native.cleanupStatus}`,
      "browser-external-runner-process:stdout-stderr-summarized",
      "browser-external-runner-process:no-provider-or-model-call",
    ],
  };
  if (native.status !== "completed") {
    const status = native.status === "timeout" ? "timed-out" : native.status === "cancelled" ? "cancelled" : "failed";
    return { ...common, status, warnings: [
      `browser-external-runner-process:${status}`,
      ...(native.terminationFailed ? ["browser-external-runner-process:termination-unverified"] : []),
      ...(native.outputFailed ? ["browser-external-runner-process:output-failed"] : []),
    ] };
  }
  const parsed = parseRunnerStdout(native.stdout);
  if (!parsed.ok) {
    return { ...common, status: "invalid-response", warnings: ["browser-external-runner-process:invalid-response"] };
  }
  const validation = validateBrowserExternalRunnerResponse(parsed.value);
  if (!validation.ok) {
    return {
      ...common,
      status: "invalid-response",
      warnings: [...validation.warnings, "browser-external-runner-process:unsafe-response"],
      redactions: [...common.redactions, ...validation.redactions],
      evidence: [...common.evidence, ...validation.evidence, "browser-external-runner-process:response-rejected"],
    };
  }
  return {
    ...common,
    status: validation.value.status,
    response: validation.value,
    stdoutSummary: "valid JSON response received; raw stdout excluded",
    warnings: validation.warnings,
    redactions: [...common.redactions, ...validation.redactions],
    evidence: [...common.evidence, ...validation.evidence, "browser-external-runner-process:executed"],
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
  status: BrowserExternalRunnerStatus,
  reason: string,
): BrowserExternalRunnerProcessResult {
  return {
    status,
    started: false,
    cleanupStatus: "not-started",
    timedOut: false,
    stdoutSummary: "none",
    stderrSummary: sanitizeBrowserEvidenceText(reason, 180).value,
    warnings: ["browser-external-runner-process:blocked"],
    redactions: [],
    evidence: [
      `browser-external-runner-process:status:${status}`,
      "browser-external-runner-process:no-default-execution",
    ],
  };
}


function summarizeOutput(value: string, budget: number): string {
  if (!value.trim()) {
    return "none";
  }
  const summarized = sanitizeBrowserEvidenceText(value.slice(0, Math.min(budget, 240)), 180).value;
  return browserExternalRunnerHasForbiddenContent(summarized)
    ? "runner output redacted"
    : summarized;
}
