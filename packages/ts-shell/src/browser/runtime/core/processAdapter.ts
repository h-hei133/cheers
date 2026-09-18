import { spawn } from "node:child_process";
import { sanitizeBrowserText } from "../../capabilityModel.js";
import {
  createBrowserRuntimeProtocolRequest,
  parseBrowserRuntimeProtocolResponseJson,
  type BrowserRuntimeProtocolRequest,
  type BrowserRuntimeProtocolValidation,
} from "./protocol.js";
import type { BrowserExecutionRequest } from "../../executionContract.js";
import type { BrowserExternalRuntimeManifest } from "../external/runtimeManifest.js";

export interface BrowserRuntimeProcessAdapterResult {
  readonly status: "ok" | "unavailable" | "invalid" | "timed-out" | "failed";
  readonly protocolRequest: BrowserRuntimeProtocolRequest;
  readonly validation?: BrowserRuntimeProtocolValidation;
  readonly stdoutSummary: string;
  readonly stderrSummary: string;
  readonly warnings: readonly string[];
  readonly evidence: readonly string[];
}

export async function runBrowserRuntimeProcessAdapter(input: {
  readonly request: BrowserExecutionRequest;
  readonly manifest: BrowserExternalRuntimeManifest;
}): Promise<BrowserRuntimeProcessAdapterResult> {
  const protocolRequest = createBrowserRuntimeProtocolRequest({
    request: input.request,
    allowedOrigins: input.manifest.allowedOrigins,
    outputBudgetChars: input.manifest.outputBudgetChars,
  });
  if (!input.manifest.runnerCommand) {
    return processResult("unavailable", protocolRequest, {
      stderrSummary: "missing explicit runner command",
      warnings: ["browser-runtime-process-adapter:missing-runner"],
    });
  }
  return new Promise((resolve) => {
    const child = spawn(input.manifest.runnerCommand!, input.manifest.runnerArgs, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill("SIGKILL");
        resolve(processResult("timed-out", protocolRequest, {
          stdoutSummary: stdout,
          stderrSummary: stderr,
          warnings: ["browser-runtime-process-adapter:timed-out"],
        }));
      }
    }, input.manifest.timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout = bound(stdout + chunk.toString("utf8"), input.manifest.outputBudgetChars);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = bound(stderr + chunk.toString("utf8"), 1_000);
    });
    child.on("error", (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve(processResult("failed", protocolRequest, {
          stderrSummary: error.message,
          warnings: ["browser-runtime-process-adapter:spawn-failed"],
        }));
      }
    });
    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      const validation = parseBrowserRuntimeProtocolResponseJson(stdout, input.manifest.outputBudgetChars);
      resolve(processResult(validation.ok && code === 0 ? "ok" : "invalid", protocolRequest, {
        validation,
        stdoutSummary: stdout,
        stderrSummary: stderr,
        warnings: [
          ...(code === 0 ? [] : [`browser-runtime-process-adapter:exit-${code ?? "unknown"}`]),
          ...(validation.ok ? validation.warnings : validation.warnings),
        ],
      }));
    });
    child.stdin.end(`${JSON.stringify(protocolRequest)}\n`);
  });
}

function processResult(
  status: BrowserRuntimeProcessAdapterResult["status"],
  protocolRequest: BrowserRuntimeProtocolRequest,
  input: {
    readonly validation?: BrowserRuntimeProtocolValidation;
    readonly stdoutSummary?: string;
    readonly stderrSummary?: string;
    readonly warnings?: readonly string[];
  },
): BrowserRuntimeProcessAdapterResult {
  return {
    status,
    protocolRequest,
    validation: input.validation,
    stdoutSummary: sanitizeBrowserText(input.stdoutSummary ?? "", 300),
    stderrSummary: sanitizeBrowserText(input.stderrSummary ?? "", 300),
    warnings: input.warnings ?? [],
    evidence: [
      `browser-runtime-process-adapter:${status}`,
      "browser-runtime-process-adapter:explicit-manifest-only",
      "browser-runtime-process-adapter:no-mcp-launch",
      "browser-runtime-process-adapter:no-provider-or-model-call",
    ],
  };
}

function bound(value: string, budget: number): string {
  return value.length <= budget ? value : value.slice(0, budget);
}
