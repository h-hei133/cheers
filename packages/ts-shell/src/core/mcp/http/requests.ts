import type { JSONRPCMessage, RequestId } from '@modelcontextprotocol/sdk/types.js';

interface PendingRequest {
  readonly abort: AbortController;
  finish?: () => void;
}

/** The SDK cancels by request ID; bind that lifecycle to the corresponding POST. */
export class McpHttpRequests {
  private readonly pending = new Map<RequestId, PendingRequest>();

  open(message: JSONRPCMessage): void {
    if ('method' in message && 'id' in message && message.id !== undefined) this.pending.set(message.id, { abort: new AbortController() });
  }

  find(body: string | undefined): { signal: AbortSignal; bind(finish: () => void): void; release(): void } | undefined {
    if (!body) return;
    const { id, method } = JSON.parse(body) as { id?: RequestId; method?: string };
    // Incoming server request IDs use a separate namespace. Our response to one
    // must never claim a client request with the same ID.
    if (id === undefined || typeof method !== 'string') return;
    const entry = this.pending.get(id);
    if (!entry) return;
    return { signal: entry.abort.signal, bind: finish => { entry.finish = finish; },
      release: () => { if (this.pending.get(id) === entry) this.pending.delete(id); } };
  }

  cancel(id: RequestId): void {
    const entry = this.pending.get(id);
    if (entry?.finish) entry.finish();
    else entry?.abort.abort();
    // Keep the aborted entry until a delayed fetch has observed its signal.
  }

  settle(message: JSONRPCMessage): void {
    if (!('id' in message) || message.id === undefined || 'method' in message) return;
    const entry = this.pending.get(message.id);
    this.pending.delete(message.id);
    entry?.finish?.();
  }

  close(): void {
    for (const entry of this.pending.values()) entry.abort.abort();
    this.pending.clear();
  }
}
