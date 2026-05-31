import {
  createModelResponseBoundary,
  type ModelResponseBoundary,
} from "../../provider/response/boundary.js";
import {
  projectProviderResponseStream,
  type ProviderResponseStreamEvent,
  type ProviderResponseStreamProjection,
} from "../../provider/response/stream.js";
import type { ModelRequestBoundary } from "../../provider/request/boundary.js";
import {
  accumulateAssistantResponse,
  type AssistantResponseState,
} from "../../turn/assistantResponse.js";
import {
  extractToolCallBatch,
  type NormalizedToolCallBatch,
} from "../../tools/toolCallBatch.js";

export interface ModelBoundaryPhaseInput {
  readonly phaseId: string;
  readonly turnId?: string;
  readonly requestBoundary: ModelRequestBoundary;
  readonly responseId: string;
  readonly streamId?: string;
  readonly streamEvents: readonly ProviderResponseStreamEvent[];
  readonly notProvenClaims?: readonly string[];
}

export interface ModelBoundaryPhaseProjection {
  readonly phaseId: string;
  readonly loopPhase: "model-boundary";
  readonly requestBoundary: ModelRequestBoundary;
  readonly stream: ProviderResponseStreamProjection;
  readonly responseBoundary: ModelResponseBoundary;
  readonly assistantResponse: AssistantResponseState;
  readonly toolCallBatch: NormalizedToolCallBatch;
  readonly toolBatchHandoffPrepared: boolean;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export function projectModelBoundaryPhase(
  input: ModelBoundaryPhaseInput,
): ModelBoundaryPhaseProjection {
  const stream = projectProviderResponseStream({
    streamId: input.streamId ?? `${input.phaseId}:stream`,
    responseId: input.responseId,
    turnId: input.turnId,
    requestBoundary: input.requestBoundary,
    events: input.streamEvents,
    notProvenClaims: input.notProvenClaims,
  });
  const responseBoundary = createModelResponseBoundary({
    responseId: input.responseId,
    turnId: input.turnId,
    providerMode: input.requestBoundary.providerMode,
    providerSafeLabel: input.requestBoundary.providerSafeLabel,
    modelSafeLabel: input.requestBoundary.modelSafeLabel,
    source: stream.status === "completed" ? "existing_safe_projection" : "fake_default_safe",
    status: responseStatusFromStream(stream.status),
    assistantContent: stream.contentSummary === "empty" ? "" : stream.contentSummary,
    toolCallCount: stream.completedToolCalls.length,
    notProvenClaims: stream.notProvenClaims,
  });
  const assistantResponse = accumulateAssistantResponse({
    responseBoundary,
    turnId: input.turnId,
    chunks: [{
      textDelta: stream.contentSummary === "empty" ? undefined : stream.contentSummary,
      toolCalls: stream.completedToolCalls,
    }],
    notProvenClaims: stream.notProvenClaims,
  });
  const toolCallBatch = extractToolCallBatch({
    responseBoundary,
    assistantResponse,
    turnId: input.turnId,
    batchId: `${input.phaseId}:tool-call-batch`,
    notProvenClaims: stream.notProvenClaims,
  });

  return deepFreeze({
    phaseId: input.phaseId,
    loopPhase: "model-boundary",
    requestBoundary: input.requestBoundary,
    stream,
    responseBoundary,
    assistantResponse,
    toolCallBatch,
    toolBatchHandoffPrepared: toolCallBatch.calls.length > 0,
    terminalSuccessClaim: false,
    notProvenClaims: unique([
      "model-boundary-observed-is-not-task-success",
      "model-response-complete-is-not-task-success",
      "tool-batch-ready-is-not-tool-executed",
      "terminal-success",
      ...input.requestBoundary.notProvenClaims,
      ...stream.notProvenClaims,
      ...responseBoundary.notProvenClaims,
      ...assistantResponse.notProvenClaims,
      ...toolCallBatch.notProvenClaims,
      ...(input.notProvenClaims ?? []),
    ]),
  });
}

function responseStatusFromStream(
  status: ProviderResponseStreamProjection["status"],
): ModelResponseBoundary["status"] {
  switch (status) {
    case "completed":
      return "observed";
    case "cancelled":
      return "aborted";
    case "failed":
    case "output_invalid":
    case "output_insufficient":
    case "redaction_failed":
      return "failed";
    case "not_started":
      return "unavailable";
    case "partial":
    case "streaming":
    default:
      return "observed";
  }
}

function unique(input: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(input)]);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}
