import { sanitizeBrowserText } from "../../capabilityModel.js";
import type { BrowserExecutionRequest } from "../../executionContract.js";
import { sanitizeBrowserEvidenceText } from "../../localFixture.js";
export interface BrowserExternalRunnerCommand {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd?: string;
}

export type BrowserExternalRunnerAction = "observe" | "extract" | "navigate-local";
export type BrowserExternalRunnerMode = "external-local" | "skill-managed" | "test-local";
export type BrowserExternalRunnerStatus =
  | "executed"
  | "blocked"
  | "unavailable"
  | "failed"
  | "timed-out"
  | "invalid-response";

export interface BrowserExternalRunnerEvidence {
  readonly safeTitle?: string;
  readonly safeUrl?: string;
  readonly safeObservationSummary?: string;
  readonly safeExtractionSummary?: string;
  readonly actionTraceSummary?: string;
  readonly warnings?: readonly string[];
  readonly redactions?: readonly string[];
}

export interface BrowserExternalRunnerError {
  readonly code: string;
  readonly message: string;
}

export interface BrowserExternalRunnerRequest {
  readonly requestId: string;
  readonly action: BrowserExternalRunnerAction;
  readonly mode: BrowserExternalRunnerMode;
  readonly fixtureId: string;
  readonly safeUrl: string;
  readonly extractionGoal?: string;
  readonly sandboxDecision: string;
  readonly allowlistDecision: string;
  readonly confirmationDecision: string;
  readonly outputBudgetBytes: number;
  readonly rawContent: "excluded";
}

export interface BrowserExternalRunnerResponse {
  readonly status: BrowserExternalRunnerStatus;
  readonly executed: boolean;
  readonly mode: BrowserExternalRunnerMode;
  readonly evidence: BrowserExternalRunnerEvidence;
  readonly warnings: readonly string[];
  readonly redactions: readonly string[];
  readonly error?: BrowserExternalRunnerError;
  readonly rawContent: "excluded";
  readonly providerCall: "none";
  readonly modelCall: "none";
  readonly browserSessionPersistence: "none";
}

export type BrowserExternalRunnerValidationResult<T> =
  | {
      readonly ok: true;
      readonly value: T;
      readonly evidence: readonly string[];
      readonly warnings: readonly string[];
      readonly redactions: readonly string[];
    }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly evidence: readonly string[];
      readonly warnings: readonly string[];
      readonly redactions: readonly string[];
    };

export function browserExternalRunnerActionForRequest(
  request: BrowserExecutionRequest,
): BrowserExternalRunnerAction {
  if (request.actionKind === "navigate") {
    return "navigate-local";
  }
  if (request.actionKind === "extract") {
    return "extract";
  }
  return "observe";
}

export function createBrowserExternalRunnerRequest(input: {
  readonly request: BrowserExecutionRequest;
  readonly mode: BrowserExternalRunnerMode;
  readonly fixtureId: string;
  readonly safeUrl: string;
  readonly outputBudgetBytes: number;
  readonly sandboxDecision: string;
  readonly allowlistDecision: string;
  readonly confirmationDecision: string;
}): BrowserExternalRunnerRequest {
  return {
    requestId: sanitizeBrowserText(input.request.requestId, 100),
    action: browserExternalRunnerActionForRequest(input.request),
    mode: input.mode,
    fixtureId: sanitizeBrowserText(input.fixtureId, 120),
    safeUrl: sanitizeBrowserText(input.safeUrl, 120),
    extractionGoal: input.request.action.extractionGoal
      ? sanitizeBrowserText(input.request.action.extractionGoal, 120)
      : undefined,
    sandboxDecision: sanitizeBrowserText(input.sandboxDecision, 120),
    allowlistDecision: sanitizeBrowserText(input.allowlistDecision, 120),
    confirmationDecision: sanitizeBrowserText(input.confirmationDecision, 120),
    outputBudgetBytes: input.outputBudgetBytes,
    rawContent: "excluded",
  };
}

export function validateBrowserExternalRunnerRequest(
  value: unknown,
): BrowserExternalRunnerValidationResult<BrowserExternalRunnerRequest> {
  if (!isRecord(value)) {
    return invalid("External runner request must be a JSON object.");
  }
  const requestId = stringValue(value.requestId);
  const action = stringValue(value.action);
  const mode = stringValue(value.mode);
  const fixtureId = stringValue(value.fixtureId);
  const safeUrl = stringValue(value.safeUrl);
  const outputBudgetBytes = numberValue(value.outputBudgetBytes);
  if (!requestId || !isRunnerAction(action) || !isRunnerMode(mode) || !fixtureId || !safeUrl || !outputBudgetBytes) {
    return invalid("External runner request is missing required safe fields.");
  }
  if (!safeUrl.startsWith("local-fixture://")) {
    return invalid("External runner request may only target local fixtures.");
  }
  if (value.rawContent !== "excluded") {
    return invalid("External runner request must exclude raw content.");
  }
  const unsafe = [
    requestId,
    fixtureId,
    safeUrl,
    stringValue(value.extractionGoal),
    stringValue(value.sandboxDecision),
    stringValue(value.allowlistDecision),
    stringValue(value.confirmationDecision),
  ].find((item) => item && browserExternalRunnerHasForbiddenContent(item));
  if (unsafe) {
    return invalid("External runner request contains unsafe raw content.");
  }
  return {
    ok: true,
    value: {
      requestId,
      action,
      mode,
      fixtureId,
      safeUrl,
      extractionGoal: stringValue(value.extractionGoal),
      sandboxDecision: stringValue(value.sandboxDecision) ?? "unknown",
      allowlistDecision: stringValue(value.allowlistDecision) ?? "unknown",
      confirmationDecision: stringValue(value.confirmationDecision) ?? "unknown",
      outputBudgetBytes,
      rawContent: "excluded",
    },
    evidence: [
      "browser-external-runner-protocol:request-valid",
      "browser-external-runner-protocol:local-fixture-only",
      "browser-external-runner-protocol:no-raw-content",
    ],
    warnings: [],
    redactions: [],
  };
}

