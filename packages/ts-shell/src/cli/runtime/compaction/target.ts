import type { PreparedTurnContext, StepTarget } from '../../../turn/context/contract.js';
import type { CompactionProvider } from '../../../core/query/compaction/summarize.js';
import { admittedFetch, assertAdmission, type Admission } from '../../../core/network/admission.js';
import type { ModelTransport } from '../../../core/agent/request/model.js';

/** Project the accepted physical identity without resolving credentials a second time. */
export function summaryTarget(prepared: PreparedTurnContext): CompactionProvider & { readonly providerId: string } {
  const { provider } = prepared.target;
  return { providerId: prepared.activeProvider, model: prepared.activeModel,
    baseUrl: provider.baseUrl, endpoint: prepared.endpoint, headers: provider.headers,
    credentialId: provider.credentialId, credentialGeneration: provider.credentialGeneration,
    replayBinding: prepared.replayBinding, serviceTier: provider.serviceTier, shape: prepared.shape,
    supportsTemperature: prepared.shape.supportsTemperature };
}

/** Check the request lifetime again after a signer or transport acquisition awaits. */
export function summaryTransport(target: Pick<StepTarget, 'fetchImpl' | 'modelTransport'>, admission?: Admission): {
  readonly fetchImpl: typeof fetch; readonly modelTransport: ModelTransport;
} {
  const fetchImpl = admittedFetch(target.fetchImpl ?? fetch, admission);
  const transport = target.modelTransport;
  return { fetchImpl, modelTransport: (url, init, beforeDispatch) => {
    assertAdmission(admission); init.signal?.throwIfAborted();
    const dispatch = () => { assertAdmission(admission); init.signal?.throwIfAborted(); beforeDispatch(); };
    if (transport) return transport(url, init, dispatch);
    dispatch(); return fetchImpl(url, init);
  } };
}
