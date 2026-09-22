/**
 * A push channel read as an async iterable.
 *
 * The kernel reports through a listener while the shell reads an event stream;
 * this is the seam between the two. Pushes never block, so a listener is never
 * held up by a slow reader, and closing lets the reader drain what was pushed
 * before it ends.
 */
export class EventChannel<T> implements AsyncIterable<T> {
  private readonly buffered: T[] = [];
  private waiting: ((result: IteratorResult<T>) => void) | undefined;
  private closed = false;

  push(item: T): void {
    if (this.closed) return;
    const waiting = this.waiting;
    if (waiting) {
      this.waiting = undefined;
      waiting({ value: item, done: false });
      return;
    }
    this.buffered.push(item);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    const waiting = this.waiting;
    if (waiting) {
      this.waiting = undefined;
      waiting({ value: undefined as never, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        const buffered = this.buffered.shift();
        if (buffered !== undefined) return Promise.resolve({ value: buffered, done: false });
        if (this.closed) return Promise.resolve({ value: undefined as never, done: true });
        return new Promise((resolve) => {
          this.waiting = resolve;
        });
      },
    };
  }
}
