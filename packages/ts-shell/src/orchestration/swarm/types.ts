export type SubAgentRole = "scout" | "coder" | "reviewer" | "tester";

export interface SubAgentTaskSpec {
  readonly taskId: string;
  readonly role: SubAgentRole;
  readonly prompt: string;
  readonly tokenBudget?: number;
  readonly readOnly?: boolean;
}

export interface SubAgentExecutionResult {
  readonly taskId: string;
  readonly role: SubAgentRole;
  readonly output: string;
  readonly success: boolean;
  readonly tokensUsed: number;
  readonly artifacts: readonly string[];
}
