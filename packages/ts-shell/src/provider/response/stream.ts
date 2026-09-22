import { freezeDeep } from "../../core/values/freeze.js";
import {
  classifyProviderFailure,
  type ProviderFailureClass,
} from "../registry/provider.js";
import type { ModelRequestBoundary } from "../request/boundary.js";

export type ProviderResponseStreamEventKind =
  | "stream_started"
  | "content_delta"
  | "tool_call_delta"
  | "tool_call_completed"
  | "assistant_message_completed"
  | "stream_completed"
  | "stream_cancelled"
  | "stream_failed"
  | "output_invalid"
  | "output_insufficient"
  | "redaction_failed";

export type ProviderResponseStreamStatus =
  | "not_started"
  | "streaming"
  | "completed"
  | "cancelled"
  | "failed"
  | "output_invalid"
  | "output_insufficient"
  | "redaction_failed"
  | "partial";

export interface ProviderResponseStreamEvent {
  readonly eventId: string;
  readonly kind: ProviderResponseStreamEventKind;
  readonly requestId?: string;
  readonly responseId?: string;
  readonly turnId?: string;
  readonly contentDelta?: string;
  readonly toolCallId?: string;
  readonly toolName?: string;
  readonly toolArguments?: unknown;
  readonly failureClass?: ProviderFailureClass;
  readonly cancellationKind?: "user_cancelled" | "timeout_cancelled" | "provider_cancelled" | "stream_aborted";
  readonly retry: "not_allowed" | "eligible";
  readonly fallbackEligible?: boolean;
  readonly notProvenClaims?: readonly string[];
}

export interface ProviderResponseStreamProjection {
  readonly streamId: string;
  readonly requestId?: string;
  readonly responseId: string;
  readonly turnId?: string;
  readonly status: ProviderResponseStreamStatus;
  readonly eventCount: number;
  readonly contentDeltaCount: number;
  readonly contentSummary: string;
  readonly toolCallDeltaCount: number;
  readonly completedToolCalls: readonly {
    readonly id: string;
    readonly name: string;
    readonly arguments?: unknown;
  }[];
  readonly malformedToolCallCount: number;
  readonly assistantMessageCompleted: boolean;
  readonly streamCompleted: boolean;
  readonly cancellation?: {
    readonly kind: "user_cancelled" | "timeout_cancelled" | "provider_cancelled" | "stream_aborted";
    readonly partialResponsePreserved: boolean;
    readonly retryStatus: "retry_eligible" | "retry_not_allowed";
  };
  readonly failure?: {
    readonly class: ProviderFailureClass;
    readonly fallbackEligibility: "eligible" | "ineligible" | "unknown";
    readonly fallbackExecuted: false;
  };
  readonly redaction: {
    readonly status: "report-safe" | "redacted";
    readonly excluded: readonly string[];
  };
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

const REDACTION_EXCLUSIONS = [
  "api-keys",
  "provider.env",
  "auth-headers",
  "raw-provider-output",
  "oldText",
  "newText",
  "unredacted-command-output",
  "hidden-reasoning",
  "full-transcript",
  "unsafe-file-contents",
] as const;

export function projectProviderResponseStream(input: {
  readonly streamId: string;
  readonly responseId: string;
  readonly turnId?: string;
  readonly requestBoundary?: ModelRequestBoundary;
  readonly events: readonly ProviderResponseStreamEvent[];
  readonly notProvenClaims?: readonly string[];
}): ProviderResponseStreamProjection {
  const redactions = new Set<string>();
  const contentDeltas: string[] = [];
  const completedToolCalls: ProviderResponseStreamProjection["completedToolCalls"][number][] = [];
  let toolCallDeltaCount = 0;
  let malformedToolCallCount = 0;
  let assistantMessageCompleted = false;
  let streamCompleted = false;
  let cancellation: ProviderResponseStreamProjection["cancellation"] | undefined;
  let failure: ProviderResponseStreamProjection["failure"] | undefined;
  let status: ProviderResponseStreamStatus = "not_started";

  for (const event of input.events) {
    switch (event.kind) {
      case "stream_started":
        status = "streaming";
        break;
      case "content_delta":
        contentDeltas.push(sanitizeText(event.contentDelta ?? "", redactions));
        status = status === "not_started" ? "streaming" : status;
        break;
      case "tool_call_delta":
        toolCallDeltaCount += 1;
        status = status === "not_started" ? "streaming" : status;
        break;
      case "tool_call_completed": {
        const toolCall = normalizeCompletedToolCall(event, completedToolCalls.length + 1, redactions);
        completedToolCalls.push(toolCall.value);
        malformedToolCallCount += toolCall.malformed ? 1 : 0;
        break;
      }
      case "assistant_message_completed":
        assistantMessageCompleted = true;
        break;
      case "stream_completed":
        streamCompleted = true;
        status = "completed";
        break;
      case "stream_cancelled":
        cancellation = {
          kind: event.cancellationKind ?? "stream_aborted",
          partialResponsePreserved: contentDeltas.length > 0 || completedToolCalls.length > 0,
          retryStatus: event.retry === "eligible" ? "retry_eligible" : "retry_not_allowed",
        };
        status = "cancelled";
        break;
      case "stream_failed":
      case "output_invalid":
      case "output_insufficient":
      case "redaction_failed":
        failure = {
          class: event.failureClass ?? classifyProviderFailure({
            invalidOutput: event.kind === "output_invalid",
            insufficientOutput: event.kind === "output_insufficient",
            redactionFailed: event.kind === "redaction_failed",
            streamProtocolError: event.kind === "stream_failed",
            fallbackEligible: event.fallbackEligible === true,
            fallbackIneligible: event.fallbackEligible === false,
          }),
          fallbackEligibility: event.fallbackEligible === true
            ? "eligible"
            : event.fallbackEligible === false
              ? "ineligible"
              : "unknown",
          fallbackExecuted: false,
        };
        status = event.kind === "output_invalid"
          ? "output_invalid"
          : event.kind === "output_insufficient"
            ? "output_insufficient"
            : event.kind === "redaction_failed"
              ? "redaction_failed"
              : "failed";
        break;
    }
  }

  if (status === "streaming" && input.events.length > 0) {
    status = "partial";
  }

  const contentSummary = summarizeText(contentDeltas.join(""), redactions);
  return freezeDeep({
    streamId: sanitizeText(input.streamId || "provider-stream-unavailable", redactions),
    ...(input.requestBoundary ? { requestId: input.requestBoundary.requestId } : {}),
    responseId: sanitizeText(input.responseId || "response-unavailable", redactions),
    ...(input.turnId ? { turnId: sanitizeText(input.turnId, redactions) } : {}),
    status,
    eventCount: input.events.length,
    contentDeltaCount: contentDeltas.length,
    contentSummary,
    toolCallDeltaCount,
    // Handed to `freezeDeep` unfrozen on purpose. Freezing the array here would
    // freeze the container only: the deep walk skips a value that is already
    // frozen, so each tool call and its `arguments` - the raw request the model
    // asked for - would stay writable. Same shape as the regression fixed in
    // turn/assistantResponse.ts; this one predates it and was found by review.
    completedToolCalls,
    malformedToolCallCount,
    assistantMessageCompleted,
    streamCompleted,
    ...(cancellation ? { cancellation } : {}),
    ...(failure ? { failure } : {}),
    redaction: {
      status: redactions.size > 0 ? "redacted" : "report-safe",
      excluded: REDACTION_EXCLUSIONS,
    },
    notProvenClaims: unique([
      "stream-started-is-not-model-response-complete",
      "content-delta-is-not-final-response",
      "assistant-accumulated-is-not-task-success",
      "tool-call-partial-is-not-executable-tool-call",
      "tool-call-extracted-is-not-tool-executed",
      "fallback-eligible-is-not-fallback-executed",
      "model-response-complete-is-not-task-success",
      "terminal-success",
      ...(input.requestBoundary?.notProvenClaims ?? []),
      ...input.events.flatMap((event) => event.notProvenClaims ?? []),
      ...(input.notProvenClaims ?? []),
    ]),
    terminalSuccessClaim: false,
  });
}

function normalizeCompletedToolCall(
  event: ProviderResponseStreamEvent,
  index: number,
  redactions: Set<string>,
): { readonly value: ProviderResponseStreamProjection["completedToolCalls"][number]; readonly malformed: boolean } {
  const id = sanitizeText(event.toolCallId ?? `malformed-tool-call-${index}`, redactions);
  const name = sanitizeText(event.toolName ?? "unknown", redactions);
  const args = sanitizeUnknown(event.toolArguments, redactions);
  return {
    value: {
      id,
      name,
      ...(args.value !== undefined ? { arguments: args.value } : {}),
    },
    malformed: !event.toolCallId || !event.toolName,
  };
}

function sanitizeUnknown(value: unknown, redactions: Set<string>): { readonly value: unknown } {
  if (value === undefined) {
    return { value: undefined };
  }
  if (typeof value === "string") {
    return { value: sanitizeText(value, redactions) };
  }
  if (Array.isArray(value)) {
    return { value: value.map((item) => sanitizeUnknown(item, redactions).value) };
  }
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      output[sanitizeText(key, redactions)] = sanitizeUnknown(child, redactions).value;
    }
    return { value: output };
  }
  return { value };
}

