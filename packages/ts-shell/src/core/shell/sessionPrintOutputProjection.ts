import type {
  CodingResultSummary,
  OrchestrationStatus,
} from "../../result/types.js";

export function selectPrintTerminalOutput(input: {
  readonly finalOutput: string;
  readonly terminalStatus: OrchestrationStatus;
  readonly terminalStopReason?: string;
  readonly codingResult?: CodingResultSummary;
}): string | undefined {
  if (input.terminalStatus === "completed") {
    return input.finalOutput.length > 0 ? input.finalOutput : undefined;
  }
  if (
    input.finalOutput.length > 0 &&
    input.codingResult?.evidence.includes(
      "session-print:stopped-final-output:include",
    )
  ) {
    return input.finalOutput;
  }
  return input.terminalStopReason ?? input.terminalStatus;
}
