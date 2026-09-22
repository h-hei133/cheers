export type PendingQueueMode = "one-at-a-time" | "all";

export class PendingQueue<T> {
  public mode: PendingQueueMode;

  private messages: T[] = [];

  constructor(mode: PendingQueueMode = "one-at-a-time") {
    this.mode = mode;
  }

  public enqueue(message: T): void {
    this.messages.push(message);
  }

  public hasItems(): boolean {
    return this.messages.length > 0;
  }

  public drain(): T[] {
    if (this.mode === "all") {
      const drained = this.messages.slice();
      this.messages = [];
      return drained;
    }
    const first = this.messages[0];
    if (first === undefined) {
      return [];
    }
    this.messages = this.messages.slice(1);
    return [first];
  }

  public clear(): void {
    this.messages = [];
  }
}
