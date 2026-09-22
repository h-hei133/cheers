import { freezeDeep } from "../core/values/freeze.js";
import type { ModelResponseBoundary } from "../provider/response/boundary.js";
import type { AssistantResponseState } from "../turn/assistantResponse.js";
import { isAllowlistedTool } from "./types.js";

export type NormalizedToolCallStatus =
  | "prepared"
  | "malformed"
  | "unsupported"
  | "unknown";

export type ToolCallBatchExtractionStatus =
  | "empty"
  | "extracted"
  | "partial"
  | "failed";

export interface NormalizedToolCall {
  readonly id: string;
  readonly name: string;
  readonly kind: "allowlisted" | "unsupported" | "unknown";
  readonly status: NormalizedToolCallStatus;
  readonly argumentKeys: readonly string[];
  readonly reportSafeArguments?: Readonly<Record<string, unknown>>;
  readonly argumentSummary: string;
  readonly riskLevel: "low" | "medium" | "unknown";
  readonly beforeToolPolicy: "pending";
  readonly dispatchStatus: "not_dispatched";
  readonly redaction: {
    readonly status: "report-safe" | "redacted";
    readonly excluded: readonly string[];
  };
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface NormalizedToolCallBatch {
  readonly batchId: string;
  readonly responseId: string;
  readonly turnId?: string;
  readonly extractionStatus: ToolCallBatchExtractionStatus;
  readonly dispatchStatus: "not_dispatched";
  readonly calls: readonly NormalizedToolCall[];
  readonly malformedCallCount: number;
  readonly unsupportedCallCount: number;
  readonly unknownCallCount: number;
  readonly redaction: {
    readonly status: "report-safe" | "redacted";
    readonly excluded: readonly string[];
  };
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface ExtractToolCallBatchInput {
  readonly responseBoundary: ModelResponseBoundary;
  readonly assistantResponse: AssistantResponseState;
  readonly batchId?: string;
  readonly turnId?: string;
  readonly candidates?: readonly unknown[];
  readonly notProvenClaims?: readonly string[];
}

const REDACTION_EXCLUSIONS = [
  "api-keys",
  "provider-config",
  "auth-headers",
  "raw-provider-output",
  "oldText",
  "newText",
  "unredacted-command-output",
  "reasoning-private",
  "transcript-dumps",
  "unsafe-file-contents",
] as const;

export function extractToolCallBatch(
  input: ExtractToolCallBatchInput,
): NormalizedToolCallBatch {
  const candidates = input.candidates ?? input.assistantResponse.toolCallCandidates;
  const seenIds = new Set<string>();
  let redacted = input.responseBoundary.redaction.status === "redacted" ||
    input.assistantResponse.redaction.status === "redacted";
  const calls = candidates.map((candidate, index) => {
    const normalized = normalizeToolCall(candidate, index + 1, seenIds);
    redacted ||= normalized.redaction.status === "redacted";
    seenIds.add(normalized.id);
    return normalized;
  });
  const malformedCallCount = calls.filter((call) => call.status === "malformed").length;
  const unsupportedCallCount = calls.filter((call) => call.status === "unsupported").length;
  const unknownCallCount = calls.filter((call) => call.status === "unknown").length;
  const extractionStatus: ToolCallBatchExtractionStatus = calls.length === 0
    ? "empty"
    : malformedCallCount === calls.length
      ? "failed"
      : malformedCallCount > 0 || unsupportedCallCount > 0 || unknownCallCount > 0
        ? "partial"
        : "extracted";

  return freezeDeep({
    batchId: sanitizeText(input.batchId ?? `${input.responseBoundary.responseId}:tool-call-batch`).value,
    responseId: input.responseBoundary.responseId,
    ...(input.turnId || input.responseBoundary.turnId || input.assistantResponse.turnId
      ? { turnId: input.turnId ?? input.responseBoundary.turnId ?? input.assistantResponse.turnId }
      : {}),
    extractionStatus,
    dispatchStatus: "not_dispatched",
    calls: Object.freeze(calls),
    malformedCallCount,
    unsupportedCallCount,
    unknownCallCount,
    redaction: {
      status: redacted ? "redacted" : "report-safe",
      excluded: REDACTION_EXCLUSIONS,
    },
    notProvenClaims: Object.freeze([
      ...new Set([
        "tool-dispatch-not-run",
        "tool-results-not-available",
        "tool-success",
        "task-success",
        "verification-success",
        "terminal-success",
        ...(input.notProvenClaims ?? []),
        ...input.responseBoundary.notProvenClaims,
        ...input.assistantResponse.notProvenClaims,
        ...calls.flatMap((call) => call.notProvenClaims),
      ]),
    ]),
    terminalSuccessClaim: false,
  });
}

function normalizeToolCall(
  candidate: unknown,
  index: number,
  seenIds: ReadonlySet<string>,
): NormalizedToolCall {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return malformedCall(`malformed-tool-call-${index}`, "unknown", ["candidate-not-object"]);
  }
  const record = candidate as Record<string, unknown>;
  const idValue = typeof record.id === "string" ? sanitizeText(record.id) : undefined;
  const nameValue = typeof record.name === "string" ? sanitizeText(record.name) : undefined;
  const id = idValue?.value || `malformed-tool-call-${index}`;
  const name = nameValue?.value || "unknown";
  const argumentProjection = projectArguments(record.arguments);
  const baseRedacted = (idValue?.redacted ?? false) ||
    (nameValue?.redacted ?? false) ||
    argumentProjection.redacted;
  const baseClaims = [
    "tool-dispatch-not-run",
    "tool-success",
    "terminal-success",
  ];

  if (!idValue || !nameValue || seenIds.has(id)) {
    return freezeDeep({
      id,
      name,
      kind: nameValue ? classifyToolKind(name) : "unknown",
      status: "malformed",
      argumentKeys: argumentProjection.keys,
      ...(argumentProjection.reportSafeArguments
        ? { reportSafeArguments: argumentProjection.reportSafeArguments }
        : {}),
      argumentSummary: argumentProjection.summary,
      riskLevel: "unknown",
      beforeToolPolicy: "pending",
      dispatchStatus: "not_dispatched",
      redaction: {
        status: baseRedacted ? "redacted" : "report-safe",
        excluded: REDACTION_EXCLUSIONS,
      },
      notProvenClaims: Object.freeze([
        ...baseClaims,
        !idValue ? "tool-call-id-missing" : "tool-call-duplicate-id",
        !nameValue ? "tool-call-name-missing" : "tool-call-malformed",
      ]),
      terminalSuccessClaim: false,
    });
  }

  const kind = classifyToolKind(name);
  if (kind === "unsupported") {
    return freezeDeep({
      id,
      name,
      kind,
      status: "unsupported",
      argumentKeys: argumentProjection.keys,
      ...(argumentProjection.reportSafeArguments
        ? { reportSafeArguments: argumentProjection.reportSafeArguments }
        : {}),
      argumentSummary: argumentProjection.summary,
      riskLevel: "unknown",
      beforeToolPolicy: "pending",
      dispatchStatus: "not_dispatched",
      redaction: {
        status: baseRedacted ? "redacted" : "report-safe",
        excluded: REDACTION_EXCLUSIONS,
      },
      notProvenClaims: Object.freeze([
        ...baseClaims,
        "tool-call-unsupported",
      ]),
      terminalSuccessClaim: false,
    });
  }
  if (kind === "unknown") {
    return freezeDeep({
      id,
      name,
      kind,
      status: "unknown",
      argumentKeys: argumentProjection.keys,
      ...(argumentProjection.reportSafeArguments
        ? { reportSafeArguments: argumentProjection.reportSafeArguments }
        : {}),
      argumentSummary: argumentProjection.summary,
      riskLevel: "unknown",
      beforeToolPolicy: "pending",
      dispatchStatus: "not_dispatched",
      redaction: {
        status: baseRedacted ? "redacted" : "report-safe",
        excluded: REDACTION_EXCLUSIONS,
      },
      notProvenClaims: Object.freeze([
        ...baseClaims,
        "tool-call-unknown",
      ]),
      terminalSuccessClaim: false,
    });
  }

  return freezeDeep({
    id,
    name,
    kind,
    status: "prepared",
    argumentKeys: argumentProjection.keys,
    ...(argumentProjection.reportSafeArguments
      ? { reportSafeArguments: argumentProjection.reportSafeArguments }
      : {}),
    argumentSummary: argumentProjection.summary,
    riskLevel: "unknown",
    beforeToolPolicy: "pending",
    dispatchStatus: "not_dispatched",
    redaction: {
      status: baseRedacted ? "redacted" : "report-safe",
      excluded: REDACTION_EXCLUSIONS,
    },
    notProvenClaims: Object.freeze(baseClaims),
    terminalSuccessClaim: false,
  });
}

function malformedCall(
  id: string,
  name: string,
  claims: readonly string[],
): NormalizedToolCall {
  return freezeDeep({
    id,
    name,
    kind: "unknown",
    status: "malformed",
    argumentKeys: Object.freeze([]),
    argumentSummary: "arguments=unavailable",
    riskLevel: "unknown",
    beforeToolPolicy: "pending",
    dispatchStatus: "not_dispatched",
    redaction: {
      status: "report-safe",
      excluded: REDACTION_EXCLUSIONS,
    },
    notProvenClaims: Object.freeze([
      "tool-dispatch-not-run",
      "tool-success",
      "terminal-success",
      ...claims,
    ]),
    terminalSuccessClaim: false,
  });
}

function classifyToolKind(name: string): NormalizedToolCall["kind"] {
  if (name === "unknown") {
    return "unknown";
  }
  if (isAllowlistedTool(name)) {
    return "allowlisted";
  }
  return name.includes(".") || name.includes("__") ? "unsupported" : "unknown";
}

function projectArguments(value: unknown): {
  readonly keys: readonly string[];
  readonly reportSafeArguments?: Readonly<Record<string, unknown>>;
  readonly summary: string;
  readonly redacted: boolean;
} {
  if (value === undefined) {
    return { keys: Object.freeze([]), summary: "arguments=none", redacted: false };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    const sanitized = sanitizeText(String(value));
    return {
      keys: Object.freeze([]),
      summary: sanitized.redacted ? "arguments=redacted" : "arguments=malformed",
      redacted: sanitized.redacted,
    };
  }
  let redacted = false;
  const source = value as Record<string, unknown>;
  const projected: Record<string, unknown> = {};
  const keys = Object.keys(source).map((key) => {
    const sanitized = sanitizeText(key);
    redacted ||= sanitized.redacted;
    const child = projectReportSafeValue(source[key]);
    redacted ||= child.redacted;
    if (!child.redacted) {
      projected[sanitized.value] = child.value;
    }
    return sanitized.value;
  }).sort();
  return {
    keys: Object.freeze(keys),
    ...(redacted ? {} : { reportSafeArguments: freezeDeep(projected) }),
    summary: `argumentKeys=${keys.join(",") || "none"}; redacted=${redacted}`,
    redacted,
  };
}

function projectReportSafeValue(value: unknown): {
  readonly value?: unknown;
  readonly redacted: boolean;
} {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return { value, redacted: false };
  }
  if (typeof value === "string") {
    const sanitized = sanitizeText(value);
    return sanitized.redacted
      ? { redacted: true }
      : { value: sanitized.value, redacted: false };
  }
  if (Array.isArray(value)) {
    const projected = value.map(projectReportSafeValue);
    return projected.some((item) => item.redacted)
      ? { redacted: true }
      : { value: projected.map((item) => item.value), redacted: false };
  }
  if (value && typeof value === "object") {
    const projected: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      const safeKey = sanitizeText(key);
      const safeChild = projectReportSafeValue(child);
      if (safeKey.redacted || safeChild.redacted) {
        return { redacted: true };
      }
      projected[safeKey.value] = safeChild.value;
    }
    return { value: freezeDeep(projected), redacted: false };
  }
  return { redacted: true };
}

