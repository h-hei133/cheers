import type { ToolDefinition, ToolExecutionResult } from "../../tools/types.js";
import { createBrowserActionContract } from "./browserActionContract.js";
import {
  createBrowserExecutionRequest,
  type BrowserExecutionRequest,
} from "./browserExecutionContract.js";
import {
  createBrowserRuntimeManifest,
  validateBrowserRuntimeManifest,
  type BrowserRuntimeManifest,
} from "./browserRuntimeManifest.js";
import {
  browserObservationFromRuntimeResult,
  formatBrowserObservation,
  type BrowserObservation,
} from "./browserObs.js";
import { PwAdapter } from "./pwAdapter.js";
import { pwFixtures } from "../harness/pwFixtures.js";
import { getPwRuntimeStatus, type PwRuntimeStatus } from "./pwRuntime.js";
import {
  browserActionKindForTool,
  decideBrowserToolPolicy,
  type BrowserToolName,
} from "./browserToolPolicy.js";
import {
  buildPolicyBlockedResult,
  buildUnavailableResult,
} from "../tools/toolPolicyResult.js";

export const BROWSER_TOOL_NAMES = [
  "browser.observe",
  "browser.extract",
  "browser.click",
  "browser.type",
] as const satisfies readonly BrowserToolName[];

export interface BrowserToolRegistryOptions {
  readonly runtimeStatus?: PwRuntimeStatus;
  readonly timeoutMs?: number;
  readonly launchTimeoutMs?: number;
}

export function createBrowserToolDefinitions(
  options: BrowserToolRegistryOptions = {},
): readonly ToolDefinition[] {
  return BROWSER_TOOL_NAMES.map((toolName) => ({
    name: toolName,
    description: browserToolDescription(toolName),
    argsSchema: browserToolArgsSchema(toolName),
    permissions: { check: () => [] },
    async execute(args) {
      return executeBrowserTool({
        toolName,
        args,
        runtimeStatus: options.runtimeStatus ?? await getPwRuntimeStatus(),
        timeoutMs: options.timeoutMs,
        launchTimeoutMs: options.launchTimeoutMs,
      });
    },
  }));
}

async function executeBrowserTool(input: {
  readonly toolName: BrowserToolName;
  readonly args: Record<string, unknown>;
  readonly runtimeStatus: PwRuntimeStatus;
  readonly timeoutMs?: number;
  readonly launchTimeoutMs?: number;
}): Promise<ToolExecutionResult> {
  const manifest = createToolManifest(input.args, input.timeoutMs);
  const manifestLoad = validateBrowserRuntimeManifest(manifest);
  if (manifestLoad.status !== "valid") {
    return blockedResult({
      toolName: input.toolName,
      reasonCode: "policy-blocked",
      reason: manifestLoad.reason,
      nextAction: "Use an explicit controlled local browser fixture target.",
      evidence: manifestLoad.evidence,
      operation: browserActionKindForTool(input.toolName),
      controlledTarget: firstTarget(input.args),
    });
  }

  const policy = decideBrowserToolPolicy({
    toolName: input.toolName,
    args: input.args,
    runtimeStatus: input.runtimeStatus,
    manifest: manifestLoad.manifest,
  });
  if (!policy.allowed) {
    return blockedResult({
      toolName: input.toolName,
      reasonCode: policy.reasonCode,
      reason: policy.reason,
      nextAction: policy.nextAction,
      evidence: policy.evidence,
      operation: browserActionKindForTool(input.toolName),
      controlledTarget: firstTarget(input.args),
    });
  }

  const request = createToolRequest(input.toolName, input.args);
  const executor = new PwAdapter({
    status: input.runtimeStatus,
    fixtures: pwFixtures,
    timeoutMs: input.timeoutMs,
    launchTimeoutMs: input.launchTimeoutMs,
  });
  const result = await executor.execute({ request, manifest: manifestLoad.manifest });
  const observation = browserObservationFromRuntimeResult({
    toolName: input.toolName,
    result,
  });
  return {
    success: result.status === "observed" || result.status === "acted",
    output: formatBrowserObservation(observation),
    error: result.status === "observed" || result.status === "acted"
      ? undefined
      : observation.visibleTextSummary || observation.reasonCode,
    metadata: browserToolMetadata({
      observation,
      runtimeStatus: input.runtimeStatus,
      manifest: manifestLoad.manifest,
      evidence: result.evidence,
    }),
  };
}

function createToolManifest(
  args: Record<string, unknown>,
  timeoutMs: number | undefined,
): BrowserRuntimeManifest {
  const page = firstTarget(args) ?? "local-fixture://pw/static";
  return createBrowserRuntimeManifest({
    manifestId: "browser-runtime:agent-loop-direct-playwright",
    runtimeMode: "direct-playwright-core",
    source: "test-only",
    allowedOrigins: unique([
      "local-fixture://pw/static",
      "local-fixture://pw/js",
      "local-fixture://pw/timeout",
      "local-fixture://pw/unsafe",
      "local-fixture://pw/redaction",
      page,
    ]),
    allowedActions: ["observe", "extract", "click", "type"],
    timeoutMs: numberArg(args, "timeoutMs") ?? timeoutMs ?? 5_000,
    outputBudgetChars: 2_400,
    warnings: ["browser-agent-loop:controlled-local-only"],
  });
}

