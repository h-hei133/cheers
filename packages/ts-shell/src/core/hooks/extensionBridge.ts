export type ExtensionEventRunner = (
  event: string,
  payload: unknown,
  aliases?: readonly string[],
  signal?: AbortSignal,
) => Promise<unknown>;

type ExtensionEventProvider = (root: string, sessionId?: string) => readonly ExtensionEventRunner[];

let activeProvider: ExtensionEventProvider | undefined;

/** Installed by catalog contributions so HookDispatcher avoids importing core/catalog directly. */
export function registerExtensionEventProvider(provider: ExtensionEventProvider): void {
  activeProvider = provider;
}

export function getExtensionEventRunners(root: string, sessionId?: string): readonly ExtensionEventRunner[] {
  return activeProvider ? activeProvider(root, sessionId) : [];
}

export interface ExtensionEventDispatch {
  readonly delivered: number;
  readonly failed: number;
  readonly cancelled: boolean;
}

/** Notifications consume the captured audience, without treating observer returns as permissions. */
export async function dispatchExtensionEvent(
  root: string,
  sessionId: string,
  event: string,
  payload: unknown,
  options: {
    readonly signal?: AbortSignal;
    readonly admission?: () => string | undefined;
    readonly timeoutMs?: number;
    /** A caller may pin the audience before queuing an observational event. */
    readonly runners?: readonly ExtensionEventRunner[];
  } = {},
): Promise<ExtensionEventDispatch> {
  const { signal, admission } = options;
  const requestedTimeout = options.timeoutMs ?? 5000;
  const timeoutMs = Number.isFinite(requestedTimeout) && requestedTimeout > 0
    ? Math.min(5000, Math.max(1, Math.trunc(requestedTimeout))) : 5000;
  const controller = new AbortController();
  const cancelled = (): boolean => {
    try {
      AbortSignal.prototype.throwIfAborted.call(controller.signal);
      if (signal) AbortSignal.prototype.throwIfAborted.call(signal);
      const refused = Boolean(admission?.());
      AbortSignal.prototype.throwIfAborted.call(controller.signal);
      if (signal) AbortSignal.prototype.throwIfAborted.call(signal);
      return refused;
    } catch { return true; }
  };
  const cancel = () => AbortController.prototype.abort.call(controller);
  let delivered = 0, failed = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let settleCancellation!: () => void;
  const cancellation = new Promise<void>(resolve => { settleCancellation = resolve; });
  const onCancelled = () => settleCancellation();
  EventTarget.prototype.addEventListener.call(controller.signal, 'abort', onCancelled, { once: true });
  if (signal) EventTarget.prototype.addEventListener.call(signal, 'abort', cancel, { once: true });
  try {
    if (cancelled()) return { delivered, failed, cancelled: true };
    const runners = [...(options.runners ?? getExtensionEventRunners(root, sessionId))];
    if (cancelled()) return { delivered, failed, cancelled: true };
    timer = setTimeout(cancel, timeoutMs);
    for (const runner of runners) {
      if (cancelled()) return { delivered, failed, cancelled: true };
      // Observe both outcomes even if cancellation wins the bounded wait.
      const pending = Promise.resolve().then(() => {
        if (cancelled()) return false;
        return runner(event, payload, undefined, controller.signal).then(() => true);
      }).then(success => ({ success }), () => ({ success: false }));
      const result = await Promise.race([pending, cancellation.then(() => ({ success: false }))]);
      if (cancelled()) return { delivered, failed, cancelled: true };
      if (result.success) delivered++; else failed++;
    }
    return { delivered, failed, cancelled: false };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (signal) EventTarget.prototype.removeEventListener.call(signal, 'abort', cancel);
    EventTarget.prototype.removeEventListener.call(controller.signal, 'abort', onCancelled);
    AbortController.prototype.abort.call(controller);
  }
}
