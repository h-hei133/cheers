import type { SessionMessage } from '../schema/sessionMessage.js';

type RetainedValue = { readonly message: SessionMessage } | { start: number; end: number };
interface RetainedNode { readonly value: RetainedValue; next?: RetainedNode }

/** A declaration is registered once; compaction moves its range instead of copying it. */
export class TranscriptRetention {
  private readonly declarations: SessionMessage[] = [];
  private spineLength = 0;
  private tailLength = 0;
  private head?: RetainedNode;
  private tail?: RetainedNode;

  append(message: SessionMessage): void {
    let value: RetainedValue;
    if (message.requestDeclaration) {
      const start = this.declarations.length;
      this.declarations.push(message);
      const last = this.tail?.value;
      if (last && !('message' in last) && last.end === start) {
        last.end += 1;
        this.tailLength += 1;
        return;
      }
      value = { start, end: start + 1 };
    } else value = { message };
    const node: RetainedNode = { value };
    if (this.tail) this.tail.next = node;
    else this.head = node;
    this.tail = node;
    this.tailLength += 1;
  }

  compact(checkpoint: SessionMessage, keptMessages: number | undefined, signal?: AbortSignal): void {
    signal?.throwIfAborted();
    const length = this.spineLength + this.tailLength;
    const offset = keptMessages && keptMessages > 0 ? Math.trunc(-keptMessages) : undefined;
    const kept = offset === undefined ? 0 : offset < 0 ? Math.min(-offset, length) : length;
    if (kept < this.tailLength) this.discard(this.tailLength - kept, signal);
    else {
      // The old suffix may begin inside the declaration spine. It stays after
      // the new checkpoint, as every retained raw message always did.
      const retained = kept - this.tailLength;
      if (retained > 0) {
        this.prepend({ start: this.spineLength - retained, end: this.spineLength }, retained);
        this.spineLength -= retained;
      }
    }
    this.prepend({ message: checkpoint }, 1);
  }

  messages(signal?: AbortSignal): SessionMessage[] {
    const result: SessionMessage[] = [];
    let checks = 0;
    signal?.throwIfAborted();
    for (let index = 0; index < this.spineLength; index += 1) {
      if ((checks++ & 255) === 0) signal?.throwIfAborted();
      result.push(this.declarations[index]!);
    }
    for (let node = this.head; node; node = node.next) {
      if ((checks++ & 255) === 0) signal?.throwIfAborted();
      const value = node.value;
      if ('message' in value) result.push(value.message);
      else for (let index = value.start; index < value.end; index += 1) {
        if ((checks++ & 255) === 0) signal?.throwIfAborted();
        result.push(this.declarations[index]!);
      }
    }
    signal?.throwIfAborted();
    return result;
  }

  private prepend(value: RetainedValue, length: number): void {
    const node: RetainedNode = { value, next: this.head };
    this.head = node;
    this.tail ??= node;
    this.tailLength += length;
  }

  private discard(length: number, signal?: AbortSignal): void {
    let checks = 0;
    while (length > 0 && this.head) {
      if ((checks++ & 255) === 0) signal?.throwIfAborted();
      const node = this.head;
      const value = node.value;
      if ('message' in value) {
        length -= 1;
        this.tailLength -= 1;
        this.head = node.next;
      } else {
        const removed = Math.min(length, value.end - value.start);
        value.start += removed;
        this.spineLength += removed;
        this.tailLength -= removed;
        length -= removed;
        if (value.start === value.end) this.head = node.next;
      }
    }
    if (!this.head) this.tail = undefined;
  }
}
