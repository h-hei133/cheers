import { runBrowserProcess, type BrowserProcessCleanup } from "../process.js";
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
  readonly status: "ok" | "unavailable" | "invalid" | "timed-out" | "failed" | "cancelled";
  readonly started: boolean;
  readonly cleanupStatus: BrowserProcessCleanup;
  readonly terminationFailed?: true;
  readonly outputFailed?: true;
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
  readonly signal?: AbortSignal;
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
  const native = await runBrowserProcess({
    command: input.manifest.runnerCommand,
    args: input.manifest.runnerArgs,
    request: protocolRequest,
    timeoutMs: input.manifest.timeoutMs,
    outputBudgetBytes: input.manifest.outputBudgetChars * 4,
    stderrBudgetBytes: 1_000,
    signal: input.signal,
  });
  const common = {
    started: native.started,
    cleanupStatus: native.cleanupStatus,
    terminationFailed: native.terminationFailed,
    outputFailed: native.outputFailed,
    stdoutSummary: native.stdout,
    stderrSummary: native.stderr,
  };
  if (native.status !== "completed") {
    const status = native.status === "timeout" ? "timed-out" : native.status === "cancelled" ? "cancelled" : "failed";
    return processResult(status, protocolRequest, {
      ...common,
      warnings: [
        `browser-runtime-process-adapter:${status}`,
        ...(native.terminationFailed ? ["browser-runtime-process-adapter:termination-unverified"] : []),
        ...(native.outputFailed ? ["browser-runtime-process-adapter:output-failed"] : []),
      ],
    });
  }
  const validation = parseBrowserRuntimeProtocolResponseJson(native.stdout, input.manifest.outputBudgetChars);
  return processResult(validation.ok ? "ok" : "invalid", protocolRequest, {
    ...common, validation, warnings: validation.warnings,
  });
}

function processResult(
  status: BrowserRuntimeProcessAdapterResult["status"],
  protocolRequest: BrowserRuntimeProtocolRequest,
  input: {
    readonly started?: boolean;
    readonly cleanupStatus?: BrowserProcessCleanup;
    readonly terminationFailed?: true;
    readonly outputFailed?: true;
    readonly validation?: BrowserRuntimeProtocolValidation;
    readonly stdoutSummary?: string;
    readonly stderrSummary?: string;
    readonly warnings?: readonly string[];
  },
): BrowserRuntimeProcessAdapterResult {
  return {
    status,
    started: input.started ?? false,
    cleanupStatus: input.cleanupStatus ?? "not-started",
    terminationFailed: input.terminationFailed,
    outputFailed: input.outputFailed,
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
