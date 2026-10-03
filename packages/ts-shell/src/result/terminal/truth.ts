import type { TerminalClassification, TerminalReason } from "../types.js";

export interface ContinuityTerminalFacts {
  readonly terminalClassification?: TerminalClassification;
  readonly terminalReason?: TerminalReason;
  readonly stopReason?: string;
}

export function selectContinuityTerminalSource(input: {
  readonly query?: ContinuityTerminalFacts;
  readonly coding?: ContinuityTerminalFacts;
}): ContinuityTerminalFacts | undefined {
  if (!input.query?.terminalClassification) return input.coding ?? input.query;
  return input.query.terminalClassification === "success" && input.coding &&
    input.coding.terminalClassification !== "success" ? input.coding : input.query;
}
