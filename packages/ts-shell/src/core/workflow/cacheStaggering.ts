export interface StaggeredExecutionOptions {
  readonly staggerIntervalMs?: number;
  readonly prefixGroupKey?: (taskInput: unknown) => string;
}

/**
 * Cache Staggering Dispatcher
 * Prompt cache prefix staggering for dynamic workflows:
 * Staggers homogeneous parallel agent dispatch calls by a small delta (e.g. 50ms)
 * to guarantee that subsequent tasks hit the warm Prompt Cache established by the first task.
 */
export class CacheStaggeringDispatcher {
  public static async dispatchStaggered<TInput, TOutput>(
    tasks: readonly TInput[],
    executor: (item: TInput, index: number) => Promise<TOutput>,
    options: StaggeredExecutionOptions = {},
  ): Promise<TOutput[]> {
    const { staggerIntervalMs = 50 } = options;

    if (tasks.length <= 1 || staggerIntervalMs <= 0) {
      return Promise.all(tasks.map((task, idx) => executor(task, idx)));
    }

    const promises = tasks.map(async (task, index) => {
      if (index > 0) {
        await new Promise((resolve) => setTimeout(resolve, index * staggerIntervalMs));
      }
      return executor(task, index);
    });

    return Promise.all(promises);
  }
}
