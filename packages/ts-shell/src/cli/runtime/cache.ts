import type { RuntimeConfig } from "../../config/runtimeConfig.js";
import type { CacheWarmingOptions } from "../../turn/cacheWarm.js";
import { canRefreshSentRequest, sendSentRequest, type SentRequest } from "../../provider/request/sentRequest.js";
import { providerFetchForEndpoint } from "../../provider/request/fetch.js";
import { DEFAULT_ENDPOINT_KIND, endpointShape } from "../../provider/endpoints/index.js";
import { usageFromProvider } from "../../provider/response/usage.js";
import { recordSessionUsage } from "../../observability/usageTelemetry.js";
import { writeSessionUsage } from "../../session/store/usage.js";
import { createComponentLogger } from "../../observability/structuredLogger.js";

const logger = createComponentLogger("cache-warming");

/** Provider transport and accounting for one run's captured request. */
export function cacheRefreshFor(input: {
  readonly sessionId: string;
  readonly runtimeConfig: RuntimeConfig;
  readonly isCurrent: () => boolean;
  readonly admission?: () => string | undefined;
  readonly renewHeaders: () => Promise<Readonly<Record<string, string>> | undefined>;
  readonly provider?: { readonly providerId: string; readonly model: string; readonly endpoint?: string };
}): Pick<CacheWarmingOptions, "refresh" | "canRefresh" | "onUsage" | "isCurrent"> {
  const provider = input.provider;
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
      return sendSentRequest({ ...sent, headers: renewed }, signal, fetchImpl);
    },
    onUsage: (usage) => {
      if (!provider) return;
      recordSessionUsage(input.sessionId, {
        ...usageFromProvider(usage), provider: provider.providerId, model: provider.model,
      }, { affectsContext: false });
      try {
        writeSessionUsage(input.sessionId);
      } catch {
        // The unacknowledged delta remains in memory for the next state write.
        logger.warn("Could not persist cache refresh usage.");
      }
    },
  };
}
