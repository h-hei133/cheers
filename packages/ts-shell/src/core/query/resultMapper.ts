import type {
  OrchestrationResult,
} from "../../orchestration/types.js";
import type { QueryRuntimeState } from "./runtimeState.js";
import type { QueryTerminal } from "./transitions.js";
import { deriveTruthfulTerminal } from "../../result/terminal/queryTerminalTruth.js";

export function mapTerminalToOrchestrationResult(
  state: QueryRuntimeState,
  terminal: QueryTerminal,
): OrchestrationResult {
  const latestCodingResult =
    state.transcript[state.transcript.length - 1]?.codingResult;
  const latestLoopTrajectory =
    [...state.transcript].reverse().find((turn) => turn.loopTrajectory)
      ?.loopTrajectory;
  const codingResult = latestCodingResult
    ? {
        ...latestCodingResult,
        ...(terminal.terminalReason === "completed" ||
        latestCodingResult.failureBoundary
          ? {}
          : {
              failureBoundary: terminal.stopReason ?? terminal.terminalReason,
            }),
      }
    : undefined;

  const truthfulTerminal = deriveTruthfulTerminal({
    terminal,
    codingResult,
    lastContinuationReason: state.lastContinuationReason,
  });

  return {
    status: truthfulTerminal.terminalReason,
    terminalReason: truthfulTerminal.terminalReason,
    terminalClassification: truthfulTerminal.terminalClassification,
    lastContinuationReason: state.lastContinuationReason,
    stopReason: truthfulTerminal.stopReason,
    transcript: state.transcript,
    sharedContext: state.sharedContext,
    finalOutput: state.transcript[state.transcript.length - 1]?.content ?? "",
    codingResult,
    loopTrajectory: latestLoopTrajectory,
  };
}