export function validateBrowserExternalRunnerResponse(
  value: unknown,
): BrowserExternalRunnerValidationResult<BrowserExternalRunnerResponse> {
  if (!isRecord(value)) {
    return invalid("External runner response must be a JSON object.");
  }
  const status = stringValue(value.status);
  const mode = stringValue(value.mode);
  if (!isRunnerStatus(status) || !isRunnerMode(mode) || typeof value.executed !== "boolean") {
    return invalid("External runner response is missing required status fields.");
  }
  if (value.rawContent !== "excluded" || value.providerCall !== "none" || value.modelCall !== "none") {
    return invalid("External runner response must exclude raw content and provider/model calls.");
  }
  if (value.browserSessionPersistence !== "none") {
    return invalid("External runner response must not persist browser sessions.");
  }
  if (browserExternalRunnerHasForbiddenContent(JSON.stringify(value))) {
    return invalid("External runner response contains unsafe or raw content.", ["external-runner-response"]);
  }
  const rawEvidence = isRecord(value.evidence) ? value.evidence : {};
  const evidence = sanitizeEvidence(rawEvidence);
  const warnings = safeStringArray(value.warnings, 6, 120);
  const redactions = safeStringArray(value.redactions, 8, 80);
  const error = isRecord(value.error)
    ? sanitizeError(value.error)
    : undefined;
  const encoded = JSON.stringify({ evidence, warnings, redactions, error });
  if (browserExternalRunnerHasForbiddenContent(encoded)) {
    return invalid("External runner response contains unsafe or raw content.", ["external-runner-response"]);
  }
  return {
    ok: true,
    value: {
      status,
      executed: value.executed,
      mode,
      evidence,
      warnings,
      redactions,
      error,
      rawContent: "excluded",
      providerCall: "none",
      modelCall: "none",
      browserSessionPersistence: "none",
    },
    evidence: [
      "browser-external-runner-protocol:response-valid",
      "browser-external-runner-protocol:safe-summary-only",
      "browser-external-runner-protocol:no-provider-or-model-call",
    ],
    warnings,
    redactions,
  };
}

export function browserExternalRunnerHasForbiddenContent(value: string): boolean {
  return (
    /<[^>]+>/.test(value) ||
    /\bRAW_[A-Z0-9_]+\b/.test(value) ||
    /\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/.test(value) ||
    /\b(hidden reasoning|chain[- ]?of[- ]?thought)\b/i.test(value) ||
    /\b(auth token|api key|provider credential)\b/i.test(value) ||
    /\bdata:image\/|base64,|screenshot|ocr\b/i.test(value)
  );
}

function sanitizeEvidence(value: Record<string, unknown>): BrowserExternalRunnerEvidence {
  return {
    safeTitle: optionalSafeText(value.safeTitle, 80),
    safeUrl: optionalSafeText(value.safeUrl, 120),
    safeObservationSummary: optionalSafeText(value.safeObservationSummary, 180),
    safeExtractionSummary: optionalSafeText(value.safeExtractionSummary, 180),
    actionTraceSummary: optionalSafeText(value.actionTraceSummary, 160),
    warnings: safeStringArray(value.warnings, 6, 120),
    redactions: safeStringArray(value.redactions, 8, 80),
  };
}

function sanitizeError(value: Record<string, unknown>): BrowserExternalRunnerError | undefined {
  const code = optionalSafeText(value.code, 80);
  const message = optionalSafeText(value.message, 180);
  if (!code || !message) {
    return undefined;
  }
  return { code, message };
}

function optionalSafeText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }
  return sanitizeBrowserEvidenceText(value, maxLength).value;
}

function safeStringArray(value: unknown, maxItems: number, maxLength: number): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .slice(0, maxItems)
    .map((item) => sanitizeBrowserEvidenceText(item, maxLength).value);
}

function invalid(
  reason: string,
  redactions: readonly string[] = [],
): Extract<BrowserExternalRunnerValidationResult<never>, { ok: false }> {
  return {
    ok: false,
    reason,
    evidence: ["browser-external-runner-protocol:invalid"],
    warnings: ["browser-external-runner-protocol:blocked"],
    redactions,
  };
}

function isRunnerAction(value: unknown): value is BrowserExternalRunnerAction {
  return value === "observe" || value === "extract" || value === "navigate-local";
}

function isRunnerMode(value: unknown): value is BrowserExternalRunnerMode {
  return value === "external-local" || value === "skill-managed" || value === "test-local";
}

function isRunnerStatus(value: unknown): value is BrowserExternalRunnerStatus {
  return (
    value === "executed" ||
    value === "blocked" ||
    value === "unavailable" ||
    value === "failed" ||
    value === "timed-out" ||
    value === "invalid-response"
  );
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
