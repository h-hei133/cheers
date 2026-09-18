import { sanitizeBrowserText } from "../../browserCapabilityModel.js";
import type { BrowserExecutionRequest } from "../../browserExecutionContract.js";
import type { BrowserSkillRunnerBindingMode } from "../runner/binding.js";
import type { BrowserSkillRunnerMetadata } from "../runner/metadata.js";
import { browserExternalRunnerHasForbiddenContent } from "../../runtime/external/protocol.js";
import { sanitizeBrowserEvidenceText } from "../../browserLocalFixture.js";

export type BrowserSkillExecutionAction = "observe" | "extract" | "navigate-local";
export type BrowserSkillExecutionStatus =
  | "executed"
  | "blocked"
  | "unavailable"
  | "failed"
  | "timed-out"
  | "invalid-response"
  | "unsafe-output";
export type BrowserSkillExecutionMode =
  | "skill-managed-test-local"
  | "skill-managed-explicit-local"
  | "future-skill-runtime";

export interface BrowserSkillExecutionEvidence {
  readonly safeTitle?: string;
  readonly safeUrl?: string;
  readonly safeObservationSummary?: string;
  readonly safeExtractionSummary?: string;
  readonly actionTraceSummary?: string;
  readonly receiptHint?: string;
  readonly replayHint?: string;
  readonly warnings?: readonly string[];
  readonly redactions?: readonly string[];
}

export interface BrowserSkillExecutionError {
  readonly code: string;
  readonly message: string;
}

export interface BrowserSkillExecutionRequest {
  readonly requestId: string;
  readonly skillId: string;
  readonly skillRunnerMetadataId: string;
  readonly skillRunnerMetadataVersion: string;
  readonly action: BrowserSkillExecutionAction;
  readonly mode: BrowserSkillExecutionMode;
  readonly fixtureId: string;
  readonly safeUrl: string;
  readonly extractionGoal?: string;
  readonly sandboxDecision: string;
  readonly allowlistDecision: string;
  readonly confirmationDecision: string;
  readonly evidenceContractId: "safe-summary-only";
  readonly replayContractId: "receipt-reference-only";
  readonly outputBudgetBytes: number;
  readonly rawContent: "excluded";
}

export interface BrowserSkillExecutionResponse {
  readonly status: BrowserSkillExecutionStatus;
  readonly executed: boolean;
  readonly mode: BrowserSkillExecutionMode;
  readonly evidence: BrowserSkillExecutionEvidence;
  readonly warnings: readonly string[];
  readonly redactions: readonly string[];
  readonly error?: BrowserSkillExecutionError;
  readonly rawContent: "excluded";
  readonly providerCall: "none";
  readonly modelCall: "none";
  readonly browserSessionPersistence: "none";
}

export type BrowserSkillExecutionValidationResult<T> =
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

export function browserSkillExecutionModeForBinding(
  mode: BrowserSkillRunnerBindingMode,
): BrowserSkillExecutionMode {
  if (mode === "test-local-process") {
    return "skill-managed-test-local";
  }
  if (mode === "external-local-process") {
    return "skill-managed-explicit-local";
  }
  return "future-skill-runtime";
}

export function browserSkillExecutionActionForRequest(
  request: BrowserExecutionRequest,
): BrowserSkillExecutionAction {
  if (request.actionKind === "navigate") {
    return "navigate-local";
  }
  if (request.actionKind === "extract") {
    return "extract";
  }
  return "observe";
}

export function createBrowserSkillExecutionRequest(input: {
  readonly request: BrowserExecutionRequest;
  readonly metadata: BrowserSkillRunnerMetadata;
  readonly mode: BrowserSkillExecutionMode;
  readonly fixtureId: string;
  readonly safeUrl: string;
  readonly outputBudgetBytes: number;
  readonly sandboxDecision: string;
  readonly allowlistDecision: string;
  readonly confirmationDecision: string;
}): BrowserSkillExecutionRequest {
  return {
    requestId: sanitizeBrowserText(input.request.requestId, 100),
    skillId: sanitizeBrowserText(input.metadata.skillId, 120),
    skillRunnerMetadataId: sanitizeBrowserText(input.metadata.runnerId, 120),
    skillRunnerMetadataVersion: sanitizeBrowserText(input.metadata.runnerVersion, 80),
    action: browserSkillExecutionActionForRequest(input.request),
    mode: input.mode,
    fixtureId: sanitizeBrowserText(input.fixtureId, 120),
    safeUrl: sanitizeBrowserText(input.safeUrl, 120),
    extractionGoal: input.request.action.extractionGoal
      ? sanitizeBrowserText(input.request.action.extractionGoal, 120)
      : undefined,
    sandboxDecision: sanitizeBrowserText(input.sandboxDecision, 120),
    allowlistDecision: sanitizeBrowserText(input.allowlistDecision, 120),
    confirmationDecision: sanitizeBrowserText(input.confirmationDecision, 120),
    evidenceContractId: "safe-summary-only",
    replayContractId: "receipt-reference-only",
    outputBudgetBytes: input.outputBudgetBytes,
    rawContent: "excluded",
  };
}

