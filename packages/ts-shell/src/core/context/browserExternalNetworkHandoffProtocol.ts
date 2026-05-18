import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import type { BrowserExecutionRequest } from "./browserExecutionContract.js";
import type { BrowserExternalNetworkRunnerManifestMode } from "./browserExternalNetworkRunnerManifest.js";

export type BrowserExternalNetworkHandoffStatus =
  | "simulated"
  | "blocked"
  | "unavailable"
  | "invalid-response"
  | "timed-out"
  | "unsafe-output";

export interface BrowserExternalNetworkHandoffRequest {
  readonly requestId: string;
  readonly actionKind: BrowserExecutionRequest["actionKind"];
  readonly targetOrigin: string;
  readonly safeUrlSummary: string;
  readonly allowlistStatus: string;
  readonly confirmationStatus: string;
  readonly sandboxStatus: string;
  readonly preflightStatus: string;
  readonly runnerMode: BrowserExternalNetworkRunnerManifestMode;
  readonly evidenceRequirements: readonly string[];
  readonly outputBudgetBytes: number;
  readonly realNetworkExecution: false;
}

export interface BrowserExternalNetworkHandoffResponse {
  readonly status: BrowserExternalNetworkHandoffStatus;
  readonly executed: false;
  readonly realNetworkExecution: false;
  readonly safeTitle?: string;
  readonly safeSummary?: string;
  readonly warnings: readonly string[];
  readonly redactions: readonly string[];
  readonly errorSummary?: string;
  readonly evidence: readonly string[];
}

export type BrowserExternalNetworkHandoffResponseValidationResult =
  | {
      readonly ok: true;
      readonly response: BrowserExternalNetworkHandoffResponse;
      readonly evidence: readonly string[];
    }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly response: BrowserExternalNetworkHandoffResponse;
      readonly evidence: readonly string[];
    };

export function createBrowserExternalNetworkHandoffRequest(input: {
  readonly request: BrowserExecutionRequest;
  readonly targetOrigin: string;
  readonly safeUrlSummary: string;
  readonly allowlistStatus: string;
  readonly confirmationStatus: string;
  readonly sandboxStatus: string;
  readonly preflightStatus: string;
  readonly runnerMode: BrowserExternalNetworkRunnerManifestMode;
  readonly outputBudgetBytes: number;
}): BrowserExternalNetworkHandoffRequest {
  return {
    requestId: sanitizeBrowserText(input.request.requestId, 160),
    actionKind: input.request.actionKind,
    targetOrigin: sanitizeBrowserText(input.targetOrigin, 160),
    safeUrlSummary: sanitizeBrowserText(input.safeUrlSummary, 180),
    allowlistStatus: sanitizeBrowserText(input.allowlistStatus, 80),
    confirmationStatus: sanitizeBrowserText(input.confirmationStatus, 80),
    sandboxStatus: sanitizeBrowserText(input.sandboxStatus, 80),
    preflightStatus: sanitizeBrowserText(input.preflightStatus, 80),
    runnerMode: input.runnerMode,
    evidenceRequirements: [
      "safe-summary-only",
      "no-raw-page-content",
      "no-url-credentials",
      "no-screenshot-or-ocr",
      "real-network-execution-false",
    ],
    outputBudgetBytes: input.outputBudgetBytes,
    realNetworkExecution: false,
  };
}

export function validateBrowserExternalNetworkHandoffResponse(input: {
  readonly response: BrowserExternalNetworkHandoffResponse;
  readonly outputBudgetBytes: number;
}): BrowserExternalNetworkHandoffResponseValidationResult {
  const response = sanitizeResponse(input.response);
  if (input.response.executed !== false || input.response.realNetworkExecution !== false) {
    return invalid("External-network handoff response must not claim execution or real network.", response);
  }
  const combined = [
    response.safeTitle,
    response.safeSummary,
    response.errorSummary,
    ...response.warnings,
    ...response.redactions,
  ].filter(Boolean).join("\n");
  if (combined.length > input.outputBudgetBytes) {
    return invalid("External-network handoff response exceeded output budget.", {
      ...response,
      status: "unsafe-output",
      safeSummary: undefined,
      errorSummary: "Handoff response exceeded output budget.",
      warnings: unique([...response.warnings, "output-budget-exceeded"]),
    });
  }
  if (hasForbiddenContent(combined)) {
    return invalid("External-network handoff response contained unsafe output.", {
      ...response,
      status: "unsafe-output",
      safeTitle: undefined,
      safeSummary: undefined,
      errorSummary: "Handoff response contained unsafe output.",
      redactions: unique([...response.redactions, "unsafe-output"]),
    });
  }
  return {
    ok: true,
    response,
    evidence: [
      "browser-external-network-handoff-protocol:response-valid",
      "browser-external-network-handoff-protocol:no-real-network",
      "browser-external-network-handoff-protocol:safe-summary-only",
    ],
  };
}

function sanitizeResponse(
  response: BrowserExternalNetworkHandoffResponse,
): BrowserExternalNetworkHandoffResponse {
  return {
    status: response.status,
    executed: false,
    realNetworkExecution: false,
    safeTitle: optionalSafe(response.safeTitle, 120),
    safeSummary: optionalSafe(response.safeSummary, 240),
    warnings: sanitizeList(response.warnings),
    redactions: sanitizeList(response.redactions),
    errorSummary: optionalSafe(response.errorSummary, 180),
    evidence: sanitizeList(response.evidence),
  };
}

function optionalSafe(value: string | undefined, maxLength: number): string | undefined {
  const safe = sanitizeBrowserText(value ?? "", maxLength);
  return safe.length > 0 ? safe : undefined;
}

function sanitizeList(values: readonly string[]): readonly string[] {
  return unique(values.map((value) => sanitizeBrowserText(value, 180)));
}

function hasForbiddenContent(value: string): boolean {
  return /(sk-[a-z0-9]|api[_-]?key|token|secret|password|<html|<body|<script|hidden reasoning|screenshot|ocr payload|data:image)/i.test(value);
}

function invalid(
  reason: string,
  response: BrowserExternalNetworkHandoffResponse,
): BrowserExternalNetworkHandoffResponseValidationResult {
  return {
    ok: false,
    reason,
    response: {
      ...response,
      status: response.status === "timed-out" ? "timed-out" : "invalid-response",
      executed: false,
      realNetworkExecution: false,
      safeTitle: undefined,
      safeSummary: undefined,
      errorSummary: sanitizeBrowserText(reason, 180),
      redactions: unique([...response.redactions, "unsafe-handoff-response"]),
    },
    evidence: [
      "browser-external-network-handoff-protocol:response-invalid",
      "browser-external-network-handoff-protocol:no-real-network",
    ],
  };
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
