import type { PendingQueue, PendingQueueEntry } from './queue.js';

/** Polling borrows a prefix until the turn has accepted its history. */
export function reserveQueueInput<T>() {
  const reservations = new WeakMap<readonly T[], { queue: PendingQueue<T>; entries: readonly PendingQueueEntry<T>[] }>();
  return {
    reserve(queue: PendingQueue<T>): T[] {
      const pending = queue.entries();
      const entries = queue.mode === 'all' ? pending : pending.slice(0, 1);
      const messages = entries.map(entry => entry.value);
      reservations.set(messages, { queue, entries });
      return messages;
    },
    commit(messages: readonly T[]): readonly T[] {
      const reservation = reservations.get(messages);
      if (!reservation) return messages;
      reservations.delete(messages);
      return reservation.queue.drain(reservation.entries);
    },
  };
}
