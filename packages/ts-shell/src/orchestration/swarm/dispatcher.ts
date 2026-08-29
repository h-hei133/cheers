import type { SubAgentExecutionResult, SubAgentTaskSpec } from "./types.js";

export class SubAgentDispatcher {
  async dispatchTask(
    spec: SubAgentTaskSpec,
    runner: (prompt: string, readOnly: boolean) => Promise<string>,
  ): Promise<SubAgentExecutionResult> {
    try {
      const output = await runner(spec.prompt, Boolean(spec.readOnly));
      return {
        taskId: spec.taskId,
        role: spec.role,
        output,
        success: true,
        tokensUsed: Math.round((output.length + spec.prompt.length) / 4),
        artifacts: [],
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        taskId: spec.taskId,
        role: spec.role,
        output: `Sub-agent failed: ${msg}`,
        success: false,
        tokensUsed: 0,
        artifacts: [],
      };
    }
  }

  async dispatchBatch(
    specs: readonly SubAgentTaskSpec[],
    runner: (prompt: string, readOnly: boolean) => Promise<string>,
  ): Promise<readonly SubAgentExecutionResult[]> {
    return Promise.all(specs.map((spec) => this.dispatchTask(spec, runner)));
  }
}
