import type { Admission } from '../../core/network/admission.js';
import type { ModelTransport } from '../../core/agent/request/model.js';
import { endpointShape } from '../endpoints/index.js';
import { providerFetchForEndpoint } from './fetch.js';

const HANDOFF = Symbol('model-request-handoff');
type DispatchInit = RequestInit & { readonly [HANDOFF]?: () => void };

export function providerModelTransport(config: {
  readonly providerConnectTimeoutMs?: number; readonly providerHeadersTimeoutMs?: number; readonly providerBodyTimeoutMs?: number;
} | undefined, endpoint: string | undefined, admission?: Admission): ModelTransport {
  // Each immutable request carries its own callback; signer construction remains once per transport.
  const fetchImpl = providerFetchForEndpoint(config, endpoint, endpointShape, admission, init => (init as DispatchInit | undefined)?.[HANDOFF]?.());
  return (input, init, beforeDispatch) => fetchImpl(input, { ...init, [HANDOFF]: beforeDispatch } as DispatchInit);
}
