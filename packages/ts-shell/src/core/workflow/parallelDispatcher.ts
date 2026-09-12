export type Thunk<T> = () => Promise<T>;

export interface ParallelOptions {
  readonly maxConcurrency?: number;
  readonly timeoutMs?: number;
}

/**
 * Parallel Dispatcher
 * parallel(thunks): runs asynchronous tasks concurrently
 * in a bounded worker pool while preserving strict input/output index correspondence.
 */
export class ParallelDispatcher {
  public static async run<T>(
    thunks: readonly Thunk<T>[],
    options: ParallelOptions = {},
  ): Promise<T[]> {
    if (thunks.length === 0) {
      return [];
    }

    const { maxConcurrency = 4, timeoutMs } = options;
    const maxPool = Math.max(1, maxConcurrency);
    const results: T[] = new Array(thunks.length);
    let nextIndex = 0;

    const worker = async (): Promise<void> => {
      while (nextIndex < thunks.length) {
        const currentIndex = nextIndex++;
        const thunk = thunks[currentIndex];

        if (timeoutMs && timeoutMs > 0) {
          let timerId: NodeJS.Timeout | number | undefined;
          const timeoutPromise = new Promise<T>((_, reject) => {
            timerId = setTimeout(
              () => reject(new Error(`Task timed out after ${timeoutMs}ms`)),
              timeoutMs,
            );
          });

          try {
            results[currentIndex] = await Promise.race([thunk(), timeoutPromise]);
          } finally {
            clearTimeout(timerId);
          }
        } else {
          results[currentIndex] = await thunk();
        }
      }
    };

    const workerCount = Math.min(maxPool, thunks.length);
    const workers: Promise<void>[] = [];
    for (let i = 0; i < workerCount; i++) {
      workers.push(worker());
    }

    await Promise.all(workers);
    return results;
  }
}
