import { freezeDeep } from "../core/values/freeze.js";
import type { ModelResponseBoundary } from "../provider/response/boundary.js";

export type AssistantAccumulationStatus = "empty" | "accumulated" | "redacted";

export interface AssistantResponseChunk {
  readonly textDelta?: string;
  readonly toolCall?: unknown;
  readonly toolCalls?: readonly unknown[];
}

export interface AssistantResponseAccumulatorInput {
  readonly responseBoundary: ModelResponseBoundary;
  readonly turnId?: string;
  readonly chunks: readonly AssistantResponseChunk[];
  readonly notProvenClaims?: readonly string[];
}

export interface AssistantResponseState {
  readonly responseId: string;
  readonly turnId?: string;
  readonly chunkCount: number;
  readonly textDeltaCount: number;
  readonly contentSummary: string;
  readonly safeContent: string;
  readonly toolCallCandidates: readonly unknown[];
  readonly accumulationStatus: AssistantAccumulationStatus;
  readonly redaction: {
    readonly status: "report-safe" | "redacted";
    readonly excluded: readonly string[];
  };
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
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

export function accumulateAssistantResponse(
  input: AssistantResponseAccumulatorInput,
): AssistantResponseState {
  const safeDeltas: string[] = [];
  const candidates: unknown[] = [];
  let redacted = input.responseBoundary.redaction.status === "redacted";
  for (const chunk of input.chunks) {
    if (chunk.textDelta) {
      const sanitized = sanitizeText(chunk.textDelta);
      safeDeltas.push(sanitized.value);
      redacted ||= sanitized.redacted;
    }
    if (chunk.toolCall !== undefined) {
      const sanitized = sanitizeUnknown(chunk.toolCall);
      candidates.push(sanitized.value);
      redacted ||= sanitized.redacted;
    }
    for (const candidate of chunk.toolCalls ?? []) {
      const sanitized = sanitizeUnknown(candidate);
      candidates.push(sanitized.value);
      redacted ||= sanitized.redacted;
    }
  }

  const safeContent = safeDeltas.join("");
  const summary = summarizeText(safeContent);
  redacted ||= summary.redacted;
  const status: AssistantAccumulationStatus = redacted
    ? "redacted"
    : safeContent.trim() || candidates.length > 0
      ? "accumulated"
      : "empty";

  return freezeDeep({
    responseId: input.responseBoundary.responseId,
    ...(input.turnId || input.responseBoundary.turnId
      ? { turnId: input.turnId ?? input.responseBoundary.turnId }
      : {}),
    chunkCount: input.chunks.length,
    textDeltaCount: safeDeltas.length,
    contentSummary: summary.value,
    safeContent,
    toolCallCandidates: Object.freeze(candidates),
    accumulationStatus: status,
    redaction: {
      status: redacted ? "redacted" : "report-safe",
      excluded: REDACTION_EXCLUSIONS,
    },
    notProvenClaims: Object.freeze([
      ...new Set([
        "assistant-text-is-not-task-success",
        "provider-success",
        "tool-success",
        "verification-success",
        "terminal-success",
        ...(input.notProvenClaims ?? []),
        ...input.responseBoundary.notProvenClaims,
      ]),
    ]),
    terminalSuccessClaim: false,
  });
}

function summarizeText(value: string): { readonly value: string; readonly redacted: boolean } {
  const sanitized = sanitizeText(value);
  if (!sanitized.value.trim()) {
    return { value: "empty", redacted: sanitized.redacted };
  }
  const normalized = sanitized.value.replace(/\s+/g, " ").trim();
  return {
    value: normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized,
    redacted: sanitized.redacted,
  };
}

function sanitizeUnknown(value: unknown): { readonly value: unknown; readonly redacted: boolean } {
  if (typeof value === "string") {
    return sanitizeText(value);
  }
  if (Array.isArray(value)) {
    let redacted = false;
    const values = value.map((item) => {
      const sanitized = sanitizeUnknown(item);
      redacted ||= sanitized.redacted;
      return sanitized.value;
    });
    return { value: values, redacted };
  }
  if (value && typeof value === "object") {
    let redacted = false;
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      const safeKey = sanitizeText(key);
      const safeValue = sanitizeUnknown(child);
      redacted ||= safeKey.redacted || safeValue.redacted;
      output[safeKey.value] = safeValue.value;
    }
    return { value: output, redacted };
  }
  return { value, redacted: false };
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