function sanitizeText(value: string): { readonly value: string; readonly redacted: boolean } {
  let redacted = /\[(?:redacted|secret-redacted|raw-content-excluded)/i.test(value);
  let sanitized = value;
  const replacements: readonly [RegExp, string][] = [
    [/\/home\/wang\/\.private-agents-real(?:\/[^\s"'`)]*)?/gi, "[redacted-real-provider-home]"],
    [/\bprovider\.env\b/gi, "provider-config=[redacted]"],
    [/\bAuthorization:\s*Bearer\s+[A-Za-z0-9._~+/-]+/gi, "Authorization: Bearer [secret-redacted]"],
    [/\bBearer\s+[A-Za-z0-9._~+/-]+/gi, "Bearer [secret-redacted]"],
    [/\b(?:sk|pk)-[A-Za-z0-9_-]{8,}\b/g, "[secret-redacted]"],
    [/\b(?:token|api[_-]?key|secret)\s*[:=]\s*[^\s"'`]+/gi, "[secret-redacted]"],
    [/\boldText\s*=\s*[^\s"'`]+/gi, "oldText=[raw-content-excluded]"],
    [/\bnewText\s*=\s*[^\s"'`]+/gi, "newText=[raw-content-excluded]"],
    [/raw provider output\s*:\s*[^\n\r]*/gi, "raw-provider-output=[raw-content-excluded]"],
    [/hidden reasoning[^\n\r]*/gi, "reasoning-private=[raw-content-excluded]"],
    [/<[^>]+>/g, "[raw-content-excluded]"],
  ];
  for (const [pattern, replacement] of replacements) {
    const next = sanitized.replace(pattern, replacement);
    redacted ||= next !== sanitized;
    sanitized = next;
  }
  return { value: sanitized, redacted };
}
