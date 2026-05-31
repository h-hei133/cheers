import type { NormalizedStreamEvent } from "../../model-adapters/types.js";
import type { ProviderResponseStreamEvent } from "./stream.js";

export type ProviderCompletedResponse = {
  readonly content?: string;
  readonly toolCalls?: readonly {
    readonly id?: string;
    readonly name?: string;
    readonly arguments?: unknown;
  }[];
  readonly finishReason?: "stop" | "tool_calls" | "length" | "content_filter" | "unknown";
};

export type ProviderStreamFetchOutcome =
  | { readonly kind: "stream"; readonly events: AsyncIterable<NormalizedStreamEvent> }
  | { readonly kind: "completed"; readonly response: ProviderCompletedResponse };

export async function providerFetchOutcomeToStreamEvents(input: {
  readonly requestId: string;
  readonly responseId: string;
  readonly turnId?: string;
  readonly outcome: ProviderStreamFetchOutcome;
}): Promise<readonly ProviderResponseStreamEvent[]> {
  if (input.outcome.kind === "completed") {
    return completedResponseToStreamEvents({
      requestId: input.requestId,
      responseId: input.responseId,
      turnId: input.turnId,
      outcome: input.outcome,
    });
  }

  const events: ProviderResponseStreamEvent[] = [];
  let started = false;
  let completed = false;
  let index = 0;
  for await (const event of input.outcome.events) {
    index += 1;
    const projected = normalizedStreamEventToProviderEvent({
      event,
      index,
      requestId: input.requestId,
      responseId: input.responseId,
      turnId: input.turnId,
    });
    if (projected.kind === "stream_started") {
      started = true;
    }
    if (
      projected.kind === "stream_completed" ||
      projected.kind === "stream_cancelled" ||
      projected.kind === "stream_failed" ||
      projected.kind === "output_invalid" ||
      projected.kind === "output_insufficient" ||
      projected.kind === "redaction_failed"
    ) {
      completed = true;
    }
    events.push(projected);
    if (event.type === "response.completed") {
      events.splice(events.length - 1, 0, {
        eventId: `${input.responseId}:message-completed`,
        kind: "assistant_message_completed",
        requestId: input.requestId,
        responseId: input.responseId,
        ...(input.turnId ? { turnId: input.turnId } : {}),
        retry: "not_allowed",
      });
    }
  }
  if (!started) {
    events.unshift({
      eventId: `${input.responseId}:started`,
      kind: "stream_started",
      requestId: input.requestId,
      responseId: input.responseId,
      ...(input.turnId ? { turnId: input.turnId } : {}),
      retry: "not_allowed",
    });
  }
  if (!completed) {
    events.push({
      eventId: `${input.responseId}:insufficient`,
      kind: "output_insufficient",
      requestId: input.requestId,
      responseId: input.responseId,
      ...(input.turnId ? { turnId: input.turnId } : {}),
      failureClass: "provider_output_insufficient",
      retry: "not_allowed",
      fallbackEligible: false,
    });
  }
  return Object.freeze(events);
}

function completedResponseToStreamEvents(input: {
  readonly requestId: string;
  readonly responseId: string;
  readonly turnId?: string;
  readonly outcome: Extract<ProviderStreamFetchOutcome, { readonly kind: "completed" }>;
}): readonly ProviderResponseStreamEvent[] {
  const base = {
    requestId: input.requestId,
    responseId: input.responseId,
    ...(input.turnId ? { turnId: input.turnId } : {}),
    retry: "not_allowed" as const,
  };
  const events: ProviderResponseStreamEvent[] = [{
    eventId: `${input.responseId}:started`,
    kind: "stream_started",
    ...base,
  }];
  if (input.outcome.response.content?.trim()) {
    events.push({
      eventId: `${input.responseId}:content`,
      kind: "content_delta",
      contentDelta: input.outcome.response.content,
      ...base,
    });
  }
  if (
    !input.outcome.response.content?.trim() &&
    (input.outcome.response.toolCalls ?? []).length === 0
  ) {
    events.push({
      eventId: `${input.responseId}:insufficient`,
      kind: "output_insufficient",
      failureClass: "provider_output_insufficient",
      fallbackEligible: false,
      ...base,
    });
    return Object.freeze(events);
  }
  for (const [index, toolCall] of (input.outcome.response.toolCalls ?? []).entries()) {
    events.push({
      eventId: `${input.responseId}:tool:${index + 1}`,
      kind: "tool_call_completed",
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      toolArguments: toolCall.arguments,
      ...base,
    });
  }
  events.push({
    eventId: `${input.responseId}:message-completed`,
    kind: "assistant_message_completed",
    ...base,
  });
  if (input.outcome.response.finishReason === "length") {
    events.push({
      eventId: `${input.responseId}:insufficient`,
      kind: "output_insufficient",
      failureClass: "provider_output_insufficient",
      fallbackEligible: false,
      ...base,
    });
    return Object.freeze(events);
  }
  if (input.outcome.response.finishReason === "content_filter") {
    events.push({
      eventId: `${input.responseId}:invalid`,
      kind: "output_invalid",
      failureClass: "provider_output_invalid",
      fallbackEligible: false,
      ...base,
    });
    return Object.freeze(events);
  }
  events.push({
    eventId: `${input.responseId}:completed`,
    kind: "stream_completed",
    ...base,
  });
  return Object.freeze(events);
}

function normalizedStreamEventToProviderEvent(input: {
  readonly event: NormalizedStreamEvent;
  readonly index: number;
  readonly requestId: string;
  readonly responseId: string;
  readonly turnId?: string;
}): ProviderResponseStreamEvent {
  const base = {
    eventId: `${input.responseId}:event:${input.index}`,
    requestId: input.requestId,
    responseId: input.responseId,
    ...(input.turnId ? { turnId: input.turnId } : {}),
    retry: "not_allowed" as const,
  };
  switch (input.event.type) {
    case "response.started":
      return { ...base, kind: "stream_started" };
    case "content.delta":
      return { ...base, kind: "content_delta", contentDelta: input.event.delta };
    case "tool.call.delta":
      return {
        ...base,
        kind: "tool_call_delta",
        toolCallId: input.event.toolCallId,
        toolName: input.event.name,
        toolArguments: input.event.argumentsDelta,
      };
    case "tool.call.completed":
      return {
        ...base,
        kind: "tool_call_completed",
        toolCallId: input.event.toolCall.id,
        toolName: input.event.toolCall.name,
        toolArguments: parseToolArguments(input.event.toolCall.argumentsJson),
      };
    case "response.completed":
      if (input.event.finishReason === "length") {
        return {
          ...base,
          kind: "output_insufficient",
          failureClass: "provider_output_insufficient",
          fallbackEligible: false,
        };
      }
      if (input.event.finishReason === "content_filter") {
        return {
          ...base,
          kind: "output_invalid",
          failureClass: "provider_output_invalid",
          fallbackEligible: false,
        };
      }
      return { ...base, kind: "stream_completed" };
  }
}

function parseToolArguments(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
