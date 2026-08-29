import type { SubAgentExecutionResult } from "./types.js";

export interface SwarmConvergenceResult {
  readonly converged: boolean;
  readonly totalTokens: number;
  readonly consensusOutput: string;
  readonly discrepancies: readonly string[];
}

export function verifySwarmConvergence(
  results: readonly SubAgentExecutionResult[],
): SwarmConvergenceResult {
  if (results.length === 0) {
    return {
      converged: false,
      totalTokens: 0,
      consensusOutput: "",
      discrepancies: ["No sub-agent results provided."],
    };
  }

  const failed = results.filter((r) => !r.success);
  const totalTokens = results.reduce((acc, r) => acc + r.tokensUsed, 0);

  if (failed.length > 0) {
    return {
      converged: false,
      totalTokens,
      consensusOutput: "",
      discrepancies: failed.map((f) => `Task ${f.taskId} (${f.role}) failed: ${f.output}`),
    };
  }

  const successfulOutputs = results.map((r) => r.output.trim());
  const primaryOutput = successfulOutputs[0] ?? "";

  return {
    converged: true,
    totalTokens,
    consensusOutput: primaryOutput,
    discrepancies: [],
  };
}
