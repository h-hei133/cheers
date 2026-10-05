/** A timeout bounds waiting; it is never evidence that a resource closed. */
export type CloseOutcome = "closed" | "failed" | "unknown";

export interface Closable {
  close(): Promise<void>;
}

export const CLOSE_WAIT_MS = 1_000;

/** Retain pending attempts so retries observe them instead of issuing duplicate closes. */
export class ResourceCleanup {
  private readonly attempts = new WeakMap<Closable, Promise<CloseOutcome>>();

  async close(resource: Closable): Promise<CloseOutcome> {
    let attempt = this.attempts.get(resource);
    if (!attempt) {
      attempt = Promise.resolve().then(() => resource.close()).then(
        () => "closed" as const,
        () => {
          this.attempts.delete(resource);
          return "failed" as const;
        },
      );
      this.attempts.set(resource, attempt);
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        attempt,
        new Promise<CloseOutcome>((resolve) => {
          timer = setTimeout(() => resolve("unknown"), CLOSE_WAIT_MS);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Observe initialization without abandoning responsibility for its late handles. */
export async function initializationSettled(initialization: Promise<unknown>): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      initialization.then(() => true, () => true),
      new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), CLOSE_WAIT_MS); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
