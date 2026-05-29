import type {
  ExecutionAuthorityMode,
  ExecutionPolicyMetadata,
} from "../runtime/execution/executionService.js";
import type { RuntimeExecutionReceiptProjection } from "../runtime/execution/executionReceipt.js";
import type { ToolExecutionResult } from "./types.js";

export type ToolInterceptionDecisionStatus =
  | "allow"
  | "block"
  | "request_authority"
  | "redact_then_allow"
  | "observe_only"
  | "unsupported"
  | "rejected";

export type ToolInterceptionRiskLevel = "low" | "medium" | "high" | "unknown";

export type ToolInterceptionRedactionStatus = "report-safe" | "redacted";

export type ToolForbiddenInterceptionOutcome =
  | "execute-tool"
  | "bypass-authority"
  | "mutate-file"
  | "run-shell"
  | "call-provider"
  | "declare-success"
  | "alter-hidden-transcript";

export interface ToolInterceptionIntent {
  readonly interceptionId: string;
  readonly toolId: string;
  readonly toolKind: string;
  readonly caller: string;
  readonly operationKind: string;
  readonly requestedActionSummary: string;
  readonly authorityMode: ExecutionAuthorityMode;
  readonly riskLevel: ToolInterceptionRiskLevel;
  readonly inputRedactionStatus: ToolInterceptionRedactionStatus;
  readonly notProvenClaims: readonly string[];
}

export interface ToolBeforePolicyDecision {
  readonly decisionId: string;
  readonly intent: ToolInterceptionIntent;
  readonly status: ToolInterceptionDecisionStatus;
  readonly reason: string;
  readonly policySource: string;
  readonly authorityRequirement: ExecutionAuthorityMode;
  readonly redactionStatus: ToolInterceptionRedactionStatus;
  readonly reportSafeSummary: string;
  readonly terminalSuccessClaim: false;
  readonly forbiddenOutcomes: readonly ToolForbiddenInterceptionOutcome[];
  readonly hookPolicyOutcomes: readonly string[];
  readonly notProvenClaims: readonly string[];
}