function summarizeText(value: string, redactions: Set<string>): string {
  const sanitized = sanitizeText(value, redactions);
  if (!sanitized.trim()) {
    return "empty";
  }
  const normalized = sanitized.replace(/\s+/g, " ").trim();
  return normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized;
}

function sanitizeText(input: string, redactions: Set<string>): string {
  const before = input;
  let value = input.trim();
  value = value.replace(/\/home\/wang\/\.private-agents-real[^\s"'`]*/g, "[redacted-real-provider-home]");
  value = value.replace(/\bprovider\.env\b[^\n\r]*/gi, "provider.env=[redacted]");
  value = value.replace(/\bAuthorization:\s*Bearer\s+[A-Za-z0-9._~+/-]+/gi, "Authorization: Bearer [secret-redacted]");
  value = value.replace(/\b(?:Bearer|token|api[_-]?key|secret)\s*[:=]?\s*[A-Za-z0-9._~+/-]+/gi, "[secret-redacted]");
  value = value.replace(/\b(?:sk|pk)-[A-Za-z0-9_-]{8,}\b/g, "[secret-redacted]");
  value = value.replace(/\boldText\s*[:=]\s*[^\n\r]*/gi, "oldText=[raw-content-excluded]");
  value = value.replace(/\bnewText\s*[:=]\s*[^\n\r]*/gi, "newText=[raw-content-excluded]");
  value = value.replace(/\braw provider output\s*[:=]\s*[^\n\r]*/gi, "raw-provider-output=[raw-content-excluded]");
  value = value.replace(/\bhidden reasoning[^\n\r]*/gi, "hidden-reasoning=[raw-content-excluded]");
  value = value.replace(/<[^>]+>/g, "[raw-content-excluded]");
  if (value !== before) {
    redactions.add("unsafe-stream-boundary-input");
  }
  return value.length > 0 ? value.slice(0, 180) : "redacted-empty";
}

function unique(input: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(input)]);
}
