import { inputQueueControl, type PendingQueue, type PendingQueueEntry } from '../core/agent/queue.js';
import type { AgentMessage } from '../core/agent/state.js';
import { imagesOf, messageToText, type ImageContent } from '../model-adapters/multimodal.js';

export type InputDisposition = 'steer' | 'followUp';
export type InputFormat = (text: string, images: readonly ImageContent[]) => string;

export interface QueuedInputOptions {
  readonly images?: readonly ImageContent[];
  readonly prepare?: (text: string, images: readonly ImageContent[], signal: AbortSignal) => Promise<PreparedQueuedInput>;
}

export type PreparedQueuedInput = { readonly status: 'handled'; readonly check: () => void }
  | { readonly status: 'continue'; readonly prompt: string; readonly images?: readonly ImageContent[]; readonly check: () => void };

type MessageQueue = PendingQueue<AgentMessage>;
type Preparation = { readonly status: 'rejected' } | PreparedQueuedInput;

/** The consumer holds the exact queue head until its callbacks and admission have settled. */
export function turnInput(signal: AbortSignal, report: (status: 'handled' | 'rejected', lane: InputDisposition) => void,
  publish: (message: AgentMessage) => void) {
  const preparation = new WeakMap<AgentMessage, NonNullable<QueuedInputOptions['prepare']>>();
  const decisions = new WeakMap<AgentMessage, Preparation>();
  const published = new WeakSet<AgentMessage>();
  const reservations = new WeakMap<AgentMessage, { readonly queue: MessageQueue; readonly entry: PendingQueueEntry<AgentMessage>;
    readonly lane: InputDisposition; readonly check?: () => void }>();
  let publicationFailed = false;
  let active: { readonly queue: MessageQueue; readonly entry: PendingQueueEntry<AgentMessage>; readonly controller: AbortController } | undefined;

  const message = (text: string, options?: QueuedInputOptions): AgentMessage => {
    const value: AgentMessage = { role: 'user', content: options?.images?.length ? [{ type: 'text', text }, ...options.images] : text };
    if (options?.prepare) preparation.set(value, options.prepare);
    return value;
  };
  const changed = () => {
    if (active && !active.queue.contains(active.entry)) active.controller.abort();
  };
  const control = (steering: MessageQueue, followUp: MessageQueue) => {
    const owners = [
      { lane: 'steering' as const, queue: steering },
      { lane: 'followUp' as const, queue: followUp },
    ];
    const queue = inputQueueControl<AgentMessage>(owners.map(owner => ({ ...owner,
      text: value => messageToText(value.content),
      replace: (value, text) => message(text, { images: imagesOf(value.content), prepare: preparation.get(value) }),
    })));
    return {
      entries: queue.entries,
      edit: (id: string, text: string) => { const result = queue.edit(id, text); changed(); return result; },
      cancel: (id: string) => { const result = queue.cancel(id); changed(); return result; },
      move: (id: string, beforeId?: string) => { const result = queue.move(id, beforeId); changed(); return result; },
      clear: (format: InputFormat = text => text) => {
        const pending = owners.flatMap(owner => owner.queue.entries());
        for (const owner of owners) owner.queue.clear();
        changed();
        return pending.map(({ value }) => format(messageToText(value.content), imagesOf(value.content)));
      },
    };
  };

  const prepare = async (queue: MessageQueue, entry: PendingQueueEntry<AgentMessage>, reduce: NonNullable<QueuedInputOptions['prepare']>) => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    active = { queue, entry, controller };
    signal.addEventListener('abort', abort, { once: true });
    try {
      const result = await reduce(messageToText(entry.value.content), imagesOf(entry.value.content), controller.signal);
      controller.signal.throwIfAborted();
      decisions.set(entry.value, result);
    } catch { if (!controller.signal.aborted) decisions.set(entry.value, { status: 'rejected' }); }
    finally { signal.removeEventListener('abort', abort); active = undefined; }
  };

  const reserve = (queue: MessageQueue, lane: InputDisposition, entries: readonly PendingQueueEntry<AgentMessage>[]) => {
    const messages: AgentMessage[] = [];
    for (const entry of entries) {
      const result = decisions.get(entry.value);
      if (result?.status === 'rejected' || (result && !admitted(result.check))) {
        queue.cancel(entry.id); report('rejected', lane); continue;
      }
      if (result?.status === 'handled') {
        queue.cancel(entry.id); report('handled', lane); continue;
      }
      const value = result ? message(result.prompt, { images: result.images }) : entry.value;
      reservations.set(value, { queue, entry, lane, check: result?.check });
      messages.push(value);
    }
    return messages;
  };

  const drain = async (queue: MessageQueue, lane: InputDisposition): Promise<AgentMessage[]> => {
    const initial = new Set(queue.entries().map(entry => entry.id));
    while (!signal.aborted) {
      const chosen: PendingQueueEntry<AgentMessage>[] = [];
      let wait: Promise<void> | undefined;
      for (const entry of queue.entries()) {
        if (!initial.has(entry.id)) break;
        const reduce = preparation.get(entry.value), result = decisions.get(entry.value);
        if (reduce && !result) { wait = prepare(queue, entry, reduce); break; }
        chosen.push(entry);
        if (queue.mode === 'one-at-a-time' && (!result || result.status === 'continue' && admitted(result.check))) break;
      }
      if (!wait) return reserve(queue, lane, chosen);
      await wait;
    }
    return [];
  };

  const commit = (values: readonly AgentMessage[]): { readonly messages: readonly AgentMessage[]; readonly failure?: Error } => {
    const messages: AgentMessage[] = [];
    const offsets = new Map<MessageQueue, number>();
    // The already acquired prefix must still be in order. Check every guard before the first append advances history.
    const ready = values.map(value => {
      const reservation = reservations.get(value);
      if (!reservation) return { value };
      const { queue, entry, check } = reservation;
      const index = offsets.get(queue) ?? 0;
      const current = queue.entries()[index];
      if (current?.id !== entry.id || current.value !== entry.value) return { value, stale: true };
      offsets.set(queue, index + 1);
      return { value, reservation, refused: check !== undefined && !admitted(check) };
    });
    for (const { value, reservation, refused, stale } of ready) {
      if (signal.aborted || stale) break;
      if (reservation) {
        const { queue, entry, lane } = reservation;
        if (!queue.contains(entry)) break;
        queue.cancel(entry.id);
        reservations.delete(value);
        if (refused) { report('rejected', lane); continue; }
        try { publish(value); }
        catch {
          publicationFailed = true;
          return { messages, failure: new Error('Queued input persistence is unverified.') };
        }
        published.add(value);
      }
      messages.push(value);
    }
    return { messages };
  };

  return { message, control, drain, commit, wasPublished: (value: AgentMessage) => published.has(value),
    publicationFailed: () => publicationFailed };
}

function admitted(check: () => void): boolean {
  try { check(); return true; } catch { return false; }
}
