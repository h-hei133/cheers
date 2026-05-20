import type {
  OrchestrationResult,
  TerminalReason,
} from "../../orchestration/types.js";
import type { QueryRuntimeState } from "./runtimeState.js";

export function classifyTerminalReason(
  reason: TerminalReason,
  lastContinuationReason?: QueryRuntimeState["lastContinuationReason"],
): OrchestrationResult["terminalClassification"] {
  if (reason === "stopped_error") {
    return lastContinuationReason === "retryable-error" ? "stopped" : "error";
  }

  return reason === "completed" ? "success" : "stopped";
}

