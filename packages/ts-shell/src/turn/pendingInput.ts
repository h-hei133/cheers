import type { TurnInput } from "./session.js";
import { PendingQueue, inputQueueControl } from '../core/agent/queue.js';
import type { QueuedInputOptions } from './input.js';

type PendingInput = { readonly text: string; readonly options?: QueuedInputOptions };

/**
 * A run's input handle, from before the run exists.
 *
 * A turn is not ready the moment the caller asks for it: a real provider is
 * checked for readiness first, and the MCP tool snapshot is awaited before the
 * tool pool is built. Input typed in that window has nowhere to go yet, and
 * dropping it would silently lose the user's message — so it is held here and
 * delivered when the run's own handle appears.
 *
 * One implementation rather than one per call site. Two copies of this existed,
 * and they had already drifted: the copy that only read its own buffer reported
 * an empty queue while the run held the messages, so text the user typed was
 * invisible to `pending()` and unrecoverable through `clearQueue()` — which is
 * what the interrupt path uses to hand undelivered input back to the editor.
 */
export interface PendingTurnInput {
  /** The handle callers get now. Safe to use before {@link PendingTurnInput.adopt}. */
  readonly input: TurnInput;
  /**
   * Bind the run's own handle, delivering whatever was typed before it existed.
   *
   * A run that takes no input leaves the buffer in place instead of adopting
   * nothing: "this run reads no input" and "the run has not started" are
   * different, and only the second has somewhere to deliver to later.
   */
  adopt(run: { readonly input?: TurnInput } | undefined): void;
}

export function pendingTurnInput(): PendingTurnInput {
  const steering = new PendingQueue<PendingInput>('all');
  const followUps = new PendingQueue<PendingInput>('all');
  // The run's own handle once it exists. Everything below reads and writes
  // through it when it is set, so the queue reported and the queue drained are
  // the run's — the queue that actually holds the messages.
  let live: TurnInput | undefined;
  const modes: Partial<Record<'steering' | 'followUp', 'one-at-a-time' | 'all'>> = {};
  const buffered = inputQueueControl([
    { lane: 'steering', queue: steering, text: value => value.text, replace: (value, text) => ({ ...value, text }) },
    { lane: 'followUp', queue: followUps, text: value => value.text, replace: (value, text) => ({ ...value, text }) },
  ]);

  const input: TurnInput = {
    isCompacting: () => live?.isCompacting?.() ?? false,
    isAccepting: () => live?.isAccepting?.() ?? true,
    abortRetry: () => live?.abortRetry?.(),
    activeTools: () => live?.activeTools?.() ?? [],
    setQueueMode: (lane, mode) => {
      modes[lane] = mode;
      live?.setQueueMode?.(lane, mode);
    },
    steer: (text, id, options) => {
      if (live) options ? live.steer(text, id, options) : live.steer(text, id);
      else steering.enqueue({text, options}, id);
    },
    followUp: (text, id, options) => {
      if (live) options ? live.followUp(text, id, options) : live.followUp(text, id);
      else followUps.enqueue({text, options}, id);
    },
    queue: { entries: () => (live?.queue ?? buffered).entries(), edit: (id, text) => (live?.queue ?? buffered).edit(id, text),
      cancel: id => (live?.queue ?? buffered).cancel(id), move: (id, beforeId) => (live?.queue ?? buffered).move(id, beforeId) },
    pending: () =>
      live?.pending() ?? { steering: steering.entries().map(entry => entry.value.text), followUps: followUps.entries().map(entry => entry.value.text) },
    recallFollowUp: format => {
      if (live) return live.recallFollowUp?.(format);
      const entry = followUps.entries().at(-1);
      if (!entry || entry.value.options?.source !== 'interactive') return;
      const draft = format(entry.value.text, entry.value.options.images ?? []);
      return draft !== undefined && followUps.contains(entry) && followUps.cancel(entry.id) ? draft : undefined;
    },
    clearQueue: (format) => {
      // Emptied as it is read: the interrupt path hands this text back to the
      // editor, and a second read must not hand it over twice.
      const taken = [...steering.drain(), ...followUps.drain()].map(value => format?.(value.text, value.options?.images ?? []) ?? value.text);
      return [...taken, ...(format ? live?.clearQueue(format) ?? [] : live?.clearQueue() ?? [])];
    },
  };

  return {
    input,
    adopt: (run) => {
      if (!run?.input) return;
      live = run.input;
      if (modes.steering) live.setQueueMode?.('steering', modes.steering);
      if (modes.followUp) live.setQueueMode?.('followUp', modes.followUp);
      for (const entry of steering.entries()) input.steer(entry.value.text, entry.id, entry.value.options);
      for (const entry of followUps.entries()) input.followUp(entry.value.text, entry.id, entry.value.options);
      steering.clear(); followUps.clear();
    },
  };
}
