import { TextDecoder } from 'node:util';
import type { ExecutionInput } from '../runtime/execution/types.js';
import { LanguageError, languageLimits, object, type JsonObject } from './contract.js';

/** Content-Length counts UTF-8 bytes, including across arbitrary pipe boundaries. */
export class MessageFrames {
  private buffer = Buffer.alloc(0);
  private length: number | undefined;
  private total = 0;
  constructor(private readonly receive: (message: JsonObject) => void) {}

  push(chunk: Buffer): void {
    this.total += chunk.length;
    if (this.total > languageLimits.outputBytes || this.buffer.length + chunk.length > languageLimits.frameBytes + languageLimits.headerBytes) {
      throw new LanguageError('protocol', 'Language server output limit exceeded.');
    }
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length) {
      if (this.length === undefined) {
        const boundary = this.buffer.indexOf('\r\n\r\n');
        if (boundary === -1) {
          if (this.buffer.length > languageLimits.headerBytes) throw new LanguageError('protocol', 'Language server header limit exceeded.');
          return;
        }
        if (boundary > languageLimits.headerBytes) throw new LanguageError('protocol', 'Language server header limit exceeded.');
        const headers = this.buffer.subarray(0, boundary).toString('ascii').split('\r\n');
        const lengths = headers.filter(header => /^content-length:/i.test(header));
        const match = lengths.length === 1 ? /^content-length:\s*(\d+)\s*$/i.exec(lengths[0]!) : null;
        const size = match ? Number(match[1]) : NaN;
        if (!Number.isSafeInteger(size) || size < 1 || size > languageLimits.frameBytes) throw new LanguageError('protocol', 'Language server frame length is invalid.');
        this.length = size;
        this.buffer = this.buffer.subarray(boundary + 4);
      }
      if (this.buffer.length < this.length) return;
      const body = this.buffer.subarray(0, this.length);
      this.buffer = this.buffer.subarray(this.length);
      this.length = undefined;
      let message: JsonObject;
      try { message = object(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body))); }
      catch { throw new LanguageError('protocol', 'Language server sent invalid JSON.'); }
      this.receive(message);
    }
  }
}

interface Pending {
  readonly resolve: (result: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly finish: () => void;
}

export class RpcConnection {
  private sequence = 0;
  private readonly pending = new Map<number, Pending>();
  private failure: Error | undefined;
  readonly frames = new MessageFrames(message => this.receive(message));
  constructor(private readonly input: ExecutionInput, private readonly notification: (method: string, params: unknown) => void) {}

  async send(message: JsonObject): Promise<void> {
    if (this.failure) throw this.failure;
    const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...message }));
    if (body.length > languageLimits.frameBytes) throw new LanguageError('invalid', 'Language request exceeds the frame limit.');
    await this.input.write(Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]));
  }

  notify(method: string, params?: unknown): Promise<void> { return this.send({ method, ...(params === undefined ? {} : { params }) }); }

  request(method: string, params: unknown, signal?: AbortSignal, timeoutMs: number = languageLimits.requestMs): Promise<unknown> {
    if (this.failure) return Promise.reject(this.failure);
    if (signal?.aborted) return Promise.reject(new LanguageError('cancelled', 'Language request was cancelled.'));
    if (this.pending.size >= languageLimits.pending) return Promise.reject(new LanguageError('unavailable', 'Language server request limit reached.'));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const cancel = (kind: 'cancelled' | 'timeout') => {
        const pending = this.pending.get(id);
        if (!pending) return;
        this.pending.delete(id); pending.finish();
        void this.notify('$/cancelRequest', { id }).catch(() => {});
        reject(new LanguageError(kind, kind === 'timeout' ? 'Language request timed out.' : 'Language request was cancelled.'));
      };
      const onAbort = () => cancel('cancelled');
      const timer = setTimeout(() => cancel('timeout'), timeoutMs);
      this.pending.set(id, { resolve, reject, finish: () => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); } });
      signal?.addEventListener('abort', onAbort, { once: true });
      void this.send({ id, method, params }).catch(() => {
        const pending = this.pending.get(id);
        if (pending) { this.pending.delete(id); pending.finish(); reject(new LanguageError('crashed', 'Language server input is unavailable.')); }
      });
    });
  }

  private receive(message: JsonObject): void {
    if (message.jsonrpc !== '2.0') throw new LanguageError('protocol', 'Language server JSON-RPC version is invalid.');
    if (typeof message.method === 'string') {
      if (message.id !== undefined) {
        if (typeof message.id !== 'string' && typeof message.id !== 'number') throw new LanguageError('protocol', 'Language server request ID is invalid.');
        // A server request cannot grant write authority, invoke commands or alter permissions.
        const response = message.method === 'workspace/applyEdit'
          ? { result: { applied: false, failureReason: 'Edits require an explicit apply_patch proposal and approval.' } }
          : { error: { code: -32601, message: 'Client request is not supported.' } };
        void this.send({ id: message.id, ...response }).catch(() => {});
      } else this.notification(message.method, message.params);
      return;
    }
    if (typeof message.id !== 'number') throw new LanguageError('protocol', 'Language server response ID is invalid.');
    const pending = this.pending.get(message.id);
    if (!pending) return; // Late responses to cancelled requests have no authority.
    this.pending.delete(message.id); pending.finish();
    if (message.error !== undefined) pending.reject(new LanguageError('server-error', 'Language server rejected the request.'));
    else if (!Object.hasOwn(message, 'result')) pending.reject(new LanguageError('protocol', 'Language server response has no result.'));
    else pending.resolve(message.result);
  }

  close(error: Error): void {
    this.failure = error;
    for (const pending of this.pending.values()) { pending.finish(); pending.reject(error); }
    this.pending.clear();
  }
}
