export interface BrowserActionContext {
  readonly signal?: AbortSignal;
  readonly deadline?: number;
  readonly taskId?: string;
}

export interface BrowserActionEvidence {
  readonly taskId?: string;
  readonly state: "completed" | "cancelled" | "error";
  readonly activity: "not-started" | "started" | "completed";
  readonly effect: "none" | "possible" | "confirmed";
  readonly cleanup: "not-needed" | "complete" | "failed" | "unknown";
  readonly reason?: "parent-abort" | "deadline" | "session-close";
}

export type BrowserOperation<T> =
  | { readonly status: "completed"; readonly value: T; readonly evidence: BrowserActionEvidence }
  | { readonly status: "cancelled" | "error"; readonly value?: T; readonly evidence: BrowserActionEvidence };

type Cleanup = () => Promise<{ readonly ok: boolean; readonly failure?: { readonly cleanup?: "failed" | "unknown" } }>;
const DEFAULT_ACTION_MS = 30_000;
const CANCELLATION_WAIT_MS = 4_000;

/** Scope survives a caller timeout until its underlying operation has settled. */
export class ActionScope {
  private readonly controller = new AbortController();
  readonly signal = this.controller.signal;
  readonly stopped: Promise<void>;
  private stop!: () => void;
  private readonly timer: ReturnType<typeof setTimeout>;
  private readonly deadline: number;
  private readonly onAbort = () => this.cancel("parent-abort");
  reason?: BrowserActionEvidence["reason"];
  activity: BrowserActionEvidence["activity"] = "not-started";
  effect: BrowserActionEvidence["effect"] = "none";

  constructor(readonly context: BrowserActionContext) {
    this.stopped = new Promise((resolve) => { this.stop = resolve; });
    this.deadline = context.deadline ?? Date.now() + DEFAULT_ACTION_MS;
    const remaining = this.deadline - Date.now();
    this.timer = setTimeout(() => this.cancel("deadline"), Math.max(0, remaining));
    context.signal?.addEventListener("abort", this.onAbort, { once: true });
    if (context.signal?.aborted) this.cancel("parent-abort");
    else if (remaining <= 0) this.cancel("deadline");
  }

  cancel(reason: NonNullable<BrowserActionEvidence["reason"]>): void {
    if (this.reason) return;
    this.reason = reason;
    this.controller.abort(new Error('Browser action stopped.'));
    this.stop();
  }

  check(): void {
    if (Date.now() >= this.deadline) this.cancel("deadline");
    if (this.reason) throw new Error("Browser action stopped.");
  }

  async perform<T>(operation: () => Promise<T>): Promise<T> {
    this.check();
    this.effect = "possible";
    const value = await operation();
    this.effect = "confirmed";
    this.check();
    return value;
  }

  evidence(state: BrowserActionEvidence["state"], cleanup: BrowserActionEvidence["cleanup"]): BrowserActionEvidence {
    return { taskId: this.context.taskId, state, activity: this.activity, effect: this.effect, cleanup, reason: this.reason };
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.context.signal?.removeEventListener("abort", this.onAbort);
  }
}

/** Serializes the entire operation, including late work and cancellation cleanup. */
export class BrowserActions {
  private tail: Promise<void> = Promise.resolve();
  scope?: ActionScope;

  async run<T>(context: BrowserActionContext, operation: () => Promise<T>, cleanup: Cleanup): Promise<BrowserOperation<T>> {
    const scope = new ActionScope(context);
    const previous = this.tail;
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    this.tail = previous.then(() => held);
    const admitted = await Promise.race([previous.then(() => true), scope.stopped.then(() => false)]);
    if (!admitted || scope.reason) {
      release();
      scope.dispose();
      return { status: "cancelled", evidence: scope.evidence("cancelled", "not-needed") };
    }
    this.scope = scope;
    scope.activity = "started";
    let finished: { readonly ok: true; readonly value: T } | { readonly ok: false } | undefined;
    const work = Promise.resolve().then(() => { scope.check(); return operation(); }).then(
      (value) => ({ ok: true as const, value }),
      () => ({ ok: false as const }),
    ).then(result => { finished = result; return result; });
    const first = await Promise.race([work, scope.stopped.then(() => undefined)]);
    if (first && !scope.reason) {
      scope.activity = "completed";
      this.scope = undefined;
      scope.dispose();
      release();
      return first.ok
        ? { status: "completed", value: first.value, evidence: scope.evidence("completed", "not-needed") }
        : { status: "error", evidence: scope.evidence("error", "not-needed") };
    }
    // Close immediately to interrupt page operations, then also collect handles
    // returned by a late launch. Never release the lane while work is outstanding.
    const settling = (async (): Promise<BrowserActionEvidence["cleanup"]> => {
      await cleanup();
      await work;
      const result = await cleanup();
      return result.ok ? "complete" : result.failure?.cleanup ?? "failed";
    })().catch(() => "unknown" as const).finally(() => {
      this.scope = undefined;
      scope.dispose();
      release();
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const outcome = await Promise.race([
        settling,
        new Promise<"unknown">((resolve) => { timer = setTimeout(() => resolve("unknown"), CANCELLATION_WAIT_MS); }),
      ]);
      return { status: "cancelled", ...(finished?.ok ? { value: finished.value } : {}), evidence: scope.evidence("cancelled", outcome) };
    } finally {
      clearTimeout(timer);
    }
  }
}
