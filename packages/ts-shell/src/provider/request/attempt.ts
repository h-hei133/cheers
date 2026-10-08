import { createHash, randomUUID } from 'node:crypto';
import { ModelAdmissionError, type ModelAttempt, type ModelTransport, type RequestPolicy } from '../../core/agent/request/model.js';
import { endpointShape } from '../endpoints/index.js';
import { modelUsage } from '../response/metering.js';
import type { ProviderUsage } from '../../turn/completion.js';

export interface RequestAttempt {
  readonly id?: string;
  send(input: RequestInfo | URL, init: RequestInit, fetchImpl: typeof fetch, transport?: ModelTransport): Promise<Response>;
  settle(usage?: ProviderUsage): void;
}

/** Reserve exact final bytes before signing; only a proven pre-handoff failure releases. */
export async function prepareRequestAttempt(request: {
  readonly body: string; readonly provider: string; readonly model: string; readonly endpoint: string;
  readonly purpose: string; readonly requestId?: string; readonly policy?: RequestPolicy;
}): Promise<RequestAttempt> {
  request = Object.freeze({ ...request });
  const proof = request.policy ? await endpointShape(request.endpoint).requestBound?.(request) : undefined;
  const attempt: ModelAttempt | undefined = request.policy?.reserve({
    requestId: request.requestId ?? randomUUID(), bodyDigest: createHash('sha256').update(request.body).digest('hex'),
    provider: request.provider, model: request.model, endpoint: request.endpoint, purpose: request.purpose,
    ...(proof !== undefined ? { bound: proof } : {}),
  });
  return {
    ...(attempt ? { id: attempt.id } : {}),
    send: async (input, init, fetchImpl, transport) => {
      let handedOff = false;
      const beforeDispatch = () => { attempt?.dispatch(); handedOff = true; };
      try {
        if (init.body !== request.body) throw new ModelAdmissionError('unsupported');
        init.signal?.throwIfAborted();
        if (transport) return await transport(input, init, beforeDispatch);
        beforeDispatch();
        return await fetchImpl(input, init);
      } catch (error) {
        // A failed dispatch persistence may have armed a reservation. Preserve unknown outcomes.
        if (!handedOff && !(error instanceof ModelAdmissionError && error.persistence !== 'unchanged')) attempt?.confirmUnsent();
        throw error;
      }
    },
    settle: usage => { attempt?.settle(modelUsage(usage, request.endpoint)); },
  };
}