function createToolRequest(
  toolName: BrowserToolName,
  args: Record<string, unknown>,
): BrowserExecutionRequest {
  const actionKind = browserActionKindForTool(toolName);
  const page = firstTarget(args) ?? "local-fixture://pw/static";
  const target = stringArg(args, "selector") ??
    stringArg(args, "target") ??
    (actionKind === "click" ? "Save draft" : actionKind === "type" ? "Safe note" : page);
  return createBrowserExecutionRequest({
    requestId: `browser-agent-loop:${actionKind}:${target}`,
    mode: "test-local",
    source: "test",
    approval: actionKind === "observe" || actionKind === "extract" ? "read-only" : "none",
    action: createBrowserActionContract({
      actionKind,
      target,
      url: page,
      selector: stringArg(args, "selector"),
      text: actionKind === "type" ? stringArg(args, "text") : undefined,
      extractionGoal: actionKind === "extract"
        ? stringArg(args, "extractionKind") ?? stringArg(args, "target") ?? "visible-text"
        : undefined,
      userIntentSummary: `browser agent ${actionKind} on ${page}`,
      requiresNetwork: false,
      requiresAuth: false,
    }),
  });
}

function blockedResult(input: {
  readonly toolName: BrowserToolName;
  readonly reasonCode: string;
  readonly reason: string;
  readonly nextAction: string;
  readonly evidence: readonly string[];
  readonly operation: string;
  readonly controlledTarget?: string;
}): ToolExecutionResult {
  const contract = isBrowserUnavailableReason(input.reasonCode)
    ? buildUnavailableResult({
        capability: "browser",
        availability: browserAvailabilityForReason(input.reasonCode),
        reasonCode: input.reasonCode,
        reason: input.reason,
        doNext: input.nextAction,
        evidence: input.evidence,
      })
    : buildPolicyBlockedResult({
        capability: "browser",
        reasonCode: input.reasonCode,
        reason: input.reason,
        doNext: input.nextAction,
        evidence: input.evidence,
      });
  const observation: BrowserObservation = {
    status: "stopped",
    operation: input.operation,
    controlledTarget: input.controlledTarget ?? "controlled-target-unresolved",
    visibleTextSummary: contract.reason,
    actionResultSummary: "Browser tool stopped before Direct Playwright runtime call.",
    reasonCode: contract.reasonCode,
    cleanupStatus: "not-started",
    redactionStatus: "clean",
    evidenceId: `browser-obs-blocked-${contract.reasonCode}`,
    nextActions: [contract.doNext],
    evidence: [
      ...contract.evidence,
      "browser-observation:stopped-before-runtime",
      "browser-observation:raw-dom-excluded",
    ],
  };
  return {
    success: false,
    output: formatBrowserObservation(observation),
    error: contract.reason,
    metadata: browserToolMetadata({
      observation,
      runtimeStatus: undefined,
      manifest: undefined,
      evidence: contract.evidence,
    }),
  };
}

function isBrowserUnavailableReason(reasonCode: string): boolean {
  return (
    reasonCode === "runtime-disabled" ||
    reasonCode === "runtime-package-missing" ||
    reasonCode === "runtime-binary-missing"
  );
}

function browserAvailabilityForReason(
  reasonCode: string,
): "disabled" | "not-installed" | "not-ready" {
  if (reasonCode === "runtime-disabled") {
    return "disabled";
  }
  if (
    reasonCode === "runtime-package-missing" ||
    reasonCode === "runtime-binary-missing"
  ) {
    return "not-installed";
  }
  return "not-ready";
}

function browserToolMetadata(input: {
  readonly observation: BrowserObservation;
  readonly runtimeStatus: PwRuntimeStatus | undefined;
  readonly manifest: BrowserRuntimeManifest | undefined;
  readonly evidence: readonly string[];
}): Record<string, unknown> {
  return {
    executionPath: "browser-tool",
    browserRuntimeStatus: input.runtimeStatus?.status ?? "not-ready",
    browserReasonCode: input.observation.reasonCode,
    browserCleanupStatus: input.observation.cleanupStatus,
    browserObservation: input.observation,
    manifestId: input.manifest?.manifestId,
    publicAutomation: false,
    rawContent: "excluded",
    evidence: [
      ...input.evidence,
      ...input.observation.evidence,
      "browser-tool:no-raw-dom",
      "browser-tool:no-screenshots-default",
      "browser-tool:no-session-persistence",
      "browser-tool:no-provider-or-model-call",
      "browser-tool:no-mcp-live-backend",
    ],
  };
}

function browserToolDescription(toolName: BrowserToolName): string {
  const action = browserActionKindForTool(toolName);
  return `Controlled local browser ${action}; Direct Playwright only, no public web, auth, cookies, screenshots, uploads/downloads, or raw DOM.`;
}

function browserToolArgsSchema(toolName: BrowserToolName): Record<string, unknown> {
  const baseProperties = {
    page: {
      type: "string",
      description: "Controlled local fixture marker, such as local-fixture://pw/static.",
    },
    target: { type: "string", description: "Visible role/name target or safe fixture target." },
    selector: { type: "string", description: "Controlled selector when role/name is insufficient." },
    timeoutMs: { type: "number", description: "Bounded browser action timeout." },
  };
  if (toolName === "browser.type") {
    return {
      type: "object",
      required: ["target", "text", "valueClassification"],
      properties: {
        ...baseProperties,
        text: { type: "string", description: "Safe non-secret local fixture text." },
        valueClassification: {
          type: "string",
          enum: ["safe-test-text"],
          description: "Required safe text classification; secrets are blocked.",
        },
      },
    };
  }
  if (toolName === "browser.extract") {
    return {
      type: "object",
      properties: {
        ...baseProperties,
        extractionKind: { type: "string", enum: ["visible-text", "status", "heading"] },
      },
    };
  }
  return { type: "object", properties: baseProperties };
}

function firstTarget(args: Record<string, unknown>): string | undefined {
  return stringArg(args, "page") ?? stringArg(args, "url") ?? stringArg(args, "target");
}

function stringArg(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function numberArg(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
