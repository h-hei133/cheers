import type { StreamingRenderer } from "../../presentation/terminal/streaming.js";

export type TurnOrigin = "normal" | "resumed" | "continued";

export type TurnEndStatus =
  | "completed"
  | "blocked"
  | "interrupted"
  | "error";

export type TurnFallbackOutcome = "blocked" | "interrupted" | "error";

export function formatTurnStartBoundary(input: {
  turnNumber: number;
  origin: TurnOrigin;
}): string {
  return `\n=== Turn ${input.turnNumber}${formatTurnQualifier(input.origin)} ===`;
}

export function formatTurnEndBoundary(input: {
  turnNumber: number;
  origin: TurnOrigin;
  status: TurnEndStatus;
}): string {
  return `=== End Turn ${input.turnNumber}${formatTurnQualifier(
    input.origin,
    input.status,
  )} ===\n`;
}

export function formatExecutionStartedLine(origin: TurnOrigin): string {
  if (origin === "resumed") {
    return "Execution started (resumed context)...";
  }
  if (origin === "continued") {
    return "Execution started (continued context)...";
  }
  return "Execution started...";
}

export function renderTurnResultFallback(
  renderer: StreamingRenderer,
  input: {
    outcome: TurnFallbackOutcome;
    detail: string;
    doNext?: string;
  },
): void {
  renderer.renderLine("");
  renderer.renderLine("Result");
  renderer.renderLine(`- Outcome: ${input.outcome}`);
  renderer.renderLine(`- Detail: ${input.detail}`);
  if (input.doNext) {
    renderer.renderLine(`- DoNext: ${input.doNext}`);
  }
  renderer.renderLine("");
}

function formatTurnQualifier(
  origin: TurnOrigin,
  status: TurnEndStatus = "completed",
): string {
  const qualifiers: string[] = [];
  if (origin !== "normal") {
    qualifiers.push(origin);
  }
  if (status !== "completed") {
    qualifiers.push(status);
  }
  return qualifiers.length > 0 ? ` (${qualifiers.join(", ")})` : "";
}
