import type { ContinuationReason, TerminalReason } from "../../orchestration/types.js";
import type { SessionTerminalState } from "./sessionTerminalState.js";

export function projectAssistantTurnPersistence(
  terminalState: SessionTerminalState,
): { role: "assistant"; content: string } | undefined {
  if (terminalState.finalOutput.length === 0) {
    return undefined;
  }
  return {
    role: "assistant",
    content: terminalState.finalOutput,
  };
}

export function projectCompletedSessionSave(
  terminalState: SessionTerminalState,
): {
  terminalReason: TerminalReason;
  terminalClassification: "success" | "stopped" | "error";
  lastContinuationReason?: ContinuationReason;
} {
  return {
    terminalReason: terminalState.terminalReason,
    terminalClassification: terminalState.terminalClassification,
    lastContinuationReason: terminalState.lastContinuationReason,
  };
}

export function projectErrorSessionSave(
  terminalState: SessionTerminalState,
): {
  error: string;
  options: {
    terminalReason: TerminalReason;
    terminalClassification: "success" | "stopped" | "error";
    lastContinuationReason?: ContinuationReason;
  };
} {
  return {
    error: terminalState.terminalStopReason ?? terminalState.terminalStatus,
    options: {
      terminalReason: terminalState.terminalReason,
      terminalClassification: terminalState.terminalClassification,
      lastContinuationReason: terminalState.lastContinuationReason,
    },
  };
}

export function projectRuntimeFailureSessionSave(input: {
  error: unknown;
  lastContinuationReason?: ContinuationReason;
}): {
  error: string;
  options: {
    terminalReason: "stopped_error";
    terminalClassification: "error";
    lastContinuationReason?: ContinuationReason;
  };
} {
  return {
    error: input.error instanceof Error ? input.error.message : String(input.error),
    options: {
      terminalReason: "stopped_error",
      terminalClassification: "error",
      lastContinuationReason: input.lastContinuationReason,
    },
  };
}
