import { randomUUID } from 'node:crypto';
import { requestBrowser } from '../../core/network/connection.js';
import { requestScope } from '../../core/network/request.js';
import { WIRE_BYTES, type ServiceRequest, type ServiceResponse } from '../contract/model.js';
import { CollaborationError, keys, object, parseJson, requireValue } from '../contract/value.js';
import type { Profile } from './profile.js';

/** No retry, redirect, implicit discovery or body/error echo. */
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
    const endpoint = this.profile.origin + '/v1';
    try {
      this.profile.check(); scope.check();
      const body = JSON.stringify({ version: 1, operation, ...input, principal: this.profile.principal, ...(requestId ? { requestId } : {}) });
      requireValue(Buffer.byteLength(body) <= WIRE_BYTES, 'capacity');
      attempted = true;
      const response = await requestBrowser(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + this.profile.token }, body, maxBytes: WIRE_BYTES }, scope,
        { admitUrl: url => url === endpoint, admitAddress: address => this.profile.addresses.includes(address) });
      requireValue(response.ok, response.status === 403 ? 'denied' : response.status === 429 ? 'capacity' : 'stale');
      const payload = object(parseJson(await response.text(), WIRE_BYTES)); scope.check(); this.profile.check();
      keys(payload, ['version', 'epoch', 'principal', 'result']); requireValue(payload.version === 1 && payload.principal === this.profile.principal && typeof payload.epoch === 'string');
      return payload as unknown as ServiceResponse;
    } catch (error) {
      if (mutation && attempted) throw new UnknownMutation(requestId!);
      throw error instanceof CollaborationError ? error : new CollaborationError('unavailable');
    } finally { scope.dispose(); this.controller.signal.removeEventListener('abort', abort); parent?.removeEventListener('abort', abort); }
  }
}
export class UnknownMutation extends CollaborationError {
  constructor(readonly requestId: string) { super('unknown'); }
}
