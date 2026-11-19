import { randomUUID } from 'node:crypto';
import { requestBrowser } from '../../core/network/connection.js';
import { NetworkError } from '../../core/network/error.js';
import { requestScope, type RequestScope } from '../../core/network/request.js';
import { STATE_BYTES, WIRE_BYTES, type ServiceRequest, type ServiceResponse } from '../contract/model.js';
import { ROOM_STREAM_TYPE, ROOM_STREAM_WINDOW_MS } from '../contract/stream.js';
import { CollaborationError, parseJson, requireValue } from '../contract/value.js';
import type { Profile } from './profile.js';
import { decodeResponse, readRoomStream } from './stream.js';

/** One pinned HTTP attempt per request or observation window. */
export class CollaborationClient {
  private readonly controller = new AbortController();
  constructor(readonly profile: Profile) {}
  close(): void { this.controller.abort(); }
  async request(operation: string, input: Omit<Partial<ServiceRequest>, 'version' | 'operation'> = {}, mutation = false, parent?: AbortSignal): Promise<ServiceResponse> {
    const requestId = mutation ? input.requestId ?? randomUUID() : input.requestId;
    const lifetime = new AbortController(); const abort = () => lifetime.abort();
    this.controller.signal.addEventListener('abort', abort, { once: true }); parent?.addEventListener('abort', abort, { once: true });
    if (this.controller.signal.aborted || parent?.aborted) abort();
    const scope = requestScope(3_000, lifetime.signal); let attempted = false;
    try {
      this.profile.check(); scope.check();
      const body = JSON.stringify({ version: 1, operation, ...input, principal: this.profile.principal, ...(requestId ? { requestId } : {}) });
      requireValue(Buffer.byteLength(body) <= WIRE_BYTES, 'capacity');
      attempted = true;
      const response = await this.post(body, scope, WIRE_BYTES);
      if (response.status === 503) throw new CollaborationError('unavailable');
      requireValue(response.ok, response.status === 403 ? 'denied' : response.status === 429 ? 'capacity' : 'stale');
      const value = parseJson(await response.text(), WIRE_BYTES); scope.check(); this.profile.check();
      return decodeResponse(value, this.profile.principal);
    } catch (error) {
      if (mutation && attempted) throw new UnknownMutation(requestId!);
      throw error instanceof CollaborationError ? error : new CollaborationError('unavailable');
    } finally { scope.dispose(); this.controller.signal.removeEventListener('abort', abort); parent?.removeEventListener('abort', abort); }
  }

  async *stream(input: { readonly roomId: string; readonly ticket: string; readonly epoch: string; readonly generation: number; readonly after: number },
    parent: AbortSignal): AsyncGenerator<ServiceResponse | undefined> {
    const lifetime = AbortSignal.any([this.controller.signal, parent, AbortSignal.timeout(ROOM_STREAM_WINDOW_MS + 5_000)]);
    const scope = requestScope(3_000, lifetime);
    const check = () => {
      scope.check();
      try { this.profile.check(); } catch { throw new CollaborationError('stale'); }
    };
    try {
      check();
      const { roomId, ticket, ...data } = input;
      const body = JSON.stringify({ version: 1, operation: 'stream', principal: this.profile.principal, roomId, ticket, data });
      requireValue(Buffer.byteLength(body) <= WIRE_BYTES, 'capacity');
      const response = await this.post(body, scope, STATE_BYTES, ROOM_STREAM_TYPE);
      if (response.status === 429 || response.status === 503) throw new CollaborationError('unavailable');
      requireValue(response.ok, response.status === 403 ? 'denied' : 'stale');
      if (response.status !== 200 || response.headers.get('content-type') !== ROOM_STREAM_TYPE || !response.body) {
        await response.body?.cancel().catch(() => {});
        throw new CollaborationError('invalid');
      }
      scope.releaseDeadline();
      yield* readRoomStream(response.body, this.profile.principal, check);
    } catch (error) {
      if (error instanceof NetworkError && error.code === 'response_limit') throw new CollaborationError('capacity');
      if (error instanceof NetworkError && error.code === 'denied') throw new CollaborationError('denied');
      throw error instanceof CollaborationError ? error : new CollaborationError('unavailable');
    } finally { scope.dispose(); }
  }

  private post(body: string, scope: RequestScope, maxBytes: number, accept?: string): Promise<Response> {
    const endpoint = this.profile.origin + '/v1';
    return requestBrowser(endpoint, { method: 'POST', headers: { 'content-type': 'application/json',
      authorization: 'Bearer ' + this.profile.token, ...(accept ? { accept } : {}) }, body, maxBytes }, scope,
      { admitUrl: url => url === endpoint, admitAddress: address => this.profile.addresses.includes(address) });
  }
}
export class UnknownMutation extends CollaborationError {
  constructor(readonly requestId: string) { super('unknown'); }
}
