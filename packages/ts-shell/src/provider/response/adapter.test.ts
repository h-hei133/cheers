import { describe, expect, it } from "vitest";

import { providerFetchOutcomeToStreamEvents } from "./adapter.js";

describe("provider fetch outcome stream adapter", () => {
  it("projects a completed non-streaming response into a deterministic stream sequence", async () => {
    const events = await providerFetchOutcomeToStreamEvents({
      requestId: "request-adapter",
      responseId: "response-adapter",
      outcome: {
        kind: "completed",
        response: {
          content: "safe answer",
          toolCalls: [{ id: "call-read", name: "read", arguments: { path: "a.ts" } }],
          finishReason: "stop",
        },
      },
    });

    expect(events.map((event) => event.kind)).toEqual([
      "stream_started",
      "content_delta",
      "tool_call_completed",
      "assistant_message_completed",
      "stream_completed",
    ]);
    expect(events[1]).toMatchObject({
      contentDelta: "safe answer",
      retry: "not_allowed",
    });
    expect(events[2]).toMatchObject({
      toolCallId: "call-read",
      toolName: "read",
      toolArguments: { path: "a.ts" },
    });
  });

  it("maps streaming provider events and incomplete finishes to safe stream failures", async () => {
    async function* stream() {
      yield { type: "content.delta" as const, delta: "partial" };
      yield { type: "response.completed" as const, finishReason: "length" as const };
    }

    const events = await providerFetchOutcomeToStreamEvents({
      requestId: "request-length",
      responseId: "response-length",
      outcome: { kind: "stream", events: stream() },
    });

    expect(events.map((event) => event.kind)).toEqual([
      "stream_started",
      "content_delta",
      "assistant_message_completed",
      "output_insufficient",
    ]);
    expect(events.at(-1)).toMatchObject({
      failureClass: "provider_output_insufficient",
      fallbackEligible: false,
    });
  });
});
