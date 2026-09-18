import { sanitizeBrowserText } from "../../browserCapabilityModel.js";
import type { BrowserExecutionRequest } from "../../browserExecutionContract.js";
import type { BrowserAccessibilityNodeInput } from "../../browserAccessibilitySnapshot.js";

export type BrowserRuntimeProtocolVersion = "browser-runtime-protocol/v1";
export type BrowserRuntimeProtocolAction =
  | "runtime-status"
  | "navigate"
  | "observe"
  | "extract"
  | "click"
  | "type"
  | "close";
export type BrowserRuntimeProtocolResponseStatus =
  | "ok"
  | "blocked"
  | "unavailable"
  | "invalid"
  | "timed-out"
  | "error";

export interface BrowserRuntimeProtocolRequest {
  readonly version: BrowserRuntimeProtocolVersion;
  readonly requestId: string;
  readonly action: BrowserRuntimeProtocolAction;
  readonly target?: string;
  readonly text?: string;
  readonly sessionId?: string;
  readonly allowedOrigins: readonly string[];
  readonly outputBudgetChars: number;
  readonly rawContent: "excluded";
}

export interface BrowserRuntimeProtocolResponse {
  readonly version: BrowserRuntimeProtocolVersion;
  readonly status: BrowserRuntimeProtocolResponseStatus;
  readonly runtimeId: string;
  readonly sessionId: string;
  readonly currentUrlSummary: string;
  readonly title?: string;
  readonly domSnapshotPayload?: BrowserRuntimeDomSnapshotPayload;
  readonly accessibilitySnapshotPayload?: BrowserRuntimeAccessibilitySnapshotPayload;
  readonly actionTargetResult?: BrowserRuntimeActionTargetResult;
  readonly postActionObservation?: string;
  readonly warnings: readonly string[];
  readonly redactions: readonly string[];
  readonly errorSummary?: string;
  readonly rawContent: "internal-only" | "excluded";
}

export interface BrowserRuntimeDomSnapshotPayload {
  readonly html?: string;
  readonly title?: string;
  readonly textSummary?: string;
}

export interface BrowserRuntimeAccessibilitySnapshotPayload {
  readonly nodes: readonly BrowserAccessibilityNodeInput[];
}

export interface BrowserRuntimeActionTargetResult {
  readonly targetId?: string;
  readonly selectorSummary?: string;
  readonly accessibleName?: string;
  readonly confidence?: number;
}

export type BrowserRuntimeProtocolValidation =
  | {
      readonly ok: true;
      readonly response: BrowserRuntimeProtocolResponse;
      readonly warnings: readonly string[];
      readonly redactions: readonly string[];
      readonly evidence: readonly string[];
    }
  | {
      readonly ok: false;
      readonly status: "invalid" | "unsafe-output";
      readonly reason: string;
      readonly warnings: readonly string[];
      readonly redactions: readonly string[];
      readonly evidence: readonly string[];
    };

export function createBrowserRuntimeProtocolRequest(input: {
  readonly request: BrowserExecutionRequest;
  readonly allowedOrigins: readonly string[];
  readonly outputBudgetChars: number;
  readonly sessionId?: string;
}): BrowserRuntimeProtocolRequest {
  return {
    version: "browser-runtime-protocol/v1",
    requestId: sanitizeBrowserText(input.request.requestId, 140),
    action: toProtocolAction(input.request.actionKind),
    target: input.request.action.url ?? input.request.action.target ?? input.request.action.extractionGoal,
    text: input.request.action.text,
    sessionId: input.sessionId,
    allowedOrigins: input.allowedOrigins.map((origin) => sanitizeBrowserText(origin, 180)),
    outputBudgetChars: Math.max(200, Math.min(24_000, input.outputBudgetChars)),
    rawContent: "excluded",
  };
}