export function validateBrowserSkillExecutionRequest(
  value: unknown,
): BrowserSkillExecutionValidationResult<BrowserSkillExecutionRequest> {
  if (!isRecord(value)) {
    return invalid("Skill execution request must be a JSON object.");
  }
  const requestId = stringValue(value.requestId);
  const skillId = stringValue(value.skillId);
  const metadataId = stringValue(value.skillRunnerMetadataId);
  const metadataVersion = stringValue(value.skillRunnerMetadataVersion);
  const action = stringValue(value.action);
  const mode = stringValue(value.mode);
  const fixtureId = stringValue(value.fixtureId);
  const safeUrl = stringValue(value.safeUrl);
  const outputBudgetBytes = numberValue(value.outputBudgetBytes);
  if (
    !requestId ||
    !skillId ||
    !metadataId ||
    !metadataVersion ||
    !isSkillAction(action) ||
    !isSkillMode(mode) ||
    !fixtureId ||
    !safeUrl ||
    !outputBudgetBytes
  ) {
    return invalid("Skill execution request is missing required safe fields.");
  }
  if (!safeUrl.startsWith("local-fixture://")) {
    return invalid("Skill execution request may only target local fixtures.");
  }
  if (
    value.rawContent !== "excluded" ||
    value.evidenceContractId !== "safe-summary-only" ||
    value.replayContractId !== "receipt-reference-only"
  ) {
    return invalid("Skill execution request must exclude raw content and use safe contracts.");
  }
  const encoded = JSON.stringify(value);
  if (browserExternalRunnerHasForbiddenContent(encoded)) {
    return invalid("Skill execution request contains unsafe or raw content.", ["skill-execution-request"]);
  }
  return {
    ok: true,
    value: {
      requestId,
      skillId,
      skillRunnerMetadataId: metadataId,
      skillRunnerMetadataVersion: metadataVersion,
      action,
      mode,
      fixtureId,
      safeUrl,
      extractionGoal: stringValue(value.extractionGoal),
      sandboxDecision: stringValue(value.sandboxDecision) ?? "unknown",
      allowlistDecision: stringValue(value.allowlistDecision) ?? "unknown",
      confirmationDecision: stringValue(value.confirmationDecision) ?? "unknown",
      evidenceContractId: "safe-summary-only",
      replayContractId: "receipt-reference-only",
      outputBudgetBytes,
      rawContent: "excluded",
    },
    evidence: [
      "browser-skill-execution-protocol:request-valid",
      "browser-skill-execution-protocol:local-fixture-only",
      "browser-skill-execution-protocol:no-raw-content",
    ],
    warnings: [],
    redactions: [],
  };
}

export function validateBrowserSkillExecutionResponse(
  value: unknown,
): BrowserSkillExecutionValidationResult<BrowserSkillExecutionResponse> {
  if (!isRecord(value)) {
    return invalid("Skill execution response must be a JSON object.");
  }
  const status = stringValue(value.status);
  const mode = stringValue(value.mode);
  if (!isSkillStatus(status) || !isSkillMode(mode) || typeof value.executed !== "boolean") {
    return invalid("Skill execution response is missing required status fields.");
  }
  if (value.rawContent !== "excluded" || value.providerCall !== "none" || value.modelCall !== "none") {
    return invalid("Skill execution response must exclude raw content and provider/model calls.");
  }
  if (value.browserSessionPersistence !== "none") {
    return invalid("Skill execution response must not persist browser sessions.");
  }
  if (browserExternalRunnerHasForbiddenContent(JSON.stringify(value))) {
    return invalid("Skill execution response contains unsafe or raw content.", ["skill-execution-response"]);
  }
  const evidence = sanitizeEvidence(isRecord(value.evidence) ? value.evidence : {});
  const warnings = safeStringArray(value.warnings, 6, 120);
  const redactions = safeStringArray(value.redactions, 8, 80);
  const error = isRecord(value.error) ? sanitizeError(value.error) : undefined;
  const encoded = JSON.stringify({ evidence, warnings, redactions, error });
  if (browserExternalRunnerHasForbiddenContent(encoded)) {
    return invalid("Skill execution response contains unsafe or raw content.", ["skill-execution-response"]);
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
      "browser-skill-execution-protocol:response-valid",
      "browser-skill-execution-protocol:safe-summary-only",
      "browser-skill-execution-protocol:no-provider-or-model-call",
    ],
    warnings,
    redactions,
  };
}

function sanitizeEvidence(value: Record<string, unknown>): BrowserSkillExecutionEvidence {
  return {
    safeTitle: optionalSafeText(value.safeTitle, 80),
    safeUrl: optionalSafeText(value.safeUrl, 120),
    safeObservationSummary: optionalSafeText(value.safeObservationSummary, 180),
    safeExtractionSummary: optionalSafeText(value.safeExtractionSummary, 180),
    actionTraceSummary: optionalSafeText(value.actionTraceSummary, 160),
    receiptHint: optionalSafeText(value.receiptHint, 120),
    replayHint: optionalSafeText(value.replayHint, 120),
    warnings: safeStringArray(value.warnings, 6, 120),
    redactions: safeStringArray(value.redactions, 8, 80),
  };
}

function sanitizeError(value: Record<string, unknown>): BrowserSkillExecutionError | undefined {
  const code = optionalSafeText(value.code, 80);
  const message = optionalSafeText(value.message, 180);
  return code && message ? { code, message } : undefined;
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
): Extract<BrowserSkillExecutionValidationResult<never>, { ok: false }> {
  return {
    ok: false,
    reason,
    evidence: ["browser-skill-execution-protocol:invalid"],
    warnings: ["browser-skill-execution-protocol:blocked"],
    redactions,
  };
}

function isSkillAction(value: unknown): value is BrowserSkillExecutionAction {
  return value === "observe" || value === "extract" || value === "navigate-local";
}

function isSkillMode(value: unknown): value is BrowserSkillExecutionMode {
  return value === "skill-managed-test-local" ||
    value === "skill-managed-explicit-local" ||
    value === "future-skill-runtime";
}

function isSkillStatus(value: unknown): value is BrowserSkillExecutionStatus {
  return value === "executed" ||
    value === "blocked" ||
    value === "unavailable" ||
    value === "failed" ||
    value === "timed-out" ||
    value === "invalid-response" ||
    value === "unsafe-output";
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
