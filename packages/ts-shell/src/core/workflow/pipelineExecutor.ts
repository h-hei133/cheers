import type { WorkflowStage, WorkflowTask } from "./types.js";

export type StageExecutorFn<TInput, TOutput> = (
  task: WorkflowTask,
  stageInput?: TInput,
) => Promise<TOutput>;

export interface PipelineExecutionResult {
  readonly success: boolean;
  readonly completedStages: number;
  readonly totalStages: number;
  readonly stageOutputs: ReadonlyMap<string, unknown>;
  readonly error?: string;
}

/**
 * Pipeline Executor
 * Executes stages sequentially with physical stage barriers (Stage Barrier).
 * Guarantees that Stage N is 100% completed before Stage N+1 begins.
 */
export class PipelineExecutor {
  public static async execute(
    stages: readonly WorkflowStage[],
    executor: StageExecutorFn<unknown, unknown>,
  ): Promise<PipelineExecutionResult> {
    const stageOutputs = new Map<string, unknown>();

    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];
      const previousOutput = i > 0 ? stageOutputs.get(stages[i - 1].id) : undefined;

      try {
        // Execute all tasks in the current stage
        const taskResults = await Promise.all(
          stage.tasks.map((task) => executor(task, previousOutput)),
        );

        stageOutputs.set(stage.id, taskResults);

        // Barrier check: if any task in this stage threw an unhandled error, pipeline halts
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          completedStages: i,
          totalStages: stages.length,
          stageOutputs,
          error: `Stage '${stage.name}' failed: ${message}`,
        };
      }
    }

    return {
      success: true,
      completedStages: stages.length,
      totalStages: stages.length,
      stageOutputs,
    };
  }
}
