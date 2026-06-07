export interface RepairFailureStrategyInput {
  readonly failureClass: string;
  readonly failureSummary: string;
  readonly targetFiles: readonly string[];
}

export interface RepairFailureStrategy {
  readonly hypothesis: string;
  readonly contextNeed?: string;
}

export function selectRepairFailureStrategy(
  input: RepairFailureStrategyInput,
): RepairFailureStrategy {
  const summary = `${input.failureClass} ${input.failureSummary}`.toLowerCase();
  const needsContext =
    summary.includes("missing context") ||
    (summary.includes("missing") && summary.includes("context"));

  return {
    hypothesis: needsContext
      ? "read missing repair context before another repair attempt"
      : "change repair strategy before another attempt",
    ...(needsContext && input.targetFiles[0]
      ? { contextNeed: input.targetFiles[0] }
      : {}),
  };
}