export interface ToolAfterObservationAnnotation {
  readonly annotationId: string;
  readonly decisionId?: string;
  readonly toolId: string;
  readonly resultStatus: "tool-success-observed" | "tool-failure-observed" | "not-executed";
  readonly executionReceiptId?: string;
  readonly resultDetailsId?: string;
  readonly redactionStatus: ToolInterceptionRedactionStatus;
  readonly annotations: readonly string[];
  readonly nextActionSuggestions: readonly string[];
  readonly blockedFollowUp?: string;
  readonly reportSafeSummary: string;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export function createToolInterceptionIntent(input: {
  readonly toolId: string;
  readonly toolKind?: string;
  readonly caller: string;
  readonly operationKind: string;
  readonly requestedActionSummary: string;
  readonly authorityMode?: ExecutionAuthorityMode;
  readonly riskLevel?: ToolInterceptionRiskLevel;
  readonly input?: unknown;
  readonly notProvenClaims?: readonly string[];
}): ToolInterceptionIntent {
  const redactions = new Set<string>();
  const toolId = sanitizeWithTracking(input.toolId, redactions, 80);
  const caller = sanitizeWithTracking(input.caller, redactions, 100);
  const operationKind = sanitizeWithTracking(input.operationKind, redactions, 80);
  const summary = sanitizeWithTracking(input.requestedActionSummary, redactions, 180);
  const inputRedaction = input.input === undefined
    ? false
    : sanitizeValue(input.input).redacted;

  return deepFreeze({
    interceptionId: stableId("tool-interception", [
      toolId,
      caller,
      operationKind,
      summary,
    ]),
    toolId,
    toolKind: sanitizeWithTracking(input.toolKind ?? "tool", redactions, 80),
    caller,
    operationKind,
    requestedActionSummary: summary,
    authorityMode: input.authorityMode ?? "unknown-transitional",
    riskLevel: input.riskLevel ?? "unknown",
    inputRedactionStatus: redactions.size > 0 || inputRedaction ? "redacted" : "report-safe",
    notProvenClaims: unique([
      "tool-execution",
      "tool-success",
      "terminal-success",
      ...(input.notProvenClaims ?? []),
    ]),
  });
}

export function createToolBeforePolicyDecision(input: {
  readonly intent: ToolInterceptionIntent;
  readonly status: ToolInterceptionDecisionStatus;
  readonly reason: string;
  readonly policySource: string;
  readonly authorityRequirement?: ExecutionAuthorityMode;
  readonly reportSafeSummary?: string;
  readonly hookPolicyOutcomes?: readonly string[];
  readonly forbiddenOutcomes?: readonly ToolForbiddenInterceptionOutcome[];
  readonly notProvenClaims?: readonly string[];
}): ToolBeforePolicyDecision {
  const forbiddenOutcomes = unique(input.forbiddenOutcomes ?? []);
  const status = forbiddenOutcomes.length > 0 ? "rejected" : input.status;
  const redactions = new Set<string>();
  const reason = forbiddenOutcomes.length > 0
    ? `forbidden tool interception outcome rejected: ${forbiddenOutcomes.join(",")}`
    : sanitizeWithTracking(input.reason, redactions, 180);
  const reportSafeSummary = sanitizeWithTracking(
    input.reportSafeSummary ?? input.intent.requestedActionSummary,
    redactions,
    180,
  );
  const hookPolicyOutcomes = unique(
    (input.hookPolicyOutcomes ?? []).map((outcome) =>
      sanitizeWithTracking(outcome, redactions, 100),
    ),
  );

  return deepFreeze({
    decisionId: stableId("tool-policy-decision", [
      input.intent.interceptionId,
      status,
      input.policySource,
      reason,
    ]),
    intent: input.intent,
    status,
    reason,
    policySource: sanitizeWithTracking(input.policySource, redactions, 100),
    authorityRequirement: input.authorityRequirement ?? input.intent.authorityMode,
    redactionStatus:
      redactions.size > 0 || input.intent.inputRedactionStatus === "redacted"
        ? "redacted"
        : "report-safe",
    reportSafeSummary,
    terminalSuccessClaim: false,
    forbiddenOutcomes,
    hookPolicyOutcomes,
    notProvenClaims: unique([
      ...input.intent.notProvenClaims,
      "provider-success",
      "verification-success",
      "repair-success",
      ...(input.notProvenClaims ?? []),
    ]),
  });
}

export function shouldPreventToolExecution(
  decision: ToolBeforePolicyDecision,
): boolean {
  return decision.status === "block" ||
    decision.status === "request_authority" ||
    decision.status === "unsupported" ||
    decision.status === "rejected";
}

export function executionPolicyMetadataFromToolDecision(
  decision: ToolBeforePolicyDecision,
): ExecutionPolicyMetadata {
  return {
    decisionId: decision.decisionId,
    decisionStatus: decision.status,
    policySource: decision.policySource,
    authorityRequirement: decision.authorityRequirement,
    redactionStatus: decision.redactionStatus,
    reportSafeSummary: decision.reportSafeSummary,
    terminalSuccessClaim: false,
    notProvenClaims: decision.notProvenClaims,
  };
}

export function createToolAfterObservationAnnotation(input: {
  readonly decision?: ToolBeforePolicyDecision;
  readonly toolId: string;
  readonly resultStatus: "tool-success-observed" | "tool-failure-observed" | "not-executed";
  readonly executionReceipt?: RuntimeExecutionReceiptProjection;
  readonly resultDetailsId?: string;
  readonly annotations?: readonly string[];
  readonly nextActionSuggestions?: readonly string[];
  readonly blockedFollowUp?: string;
  readonly reportSafeSummary: string;
  readonly notProvenClaims?: readonly string[];
}): ToolAfterObservationAnnotation {
  const redactions = new Set<string>();
  const annotations = unique(
    (input.annotations ?? []).map((annotation) =>
      sanitizeWithTracking(annotation, redactions, 120),
    ),
  );
  const nextActionSuggestions = unique(
    (input.nextActionSuggestions ?? []).map((suggestion) =>
      sanitizeWithTracking(suggestion, redactions, 140),
    ),
  );
  const blockedFollowUp = input.blockedFollowUp
    ? sanitizeWithTracking(input.blockedFollowUp, redactions, 140)
    : undefined;
  const reportSafeSummary = sanitizeWithTracking(input.reportSafeSummary, redactions, 180);

  return deepFreeze({
    annotationId: stableId("tool-result-annotation", [
      input.decision?.decisionId ?? input.toolId,
      input.resultStatus,
      reportSafeSummary,
    ]),
    ...(input.decision ? { decisionId: input.decision.decisionId } : {}),
    toolId: sanitizeWithTracking(input.toolId, redactions, 80),
    resultStatus: input.resultStatus,
    ...(input.executionReceipt ? { executionReceiptId: input.executionReceipt.receiptId } : {}),
    ...(input.resultDetailsId ? {
      resultDetailsId: sanitizeWithTracking(input.resultDetailsId, redactions, 100),
    } : {}),
    redactionStatus:
      redactions.size > 0 ||
      input.decision?.redactionStatus === "redacted" ||
      input.executionReceipt?.redaction.status === "redacted"
        ? "redacted"
        : "report-safe",
    annotations,
    nextActionSuggestions,
    ...(blockedFollowUp ? { blockedFollowUp } : {}),
    reportSafeSummary,
    terminalSuccessClaim: false,
    notProvenClaims: unique([
      "terminal-success",
      "verification-success",
      "repair-success",
      ...(input.decision?.notProvenClaims ?? []),
      ...(input.executionReceipt?.notProvenClaims ?? []),
      ...(input.notProvenClaims ?? []),
    ]),
  });
}

export function createBlockedToolInterceptionResult(
  decision: ToolBeforePolicyDecision,
): ToolExecutionResult {
  const annotation = createToolAfterObservationAnnotation({
    decision,
    toolId: decision.intent.toolId,
    resultStatus: "not-executed",
    annotations: [`tool-policy:${decision.status}`],
    nextActionSuggestions: [
      decision.status === "request_authority"
        ? "Request explicit authority before retrying this tool."
        : "Retry with an allowed tool action.",
    ],
    blockedFollowUp: decision.reason,
    reportSafeSummary: decision.reportSafeSummary,
  });

  const redactionStatus: "report-safe" | "redacted" =
    decision.redactionStatus === "redacted" ||
    annotation.redactionStatus === "redacted"
      ? "redacted"
      : "report-safe";

  return {
    success: false,
    error: decision.reason,
    content: decision.reportSafeSummary,
    details: {
      toolInterception: {
        beforeDecision: decision,
        afterAnnotation: annotation,
      },
    },
    reportSafe: {
      redactionStatus,
      notProvenClaims: unique([
        ...decision.notProvenClaims,
        ...annotation.notProvenClaims,
      ]),
      toolInterception: {
        beforeDecision: decision,
        afterAnnotation: annotation,
      },
    },
    metadata: {
      executionStatus: "not-executed",
      toolInterception: {
        beforeDecision: decision,
        afterAnnotation: annotation,
      },
    },
  };
}

const REDACTION_PATTERNS: readonly RegExp[] = [
  /\/home\/wang\/\.private-agents-real[^\s"']*/g,
  /\bsk-[A-Za-z0-9_-]{8,}\b/g,
  /\bBearer\s+[A-Za-z0-9._-]+/gi,
  /\btoken=[^\s;,)]+/gi,
  /\bauthorization[:=][^\s;,)]+/gi,
  /\bapi[_-]?key[:=][^\s;,)]+/gi,
  /\bauth(?:orization)?[_-]?header[:=][^\n\r]*/gi,
  /\bprovider\.env\b[^\n\r]*/gi,
  /\boldText[:=][\s\S]*?(?=\snewText[:=]|$)/gi,
  /\bnewText[:=][^\n\r]*/gi,
  /\braw provider output[:=][^\n\r]*/gi,
  /\bhidden reasoning[:=]?[^\n\r]*/gi,
  /<html[\s\S]*?<\/html>/gi,
];

