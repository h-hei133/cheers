/** Retention loss is diagnostic information, never evidence of a completed action. */
export interface RetentionState {
  readonly dropped: number;
  readonly incomplete: boolean;
}

export interface RetentionStatus extends RetentionState {
  readonly capacity: number;
  readonly size: number;
}

export function retentionCapacity(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError("Retention capacity must be a positive safe integer.");
  }
  return value;
}

/** Keep the most recently written entries. Reads never allocate or change retention. */
export class RetainedMap<K, V> {
  private readonly entries = new Map<K, V>();
  private dropped = 0;
  private readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = retentionCapacity(capacity);
  }

  get(key: K): V | undefined { return this.entries.get(key); }

  set(key: K, value: V): readonly [K, V] | undefined {
    this.entries.delete(key);
    this.entries.set(key, value);
    if (this.entries.size <= this.capacity) return undefined;
    const oldest = this.entries.entries().next().value as [K, V];
    this.entries.delete(oldest[0]);
    this.dropped = Math.min(Number.MAX_SAFE_INTEGER, this.dropped + 1);
    return oldest;
  }

  delete(key: K): void { this.entries.delete(key); }

  retention(): RetentionStatus {
    return { capacity: this.capacity, size: this.entries.size, dropped: this.dropped, incomplete: this.dropped > 0 };
  }
}

/** Histories are ordered newest first by their owner. */
export function retainHistory<T>(items: readonly T[], capacity: number, previousDropped = 0): {
  readonly items: readonly T[];
  readonly dropped: number;
  readonly incomplete: boolean;
} {
  const dropped = Math.min(Number.MAX_SAFE_INTEGER, previousDropped + Math.max(0, items.length - capacity));
  return { items: items.slice(0, capacity), dropped, incomplete: dropped > 0 };
}
