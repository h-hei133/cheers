import { describe, expect, it } from "vitest";

import {
  selectSyntheticProviderStep,
  syntheticProviderStepToStreamEvents,
} from "./synthetic.js";

describe("synthetic provider response", () => {
  it("selects deterministic completed steps and an exhausted fallback", () => {
    const first = selectSyntheticProviderStep({
      steps: [
        {
          kind: "completed",
          response: {
            content: "safe first response",
            finishReason: "stop",
          },
        },
      ],
    }, 1);
    const exhausted = selectSyntheticProviderStep({
      steps: [],
    }, 2);

    expect(first).toMatchObject({
      kind: "completed",
      response: { content: "safe first response" },
    });
    expect(exhausted).toMatchObject({
      kind: "completed",
      response: { content: "synthetic provider exhausted" },
    });
  });

  it("projects completed text and tool calls through provider stream events", async () => {
    const events = await syntheticProviderStepToStreamEvents({
      step: {
        kind: "completed",
        response: {
          content: "safe text",
          toolCalls: [
            { id: "call-read", name: "read", arguments: { path: "src/a.ts" } },
          ],
          finishReason: "tool_calls",
        },
      },
      turn: {
        requestId: "request-a",
        responseId: "response-a",
        turnId: "turn-a",
        turn: 1,
      },
    });

    expect(events.map((event) => event.kind)).toEqual([
      "stream_started",
      "content_delta",
      "tool_call_completed",
      "assistant_message_completed",
      "stream_completed",
    ]);
    expect(events[2]).toMatchObject({
      toolCallId: "call-read",
      toolName: "read",
      toolArguments: { path: "src/a.ts" },
    });
  });

  it("projects provider failures without live provider execution", async () => {
    const events = await syntheticProviderStepToStreamEvents({
      step: {
        kind: "failed",
        failureClass: "provider_network",
      },
      turn: {
        requestId: "request-failed",
        responseId: "response-failed",
        turn: 1,
      },
    });

    expect(events).toEqual([
      expect.objectContaining({ kind: "stream_started" }),
      expect.objectContaining({
        kind: "stream_failed",
        failureClass: "provider_network",
        fallbackEligible: false,
      }),
    ]);
    expect(JSON.stringify(events)).not.toMatch(/cheers-real|provider\.env/i);
  });
});