function sanitizeValue(input: unknown): { readonly redacted: boolean } {
  if (typeof input === "string") {
    return { redacted: sanitizeText(input).redacted };
  }
  if (Array.isArray(input)) {
    return { redacted: input.some((item) => sanitizeValue(item).redacted) };
  }
  if (input && typeof input === "object") {
    return {
      redacted: Object.entries(input).some(([key, value]) =>
        sanitizeText(key).redacted || sanitizeValue(value).redacted,
      ),
    };
  }
  return { redacted: false };
}

function sanitizeWithTracking(
  value: string,
  redactions: Set<string>,
  maxLength: number,
): string {
  const sanitized = sanitizeText(value).value.replace(/\s+/g, " ").trim().slice(0, maxLength);
  if (sanitizeText(value).redacted) {
    redactions.add("unsafe-content-redacted");
  }
  if (value.length > maxLength) {
    redactions.add("output-truncated");
  }
  return sanitized;
}

function sanitizeText(input: string): {
  readonly value: string;
  readonly redacted: boolean;
} {
  let value = input;
  const before = value;
  for (const pattern of REDACTION_PATTERNS) {
    value = value.replace(pattern, "[raw-content-excluded]");
  }
  return { value, redacted: value !== before };
}

function stableId(prefix: string, parts: readonly string[]): string {
  const suffix = parts
    .join(":")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
  return suffix ? `${prefix}:${suffix}` : prefix;
}

function unique<T extends string>(values: readonly T[]): readonly T[] {
  return Object.freeze(Array.from(new Set(values)).sort());
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}