export function validateBrowserRuntimeProtocolResponse(input: {
  readonly response: unknown;
  readonly outputBudgetChars: number;
}): BrowserRuntimeProtocolValidation {
  if (!isRecord(input.response)) {
    return invalid("invalid", "Runtime response was not an object.", [], []);
  }
  const response = input.response;
  const warnings = new Set<string>();
  const redactions = new Set<string>();
  if (response.version !== "browser-runtime-protocol/v1") {
    return invalid("invalid", "Runtime response protocol version is unsupported.", [], []);
  }
  if (!isProtocolStatus(response.status)) {
    return invalid("invalid", "Runtime response status is unsupported.", [], []);
  }
  const html = isRecord(response.domSnapshotPayload) && typeof response.domSnapshotPayload.html === "string"
    ? response.domSnapshotPayload.html
    : "";
  if (html.length > input.outputBudgetChars) {
    return invalid("unsafe-output", "Runtime response DOM payload exceeded the output budget.", ["runtime-dom-over-budget"], []);
  }
  if (/<!doctype html>|<html[\s>]/i.test(html) && html.length > Math.min(input.outputBudgetChars, 4_000)) {
    return invalid("unsafe-output", "Runtime response looked like a raw page dump.", ["raw-page-dump-blocked"], ["raw-dom"]);
  }
  if (containsSecretLikeText(JSON.stringify(response))) {
    redactions.add("secret-looking-runtime-output");
    warnings.add("runtime-output-redacted");
  }
  const safeResponse: BrowserRuntimeProtocolResponse = {
    version: "browser-runtime-protocol/v1",
    status: response.status,
    runtimeId: safeString(response.runtimeId, "runtime"),
    sessionId: safeString(response.sessionId, "session"),
    currentUrlSummary: safeString(response.currentUrlSummary, "about:blank", 180),
    title: typeof response.title === "string" ? sanitizeBrowserText(response.title, 160) : undefined,
    domSnapshotPayload: isRecord(response.domSnapshotPayload)
      ? {
          html: typeof response.domSnapshotPayload.html === "string" ? response.domSnapshotPayload.html : undefined,
          title: typeof response.domSnapshotPayload.title === "string" ? sanitizeBrowserText(response.domSnapshotPayload.title, 160) : undefined,
          textSummary: typeof response.domSnapshotPayload.textSummary === "string" ? redactProtocolText(response.domSnapshotPayload.textSummary, redactions) : undefined,
        }
      : undefined,
    accessibilitySnapshotPayload: isRecord(response.accessibilitySnapshotPayload) && Array.isArray(response.accessibilitySnapshotPayload.nodes)
      ? { nodes: response.accessibilitySnapshotPayload.nodes.map(safeAccessibilityNode).slice(0, 40) }
      : undefined,
    actionTargetResult: isRecord(response.actionTargetResult)
      ? {
          targetId: typeof response.actionTargetResult.targetId === "string" ? sanitizeBrowserText(response.actionTargetResult.targetId, 120) : undefined,
          selectorSummary: typeof response.actionTargetResult.selectorSummary === "string" ? sanitizeBrowserText(response.actionTargetResult.selectorSummary, 120) : undefined,
          accessibleName: typeof response.actionTargetResult.accessibleName === "string" ? sanitizeBrowserText(response.actionTargetResult.accessibleName, 120) : undefined,
          confidence: typeof response.actionTargetResult.confidence === "number" ? Math.max(0, Math.min(1, response.actionTargetResult.confidence)) : undefined,
        }
      : undefined,
    postActionObservation: typeof response.postActionObservation === "string" ? redactProtocolText(response.postActionObservation, redactions) : undefined,
    warnings: unique([...toStringArray(response.warnings), ...warnings]),
    redactions: unique([...toStringArray(response.redactions), ...redactions]),
    errorSummary: typeof response.errorSummary === "string" ? sanitizeBrowserText(response.errorSummary, 220) : undefined,
    rawContent: response.rawContent === "internal-only" ? "internal-only" : "excluded",
  };
  return {
    ok: true,
    response: safeResponse,
    warnings: safeResponse.warnings,
    redactions: safeResponse.redactions,
    evidence: [
      "browser-runtime-protocol:validated",
      "browser-runtime-protocol:no-runtime-launch",
      "browser-runtime-protocol:no-provider-or-model-call",
    ],
  };
}

export function parseBrowserRuntimeProtocolResponseJson(input: string, outputBudgetChars: number): BrowserRuntimeProtocolValidation {
  try {
    return validateBrowserRuntimeProtocolResponse({
      response: JSON.parse(input),
      outputBudgetChars,
    });
  } catch {
    return invalid("invalid", "Runtime response was not valid JSON.", ["runtime-invalid-json"], []);
  }
}

function invalid(
  status: "invalid" | "unsafe-output",
  reason: string,
  warnings: readonly string[],
  redactions: readonly string[],
): BrowserRuntimeProtocolValidation {
  return {
    ok: false,
    status,
    reason: sanitizeBrowserText(reason, 220),
    warnings,
    redactions,
    evidence: [
      `browser-runtime-protocol:${status}`,
      "browser-runtime-protocol:no-runtime-launch",
      "browser-runtime-protocol:no-provider-or-model-call",
    ],
  };
}

function safeAccessibilityNode(value: unknown): BrowserAccessibilityNodeInput {
  const node = isRecord(value) ? value : {};
  return {
    role: safeString(node.role, "generic", 60),
    name: typeof node.name === "string" ? redactProtocolText(node.name, new Set()) : undefined,
    selector: typeof node.selector === "string" ? sanitizeBrowserText(node.selector, 120) : undefined,
    disabled: node.disabled === true,
    hidden: node.hidden === true,
  };
}

function safeString(value: unknown, fallback: string, maxLength = 120): string {
  return sanitizeBrowserText(typeof value === "string" ? value : fallback, maxLength);
}

function redactProtocolText(value: string, redactions: Set<string>): string {
  return sanitizeBrowserText(value, Math.max(280, value.length))
    .replace(/\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, () => {
      redactions.add("secret-looking-token");
      return "[REDACTED_SECRET]";
    })
    .replace(/\b(api[_ -]?key|token|authorization|password|secret)\s*[:=]\s*[^\s<>"']+/gi, (match) => {
      redactions.add("secret-looking-field");
      const label = match.split(/[:=]/)[0] ?? "secret";
      return `${label}=[REDACTED_SECRET]`;
    })
    .replace(/\b(hidden reasoning|chain[- ]?of[- ]?thought)\b/gi, () => {
      redactions.add("hidden-reasoning-label");
      return "[REDACTED_REASONING]";
    });
}

function containsSecretLikeText(value: string): boolean {
  return /\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|api[_ -]?key|authorization|hidden reasoning|chain[- ]?of[- ]?thought)\b/i.test(value);
}

function isProtocolStatus(value: unknown): value is BrowserRuntimeProtocolResponseStatus {
  return ["ok", "blocked", "unavailable", "invalid", "timed-out", "error"].includes(String(value));
}

function toProtocolAction(value: string): BrowserRuntimeProtocolAction {
  return ["runtime-status", "navigate", "observe", "extract", "click", "type", "close"].includes(value)
    ? value as BrowserRuntimeProtocolAction
    : "close";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toStringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => sanitizeBrowserText(item, 120)) : [];
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort();
}
