import { spawn } from "node:child_process";
import {
  browserExternalRunnerHasForbiddenContent,
  validateBrowserExternalRunnerResponse,
  type BrowserExternalRunnerRequest,
  type BrowserExternalRunnerResponse,
  type BrowserExternalRunnerStatus,
} from "./protocol.js";
import type { BrowserExternalRunnerManifest } from "./manifest.js";
import { sanitizeBrowserEvidenceText } from "../../../core/context/browserLocalFixture.js";

export interface BrowserExternalRunnerProcessResult {
  readonly status: BrowserExternalRunnerStatus;
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
  return new Promise((resolve) => {
    const child = spawn(
      input.manifest.runnerCommand!.command,
      input.manifest.runnerCommand!.args,
      {
        cwd: input.manifest.runnerCommand!.cwd,
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          PATH: process.env.PATH ?? "",
          NODE_NO_WARNINGS: "1",
          PRIVATE_AGENTS_BROWSER_EXTERNAL_RUNNER: "test-local",
        },
      },
    );
    let stdout = "";
    let stderr = "";
    let settled = false;
    const budget = input.manifest.outputBudgetBytes;
    const timeout = setTimeout(() => {
      settled = true;
      child.kill("SIGKILL");
      resolve({
        status: "timed-out",
        exitCode: null,
        signal: "SIGKILL",
        timedOut: true,
        stdoutSummary: summarizeOutput(stdout, budget),
        stderrSummary: summarizeOutput(stderr, budget),
        warnings: ["browser-external-runner-process:timed-out"],
        redactions: ["raw-runner-output"],
        evidence: [
          "browser-external-runner-process:timeout",
          "browser-external-runner-process:stdout-stderr-summarized",
        ],
      });
    }, input.manifest.timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = appendBudgeted(stdout, chunk.toString("utf8"), budget);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = appendBudgeted(stderr, chunk.toString("utf8"), budget);
    });
    child.on("error", () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve(blocked("unavailable", "External runner process could not be started."));
    });
    child.on("close", (exitCode, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      const parsed = parseRunnerStdout(stdout);
      if (parsed.ok === false) {
        resolve({
          status: "invalid-response",
          exitCode,
          signal,
          timedOut: false,
          stdoutSummary: summarizeOutput(stdout, budget),
          stderrSummary: summarizeOutput(stderr, budget),
          warnings: ["browser-external-runner-process:invalid-response"],
          redactions: ["raw-runner-output"],
          evidence: [
            "browser-external-runner-process:invalid-json",
            "browser-external-runner-process:stdout-stderr-summarized",
          ],
        });
        return;
      }
      const validation = validateBrowserExternalRunnerResponse(parsed.value);
      if (validation.ok === false) {
        resolve({
          status: "invalid-response",
          exitCode,
          signal,
          timedOut: false,
          stdoutSummary: summarizeOutput(stdout, budget),
          stderrSummary: summarizeOutput(stderr, budget),
          warnings: [...validation.warnings, "browser-external-runner-process:unsafe-response"],
          redactions: [...validation.redactions, "raw-runner-output"],
          evidence: [
            ...validation.evidence,
            "browser-external-runner-process:response-rejected",
            "browser-external-runner-process:stdout-stderr-summarized",
          ],
        });
        return;
      }
      resolve({
        status: validation.value.status,
        response: validation.value,
        exitCode,
        signal,
        timedOut: false,
        stdoutSummary: "valid JSON response received; raw stdout excluded",
        stderrSummary: summarizeOutput(stderr, budget),
        warnings: validation.warnings,
        redactions: [...validation.redactions, "raw-runner-output"],
        evidence: [
          ...validation.evidence,
          "browser-external-runner-process:executed",
          "browser-external-runner-process:stdout-stderr-summarized",
          "browser-external-runner-process:no-provider-or-model-call",
        ],
      });
    });
    child.stdin?.end(`${JSON.stringify(input.request)}\n`);
  });
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

function appendBudgeted(current: string, next: string, budget: number): string {
  const merged = `${current}${next}`;
  return merged.length > budget ? merged.slice(0, budget) : merged;
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
