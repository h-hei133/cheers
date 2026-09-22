import { describe, expect, it } from "vitest";

import { createModelRequestBoundary } from "../request/boundary.js";
import { projectProviderResponseStream } from "./stream.js";

describe("provider response stream projection", () => {
  it("represents stream lifecycle, content deltas, completed tool calls, and completion safely", () => {
    const requestBoundary = createModelRequestBoundary({
      requestId: "request-stream",
      providerSafeLabel: "Synthetic provider",
      modelSafeLabel: "Fixture model",
      providerReadinessStatus: "ready",
    });
    const stream = projectProviderResponseStream({
      streamId: "stream-1",
      responseId: "response-1",
      requestBoundary,
      events: [
        { eventId: "event-start", kind: "stream_started", retry: "not_allowed" },
        { eventId: "event-delta", kind: "content_delta", contentDelta: "safe ", retry: "not_allowed" },
        { eventId: "event-tool-delta", kind: "tool_call_delta", toolCallId: "call-read", retry: "not_allowed" },
        {
          eventId: "event-tool-complete",
          kind: "tool_call_completed",
          toolCallId: "call-read",
          toolName: "read",
          toolArguments: { path: "a.ts" },
          retry: "not_allowed",
        },
        { eventId: "event-message", kind: "assistant_message_completed", retry: "not_allowed" },
        { eventId: "event-complete", kind: "stream_completed", retry: "not_allowed" },
      ],
    });

    expect(stream).toMatchObject({
      status: "completed",
      contentDeltaCount: 1,
      toolCallDeltaCount: 1,
      assistantMessageCompleted: true,
      streamCompleted: true,
      terminalSuccessClaim: false,
    });
    expect(stream.completedToolCalls).toEqual([
      { id: "call-read", name: "read", arguments: { path: "a.ts" } },
    ]);
    expect(stream.notProvenClaims).toEqual(
      expect.arrayContaining([
        "stream-started-is-not-model-response-complete",
        "content-delta-is-not-final-response",
        "tool-call-extracted-is-not-tool-executed",
        "model-response-complete-is-not-task-success",
      ]),
    );
  });

  it("deep-freezes each completed tool call, not only the array holding them", () => {
    // Guards a real depth loss: the array was passed to `freezeDeep` already
    // frozen, so the walk stopped at the container and each tool call - and the
    // `arguments` the model asked for - stayed writable.
    const stream = projectProviderResponseStream({
      streamId: "stream-depth",
      responseId: "response-depth",
      events: [
        { eventId: "e1", kind: "stream_started", retry: "not_allowed" },
        {
          eventId: "e2",
          kind: "tool_call_completed",
          toolCallId: "call-depth",
          toolName: "read",
          toolArguments: { path: "a.ts" },
          retry: "not_allowed",
        },
      ],
    });
    const [toolCall] = stream.completedToolCalls;

    expect(Object.isFrozen(stream.completedToolCalls)).toBe(true);
    expect(Object.isFrozen(toolCall)).toBe(true);
    expect(Object.isFrozen(toolCall?.arguments)).toBe(true);
    expect(() => {
      (toolCall as { name: string }).name = "write";
    }).toThrow(TypeError);
  });

  it("keeps cancellation partial and retry facts distinct from success", () => {
    const stream = projectProviderResponseStream({
      streamId: "stream-cancel",
      responseId: "response-cancel",
      events: [
        { eventId: "event-start", kind: "stream_started", retry: "not_allowed" },
        { eventId: "event-delta", kind: "content_delta", contentDelta: "partial", retry: "not_allowed" },
        {
          eventId: "event-cancel",
          kind: "stream_cancelled",
          cancellationKind: "user_cancelled",
          retry: "eligible",
        },
      ],
    });

    expect(stream.status).toBe("cancelled");
    expect(stream.cancellation).toMatchObject({
      kind: "user_cancelled",
      partialResponsePreserved: true,
      retryStatus: "retry_eligible",
    });
    expect(stream.terminalSuccessClaim).toBe(false);
  });

  it("classifies malformed stream, output, redaction, and fallback states without executing fallback", () => {
    expect(projectProviderResponseStream({
      streamId: "stream-failed",
      responseId: "response-failed",
      events: [{
        eventId: "event-failed",
        kind: "stream_failed",
        failureClass: "provider_stream_protocol_error",
        fallbackEligible: true,
        retry: "eligible",
      }],
    }).failure).toMatchObject({
      class: "provider_stream_protocol_error",
      fallbackEligibility: "eligible",
      fallbackExecuted: false,
    });
    expect(projectProviderResponseStream({
      streamId: "stream-invalid",
      responseId: "response-invalid",
      events: [{ eventId: "event-invalid", kind: "output_invalid", retry: "not_allowed" }],
    }).failure?.class).toBe("provider_output_invalid");
    expect(projectProviderResponseStream({
      streamId: "stream-insufficient",
      responseId: "response-insufficient",
      events: [{ eventId: "event-insufficient", kind: "output_insufficient", retry: "not_allowed" }],
    }).failure?.class).toBe("provider_output_insufficient");
    expect(projectProviderResponseStream({
      streamId: "stream-redaction",
      responseId: "response-redaction",
      events: [{ eventId: "event-redaction", kind: "redaction_failed", retry: "not_allowed" }],
    }).failure?.class).toBe("provider_redaction_failure");
  });

  it("redacts unsafe deltas and completed tool arguments", () => {
    const stream = projectProviderResponseStream({
      streamId: "stream-redact",
      responseId: "sk-1234567890",
      events: [
        {
          eventId: "event-delta",
          kind: "content_delta",
          contentDelta: "raw provider output: hidden reasoning token=secret oldText=before newText=after /home/wang/.private-agents-real/provider.env",
          retry: "not_allowed",
        },
        {
          eventId: "event-tool",
          kind: "tool_call_completed",
          toolCallId: "call-1",
          toolName: "read",
          toolArguments: { path: "provider.env", Authorization: "Bearer secret" },
          retry: "not_allowed",
        },
      ],
    });
    const serialized = JSON.stringify(stream);

    expect(stream.redaction.status).toBe("redacted");
    expect(serialized).not.toMatch(/sk-1234567890|token=secret|oldText=before|newText=after|cheers-real|hidden reasoning|Bearer secret/i);
  });
});
