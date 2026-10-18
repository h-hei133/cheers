import { createHash, randomUUID } from 'node:crypto';
import { ModelAdmissionError, type ModelAttempt, type ModelTransport, type RequestPolicy } from '../../core/agent/request/model.js';
import { endpointShape } from '../endpoints/index.js';
import { modelUsage } from '../response/metering.js';
import type { ProviderUsage } from '../../turn/completion.js';
import { credentialBackoffRemaining, noteCredentialRateLimit, responseBackoffMs,
  type CredentialKey } from './backoff.js';

export interface RequestAttempt {
  readonly id?: string;
  send(input: RequestInfo | URL, init: RequestInit, fetchImpl: typeof fetch, transport?: ModelTransport): Promise<Response>;
  settle(usage?: ProviderUsage): void;
}

/** Reserve exact final bytes before signing; only a proven pre-handoff failure releases. */
export async function prepareRequestAttempt(request: {
  readonly body: string; readonly provider: string; readonly model: string; readonly endpoint: string;
  readonly purpose: string; readonly requestId?: string; readonly policy?: RequestPolicy;
  readonly credential?: CredentialKey;
}): Promise<RequestAttempt> {
  request = Object.freeze({ ...request, ...(request.credential ? { credential: Object.freeze({ ...request.credential }) } : {}) });
  // A credential that a provider just rate-limited is not asked again until its
  // own deadline. Another credential of the same provider is unaffected.
  const assertCredentialReady = (): void => {
    const remaining = request.credential ? credentialBackoffRemaining(request.credential) : 0;
    if (remaining > 0) throw new Error(`This account is rate limited and must wait ${Math.ceil(remaining / 1000)}s; use another connection or retry later.`);
  };
  assertCredentialReady();
  const proof = request.policy ? await endpointShape(request.endpoint).requestBound?.(request) : undefined;
  assertCredentialReady();
  const attempt: ModelAttempt | undefined = request.policy?.reserve({
    requestId: request.requestId ?? randomUUID(), bodyDigest: createHash('sha256').update(request.body).digest('hex'),
    provider: request.provider, model: request.model, endpoint: request.endpoint, purpose: request.purpose,
    ...(request.credential ? { credentialId: request.credential.credentialId, credentialGeneration: request.credential.generation } : {}),
    ...(proof !== undefined ? { bound: proof } : {}),
  });
  const noteResponse = (response: Response): void => {
    if (!request.credential) return;
    if (response.status === 429) noteCredentialRateLimit(request.credential, responseBackoffMs(response.headers));
  };
  return {
    ...(attempt ? { id: attempt.id } : {}),
    send: async (input, init, fetchImpl, transport) => {
      let handedOff = false;
      const beforeDispatch = () => { assertCredentialReady(); attempt?.dispatch(); handedOff = true; };
      try {
        if (init.body !== request.body) throw new ModelAdmissionError('unsupported');
        init.signal?.throwIfAborted();
        if (transport) {
          const response = await transport(input, init, beforeDispatch);
          noteResponse(response);
          return response;
        }
        beforeDispatch();
        const response = await fetchImpl(input, init);
        noteResponse(response);
        return response;
      } catch (error) {
        // A failed dispatch persistence may have armed a reservation. Preserve unknown outcomes.
        if (!handedOff && !(error instanceof ModelAdmissionError && error.persistence !== 'unchanged')) attempt?.confirmUnsent();
        throw error;
      }
    },
    settle: usage => { attempt?.settle(modelUsage(usage, request.endpoint)); },
  };
}
