import { describe, expect, it } from "vitest";

import { createModelRequestBoundary } from "../../provider/request/boundary.js";
import { projectModelBoundaryPhase } from "./modelBoundary.js";

describe("model boundary phase", () => {
  it("connects request, stream, assistant accumulation, and not-dispatched tool handoff", () => {
    const requestBoundary = createModelRequestBoundary({
      requestId: "request-phase",
      providerSafeLabel: "Synthetic provider",
      modelSafeLabel: "Fixture model",
      providerReadinessStatus: "ready",
      noWriteStatus: "no-write-authority-granted",
    });
    const phase = projectModelBoundaryPhase({
      phaseId: "phase-model-boundary",
      turnId: "turn-1",
      requestBoundary,
      responseId: "response-phase",
      streamEvents: [
        { eventId: "start", kind: "stream_started", retry: "not_allowed" },
        { eventId: "delta", kind: "content_delta", contentDelta: "safe answer", retry: "not_allowed" },
        {
          eventId: "tool",
          kind: "tool_call_completed",
          toolCallId: "call-read",
          toolName: "read",
          toolArguments: { path: "a.ts" },
          retry: "not_allowed",
        },
        { eventId: "message", kind: "assistant_message_completed", retry: "not_allowed" },
        { eventId: "complete", kind: "stream_completed", retry: "not_allowed" },
      ],
    });

    expect(phase).toMatchObject({
      loopPhase: "model-boundary",
      toolBatchHandoffPrepared: true,
      terminalSuccessClaim: false,
    });
    expect(phase.responseBoundary.status).toBe("observed");
    expect(phase.assistantResponse.accumulationStatus).toBe("accumulated");
    expect(phase.toolCallBatch).toMatchObject({
      extractionStatus: "extracted",
      dispatchStatus: "not_dispatched",
      terminalSuccessClaim: false,
    });
    expect(phase.notProvenClaims).toEqual(
      expect.arrayContaining([
        "model-boundary-observed-is-not-task-success",
        "tool-batch-ready-is-not-tool-executed",
        "tool-call-extracted-is-not-tool-executed",
      ]),
    );
  });

  it("preserves aborted partial streams without final success", () => {
    const phase = projectModelBoundaryPhase({
      phaseId: "phase-abort",
      requestBoundary: createModelRequestBoundary({
        requestId: "request-abort",
        providerReadinessStatus: "ready",
      }),
      responseId: "response-abort",
      streamEvents: [
        { eventId: "start", kind: "stream_started", retry: "not_allowed" },
        { eventId: "delta", kind: "content_delta", contentDelta: "partial", retry: "not_allowed" },
        {
          eventId: "cancel",
          kind: "stream_cancelled",
          cancellationKind: "stream_aborted",
          retry: "not_allowed",
        },
      ],
    });

    expect(phase.stream.status).toBe("cancelled");
    expect(phase.responseBoundary.status).toBe("aborted");
    expect(phase.stream.cancellation?.partialResponsePreserved).toBe(true);
    expect(phase.terminalSuccessClaim).toBe(false);
  });
});
