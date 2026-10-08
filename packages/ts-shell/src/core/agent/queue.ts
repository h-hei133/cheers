import { randomUUID } from 'node:crypto';

export type PendingQueueMode = "one-at-a-time" | "all";

export interface PendingQueueEntry<T> { readonly id: string; readonly value: T }
export type InputQueueLane = 'steering' | 'followUp' | 'pending';
export interface InputQueueEntry { readonly id: string; readonly text: string; readonly lane: InputQueueLane }
/** The port reads and changes the same queue the runtime will drain. */
export interface InputQueueControl {
  entries(): readonly InputQueueEntry[];
  edit(id: string, text: string): boolean;
  cancel(id: string): boolean;
  move(id: string, beforeId?: string): boolean;
}

export interface InputQueueSource<T> {
  readonly lane: InputQueueLane;
  readonly queue: PendingQueue<T>;
  text(value: T): string;
  replace(value: T, text: string): T;
}

/** A message keeps its delivery stage; moving across stages is refused. */
export function inputQueueControl<T>(sources: readonly InputQueueSource<T>[]): InputQueueControl {
  const locate = (id: string) => sources.find(source => source.queue.entries().some(entry => entry.id === id));
  return {
    entries: () => sources.flatMap(source => source.queue.entries().map(entry => ({ id: entry.id, text: source.text(entry.value), lane: source.lane }))),
    edit: (id, text) => {
      const source = locate(id); const entry = source?.queue.entries().find(candidate => candidate.id === id);
      return Boolean(source && entry && source.queue.edit(id, source.replace(entry.value, text)));
    },
    cancel: id => locate(id)?.queue.cancel(id) ?? false,
    move: (id, beforeId) => {
      const source = locate(id);
      return Boolean(source && (beforeId === undefined || locate(beforeId) === source) && source.queue.move(id, beforeId));
    },
  };
}

export class PendingQueue<T> {
  public mode: PendingQueueMode;

  private messages: PendingQueueEntry<T>[] = [];

  constructor(mode: PendingQueueMode = "one-at-a-time") {
    this.mode = mode;
  }

  public enqueue(message: T, id: string = randomUUID()): string {
    if (this.messages.some(entry => entry.id === id)) throw new Error('Pending queue ID already exists.');
    this.messages.push({ id, value: message });
    return id;
  }

  public hasItems(): boolean {
    return this.messages.length > 0;
  }

  public drain(): T[] {
    if (this.mode === "all") {
      const drained = this.messages.map(entry => entry.value);
      this.messages = [];
      return drained;
    }
    const first = this.messages[0];
    if (first === undefined) {
      return [];
    }
    this.messages = this.messages.slice(1);
    return [first.value];
  }

  public clear(): void {
    this.messages = [];
  }

  public entries(): readonly PendingQueueEntry<T>[] { return this.messages.map(entry => ({ ...entry })); }

  public edit(id: string, value: T): boolean {
    const index = this.messages.findIndex(entry => entry.id === id);
    if (index < 0) return false;
    this.messages[index] = { id, value }; return true;
  }

  public cancel(id: string): boolean {
    const index = this.messages.findIndex(entry => entry.id === id);
    if (index < 0) return false;
    this.messages.splice(index, 1); return true;
  }

  public move(id: string, beforeId?: string): boolean {
    const entry = this.messages.find(message => message.id === id);
    if (!entry || beforeId === id) return Boolean(entry);
    if (beforeId !== undefined && !this.messages.some(message => message.id === beforeId)) return false;
    this.cancel(id);
    const position = beforeId === undefined ? this.messages.length : this.messages.findIndex(message => message.id === beforeId);
    this.messages.splice(position, 0, entry); return true;
  }
}
