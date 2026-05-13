import type { QueryEvent } from "../core/query/events.js";

export interface ProviderReadinessCliSurfaceInput {
  readonly sessionId: string;
  readonly prompt: string;
  readonly stopReason: string;
}

// CLI surface only: provider readiness checks and redaction stay in core
// readiness modules before this stop reason is rendered.
export function createProviderReadinessCliTerminalEvent(
  input: ProviderReadinessCliSurfaceInput,
): QueryEvent {
  return {
    type: "query.completed",
    result: {
      status: "stopped_error",
      terminalReason: "stopped_error",
      terminalClassification: "error",
      stopReason: input.stopReason,
      transcript: [],
      sharedContext: {
        sessionId: input.sessionId,
        initialPrompt: input.prompt,
        notes: [
          "provider-readiness: pre-query gate blocked real provider entry",
        ],
        handoffs: [],
      },
      finalOutput: "",
    },
  };
}
