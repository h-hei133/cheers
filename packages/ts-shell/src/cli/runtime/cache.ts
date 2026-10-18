import type { RuntimeConfig } from "../../config/runtimeConfig.js";
import type { CacheWarmingOptions } from "../../turn/cacheWarm.js";
import { canRefreshSentRequest, sendSentRequest, type SentRequest } from "../../provider/request/sentRequest.js";
import { providerFetchForEndpoint } from "../../provider/request/fetch.js";
import { DEFAULT_ENDPOINT_KIND, endpointShape } from "../../provider/endpoints/index.js";
import { sessionUsageRecorder } from "../../session/store/usage.js";
import type { RequestPolicy } from '../../core/agent/request/model.js';
import { providerModelTransport } from '../../provider/request/transport.js';
import type { ModelCostRates } from '../../core/models/catalog.js';

/** Provider transport and accounting for one run's captured request. */
export function cacheRefreshFor(input: {
  readonly requestPolicy?: RequestPolicy;
  readonly sessionId: string;
  readonly runtimeConfig: RuntimeConfig;
  readonly isCurrent: () => boolean;
  readonly admission?: () => string | undefined;
  readonly renewHeaders: () => Promise<Readonly<Record<string, string>> | undefined>;
  readonly provider?: { readonly providerId: string; readonly model: string; readonly endpoint?: string };
  readonly baseUrl?: string;
  readonly rates?: ModelCostRates;
  readonly credential?: { readonly credentialId: string; readonly generation: string };
}): Pick<CacheWarmingOptions, "refresh" | "canRefresh" | "onUsage" | "isCurrent"> {
  const provider = input.provider;
  const onUsage = provider ? sessionUsageRecorder(input.sessionId)({ provider: provider.providerId, model: provider.model,
    baseUrl: input.baseUrl, rates: input.rates }) : undefined;
  const fetchImpl = providerFetchForEndpoint(input.runtimeConfig, provider?.endpoint, endpointShape, input.admission);
  const canRefresh = (sent: SentRequest): boolean => provider !== undefined &&
    (sent.endpoint ?? DEFAULT_ENDPOINT_KIND) === (provider.endpoint ?? DEFAULT_ENDPOINT_KIND) && canRefreshSentRequest(sent);
  return {
    isCurrent: input.isCurrent,
    canRefresh,
    refresh: async (sent, signal) => {
      if (signal.aborted || !input.isCurrent() || !canRefresh(sent)) return;
      const renewed = await input.renewHeaders();
      if (!renewed || signal.aborted || !input.isCurrent()) return;
      return sendSentRequest({ ...sent, headers: renewed }, signal, fetchImpl, {
        policy: input.requestPolicy, provider: provider!.providerId, model: provider!.model,
        onUsage,
        ...(input.credential ? { credential: input.credential } : {}),
        transport: providerModelTransport(input.runtimeConfig, provider!.endpoint, input.admission),
      });
    },
  };
}
